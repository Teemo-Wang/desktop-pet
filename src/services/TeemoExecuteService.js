const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { TextDecoder } = require('util');

const EXECUTE_TOOLS = new Set(['run_npm_script', 'run_process']);
const NODE_SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

class TeemoExecuteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoExecuteError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) { throw new TeemoExecuteError(code, message); }

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? String(left).toLowerCase() === String(right).toLowerCase()
    : String(left) === String(right);
}

function identity(filePath) {
  const stat = fs.statSync(filePath);
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

function sanitizeOutput(value) {
  return String(value || '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

class TeemoExecuteService {
  constructor(options = {}) {
    if (!options.fileService) throw new Error('TeemoExecuteService requires TeemoFileService.');
    this.fileService = options.fileService;
    this.spawnImpl = options.spawnImpl || spawn;
    this.pathEnvironment = options.pathEnvironment || process.env.PATH || process.env.Path || '';
    this.limits = Object.freeze({
      defaultTimeoutMs: Number(options.defaultTimeoutMs) || 30000,
      maxTimeoutMs: Number(options.maxTimeoutMs) || 120000,
      maxOutputBytes: Number(options.maxOutputBytes) || 1024 * 1024,
      maxErrorBytes: Number(options.maxErrorBytes) || 256 * 1024,
      maxArgs: Number(options.maxArgs) || 20,
      maxArgLength: Number(options.maxArgLength) || 500,
      maxArgsLength: Number(options.maxArgsLength) || 4000,
      maxPackageBytes: Number(options.maxPackageBytes) || 1024 * 1024,
      maxNodeScriptBytes: Number(options.maxNodeScriptBytes) || 5 * 1024 * 1024,
    });
  }

  static get TeemoExecuteError() { return TeemoExecuteError; }

  _checkCancelled(checkCancelled) {
    if (checkCancelled && checkCancelled()) fail('EXECUTION_CANCELLED', 'Process execution was cancelled.');
  }

  _safeArgs(args) {
    if (args == null) return [];
    if (!Array.isArray(args) || args.length > this.limits.maxArgs) fail('EXECUTION_START_FAILED', 'Process arguments exceed their limit.');
    const normalized = args.map(value => String(value));
    if (normalized.some(value => value.length > this.limits.maxArgLength || /[\u0000-\u001F\u007F]/.test(value))
      || normalized.reduce((sum, value) => sum + value.length, 0) > this.limits.maxArgsLength) {
      fail('EXECUTION_START_FAILED', 'Process arguments contain unsafe control characters or exceed their limit.');
    }
    return normalized;
  }

  _resolveCwd(cwd, roots) {
    let resolved;
    try { resolved = this.fileService.resolveAuthorizedPath(cwd, roots); }
    catch (_) { fail('EXECUTION_CWD_NOT_AUTHORIZED', 'Execution directory is outside authorized folders.'); }
    const stat = fs.statSync(resolved.target);
    if (!stat.isDirectory()) fail('EXECUTION_CWD_NOT_AUTHORIZED', 'Execution cwd must be a directory.');
    return { cwd: resolved.target, root: resolved.root, cwdIdentity: identity(resolved.target) };
  }

  _pathDirectories() {
    return String(this.pathEnvironment || '').split(path.delimiter)
      .map(value => value.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }

  _resolveNodeExecutable() {
    const names = process.platform === 'win32' ? ['node.exe'] : ['node'];
    for (const directory of this._pathDirectories()) {
      for (const name of names) {
        const candidate = path.join(directory, name);
        try {
          const canonical = fs.realpathSync.native(candidate);
          if (fs.statSync(canonical).isFile()) return { path: canonical, identity: identity(canonical) };
        } catch (_) {}
      }
    }
    if (/^node(?:\.exe)?$/i.test(path.basename(process.execPath))) {
      const canonical = fs.realpathSync.native(process.execPath);
      return { path: canonical, identity: identity(canonical) };
    }
    fail('EXECUTABLE_NOT_ALLOWED', 'Trusted Node.js executable was not found.');
  }

  _resolveNpmCli(nodeExecutable) {
    for (const directory of this._pathDirectories()) {
      const npmLauncher = path.join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm');
      const npmCli = path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      try {
        if (!fs.statSync(npmLauncher).isFile()) continue;
        const canonicalCli = fs.realpathSync.native(npmCli);
        if (!fs.statSync(canonicalCli).isFile()) continue;
        const sameInstallNode = path.join(directory, process.platform === 'win32' ? 'node.exe' : 'node');
        const canonicalNode = fs.realpathSync.native(sameInstallNode);
        if (!samePath(canonicalNode, nodeExecutable.path)) continue;
        return { path: canonicalCli, identity: identity(canonicalCli) };
      } catch (_) {}
    }
    fail('EXECUTABLE_NOT_ALLOWED', 'Trusted npm CLI was not found beside Node.js.');
  }

  _decodeJson(buffer) {
    if (buffer.includes(0)) fail('PACKAGE_JSON_INVALID', 'package.json must be UTF-8 JSON.');
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
      return JSON.parse(text);
    } catch (_) {
      fail('PACKAGE_JSON_INVALID', 'package.json must be valid UTF-8 JSON.');
    }
  }

  _resource(cwd, params) {
    const url = new URL(pathToFileURL(cwd).href.replace(/^file:/, 'exec+file:'));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return url.href;
  }

  _minimalEnvironment() {
    const allowed = [
      'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
      'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL',
      'ComSpec', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
    ];
    const env = {};
    for (const key of allowed) if (process.env[key] != null) env[key] = process.env[key];
    for (const key of Object.keys(env)) {
      if (/(?:API[_-]?KEY|TOKEN|AUTHORIZATION|PASSWORD|SECRET)/i.test(key)) delete env[key];
    }
    env.CI = '1';
    env.NO_COLOR = '1';
    return env;
  }

  _terminateTree(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
      try {
        this.spawnImpl('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true, shell: false, stdio: 'ignore', env: this._minimalEnvironment(),
        });
      } catch (_) {}
    }
    try { child.kill('SIGKILL'); } catch (_) {}
  }

  _runProcess(executable, args, cwd, options = {}) {
    const requestedTimeout = Number(options.timeoutMs) || this.limits.defaultTimeoutMs;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 100), this.limits.maxTimeoutMs);
    const started = Date.now();
    return new Promise((resolve, reject) => {
      if (options.checkCancelled && options.checkCancelled()) {
        reject(new TeemoExecuteError('EXECUTION_CANCELLED', 'Process execution was cancelled.'));
        return;
      }
      let child;
      try {
        child = this.spawnImpl(executable, args, {
          cwd, windowsHide: true, shell: false, detached: false,
          stdio: ['ignore', 'pipe', 'pipe'], env: this._minimalEnvironment(),
        });
      } catch (_) {
        reject(new TeemoExecuteError('EXECUTION_START_FAILED', 'Controlled process could not be started.'));
        return;
      }
      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let outputExceeded = false;
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      const capture = (chunks, chunk, current, limit) => {
        if (current >= limit) return current;
        const remaining = limit - current;
        chunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining));
        return current + Math.min(chunk.length, remaining);
      };
      child.stdout.on('data', chunk => {
        stdoutBytes = capture(stdout, chunk, stdoutBytes, this.limits.maxOutputBytes);
        if (stdoutBytes >= this.limits.maxOutputBytes && !outputExceeded) {
          outputExceeded = true;
          this._terminateTree(child);
        }
      });
      child.stderr.on('data', chunk => {
        stderrBytes = capture(stderr, chunk, stderrBytes, this.limits.maxErrorBytes);
        if (stderrBytes >= this.limits.maxErrorBytes && !outputExceeded) {
          outputExceeded = true;
          this._terminateTree(child);
        }
      });
      const timer = setTimeout(() => { timedOut = true; this._terminateTree(child); }, timeoutMs);
      const cancelTimer = setInterval(() => {
        if (options.checkCancelled && options.checkCancelled()) {
          cancelled = true;
          this._terminateTree(child);
        }
      }, 25);
      const finish = callback => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(cancelTimer);
        callback();
      };
      child.once('error', () => finish(() => reject(new TeemoExecuteError('EXECUTION_START_FAILED', 'Controlled process could not be started.'))));
      child.once('close', (exitCode, signal) => finish(() => {
        if (cancelled) { reject(new TeemoExecuteError('EXECUTION_CANCELLED', 'Process execution was cancelled.')); return; }
        if (timedOut) { reject(new TeemoExecuteError('EXECUTION_TIMEOUT', 'Process execution timed out.')); return; }
        if (outputExceeded) { reject(new TeemoExecuteError('EXECUTION_OUTPUT_LIMIT', 'Process output exceeded its limit.')); return; }
        const data = {
          exitCode,
          signal: signal || null,
          stdout: sanitizeOutput(Buffer.concat(stdout).toString('utf8')),
          stderr: sanitizeOutput(Buffer.concat(stderr).toString('utf8')),
          truncated: false,
          durationMs: Date.now() - started,
        };
        if (exitCode !== 0) {
          const error = new TeemoExecuteError('EXECUTION_FAILED', 'Controlled process exited unsuccessfully.');
          error.result = data;
          reject(error);
          return;
        }
        resolve(data);
      }));
    });
  }

  prepareOperation(toolName, args = {}, roots = [], options = {}) {
    const tool = String(toolName || '');
    if (!EXECUTE_TOOLS.has(tool)) fail('EXECUTABLE_NOT_ALLOWED', 'Unknown execute tool.');
    this._checkCancelled(options.checkCancelled);
    const cwd = this._resolveCwd(args.cwd || args.projectPath, roots);
    const node = this._resolveNodeExecutable();
    const safeArgs = this._safeArgs(args.args);
    let snapshot;
    let reason;
    if (tool === 'run_npm_script') {
      const npmCli = this._resolveNpmCli(node);
      if (safeArgs.some(value => /[&|;<>^%!`$()'"\r\n]/.test(value))) {
        fail('EXECUTION_START_FAILED', 'npm script arguments containing shell metacharacters are not allowed.');
      }
      const packageCandidate = path.join(cwd.cwd, 'package.json');
      let packagePath;
      try { packagePath = fs.realpathSync.native(packageCandidate); }
      catch (_) { fail('NPM_SCRIPT_NOT_FOUND', 'package.json was not found in the project directory.'); }
      if (!this.fileService.isPathWithinRoot(cwd.cwd, packagePath) || !fs.statSync(packagePath).isFile()) {
        fail('PACKAGE_JSON_INVALID', 'package.json must be a regular file inside the project directory.');
      }
      const buffer = fs.readFileSync(packagePath);
      if (buffer.length > this.limits.maxPackageBytes) fail('PACKAGE_JSON_INVALID', 'package.json exceeds its size limit.');
      const packageJson = this._decodeJson(buffer);
      const script = String(args.script || '');
      if (!script || script.length > 100 || /[\u0000-\u001F\u007F]/.test(script)
        || !packageJson.scripts || typeof packageJson.scripts[script] !== 'string') {
        fail('NPM_SCRIPT_NOT_FOUND', 'The requested npm script is not declared in package.json.');
      }
      const packageSha256 = sha256(buffer);
      const commandSha256 = sha256(Buffer.from(packageJson.scripts[script], 'utf8'));
      const resource = this._resource(cwd.cwd, {
        operation: 'npm-script',
        program: 'node',
        executable: pathToFileURL(node.path).href,
        npmCli: pathToFileURL(npmCli.path).href,
        script,
        packageSha256,
        commandSha256,
      });
      snapshot = Object.freeze({
        ...cwd, nodePath: node.path, nodeIdentity: node.identity,
        npmCliPath: npmCli.path, npmCliIdentity: npmCli.identity,
        packagePath, packageIdentity: identity(packagePath), packageSha256,
        script, commandSha256, args: safeArgs, resource,
      });
      reason = `run_npm_script: npm run ${script} in ${pathToFileURL(cwd.cwd).href}`;
    } else {
      const executable = String(args.executable || '').toLowerCase();
      if (!['node', 'node.exe'].includes(executable)) fail('EXECUTABLE_NOT_ALLOWED', 'Only the trusted Node.js executable is allowed.');
      let scriptPath;
      try { scriptPath = this.fileService.resolveAuthorizedPath(args.scriptPath, roots).target; }
      catch (_) { fail('EXECUTION_CWD_NOT_AUTHORIZED', 'Node script is outside authorized folders.'); }
      const stat = fs.statSync(scriptPath);
      if (!stat.isFile() || !NODE_SCRIPT_EXTENSIONS.has(path.extname(scriptPath).toLowerCase())
        || !this.fileService.isPathWithinRoot(cwd.cwd, scriptPath)) {
        fail('EXECUTABLE_NOT_ALLOWED', 'Node script must be an approved file inside cwd.');
      }
      if (stat.size > this.limits.maxNodeScriptBytes) fail('EXECUTABLE_NOT_ALLOWED', 'Node script exceeds its size limit.');
      const scriptSha256 = sha256(fs.readFileSync(scriptPath));
      const resource = this._resource(cwd.cwd, {
        operation: 'node-script',
        program: 'node',
        executable: pathToFileURL(node.path).href,
        script: path.relative(cwd.cwd, scriptPath).replace(/\\/g, '/'),
        scriptSha256,
      });
      snapshot = Object.freeze({
        ...cwd, nodePath: node.path, nodeIdentity: node.identity,
        scriptPath, scriptIdentity: identity(scriptPath), scriptSha256,
        args: safeArgs, resource,
      });
      reason = `run_process: node ${pathToFileURL(scriptPath).href} in ${pathToFileURL(cwd.cwd).href}`;
    }
    this._checkCancelled(options.checkCancelled);
    return Object.freeze({
      tool,
      args: Object.freeze(JSON.parse(JSON.stringify(args))),
      snapshot,
      resource: snapshot.resource,
      reason,
    });
  }

  _revalidate(prepared, roots, options = {}) {
    let current;
    try { current = this.prepareOperation(prepared.tool, prepared.args, roots, options); }
    catch (_) { fail('EXECUTION_RESOURCE_CHANGED', 'Execution resource changed while permission was pending.'); }
    const before = prepared.snapshot;
    const after = current.snapshot;
    for (const key of Object.keys(before)) {
      const left = Array.isArray(before[key]) ? JSON.stringify(before[key]) : before[key];
      const right = Array.isArray(after[key]) ? JSON.stringify(after[key]) : after[key];
      if (left !== right) fail('EXECUTION_RESOURCE_CHANGED', 'Execution resource changed while permission was pending.');
    }
    return current;
  }

  async executePrepared(prepared, roots, options = {}) {
    if (!prepared || !EXECUTE_TOOLS.has(prepared.tool)) fail('EXECUTION_START_FAILED', 'Prepared execution is invalid.');
    this._checkCancelled(options.checkCancelled);
    const current = this._revalidate(prepared, roots, options);
    this._checkCancelled(options.checkCancelled);
    const timeoutMs = prepared.args.timeoutMs;
    if (prepared.tool === 'run_npm_script') {
      return this._runProcess(current.snapshot.nodePath, [
        current.snapshot.npmCliPath, 'run', current.snapshot.script,
        ...(current.snapshot.args.length ? ['--', ...current.snapshot.args] : []),
      ], current.snapshot.cwd, { ...options, timeoutMs });
    }
    return this._runProcess(current.snapshot.nodePath, [current.snapshot.scriptPath, ...current.snapshot.args], current.snapshot.cwd, {
      ...options, timeoutMs,
    });
  }
}

module.exports = TeemoExecuteService;
