const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

const GIT_TOOLS = new Set([
  'git_status', 'git_diff', 'git_log', 'git_show', 'git_stage_files', 'git_commit',
]);

class TeemoGitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoGitError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoGitError(code, message);
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

class TeemoGitService {
  constructor(options = {}) {
    if (!options.fileService) throw new Error('TeemoGitService requires TeemoFileService.');
    this.fileService = options.fileService;
    this.gitExecutable = options.gitExecutable || 'git';
    this.spawnImpl = options.spawnImpl || spawn;
    const hooksDirectory = options.safeHooksDirectory
      || fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-git-empty-hooks-'));
    this.safeHooksDirectory = fs.realpathSync.native(hooksDirectory);
    this.safeHooksIdentity = identity(this.safeHooksDirectory);
    this.limits = Object.freeze({
      timeoutMs: Number(options.timeoutMs) || 15000,
      maxOutputBytes: Number(options.maxOutputBytes) || 512 * 1024,
      maxErrorBytes: Number(options.maxErrorBytes) || 32 * 1024,
      maxFiles: Number(options.maxFiles) || 200,
      maxLogEntries: Number(options.maxLogEntries) || 100,
      maxCommitMessage: Number(options.maxCommitMessage) || 200,
      maxStageFiles: Number(options.maxStageFiles) || 100,
      maxStageFileBytes: Number(options.maxStageFileBytes) || 20 * 1024 * 1024,
    });
  }

  static get TeemoGitError() { return TeemoGitError; }

  _minimalEnvironment(extra = {}) {
    const allowed = [
      'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
      'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL',
      'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    ];
    const env = {};
    for (const key of allowed) {
      if (process.env[key] != null) env[key] = process.env[key];
    }
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      GIT_ASKPASS: '',
      SSH_ASKPASS: '',
      ...extra,
    });
    for (const key of Object.keys(env)) {
      if (/(?:API[_-]?KEY|TOKEN|AUTHORIZATION|PASSWORD|SECRET)/i.test(key)) delete env[key];
    }
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

  _assertSafeHooksDirectory() {
    let canonical;
    try {
      canonical = fs.realpathSync.native(this.safeHooksDirectory);
      if (!samePath(canonical, this.safeHooksDirectory)
        || identity(canonical) !== this.safeHooksIdentity
        || !fs.statSync(canonical).isDirectory()
        || fs.readdirSync(canonical).length !== 0) {
        fail('GIT_EXTERNAL_EXECUTION_NOT_ALLOWED', 'Safe Git hooks policy is unavailable.');
      }
    } catch (error) {
      if (error instanceof TeemoGitError) throw error;
      fail('GIT_EXTERNAL_EXECUTION_NOT_ALLOWED', 'Safe Git hooks policy is unavailable.');
    }
  }

  _safeInvocationArgs(args) {
    this._assertSafeHooksDirectory();
    return [
      '--no-pager',
      '-c', 'color.ui=false',
      '-c', 'core.pager=cat',
      '-c', 'core.fsmonitor=false',
      '-c', `core.hooksPath=${this.safeHooksDirectory}`,
      '-c', 'commit.gpgSign=false',
      '-c', 'credential.helper=',
      '-c', 'diff.external=',
      ...args,
    ];
  }

  _runGit(cwd, args, options = {}) {
    const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || this.limits.timeoutMs, 100), 60000);
    const maxOutputBytes = Number(options.maxOutputBytes) || this.limits.maxOutputBytes;
    const maxErrorBytes = Number(options.maxErrorBytes) || this.limits.maxErrorBytes;
    const checkCancelled = options.checkCancelled;
    return new Promise((resolve, reject) => {
      if (checkCancelled && checkCancelled()) {
        reject(new TeemoGitError('GIT_CANCELLED', 'Git operation was cancelled.'));
        return;
      }
      let child;
      try {
        const processArgs = options.rawExecutableArgs ? args : this._safeInvocationArgs(args);
        child = this.spawnImpl(this.gitExecutable, processArgs, {
          cwd,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: this._minimalEnvironment(options.env),
        });
      } catch (error) {
        reject(error instanceof TeemoGitError
          ? error
          : new TeemoGitError('GIT_OPERATION_FAILED', 'Git process could not be started.'));
        return;
      }
      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      const capture = (chunks, chunk, current, limit) => {
        if (current >= limit) { truncated = true; return current; }
        const remaining = limit - current;
        chunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining));
        if (chunk.length > remaining) truncated = true;
        return current + Math.min(chunk.length, remaining);
      };
      child.stdout.on('data', chunk => { stdoutBytes = capture(stdout, chunk, stdoutBytes, maxOutputBytes); });
      child.stderr.on('data', chunk => { stderrBytes = capture(stderr, chunk, stderrBytes, maxErrorBytes); });
      const timer = setTimeout(() => {
        timedOut = true;
        this._terminateTree(child);
      }, timeoutMs);
      const cancelTimer = setInterval(() => {
        if (checkCancelled && checkCancelled()) {
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
      child.once('error', () => finish(() => reject(new TeemoGitError('GIT_OPERATION_FAILED', 'Git process could not be started.'))));
      child.once('close', (exitCode, signal) => finish(() => {
        if (cancelled) { reject(new TeemoGitError('GIT_CANCELLED', 'Git operation was cancelled.')); return; }
        if (timedOut) { reject(new TeemoGitError('GIT_TIMEOUT', 'Git operation timed out.')); return; }
        resolve({
          exitCode,
          signal: signal || null,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: sanitizeOutput(Buffer.concat(stderr).toString('utf8')),
          truncated,
        });
      }));
    });
  }

  async _git(repo, args, options = {}) {
    const result = await this._runGit(repo, args, options);
    if (result.exitCode !== 0 && !options.allowFailure) {
      fail(options.failureCode || 'GIT_OPERATION_FAILED', options.failureMessage || 'Git operation failed.');
    }
    return result;
  }

  async _resolveRepo(repoPath, roots, options = {}) {
    let requested;
    try { requested = this.fileService.resolveAuthorizedPath(repoPath, roots); }
    catch (_) { fail('GIT_REPO_NOT_AUTHORIZED', 'Repository is outside authorized folders.'); }
    if (!fs.statSync(requested.target).isDirectory()) fail('GIT_PATH_INVALID', 'Repository path must be a directory.');
    const topResult = await this._git(requested.target, ['rev-parse', '--show-toplevel'], {
      ...options,
      failureCode: 'GIT_NOT_REPOSITORY',
      failureMessage: 'The requested path is not a Git repository.',
    });
    const gitDirResult = await this._git(requested.target, ['rev-parse', '--absolute-git-dir'], {
      ...options,
      failureCode: 'GIT_NOT_REPOSITORY',
      failureMessage: 'The requested path is not a Git repository.',
    });
    let repo;
    let gitDir;
    try {
      repo = fs.realpathSync.native(topResult.stdout.trim());
      gitDir = fs.realpathSync.native(gitDirResult.stdout.trim());
      this.fileService.resolveAuthorizedPath(repo, roots);
      this.fileService.resolveAuthorizedPath(gitDir, roots);
    } catch (_) {
      fail('GIT_REPO_NOT_AUTHORIZED', 'Repository metadata is outside authorized folders.');
    }
    if (!this.fileService.isPathWithinRoot(repo, gitDir)) {
      fail('GIT_REPO_NOT_AUTHORIZED', 'Linked Git metadata outside the repository is not allowed.');
    }
    return {
      repo,
      gitDir,
      repoIdentity: identity(repo),
      gitDirIdentity: identity(gitDir),
      resource: pathToFileURL(repo).href.replace(/^file:/, 'git+file:'),
    };
  }

  _safeRelativeFile(repo, rawPath, roots, options = {}) {
    const input = String(rawPath || '');
    if (!input || /[\u0000-\u001F\u007F]/.test(input) || path.isAbsolute(input) || input.startsWith(':')) {
      fail('GIT_PATH_INVALID', 'Git file paths must be non-empty repository-relative paths.');
    }
    const segments = input.replace(/\\/g, '/').split('/');
    if (segments.includes('..') || segments.includes('.')
      || segments.some(segment => segment.toLowerCase() === '.git')
      || /[*?\[]/.test(input)) {
      fail('GIT_PATH_INVALID', 'Git path traversal and pathspec patterns are not allowed.');
    }
    const candidate = path.resolve(repo, input);
    if (!this.fileService.isPathWithinRoot(repo, candidate) || samePath(repo, candidate)) {
      fail('GIT_FILE_OUTSIDE_REPOSITORY', 'Git file is outside the repository.');
    }
    let canonical;
    let exists = false;
    let fileIdentity = null;
    let fileHash = null;
    if (fs.existsSync(candidate)) {
      canonical = fs.realpathSync.native(candidate);
      const stat = fs.statSync(canonical);
      if (!stat.isFile()) fail('GIT_PATH_INVALID', 'Only explicit regular files can be staged or diffed.');
      if (options.forStage && stat.size > this.limits.maxStageFileBytes) {
        fail('GIT_PATH_INVALID', 'A file exceeds the explicit staging size limit.');
      }
      exists = true;
      fileIdentity = identity(canonical);
      if (options.forStage) fileHash = crypto.createHash('sha256').update(fs.readFileSync(canonical)).digest('hex');
    } else {
      let parent;
      try { parent = fs.realpathSync.native(path.dirname(candidate)); }
      catch (_) { fail('GIT_PATH_INVALID', 'Git file parent does not exist.'); }
      canonical = path.join(parent, path.basename(candidate));
    }
    if (!this.fileService.isPathWithinRoot(repo, canonical)) {
      fail('GIT_FILE_OUTSIDE_REPOSITORY', 'Git file is outside the repository.');
    }
    try { this.fileService.resolveAuthorizedPath(exists ? canonical : path.dirname(canonical), roots); }
    catch (_) { fail('GIT_REPO_NOT_AUTHORIZED', 'Git file is outside authorized folders.'); }
    return {
      relative: path.relative(repo, canonical).replace(/\\/g, '/'),
      canonical,
      exists,
      fileIdentity,
      fileHash,
    };
  }

  async _head(repo, options = {}) {
    const result = await this._git(repo, ['rev-parse', '--verify', 'HEAD'], { ...options, allowFailure: true });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async _stagedTree(repo, options = {}) {
    const result = await this._git(repo, ['write-tree'], { ...options, allowFailure: true });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async _stagedFiles(repo, options = {}) {
    const result = await this._git(repo, ['diff', '--cached', '--name-only', '-z'], options);
    return result.stdout.split('\u0000').filter(Boolean);
  }

  async _assertNoExternalFilters(repo, files, options = {}) {
    const paths = Array.from(new Set((files || []).map(value => String(value || '')).filter(Boolean)));
    if (!paths.length) return;
    const result = await this._git(repo, ['check-attr', '-z', 'filter', '--', ...paths], options);
    const fields = result.stdout.split('\u0000');
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const file = sanitizeOutput(fields[index]);
      const attribute = fields[index + 1];
      const value = fields[index + 2];
      if (attribute === 'filter' && value !== 'unspecified' && value !== 'unset') {
        fail('GIT_EXTERNAL_FILTER_NOT_ALLOWED', `External Git filters are not allowed for ${file || 'a staged file'}.`);
      }
    }
  }

  _snapshotRepo(resolved, extra = {}) {
    return Object.freeze({
      repo: resolved.repo,
      gitDir: resolved.gitDir,
      repoIdentity: resolved.repoIdentity,
      gitDirIdentity: resolved.gitDirIdentity,
      resource: resolved.resource,
      ...extra,
    });
  }

  async prepareOperation(toolName, args = {}, roots = [], options = {}) {
    const tool = String(toolName || '');
    if (!GIT_TOOLS.has(tool)) fail('GIT_TOOL_UNKNOWN', 'Unknown Git tool.');
    const resolved = await this._resolveRepo(args.repo, roots, options);
    const extra = {};
    if (tool === 'git_diff' && args.file) {
      extra.file = this._safeRelativeFile(resolved.repo, args.file, roots);
      await this._assertNoExternalFilters(resolved.repo, [extra.file.relative], options);
    }
    if (tool === 'git_show') {
      const revision = String(args.revision || 'HEAD');
      if (!/^(?!-)[A-Za-z0-9][A-Za-z0-9._\/^~+-]{0,199}$/.test(revision)) fail('GIT_PATH_INVALID', 'Git revision is invalid.');
      const verified = await this._git(resolved.repo, ['rev-parse', '--verify', `${revision}^{commit}`], {
        ...options, failureCode: 'GIT_OPERATION_FAILED', failureMessage: 'Git revision was not found.',
      });
      extra.revision = revision;
      extra.commit = verified.stdout.trim();
      if (args.file) extra.file = this._safeRelativeFile(resolved.repo, args.file, roots);
    }
    if (tool === 'git_stage_files') {
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > this.limits.maxStageFiles) {
        fail('GIT_PATH_INVALID', 'An explicit bounded file list is required.');
      }
      extra.files = args.files.map(file => this._safeRelativeFile(resolved.repo, file, roots, { forStage: true }));
      if (new Set(extra.files.map(file => file.relative.toLowerCase())).size !== extra.files.length) {
        fail('GIT_PATH_INVALID', 'Duplicate Git file paths are not allowed.');
      }
      await this._assertNoExternalFilters(resolved.repo, extra.files.map(file => file.relative), options);
      for (const file of extra.files.filter(item => !item.exists)) {
        const tracked = await this._git(resolved.repo, ['ls-files', '--error-unmatch', '--', file.relative], {
          ...options, allowFailure: true,
        });
        if (tracked.exitCode !== 0) fail('GIT_PATH_INVALID', 'A staged path must be an existing file or tracked deletion.');
      }
    }
    if (tool === 'git_commit') {
      const message = String(args.message || '').replace(/[\r\n]+/g, ' ').trim();
      if (!message || /[\u0000-\u001F\u007F]/.test(message) || message.length > this.limits.maxCommitMessage) {
        fail('GIT_PATH_INVALID', 'Commit message must be a bounded single line.');
      }
      const stagedFiles = await this._stagedFiles(resolved.repo, options);
      if (!stagedFiles.length) fail('GIT_NOTHING_TO_COMMIT', 'There are no staged changes to commit.');
      extra.message = message;
      extra.stagedFiles = stagedFiles.slice(0, this.limits.maxFiles);
      extra.stagedCount = stagedFiles.length;
      extra.stagedTree = await this._stagedTree(resolved.repo, options);
      extra.head = await this._head(resolved.repo, options);
    }
    const snapshot = this._snapshotRepo(resolved, extra);
    const summary = tool === 'git_stage_files'
      ? `${tool}: stage ${extra.files.length} explicit file(s) in ${resolved.resource}`
      : (tool === 'git_commit'
        ? `${tool}: commit ${extra.stagedCount} staged file(s) in ${resolved.resource}`
        : `${tool}: ${resolved.resource}`);
    return Object.freeze({
      tool,
      args: Object.freeze(JSON.parse(JSON.stringify(args))),
      snapshot,
      resource: resolved.resource,
      reason: summary,
    });
  }

  async _revalidate(prepared, roots, options = {}) {
    let current;
    try { current = await this._resolveRepo(prepared.snapshot.repo, roots, options); }
    catch (_) { fail('GIT_RESOURCE_CHANGED', 'Git repository changed while permission was pending.'); }
    if (!samePath(current.repo, prepared.snapshot.repo)
      || !samePath(current.gitDir, prepared.snapshot.gitDir)
      || current.repoIdentity !== prepared.snapshot.repoIdentity
      || current.gitDirIdentity !== prepared.snapshot.gitDirIdentity
      || current.resource !== prepared.snapshot.resource) {
      fail('GIT_RESOURCE_CHANGED', 'Git repository changed while permission was pending.');
    }
    if (prepared.tool === 'git_show') {
      const verified = await this._git(current.repo, ['rev-parse', '--verify', `${prepared.snapshot.revision}^{commit}`], options);
      if (verified.stdout.trim() !== prepared.snapshot.commit) fail('GIT_RESOURCE_CHANGED', 'Git revision changed while permission was pending.');
    }
    if (prepared.tool === 'git_stage_files') {
      await this._assertNoExternalFilters(current.repo, prepared.snapshot.files.map(file => file.relative), options);
      for (const before of prepared.snapshot.files) {
        let after;
        try { after = this._safeRelativeFile(current.repo, before.relative, roots, { forStage: true }); }
        catch (_) { fail('GIT_RESOURCE_CHANGED', 'A staged file changed while permission was pending.'); }
        if (!samePath(before.canonical, after.canonical)
          || before.exists !== after.exists
          || before.fileIdentity !== after.fileIdentity
          || before.fileHash !== after.fileHash) {
          fail('GIT_RESOURCE_CHANGED', 'A staged file changed while permission was pending.');
        }
      }
    }
    if (prepared.tool === 'git_commit') {
      const head = await this._head(current.repo, options);
      const stagedTree = await this._stagedTree(current.repo, options);
      if (head !== prepared.snapshot.head || stagedTree !== prepared.snapshot.stagedTree) {
        fail('GIT_RESOURCE_CHANGED', 'Staged Git state changed while permission was pending.');
      }
    }
    return current;
  }

  async executePrepared(prepared, roots, options = {}) {
    if (!prepared || !GIT_TOOLS.has(prepared.tool)) fail('GIT_PATH_INVALID', 'Prepared Git operation is invalid.');
    const current = await this._revalidate(prepared, roots, options);
    if (options.checkCancelled && options.checkCancelled()) fail('GIT_CANCELLED', 'Git operation was cancelled.');
    const handlers = {
      git_status: () => this._status(current.repo, options),
      git_diff: () => this._diff(current.repo, prepared, options),
      git_log: () => this._log(current.repo, prepared, options),
      git_show: () => this._show(current.repo, prepared, options),
      git_stage_files: () => this._stage(current.repo, prepared, options),
      git_commit: () => this._commit(current.repo, prepared, options),
    };
    return handlers[prepared.tool]();
  }

  async _status(repo, options) {
    const head = await this._head(repo, options);
    const branchResult = await this._git(repo, ['symbolic-ref', '--short', '-q', 'HEAD'], { ...options, allowFailure: true });
    const upstream = await this._git(repo, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { ...options, allowFailure: true });
    const status = await this._git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], options);
    const tokens = status.stdout.split('\u0000').filter(Boolean);
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const code = token.slice(0, 2);
      let file = token.slice(3);
      if ((code[0] === 'R' || code[0] === 'C') && tokens[index + 1]) file = `${tokens[index + 1]} -> ${file}`, index += 1;
      file = sanitizeOutput(file);
      if (code === '??') untracked.push(file);
      else {
        if (code[0] !== ' ') staged.push({ path: file, status: code[0] });
        if (code[1] !== ' ') unstaged.push({ path: file, status: code[1] });
      }
    }
    const cap = values => values.slice(0, this.limits.maxFiles);
    const counts = upstream.exitCode === 0 ? upstream.stdout.trim().split(/\s+/).map(Number) : [0, 0];
    return {
      repo,
      branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : null,
      head,
      staged: cap(staged),
      unstaged: cap(unstaged),
      untracked: cap(untracked),
      ahead: counts[0] || 0,
      behind: counts[1] || 0,
      truncated: staged.length > this.limits.maxFiles || unstaged.length > this.limits.maxFiles || untracked.length > this.limits.maxFiles,
    };
  }

  async _diff(repo, prepared, options) {
    const staged = prepared.args.staged === true;
    const nameArgs = ['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', '--'];
    if (prepared.snapshot.file) nameArgs.push(prepared.snapshot.file.relative);
    const names = await this._git(repo, nameArgs, options);
    const files = names.stdout.split('\u0000').filter(Boolean);
    const selected = files.slice(0, this.limits.maxFiles);
    await this._assertNoExternalFilters(repo, prepared.snapshot.file
      ? [prepared.snapshot.file.relative]
      : selected, options);
    const args = ['diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--'];
    if (prepared.snapshot.file) args.push(prepared.snapshot.file.relative);
    else args.push(...selected);
    const result = selected.length || prepared.snapshot.file
      ? await this._git(repo, args, { ...options, maxOutputBytes: this.limits.maxOutputBytes })
      : { stdout: '', truncated: false };
    return { repo, staged, files: selected.map(sanitizeOutput), diff: sanitizeOutput(result.stdout), truncated: result.truncated || files.length > selected.length };
  }

  async _log(repo, prepared, options) {
    const limit = Math.min(Math.max(Number(prepared.args.limit) || 20, 1), this.limits.maxLogEntries);
    const result = await this._git(repo, ['log', `-n${limit}`, '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x00'], options);
    const commits = result.stdout.split('\u0000').map(record => record.trim()).filter(Boolean).map(record => {
      const [hash, shortHash, author, authoredAt, subject] = record.split('\u001f');
      return { hash, shortHash, author: sanitizeOutput(author), authoredAt, subject: sanitizeOutput(subject) };
    });
    return { repo, commits, truncated: result.truncated };
  }

  async _show(repo, prepared, options) {
    const args = ['show', '--no-ext-diff', '--no-textconv', '--no-color', '--format=fuller', '--stat', '--patch', prepared.snapshot.commit, '--'];
    if (prepared.snapshot.file) args.push(prepared.snapshot.file.relative);
    const result = await this._git(repo, args, options);
    return { repo, commit: prepared.snapshot.commit, output: sanitizeOutput(result.stdout), truncated: result.truncated };
  }

  async _stage(repo, prepared, options) {
    const files = prepared.snapshot.files.map(file => file.relative);
    await this._assertNoExternalFilters(repo, files, options);
    await this._git(repo, ['add', '--', ...files], options);
    return { repo, stagedFiles: files, status: await this._status(repo, options) };
  }

  async _commit(repo, prepared, options) {
    const result = await this._git(repo, ['commit', '-m', prepared.snapshot.message], {
      ...options,
      timeoutMs: Math.min(Math.max(Number(options.timeoutMs) || this.limits.timeoutMs, 100), 60000),
      failureCode: 'GIT_OPERATION_FAILED',
      failureMessage: 'Git commit failed.',
    });
    const head = await this._head(repo, options);
    return {
      repo,
      committed: true,
      hash: head,
      files: prepared.snapshot.stagedFiles,
      fileCount: prepared.snapshot.stagedCount,
      summary: sanitizeOutput(result.stdout).slice(0, 4000),
      truncated: result.truncated || result.stdout.length > 4000,
    };
  }
}

module.exports = TeemoGitService;
