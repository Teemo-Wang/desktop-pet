const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoControlledSelfUpgrade = require('../src/upgrade/TeemoControlledSelfUpgrade');
const TeemoUpgradeRegistry = require('../src/upgrade/TeemoUpgradeRegistry');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoFileTools = require('../src/tools/file/TeemoFileTools');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoGitService = require('../src/services/TeemoGitService');
const TeemoExecuteService = require('../src/services/TeemoExecuteService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function plan() {
  return {
    goal: 'Update the synthetic Teemo behavior and verify it.',
    assumptions: ['The synthetic repository is authorized and clean.'],
    constraints: ['Patch one existing UTF-8 file only.'],
    steps: [{ title: 'Patch behavior', description: 'Replace the approved synthetic source text.', status: 'proposed' }],
    risks: ['Verification may fail.'],
    successCriteria: ['The trusted post-patch hash and baseline npm test pass.'],
  };
}

function createRepo(sandbox, name, options = {}) {
  const repo = path.join(sandbox, name);
  fs.mkdirSync(path.join(repo, 'docs', 'TeemoProjectKnowledge'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Teemo synthetic agent rules\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'TeemoProjectKnowledge', 'INDEX.md'), '# Teemo Project Knowledge\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'docs', 'TeemoProjectKnowledge', 'CURRENT-STATE.md'), [
    '# Teemo Project Current State', '', 'Installed Version:', '`1.3.2`', '',
    '<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:START -->', '- Version: `1.3.2`', '- Latest Recovery Tag: `v1.3.2-synthetic`', '<!-- TEEMO_PROJECT_KNOWLEDGE_AUTO:END -->', '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(repo, 'TeemoTarget.js'), "module.exports = 'baseline';\n", 'utf8');
  fs.writeFileSync(path.join(repo, 'TeemoVerify.js'), options.failingScript
    ? 'process.exit(9);\n'
    : "const value=require('./TeemoTarget'); if(value!=='upgraded') process.exit(2);\n", 'utf8');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'teemo-synthetic-upgrade', version: '1.3.2', scripts: { 'test:synthetic': 'node TeemoVerify.js' },
  }, null, 2) + '\n', 'utf8');
  git(repo, ['init']);
  git(repo, ['config', 'user.email', 'teemo@example.invalid']);
  git(repo, ['config', 'user.name', 'Teemo Test']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'Teemo synthetic baseline']);
  return repo;
}

function createRuntime(repo, decisionProvider = async () => ({ decision: 'allow', scope: 'once' })) {
  const fileService = new TeemoFileService({ maxReadBytes: 512 * 1024, maxReturnedText: 512 * 1024, maxPatchBytes: 512 * 1024 });
  const gitService = new TeemoGitService({ fileService, timeoutMs: 5000 });
  const executeService = new TeemoExecuteService({ fileService, defaultTimeoutMs: 5000 });
  const permission = new TeemoPermissionService({ decisionProvider });
  const permissionClient = { authorize: (request, options) => permission.requestPermission(request, options) };
  const directClient = service => ({
    prepare: async (tool, args, context = {}) => {
      const prepared = await service.prepareOperation(tool, args, [repo], { checkCancelled: () => Boolean(context.signal && context.signal.aborted) });
      return { resource: prepared.resource, reason: prepared.reason, preparation: prepared };
    },
    execute: async (prepared, options = {}) => service.executePrepared(prepared, [repo], { checkCancelled: () => Boolean(options.signal && options.signal.aborted) }),
    release: async () => true,
  });
  const registries = TeemoUpgradeRegistry.create({
    permissionService: permissionClient,
    fileClient: directClient(fileService),
    gitClient: directClient(gitService),
    executeClient: directClient(executeService),
  });
  const agentCore = new TeemoAgentCore({ toolRegistry: registries.registry });
  return {
    permission,
    registry: registries.registry,
    discoveryRegistry: registries.discoveryRegistry,
    upgrade: new TeemoControlledSelfUpgrade({ toolRegistry: registries.registry, discoveryRegistry: registries.discoveryRegistry, agentCore }),
  };
}

function proposal(overrides = {}) {
  return {
    files: [{ path: 'TeemoTarget.js', oldText: "module.exports = 'baseline';\n", newText: "module.exports = 'upgraded';\n" }],
    scripts: ['test:synthetic'],
    runTimeoutMs: 30000,
    stepTimeoutMs: 5000,
    ...overrides,
  };
}

function options(repo, overrides = {}) {
  let currentOwner = 'owner-a';
  let currentSession = 'session-a';
  let currentPlan = plan();
  return {
    ownerId: 'owner-a', sessionId: 'session-a', repoRoot: repo, planState: currentPlan,
    getCurrentOwnerId: () => currentOwner,
    getCurrentSessionId: () => currentSession,
    getCurrentPlanState: () => currentPlan,
    requestBeginApproval: async () => true,
    requestManifestApproval: async () => true,
    requestPatchConfirmation: async () => true,
    requestScriptConfirmation: async () => true,
    manifestProposal: proposal(),
    setOwner: value => { currentOwner = value; },
    setSession: value => { currentSession = value; },
    setPlan: value => { currentPlan = value; },
    ...overrides,
  };
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P5-3-controlled-upgrade-'));
  try {
    const successRepo = createRepo(sandbox, 'success');
    const successRuntime = createRuntime(successRepo);
    assert.deepEqual(successRuntime.registry.list().sort(), [...TeemoUpgradeRegistry.UPGRADE_TOOLS].sort());
    assert.deepEqual(successRuntime.discoveryRegistry.list().sort(), [...TeemoUpgradeRegistry.DISCOVERY_TOOLS].sort());
    assert.equal(successRuntime.registry.list().some(name => /commit|stage|process|create|rename|delete|shell/i.test(name)), false);
    const ordinary = new TeemoToolRegistry();
    TeemoFileTools.register(ordinary, { fileClient: {
      prepare: async () => ({ resource: 'synthetic', reason: 'synthetic', preparation: {} }),
      execute: async () => ({}), release: async () => true,
    } });
    assert.equal(ordinary.list().includes('git_status'), false);
    assert.equal(ordinary.list().includes('run_npm_script'), false);

    let beginApprovals = 0;
    let manifestApprovals = 0;
    let patchConfirmations = 0;
    let scriptConfirmations = 0;
    const states = [];
    const success = await successRuntime.upgrade.start(options(successRepo, {
      requestBeginApproval: async () => { beginApprovals += 1; return true; },
      requestManifestApproval: async manifest => { manifestApprovals += 1; assert.match(manifest.manifestSha256, /^[a-f0-9]{64}$/); assert.equal(manifest.files.length, 1); return true; },
      requestPatchConfirmation: async item => { patchConfirmations += 1; assert.equal(item.path, 'TeemoTarget.js'); return true; },
      requestScriptConfirmation: async item => { scriptConfirmations += 1; assert.equal(item.script, 'test:synthetic'); return true; },
      onState: run => states.push(run.state),
    }));
    assert.equal(success.ok, true);
    assert.equal(success.run.state, 'succeeded');
    assert.equal(fs.readFileSync(path.join(successRepo, 'TeemoTarget.js'), 'utf8'), "module.exports = 'upgraded';\n");
    assert.equal(success.run.steps[0].verified, true);
    assert.equal(success.run.scripts[0].exitCode, 0);
    assert.deepEqual([beginApprovals, manifestApprovals, patchConfirmations, scriptConfirmations], [1, 1, 1, 1]);
    assert.ok(states.includes('validating_baseline') && states.includes('awaiting_manifest_approval') && states.includes('awaiting_patch_confirmation') && states.includes('awaiting_script_confirmation'));
    assert.equal(successRuntime.upgrade.getRun(success.run.runId, 'session-a', 'foreign-owner'), null);
    assert.ok(successRuntime.permission.listAudit().length >= 10, 'file/Git/execute operations must traverse P1');

    const dirtyRepo = createRepo(sandbox, 'dirty');
    fs.appendFileSync(path.join(dirtyRepo, 'TeemoTarget.js'), '// unexpected\n', 'utf8');
    const dirty = await createRuntime(dirtyRepo).upgrade.start(options(dirtyRepo));
    assert.equal(dirty.ok, false);
    assert.equal(dirty.error.code, 'UPGRADE_GIT_DIRTY');

    const excludedRepo = createRepo(sandbox, 'excluded');
    const packageText = fs.readFileSync(path.join(excludedRepo, 'package.json'), 'utf8');
    const excluded = await createRuntime(excludedRepo).upgrade.start(options(excludedRepo, {
      manifestProposal: proposal({ files: [{ path: 'package.json', oldText: packageText, newText: packageText + ' ' }] }),
    }));
    assert.equal(excluded.ok, false);
    assert.equal(excluded.error.code, 'UPGRADE_PATH_EXCLUDED');
    assert.equal(git(excludedRepo, ['status', '--porcelain']), '');

    const deniedRepo = createRepo(sandbox, 'denied');
    const denied = await createRuntime(deniedRepo).upgrade.start(options(deniedRepo, { requestPatchConfirmation: async () => false }));
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'UPGRADE_PATCH_DENIED');
    assert.equal(git(deniedRepo, ['status', '--porcelain']), '');

    const staleRepo = createRepo(sandbox, 'stale-owner');
    const staleOptions = options(staleRepo);
    staleOptions.requestManifestApproval = async () => { staleOptions.setOwner('owner-b'); return true; };
    const stale = await createRuntime(staleRepo).upgrade.start(staleOptions);
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'UPGRADE_OWNER_STALE');
    assert.equal(git(staleRepo, ['status', '--porcelain']), '');

    const rollbackRepo = createRepo(sandbox, 'rollback', { failingScript: true });
    const rollbackRuntime = createRuntime(rollbackRepo);
    const failed = await rollbackRuntime.upgrade.start(options(rollbackRepo));
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, 'EXECUTION_FAILED');
    assert.equal(failed.run.rollbackState, 'available_with_exact_reverse_manifest');
    assert.equal(fs.readFileSync(path.join(rollbackRepo, 'TeemoTarget.js'), 'utf8'), "module.exports = 'upgraded';\n");
    let rollbackApprovals = 0;
    let reverseConfirmations = 0;
    const rolledBack = await rollbackRuntime.upgrade.rollback({
      runId: failed.run.runId, ownerId: 'owner-a', sessionId: 'session-a',
      reverseFiles: [{ path: 'TeemoTarget.js', oldText: "module.exports = 'upgraded';\n", newText: "module.exports = 'baseline';\n" }],
      requestRollbackApproval: async () => { rollbackApprovals += 1; return true; },
      requestPatchConfirmation: async () => { reverseConfirmations += 1; return true; },
    });
    assert.equal(rolledBack.ok, true);
    assert.equal(rolledBack.run.state, 'rolled_back');
    assert.equal(git(rollbackRepo, ['status', '--porcelain']), '');
    assert.deepEqual([rollbackApprovals, reverseConfirmations], [1, 1]);

    const beginDeniedRepo = createRepo(sandbox, 'begin-denied');
    let toolDispatched = false;
    const beginRuntime = createRuntime(beginDeniedRepo, async () => { toolDispatched = true; return { decision: 'allow', scope: 'once' }; });
    const beginDenied = await beginRuntime.upgrade.start(options(beginDeniedRepo, { requestBeginApproval: async () => false }));
    assert.equal(beginDenied.ok, false);
    assert.equal(toolDispatched, false, 'no source/Git/process action may precede explicit begin approval');

    const timeoutRepo = createRepo(sandbox, 'step-timeout');
    const timedOut = await createRuntime(timeoutRepo).upgrade.start(options(timeoutRepo, {
      manifestProposal: proposal({ stepTimeoutMs: 100 }),
      requestPatchConfirmation: () => new Promise(() => {}),
    }));
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.run.state, 'timed_out', JSON.stringify(timedOut.error));
    assert.equal(timedOut.error.code, 'UPGRADE_STEP_TIMED_OUT');
    assert.equal(git(timeoutRepo, ['status', '--porcelain']), '');

    const cancelRepo = createRepo(sandbox, 'cancel');
    const cancelRuntime = createRuntime(cancelRepo);
    let cancelRunId = null;
    const cancelledPromise = cancelRuntime.upgrade.start(options(cancelRepo, {
      requestManifest: (_baseline, _plan, signal) => new Promise((resolve, reject) => {
        cancelRunId = cancelRuntime.upgrade.getLatestRun('session-a', 'owner-a').runId;
        signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'UPGRADE_CANCELLED' })), { once: true });
        setTimeout(() => cancelRuntime.upgrade.cancel(cancelRunId, 'session-a', 'owner-a'), 0);
      }),
    }));
    const cancelled = await cancelledPromise;
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.run.state, 'cancelled');
    assert.equal(git(cancelRepo, ['status', '--porcelain']), '');

    console.log(JSON.stringify({
      ok: true,
      explicitTrigger: true,
      cleanBaseline: true,
      immutableManifest: true,
      ownerIsolation: true,
      p5FilePath: true,
      gitReadOnly: true,
      executeOnce: true,
      rollbackExact: true,
      ordinaryChatAllowlistChanged: false,
      formalUserDataTouched: false,
    }));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
