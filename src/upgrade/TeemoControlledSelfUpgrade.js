/* P5-3 bounded controlled self-upgrade. All run state and approvals are memory-only. */
(function (root, factory) {
  const Contract = root && root.TeemoPlanningContract
    ? root.TeemoPlanningContract
    : (typeof module === 'object' && module.exports ? require('../planning/TeemoPlanningContract') : null);
  const Upgrade = factory(Contract);
  if (root) root.TeemoControlledSelfUpgrade = Upgrade;
  if (typeof window !== 'undefined') window.TeemoControlledSelfUpgrade = Upgrade;
  if (typeof module === 'object' && module.exports) module.exports = Upgrade;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PlanningContract) {
  const LIMITS = Object.freeze({ maxFiles: 6, maxBytes: 256 * 1024, maxScripts: 8, runTimeoutMs: 15 * 60 * 1000, stepTimeoutMs: 120000 });
  const REQUIRED_FILES = Object.freeze(['AGENTS.md', 'package.json', 'docs/TeemoProjectKnowledge/INDEX.md', 'docs/TeemoProjectKnowledge/CURRENT-STATE.md']);
  const TERMINAL = new Set(['succeeded', 'failed', 'blocked', 'cancelled', 'timed_out', 'rolled_back']);
  const ALLOWED_TEXT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml']);
  const ALWAYS_EXCLUDED = /(^|\/)(?:\.git|node_modules|build|dist|out|installer|unpacked|cache|logs?|coverage|temp|tmp|user[-_ ]?data|settings|chat[-_ ]?history|skills|projects|todos|work[-_ ]?stats)(?:\/|$)/i;
  const SECRET_PATH = /(?:^|[._\/-])(?:secret|credential|password|token|api[-_]?key|auth)(?:[._\/-]|$)/i;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
  function fail(code, message) { throw Object.assign(new Error(message), { code, teemoSafe: true }); }
  function utf8Bytes(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(value)).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(String(value), 'utf8');
    return unescape(encodeURIComponent(String(value))).length;
  }
  async function sha256(value) {
    const text = String(value);
    if (typeof require === 'function') {
      try { return require('crypto').createHash('sha256').update(text, 'utf8').digest('hex'); } catch (_) {}
    }
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const bytes = new TextEncoder().encode(text);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    fail('UPGRADE_HASH_UNAVAILABLE', 'SHA-256 is unavailable.');
  }
  function planFingerprint(planState) {
    const state = planState && planState.plan ? planState : { plan: planState };
    return JSON.stringify({ plan: state && state.plan || null, createdAt: state && state.createdAt || null, revisedAt: state && state.revisedAt || null });
  }
  function samePath(left, right) {
    return String(left || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      === String(right || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }
  function normalizeRelativePath(value) {
    const raw = String(value || '').replace(/\\/g, '/').trim();
    if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.includes('\u0000')) fail('UPGRADE_PATH_INVALID', 'Manifest paths must be repository-relative.');
    const parts = raw.split('/');
    if (parts.some(part => !part || part === '.' || part === '..')) fail('UPGRADE_PATH_INVALID', 'Manifest paths cannot escape or ambiguously address the repository.');
    return parts.join('/');
  }
  function absolutePath(root, relative) {
    const separator = /\\/.test(String(root)) ? '\\' : '/';
    return String(root).replace(/[\\/]+$/, '') + separator + relative.replace(/\//g, separator);
  }
  function extension(relative) {
    const name = relative.split('/').pop();
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot).toLowerCase();
  }
  function assertAllowedPath(relative) {
    if (relative === 'package.json' || relative === 'package-lock.json' || ALWAYS_EXCLUDED.test(relative) || SECRET_PATH.test(relative)) {
      fail('UPGRADE_PATH_EXCLUDED', `The manifest path is excluded: ${relative}`);
    }
    if (!ALLOWED_TEXT_EXTENSIONS.has(extension(relative))) fail('UPGRADE_PATH_EXCLUDED', `The manifest path is not an allowed UTF-8 text file: ${relative}`);
  }
  function parseJsonObject(text, code) {
    let source = String(text || '').trim();
    const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) source = fenced[1];
    try {
      const parsed = JSON.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(code, 'Expected one JSON object.');
      return parsed;
    } catch (error) {
      if (error && error.code === code) throw error;
      fail(code, 'The provider did not return one valid JSON manifest proposal.');
    }
  }
  function publicManifest(manifest) {
    return {
      ownerId: manifest.ownerId,
      sessionId: manifest.sessionId,
      upgradeRunId: manifest.upgradeRunId,
      repository: clone(manifest.repository),
      goal: manifest.goal,
      planFingerprint: manifest.planFingerprint,
      files: manifest.files.map(file => ({ path: file.path, baselineSha256: file.baselineSha256, postPatchSha256: file.postPatchSha256, changedBytes: file.changedBytes })),
      scripts: [...manifest.scripts],
      runTimeoutMs: manifest.runTimeoutMs,
      stepTimeoutMs: manifest.stepTimeoutMs,
      manifestSha256: manifest.manifestSha256,
    };
  }
  function publicRun(run) {
    return {
      runId: run.runId,
      ownerId: run.ownerId,
      sessionId: run.sessionId,
      state: run.state,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt || null,
      manifest: run.manifest ? publicManifest(run.manifest) : null,
      steps: clone(run.steps),
      scripts: clone(run.scripts),
      error: run.error ? { ...run.error } : null,
      rollbackState: run.rollbackState || 'not_available',
      evidence: run.evidence ? clone(run.evidence) : null,
    };
  }
  function changedPaths(status) {
    const paths = [];
    for (const item of status.staged || []) paths.push(item.path);
    for (const item of status.unstaged || []) paths.push(item.path);
    for (const item of status.untracked || []) paths.push(typeof item === 'string' ? item : item.path);
    return [...new Set(paths.map(path => String(path).replace(/\\/g, '/')))];
  }
  function isClean(status) { return !status.truncated && changedPaths(status).length === 0; }
  function scriptAllowed(name) { return /^test:.+/.test(name) || name === 'verify:release-version' || name === 'project:knowledge:verify'; }
  function abortable(value, signal, code = 'UPGRADE_CANCELLED', message = 'The upgrade was cancelled.') {
    if (!signal) return Promise.resolve(value);
    if (signal.aborted) return Promise.reject(Object.assign(new Error(message), { code }));
    return new Promise((resolve, reject) => {
      const aborted = () => reject(Object.assign(new Error(message), { code }));
      signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(value).then(result => {
        signal.removeEventListener('abort', aborted);
        resolve(result);
      }, error => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      });
    });
  }
  function stepDeadline(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const parentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', parentAbort, { once: true });
    }
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
      signal: controller.signal,
      didTimeout: () => timedOut,
      dispose: () => {
        clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener('abort', parentAbort);
      },
    };
  }

  class TeemoControlledSelfUpgrade {
    constructor(options = {}) {
      this.toolRegistry = options.toolRegistry || null;
      this.discoveryRegistry = options.discoveryRegistry || null;
      this.agentCore = options.agentCore || null;
      this.aiService = options.aiService || null;
      this.runs = new Map();
      this.latestBySession = new Map();
      this.controllers = new Map();
      this.stepTimedOutRuns = new Set();
    }

    getRun(runId, sessionId, ownerId) {
      const run = this.runs.get(String(runId || ''));
      return run && run.sessionId === String(sessionId || '') && run.ownerId === String(ownerId || '') ? publicRun(run) : null;
    }

    getLatestRun(sessionId, ownerId) {
      const runId = this.latestBySession.get(String(sessionId || ''));
      return runId ? this.getRun(runId, sessionId, ownerId) : null;
    }

    buildReverseManifest(runId, sessionId, ownerId) {
      const run = this.runs.get(String(runId || ''));
      if (!run || run.sessionId !== String(sessionId || '') || run.ownerId !== String(ownerId || '')
        || run.rollbackState !== 'available_with_exact_reverse_manifest' || !run.manifest) return null;
      return run.manifest.files.slice(0, run.steps.length).map(file => ({ path: file.path, oldText: file.newText, newText: file.oldText }));
    }

    cancel(runId, sessionId, ownerId) {
      const run = this.runs.get(String(runId || ''));
      if (!run || run.sessionId !== String(sessionId || '') || run.ownerId !== String(ownerId || '') || TERMINAL.has(run.state)) return { ok: false, code: 'UPGRADE_OWNER_MISMATCH' };
      run.cancelRequested = true;
      const controller = this.controllers.get(run.runId);
      if (controller) controller.abort();
      return { ok: true };
    }

    _state(run, state, options, details = null) {
      run.state = state;
      run.updatedAt = new Date().toISOString();
      if (details) run.stateDetails = clone(details);
      if (typeof options.onState === 'function') options.onState(publicRun(run));
    }

    _assertContext(run, options) {
      if (typeof options.getCurrentSessionId !== 'function' || String(options.getCurrentSessionId() || '') !== run.sessionId
        || typeof options.getCurrentOwnerId !== 'function' || String(options.getCurrentOwnerId() || '') !== run.ownerId) {
        fail('UPGRADE_OWNER_STALE', 'The upgrade owner is no longer active.');
      }
      if (typeof options.getCurrentPlanState !== 'function' || planFingerprint(options.getCurrentPlanState()) !== run.planFingerprint) {
        fail('UPGRADE_PLAN_STALE', 'The approved P5-1 plan changed.');
      }
    }

    async _registry(tool, args, run, signal) {
      if (!this.toolRegistry || typeof this.toolRegistry.execute !== 'function') fail('UPGRADE_REGISTRY_UNAVAILABLE', 'The dedicated upgrade registry is unavailable.');
      const envelope = await this.toolRegistry.execute(tool, args, { runId: run.runId, sessionId: run.sessionId, signal });
      if (!envelope || !envelope.ok) {
        const error = envelope && envelope.error || {};
        fail(error.code || 'UPGRADE_TOOL_FAILED', error.message || `Upgrade tool failed: ${tool}`);
      }
      run.toolEvidence.push({ tool, status: envelope.status, finishedAt: envelope.finishedAt });
      return envelope.data;
    }

    async _safeFile(tool, args, run, signal) {
      if (!this.agentCore || typeof this.agentCore.executeAutonomousToolAction !== 'function') fail('UPGRADE_P5_2_UNAVAILABLE', 'P5-2 execution is unavailable.');
      const envelope = await this.agentCore.executeAutonomousToolAction({
        action: { type: 'tool_request', tool, arguments: args },
        toolRegistry: this.toolRegistry,
        runId: run.runId,
        sessionId: run.sessionId,
        step: run.steps.length + 1,
        signal,
        toolCalls: run.fileToolCalls,
      });
      if (!envelope || !envelope.ok) {
        const error = envelope && envelope.error || {};
        fail(error.code || 'UPGRADE_FILE_TOOL_FAILED', error.message || `File tool failed: ${tool}`);
      }
      run.toolEvidence.push({ tool, status: envelope.status, finishedAt: envelope.finishedAt });
      return envelope.data;
    }

    async _read(relative, run, signal) {
      const data = await this._safeFile('read_file', { path: absolutePath(run.repoRoot, relative) }, run, signal);
      if (!data || data.type !== 'file' || typeof data.content !== 'string' || !/^[a-f0-9]{64}$/i.test(String(data.sha256 || ''))) {
        fail('UPGRADE_READ_UNVERIFIABLE', `Trusted read verification failed: ${relative}`);
      }
      return data;
    }

    async _status(run, signal) {
      const status = await this._registry('git_status', { repo: run.repoRoot }, run, signal);
      if (!status || !status.head || !status.branch || status.truncated) fail('UPGRADE_GIT_BASELINE_INVALID', 'A bounded attached Git baseline is required.');
      return status;
    }

    async _baseline(run, signal) {
      const status = await this._status(run, signal);
      if (!isClean(status)) fail('UPGRADE_GIT_DIRTY', 'Controlled self-upgrade requires a clean Git worktree.');
      const documents = {};
      for (const relative of REQUIRED_FILES) documents[relative] = await this._read(relative, run, signal);
      const packageJson = parseJsonObject(documents['package.json'].content, 'UPGRADE_PACKAGE_INVALID');
      const version = String(packageJson.version || '');
      const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
      if (!version || !packageJson.name || !documents['AGENTS.md'].content.includes('Teemo') || !documents['docs/TeemoProjectKnowledge/INDEX.md'].content.includes('Teemo Project Knowledge')) {
        fail('UPGRADE_REPOSITORY_INVALID', 'The selected root is not the authorized Teemo source repository.');
      }
      const current = documents['docs/TeemoProjectKnowledge/CURRENT-STATE.md'].content;
      const installed = current.match(/Installed Version:\s*\r?\n`([^`]+)`/i);
      const knowledge = current.match(/- Version: `([^`]+)`/i);
      const recovery = current.match(/- Latest Recovery Tag: `([^`]+)`/i);
      if (!installed || !knowledge || installed[1] !== version || knowledge[1] !== version) fail('UPGRADE_VERSION_MISMATCH', 'package.json and Project Knowledge versions must match.');
      return {
        repo: status.repo,
        branch: status.branch,
        head: status.head,
        version,
        projectKnowledgeVersion: knowledge[1],
        latestRecoveryTag: recovery ? recovery[1] : null,
        packageSha256: documents['package.json'].sha256,
        scripts: clone(scripts),
      };
    }

    async _providerProposal(run, options, signal) {
      if (typeof options.requestManifest === 'function') return options.requestManifest(clone(run.baseline), clone(run.plan), signal);
      if (options.manifestProposal) return clone(options.manifestProposal);
      if (!this.agentCore || typeof this.agentCore.runNativeTools !== 'function' || !this.discoveryRegistry) {
        fail('UPGRADE_MANIFEST_PROVIDER_REQUIRED', 'A bounded manifest provider is required.');
      }
      const schema = {
        files: [{ path: 'repository/relative/file.js', oldText: 'exact full current UTF-8 text', newText: 'exact full replacement UTF-8 text' }],
        scripts: ['test:affected-area'],
        runTimeoutMs: 900000,
        stepTimeoutMs: 120000,
      };
      const response = await this.agentCore.runNativeTools({
        aiService: options.aiService || this.aiService,
        toolRegistry: this.discoveryRegistry,
        maxSteps: 8,
        timeout: Math.min(run.stepTimeoutMs, 120000),
        signal,
        disableActionContract: true,
        messages: [
          { role: 'system', content: `Propose one bounded Teemo P5-3 existing-file upgrade. You may only inspect through the supplied read/search tools. Return exactly one JSON object matching this shape: ${JSON.stringify(schema)}. Use 1-6 existing UTF-8 text files, include exact full oldText and newText, and choose only baseline scripts named test:*, verify:release-version, or project:knowledge:verify. Never propose package files, create/delete/rename, shell, Git writes, dependencies, installation, restart, persistence, or another upgrade.` },
          { role: 'user', content: JSON.stringify({ repository: run.baseline, goal: run.plan.goal, plan: run.plan }) },
        ],
      });
      if (!response || !response.ok) fail(response && response.error && response.error.code || 'UPGRADE_MANIFEST_PROVIDER_FAILED', response && response.error && response.error.message || 'The provider could not propose a manifest.');
      return parseJsonObject(response.content, 'UPGRADE_MANIFEST_INVALID');
    }

    async _canonicalManifest(run, proposal, signal) {
      if (!proposal || typeof proposal !== 'object' || !Array.isArray(proposal.files) || proposal.files.length < 1 || proposal.files.length > LIMITS.maxFiles) {
        fail('UPGRADE_MANIFEST_INVALID', 'The manifest must contain 1 to 6 files.');
      }
      const scripts = Array.isArray(proposal.scripts) ? proposal.scripts.map(value => String(value || '')) : [];
      if (scripts.length < 1 || scripts.length > LIMITS.maxScripts || new Set(scripts).size !== scripts.length) fail('UPGRADE_MANIFEST_INVALID', 'The manifest must contain 1 to 8 unique verification scripts.');
      for (const script of scripts) {
        if (!scriptAllowed(script) || typeof run.baseline.scripts[script] !== 'string') fail('UPGRADE_SCRIPT_NOT_ALLOWED', `Verification script is not baseline-bound and allowed: ${script}`);
      }
      const runTimeoutMs = Number.isInteger(proposal.runTimeoutMs) ? proposal.runTimeoutMs : LIMITS.runTimeoutMs;
      const stepTimeoutMs = Number.isInteger(proposal.stepTimeoutMs) ? proposal.stepTimeoutMs : LIMITS.stepTimeoutMs;
      if (runTimeoutMs < 1 || runTimeoutMs > LIMITS.runTimeoutMs || stepTimeoutMs < 100 || stepTimeoutMs > LIMITS.stepTimeoutMs) fail('UPGRADE_BOUNDS_INVALID', 'Finite upgrade deadlines are invalid.');
      const files = [];
      const seen = new Set();
      let totalBytes = 0;
      for (const item of proposal.files) {
        if (!item || typeof item !== 'object' || typeof item.oldText !== 'string' || typeof item.newText !== 'string' || item.oldText === item.newText) fail('UPGRADE_MANIFEST_INVALID', 'Each file needs distinct exact oldText and newText.');
        const relative = normalizeRelativePath(item.path);
        assertAllowedPath(relative);
        const key = relative.toLowerCase();
        if (seen.has(key)) fail('UPGRADE_MANIFEST_INVALID', 'Duplicate manifest paths are not allowed.');
        seen.add(key);
        const current = await this._read(relative, run, signal);
        if (current.content !== item.oldText) fail('UPGRADE_BASELINE_STALE', `Manifest oldText does not match the trusted baseline: ${relative}`);
        const postPatchSha256 = await sha256(item.newText);
        if (item.baselineSha256 && String(item.baselineSha256).toLowerCase() !== current.sha256.toLowerCase()) fail('UPGRADE_BASELINE_STALE', `Manifest baseline hash is stale: ${relative}`);
        if (item.postPatchSha256 && String(item.postPatchSha256).toLowerCase() !== postPatchSha256) fail('UPGRADE_MANIFEST_INVALID', `Manifest post-patch hash is invalid: ${relative}`);
        const changedBytes = utf8Bytes(item.newText);
        totalBytes += changedBytes;
        files.push({ path: relative, absolutePath: absolutePath(run.repoRoot, relative), baselineSha256: current.sha256, oldText: item.oldText, newText: item.newText, postPatchSha256, changedBytes });
      }
      if (totalBytes > LIMITS.maxBytes) fail('UPGRADE_BYTES_EXCEEDED', 'The manifest exceeds 256 KiB.');
      const manifest = {
        ownerId: run.ownerId,
        sessionId: run.sessionId,
        upgradeRunId: run.runId,
        repository: {
          root: run.baseline.repo,
          branch: run.baseline.branch,
          head: run.baseline.head,
          version: run.baseline.version,
          projectKnowledgeVersion: run.baseline.projectKnowledgeVersion,
          packageSha256: run.baseline.packageSha256,
        },
        goal: run.plan.goal,
        planFingerprint: run.planFingerprint,
        files,
        scripts,
        runTimeoutMs,
        stepTimeoutMs,
      };
      manifest.manifestSha256 = await sha256(JSON.stringify(manifest));
      return Object.freeze(manifest);
    }

    async _assertRepository(run, completedPaths, signal) {
      const status = await this._status(run, signal);
      if (status.head !== run.baseline.head || status.branch !== run.baseline.branch || !samePath(status.repo, run.baseline.repo)) fail('UPGRADE_REPOSITORY_STALE', 'Repository identity, branch, or HEAD changed.');
      const actual = changedPaths(status).sort();
      const expected = [...completedPaths].sort();
      if (actual.length !== expected.length || actual.some((path, index) => path.toLowerCase() !== expected[index].toLowerCase())) fail('UPGRADE_UNEXPECTED_CHANGE', 'The worktree contains changes outside the approved manifest progress.');
      return status;
    }

    async _runManifest(run, options, signal) {
      const completed = [];
      for (let index = 0; index < run.manifest.files.length; index += 1) {
        const deadline = stepDeadline(signal, run.manifest.stepTimeoutMs);
        try {
          this._assertContext(run, options);
          await this._assertRepository(run, completed, deadline.signal);
          const file = run.manifest.files[index];
          const current = await this._read(file.path, run, deadline.signal);
          if (current.sha256 !== file.baselineSha256 || current.content !== file.oldText) fail('UPGRADE_BASELINE_STALE', `File changed before patch: ${file.path}`);
          if (typeof options.requestPatchConfirmation !== 'function') fail('UPGRADE_CONFIRMATION_REQUIRED', 'Every exact patch requires owner confirmation.');
          this._state(run, 'awaiting_patch_confirmation', options, { index: index + 1, path: file.path, baselineSha256: file.baselineSha256, postPatchSha256: file.postPatchSha256 });
          const confirmed = await abortable(options.requestPatchConfirmation({ runId: run.runId, manifestSha256: run.manifest.manifestSha256, index: index + 1, path: file.path, baselineSha256: file.baselineSha256, postPatchSha256: file.postPatchSha256 }, deadline.signal), deadline.signal, 'UPGRADE_STEP_TIMED_OUT', `Patch step timed out: ${file.path}`);
          if (deadline.didTimeout()) { this.stepTimedOutRuns.add(run.runId); fail('UPGRADE_STEP_TIMED_OUT', `Patch step timed out: ${file.path}`); }
          this._assertContext(run, options);
          if (confirmed !== true) fail('UPGRADE_PATCH_DENIED', `Owner denied patch: ${file.path}`);
          this._state(run, 'patching', options, { index: index + 1, path: file.path });
          const result = await this._safeFile('patch_file', { path: file.absolutePath, expectedSha256: file.baselineSha256, edits: [{ oldText: file.oldText, newText: file.newText }] }, run, deadline.signal);
          if (!result || result.sha256 !== file.postPatchSha256) fail('UPGRADE_POSTCONDITION_FAILED', `Patch result hash did not match: ${file.path}`);
          const verified = await this._read(file.path, run, deadline.signal);
          if (verified.sha256 !== file.postPatchSha256 || verified.content !== file.newText) fail('UPGRADE_POSTCONDITION_FAILED', `Fresh post-patch verification failed: ${file.path}`);
          completed.push(file.path);
          run.steps.push({ index: index + 1, path: file.path, state: 'succeeded', verified: true, p1Permission: true, mainExecution: true });
        } catch (error) {
          if (deadline.didTimeout()) {
            this.stepTimedOutRuns.add(run.runId);
            fail('UPGRADE_STEP_TIMED_OUT', `Patch step timed out: ${run.manifest.files[index].path}`);
          }
          throw error;
        } finally {
          deadline.dispose();
        }
      }
      const status = await this._assertRepository(run, completed, signal);
      const diff = await this._registry('git_diff', { repo: run.repoRoot, staged: false }, run, signal);
      const expected = [...completed].sort();
      const diffFiles = (diff.files || []).map(path => String(path).replace(/\\/g, '/')).sort();
      if (diff.truncated || diffFiles.length !== expected.length || diffFiles.some((path, index) => path.toLowerCase() !== expected[index].toLowerCase())) fail('UPGRADE_DIFF_UNVERIFIABLE', 'Final Git diff is not limited to the approved manifest.');
      for (let index = 0; index < run.manifest.scripts.length; index += 1) {
        const deadline = stepDeadline(signal, run.manifest.stepTimeoutMs);
        try {
          this._assertContext(run, options);
          const script = run.manifest.scripts[index];
          const packageFile = await this._read('package.json', run, deadline.signal);
          if (packageFile.sha256 !== run.baseline.packageSha256) fail('UPGRADE_SCRIPT_BASELINE_STALE', 'package.json changed after manifest approval.');
          if (typeof options.requestScriptConfirmation !== 'function') fail('UPGRADE_CONFIRMATION_REQUIRED', 'Every verification script requires exact owner confirmation.');
          this._state(run, 'awaiting_script_confirmation', options, { index: index + 1, script });
          const approved = await abortable(options.requestScriptConfirmation({ runId: run.runId, manifestSha256: run.manifest.manifestSha256, index: index + 1, script }, deadline.signal), deadline.signal, 'UPGRADE_STEP_TIMED_OUT', `Verification step timed out: ${script}`);
          if (deadline.didTimeout()) { this.stepTimedOutRuns.add(run.runId); fail('UPGRADE_STEP_TIMED_OUT', `Verification step timed out: ${script}`); }
          this._assertContext(run, options);
          if (approved !== true) fail('UPGRADE_SCRIPT_DENIED', `Owner denied verification script: ${script}`);
          this._state(run, 'verifying', options, { index: index + 1, script });
          const result = await this._registry('run_npm_script', { projectPath: run.repoRoot, script, args: [], timeoutMs: run.manifest.stepTimeoutMs }, run, deadline.signal);
          if (!result || result.exitCode !== 0 || result.truncated) fail('UPGRADE_VERIFICATION_FAILED', `Verification did not pass: ${script}`);
          run.scripts.push({ index: index + 1, script, state: 'succeeded', exitCode: result.exitCode, durationMs: result.durationMs, p1ExecuteOnce: true, mainExecution: true });
        } catch (error) {
          if (deadline.didTimeout()) {
            this.stepTimedOutRuns.add(run.runId);
            fail('UPGRADE_STEP_TIMED_OUT', `Verification step timed out: ${run.manifest.scripts[index]}`);
          }
          throw error;
        } finally {
          deadline.dispose();
        }
      }
      return { status, diff };
    }

    async start(options = {}) {
      const sessionId = String(options.sessionId || '').trim();
      const ownerId = String(options.ownerId || '').trim();
      const repoRoot = String(options.repoRoot || '').trim();
      const planState = options.planState && options.planState.plan ? options.planState : { plan: options.planState };
      const plan = planState && planState.plan;
      if (!sessionId || !ownerId || !repoRoot || !plan || !PlanningContract) return { ok: false, run: null, error: { code: 'UPGRADE_CONTEXT_INVALID', message: 'Owner, session, repository, and P5-1 plan are required.' } };
      const checked = PlanningContract.parseResponse(JSON.stringify(plan), { goal: plan.goal });
      if (!checked.ok) return { ok: false, run: null, error: { code: checked.error.code, message: checked.error.message } };
      const previousId = this.latestBySession.get(sessionId);
      const previous = previousId && this.runs.get(previousId);
      if (previous && !TERMINAL.has(previous.state)) return { ok: false, run: publicRun(previous), error: { code: 'UPGRADE_ALREADY_ACTIVE', message: 'This session already has an active upgrade.' } };
      const run = {
        runId: options.runId || makeId('upgrade_run'), ownerId, sessionId, repoRoot, plan: clone(checked.plan), planFingerprint: planFingerprint(planState),
        state: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null,
        baseline: null, manifest: null, steps: [], scripts: [], fileToolCalls: [], toolEvidence: [], error: null,
        cancelRequested: false, rollbackState: 'not_available', evidence: null,
      };
      this.runs.set(run.runId, run);
      this.latestBySession.set(sessionId, run.runId);
      const controller = new AbortController();
      this.controllers.set(run.runId, controller);
      let timedOut = false;
      let timer = setTimeout(() => { timedOut = true; controller.abort(); }, LIMITS.runTimeoutMs);
      const externalAbort = () => controller.abort();
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', externalAbort, { once: true });
      }
      const signal = controller.signal;
      const finishFailure = error => {
        const cancelled = run.cancelRequested || signal.aborted;
        const stepTimedOut = this.stepTimedOutRuns.has(run.runId) || String(error.code || '') === 'UPGRADE_STEP_TIMED_OUT';
        const state = timedOut || stepTimedOut ? 'timed_out' : (cancelled ? 'cancelled' : (String(error.code || '').includes('DENIED') || String(error.code || '').includes('STALE') ? 'blocked' : 'failed'));
        run.error = { code: timedOut ? 'UPGRADE_TIMED_OUT' : (stepTimedOut ? 'UPGRADE_STEP_TIMED_OUT' : (cancelled ? 'UPGRADE_CANCELLED' : (error.code || 'UPGRADE_FAILED'))), message: timedOut || stepTimedOut ? (error.message || 'The upgrade deadline expired.') : (cancelled ? 'The upgrade was cancelled.' : error.message) };
        run.finishedAt = new Date().toISOString();
        run.rollbackState = run.steps.length ? 'available_with_exact_reverse_manifest' : 'not_available';
        this._state(run, state, options, run.error);
        this.stepTimedOutRuns.delete(run.runId);
        return { ok: false, run: publicRun(run), error: { ...run.error } };
      };
      try {
        this._assertContext(run, options);
        if (typeof options.requestBeginApproval !== 'function') fail('UPGRADE_TRIGGER_REQUIRED', 'The owner must explicitly begin the upgrade before repository access.');
        this._state(run, 'awaiting_begin_approval', options);
        if (await abortable(options.requestBeginApproval({ runId: run.runId, ownerId, sessionId, repoRoot, goal: run.plan.goal }, signal), signal) !== true) fail('UPGRADE_BEGIN_DENIED', 'The owner did not begin the upgrade.');
        this._assertContext(run, options);
        this._state(run, 'validating_baseline', options);
        run.baseline = await this._baseline(run, signal);
        if (!samePath(run.baseline.repo, repoRoot)) fail('UPGRADE_REPOSITORY_INVALID', 'Git resolved a different repository root.');
        this._state(run, 'requesting_manifest', options);
        const proposal = await abortable(this._providerProposal(run, options, signal), signal);
        this._assertContext(run, options);
        run.manifest = await this._canonicalManifest(run, proposal, signal);
        clearTimeout(timer);
        const elapsed = Date.now() - new Date(run.createdAt).getTime();
        const remaining = Math.max(1, run.manifest.runTimeoutMs - elapsed);
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, remaining);
        if (typeof options.requestManifestApproval !== 'function') fail('UPGRADE_MANIFEST_APPROVAL_REQUIRED', 'The immutable manifest requires exact owner approval.');
        this._state(run, 'awaiting_manifest_approval', options, publicManifest(run.manifest));
        if (await abortable(options.requestManifestApproval(publicManifest(run.manifest), signal), signal) !== true) fail('UPGRADE_MANIFEST_DENIED', 'The owner did not approve the immutable manifest.');
        this._assertContext(run, options);
        run.approvedManifestSha256 = run.manifest.manifestSha256;
        this._state(run, 'running', options);
        const final = await this._runManifest(run, options, signal);
        run.finishedAt = new Date().toISOString();
        run.evidence = {
          branch: run.baseline.branch,
          head: run.baseline.head,
          version: run.baseline.version,
          manifestSha256: run.manifest.manifestSha256,
          files: run.steps.map(step => ({ path: step.path, verified: step.verified })),
          scripts: run.scripts.map(script => ({ script: script.script, exitCode: script.exitCode, durationMs: script.durationMs })),
          gitFiles: final.diff.files,
          gitDiffTruncated: Boolean(final.diff.truncated),
          cancelled: false,
          timedOut: false,
          rollbackState: 'not_required',
        };
        run.rollbackState = 'not_required';
        this._state(run, 'succeeded', options);
        return { ok: true, run: publicRun(run) };
      } catch (error) {
        return finishFailure(error);
      } finally {
        clearTimeout(timer);
        this.controllers.delete(run.runId);
        if (options.signal) options.signal.removeEventListener('abort', externalAbort);
      }
    }

    async rollback(options = {}) {
      const run = this.runs.get(String(options.runId || ''));
      if (!run || run.sessionId !== String(options.sessionId || '') || run.ownerId !== String(options.ownerId || '')) return { ok: false, error: { code: 'UPGRADE_OWNER_MISMATCH', message: 'Rollback owner mismatch.' } };
      if (run.rollbackState !== 'available_with_exact_reverse_manifest' || !Array.isArray(options.reverseFiles)) return { ok: false, error: { code: 'UPGRADE_ROLLBACK_NOT_AVAILABLE', message: 'An exact reverse manifest is not available.' } };
      const completed = new Map(run.manifest.files.slice(0, run.steps.length).map(file => [file.path, file]));
      if (options.reverseFiles.length !== completed.size) return { ok: false, error: { code: 'UPGRADE_ROLLBACK_INVALID', message: 'Reverse manifest paths must exactly match completed patches.' } };
      const controller = new AbortController();
      this.controllers.set(run.runId, controller);
      try {
        const reverse = [];
        for (const item of options.reverseFiles) {
          const relative = normalizeRelativePath(item.path);
          const original = completed.get(relative);
          if (!original || item.oldText !== original.newText || item.newText !== original.oldText) fail('UPGRADE_ROLLBACK_INVALID', `Reverse patch is not exact: ${relative}`);
          reverse.push({ path: relative, original });
        }
        const reverseHash = await sha256(JSON.stringify(reverse.map(item => ({ path: item.path, from: item.original.postPatchSha256, to: item.original.baselineSha256 }))));
        if (typeof options.requestRollbackApproval !== 'function' || await options.requestRollbackApproval({ runId: run.runId, reverseManifestSha256: reverseHash, files: reverse.map(item => item.path) }, controller.signal) !== true) fail('UPGRADE_ROLLBACK_DENIED', 'The owner did not approve rollback.');
        run.rollbackState = 'running';
        for (const item of reverse) {
          if (typeof options.requestPatchConfirmation !== 'function' || await options.requestPatchConfirmation({ runId: run.runId, reverseManifestSha256: reverseHash, path: item.path, baselineSha256: item.original.postPatchSha256, postPatchSha256: item.original.baselineSha256 }, controller.signal) !== true) fail('UPGRADE_ROLLBACK_DENIED', `Owner denied reverse patch: ${item.path}`);
          const current = await this._read(item.path, run, controller.signal);
          if (current.sha256 !== item.original.postPatchSha256 || current.content !== item.original.newText) fail('UPGRADE_ROLLBACK_STALE', `Rollback source changed: ${item.path}`);
          await this._safeFile('patch_file', { path: item.original.absolutePath, expectedSha256: item.original.postPatchSha256, edits: [{ oldText: item.original.newText, newText: item.original.oldText }] }, run, controller.signal);
          const restored = await this._read(item.path, run, controller.signal);
          if (restored.sha256 !== item.original.baselineSha256 || restored.content !== item.original.oldText) fail('UPGRADE_ROLLBACK_FAILED', `Rollback verification failed: ${item.path}`);
        }
        const status = await this._status(run, controller.signal);
        if (!isClean(status)) fail('UPGRADE_ROLLBACK_FAILED', 'Rollback did not restore the clean baseline.');
        run.rollbackState = 'completed';
        run.state = 'rolled_back';
        run.updatedAt = new Date().toISOString();
        run.finishedAt = run.updatedAt;
        return { ok: true, run: publicRun(run) };
      } catch (error) {
        run.rollbackState = 'failed';
        return { ok: false, run: publicRun(run), error: { code: error.code || 'UPGRADE_ROLLBACK_FAILED', message: error.message } };
      } finally {
        this.controllers.delete(run.runId);
      }
    }
  }

  TeemoControlledSelfUpgrade.LIMITS = LIMITS;
  TeemoControlledSelfUpgrade.REQUIRED_FILES = REQUIRED_FILES;
  TeemoControlledSelfUpgrade.sha256 = sha256;
  return TeemoControlledSelfUpgrade;
});
