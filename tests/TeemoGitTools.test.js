const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoGitService = require('../src/services/TeemoGitService');
const TeemoGitTools = require('../src/tools/git/TeemoGitTools');
const TeemoGitClient = require('../src/tools/git/TeemoGitClient');
const registerTeemoGitToolIpc = require('../src/tools/git/TeemoGitToolIpc');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

function git(repo, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Teemo Test',
      GIT_AUTHOR_EMAIL: 'teemo-test@example.invalid',
      GIT_COMMITTER_NAME: 'Teemo Test',
      GIT_COMMITTER_EMAIL: 'teemo-test@example.invalid',
    },
    ...options,
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error && error.code === code);
}

function makeIpcHarness(gitService, rootsProvider, permissionService) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  registerTeemoGitToolIpc(ipcMain, gitService, { rootsProvider, permissionService });
  const sender = { id: 401 };
  const foreign = { id: 402 };
  const invoke = (owner, channel, payload) => handlers.get(channel)({ sender: owner }, payload);
  return { sender, foreign, invoke };
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function writeHook(scriptPath, markerPath) {
  const marker = markerPath.replace(/\\/g, '/').replace(/"/g, '\\"');
  fs.writeFileSync(scriptPath, `#!/bin/sh\nprintf hook > "${marker}"\nexit 0\n`, 'utf8');
  fs.chmodSync(scriptPath, 0o755);
}

function writeMarkerExecutable(directory, name, markerPath) {
  if (process.platform === 'win32') {
    const scriptPath = path.join(directory, `${name}.cmd`);
    fs.writeFileSync(scriptPath, `@echo off\r\n> "${markerPath}" echo marker\r\nexit /b 1\r\n`, 'utf8');
    return scriptPath;
  }
  const scriptPath = path.join(directory, name);
  writeHook(scriptPath, markerPath);
  return scriptPath;
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P1-6A-git-tools-'));
  const authorized = path.join(sandbox, 'authorized');
  const repo = path.join(authorized, 'Teemo-repo');
  const outside = path.join(sandbox, 'outside');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  git(repo, ['init', '--initial-branch=main']);
  git(repo, ['config', 'user.name', 'Teemo Test']);
  git(repo, ['config', 'user.email', 'teemo-test@example.invalid']);
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'initial\n', 'utf8');
  git(repo, ['add', '--', 'tracked.txt']);
  git(repo, ['commit', '-m', 'Initial commit']);

  const fileService = new TeemoFileService();
  const service = new TeemoGitService({ fileService, timeoutMs: 5000 });
  const roots = [authorized];

  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'initial\nworking change\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'Teemo-a.txt'), 'stage me\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'Teemo-b.txt'), 'leave me\n', 'utf8');

  const statusPrepared = await service.prepareOperation('git_status', { repo }, roots);
  assert.ok(statusPrepared.resource.startsWith('git+file:///'));
  const status = await service.executePrepared(statusPrepared, roots);
  assert.equal(status.branch, 'main');
  assert.equal(status.unstaged.some(item => item.path === 'tracked.txt'), true);
  assert.equal(status.untracked.includes('Teemo-a.txt'), true);

  const diff = await service.executePrepared(await service.prepareOperation('git_diff', {
    repo, staged: false, file: 'tracked.txt',
  }, roots), roots);
  assert.equal(diff.diff.includes('working change'), true);
  assert.deepEqual(diff.files, ['tracked.txt']);

  const log = await service.executePrepared(await service.prepareOperation('git_log', { repo, limit: 5 }, roots), roots);
  assert.equal(log.commits.length, 1);
  assert.equal(log.commits[0].subject, 'Initial commit');
  const shown = await service.executePrepared(await service.prepareOperation('git_show', {
    repo, revision: 'HEAD', file: 'tracked.txt',
  }, roots), roots);
  assert.equal(shown.commit.length, 40);
  assert.equal(shown.output.includes('Initial commit'), true);

  const smallOutputService = new TeemoGitService({ fileService, maxOutputBytes: 300, timeoutMs: 5000 });
  fs.appendFileSync(path.join(repo, 'tracked.txt'), 'x'.repeat(5000), 'utf8');
  const truncatedDiff = await smallOutputService.executePrepared(await smallOutputService.prepareOperation('git_diff', {
    repo, staged: false, file: 'tracked.txt',
  }, roots), roots);
  assert.equal(truncatedDiff.truncated, true);

  const stagePrepared = await service.prepareOperation('git_stage_files', {
    repo, files: ['Teemo-a.txt'],
  }, roots);
  const staged = await service.executePrepared(stagePrepared, roots);
  assert.deepEqual(staged.stagedFiles, ['Teemo-a.txt']);
  const cachedBeforeCommit = git(repo, ['diff', '--cached', '--name-only']).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(cachedBeforeCommit, ['Teemo-a.txt']);

  const commitPrepared = await service.prepareOperation('git_commit', {
    repo, message: 'Teemo explicit staged commit',
  }, roots);
  const committed = await service.executePrepared(commitPrepared, roots);
  assert.equal(committed.committed, true);
  assert.equal(committed.fileCount, 1);
  const committedNames = git(repo, ['show', '--format=', '--name-only', 'HEAD']).trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(committedNames, ['Teemo-a.txt'], 'git_commit must not auto-stage other changes');
  assert.equal(git(repo, ['status', '--porcelain']).includes('Teemo-b.txt'), true);
  assert.equal(git(repo, ['status', '--porcelain']).includes('tracked.txt'), true);
  await expectCode(service.prepareOperation('git_commit', { repo, message: 'nothing' }, roots), 'GIT_NOTHING_TO_COMMIT');

  for (const invalidFiles of [['.'], ['../outside.txt'], ['.git/config'], [':(glob)**'], ['*.txt'], ['Teemo-a.txt', 'Teemo-a.txt']]) {
    await expectCode(service.prepareOperation('git_stage_files', { repo, files: invalidFiles }, roots), 'GIT_PATH_INVALID');
  }
  await expectCode(service.prepareOperation('git_status', { repo: outside }, roots), 'GIT_REPO_NOT_AUTHORIZED');
  await expectCode(service.prepareOperation('git_status', { repo }, [outside]), 'GIT_REPO_NOT_AUTHORIZED');

  const outsideFile = path.join(outside, 'secret.txt');
  fs.writeFileSync(outsideFile, 'secret', 'utf8');
  const escapeLink = path.join(repo, 'escape.txt');
  try {
    fs.symlinkSync(outsideFile, escapeLink, 'file');
    await expectCode(service.prepareOperation('git_stage_files', { repo, files: ['escape.txt'] }, roots), 'GIT_FILE_OUTSIDE_REPOSITORY');
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
  }

  const toctouPath = path.join(repo, 'Teemo-toctou.txt');
  fs.writeFileSync(toctouPath, 'before', 'utf8');
  const toctou = await service.prepareOperation('git_stage_files', { repo, files: ['Teemo-toctou.txt'] }, roots);
  fs.writeFileSync(toctouPath, 'after', 'utf8');
  await expectCode(service.executePrepared(toctou, roots), 'GIT_RESOURCE_CHANGED');

  const definitions = TeemoGitTools.createDefinitions({
    gitClient: { prepare() {}, execute() {}, release() {} },
  });
  assert.deepEqual(definitions.map(item => item.name), [
    'git_status', 'git_diff', 'git_log', 'git_show', 'git_stage_files', 'git_commit',
  ]);
  for (const forbidden of ['git_reset', 'git_clean', 'git_checkout', 'git_restore', 'git_rebase', 'git_push', 'git_pull', 'git_fetch']) {
    assert.equal(definitions.some(item => item.name === forbidden), false);
  }

  let executeCalls = 0;
  let releaseCalls = 0;
  let permissionRequest = null;
  const fakeClient = {
    prepare: async (tool, args) => {
      const prepared = await service.prepareOperation(tool, args, roots);
      return { resource: prepared.resource, reason: prepared.reason, preparation: { operationId: 'git-test-op' } };
    },
    execute: async () => { executeCalls += 1; return { branch: 'main' }; },
    release: async () => { releaseCalls += 1; return true; },
  };
  const registry = new TeemoToolRegistry({
    permissionService: { authorize: async request => { permissionRequest = request; return { decision: 'allow' }; } },
  });
  TeemoGitTools.register(registry, { gitClient: fakeClient });
  const allowed = await registry.execute('git_status', { repo }, { runId: 'git-run', sessionId: 'git-session' });
  assert.equal(allowed.ok, true);
  assert.ok(permissionRequest.resource.startsWith('git+file:///'));
  assert.equal(permissionRequest.permission, 'read');
  assert.equal(executeCalls, 1);
  assert.equal(releaseCalls, 1);

  const deniedRegistry = new TeemoToolRegistry({
    permissionService: { authorize: async () => ({ decision: 'deny' }) },
  });
  TeemoGitTools.register(deniedRegistry, { gitClient: fakeClient });
  const denied = await deniedRegistry.execute('git_stage_files', { repo, files: ['Teemo-b.txt'] });
  assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.equal(executeCalls, 1, 'permission deny must not execute the Git handler');

  const ipcPermission = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
  const ipc = makeIpcHarness(service, () => roots, ipcPermission);
  const ipcPrepared = await ipc.invoke(ipc.sender, TeemoGitClient.CHANNELS.prepare, {
    tool: 'git_status', args: { repo }, toolCallId: 'git-ipc-call', runId: 'git-ipc-run', sessionId: 'git-ipc-session',
  });
  assert.equal(ipcPrepared.ok, true);
  const wrongOwner = await ipc.invoke(ipc.foreign, TeemoGitClient.CHANNELS.execute, { operationId: ipcPrepared.operationId });
  assert.equal(wrongOwner.error.code, 'GIT_PATH_INVALID');
  await ipcPermission.requestPermission({
    toolCallId: 'git-ipc-call', runId: 'git-ipc-run', sessionId: 'git-ipc-session',
    toolName: 'git_status', permission: 'read', resource: ipcPrepared.resource,
    requiresExecutionAuthorization: true,
  });
  const ipcResult = await ipc.invoke(ipc.sender, TeemoGitClient.CHANNELS.execute, { operationId: ipcPrepared.operationId });
  assert.equal(ipcResult.ok, true);
  const replay = await ipc.invoke(ipc.sender, TeemoGitClient.CHANNELS.execute, { operationId: ipcPrepared.operationId });
  assert.equal(replay.error.code, 'GIT_PATH_INVALID');
  const bypassPrepared = await ipc.invoke(ipc.sender, TeemoGitClient.CHANNELS.prepare, {
    tool: 'git_status', args: { repo }, toolCallId: 'git-bypass', runId: 'git-run', sessionId: 'git-session',
  });
  const bypass = await ipc.invoke(ipc.sender, TeemoGitClient.CHANNELS.execute, { operationId: bypassPrepared.operationId });
  assert.equal(bypass.error.code, 'PERMISSION_CHECK_FAILED');

  const processService = new TeemoGitService({ fileService, gitExecutable: process.execPath, timeoutMs: 100 });
  await expectCode(processService._runGit(repo, ['-e', 'setTimeout(() => {}, 5000)'], { rawExecutableArgs: true }), 'GIT_TIMEOUT');
  let cancelled = false;
  const aborting = processService._runGit(repo, ['-e', 'setTimeout(() => {}, 5000)'], {
    timeoutMs: 5000,
    checkCancelled: () => cancelled,
    rawExecutableArgs: true,
  });
  setTimeout(() => { cancelled = true; }, 50);
  await expectCode(aborting, 'GIT_CANCELLED');

  const childPidFile = path.join(sandbox, 'Teemo-child.pid');
  const treeScript = path.join(sandbox, 'Teemo-process-tree.js');
  fs.writeFileSync(treeScript, [
    "const fs=require('fs');",
    "const {spawn}=require('child_process');",
    `const child=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{windowsHide:true});`,
    `fs.writeFileSync(${JSON.stringify(childPidFile)},String(child.pid));`,
    'setTimeout(()=>{},10000);',
  ].join('\n'), 'utf8');
  let treeCancelled = false;
  const treeRun = processService._runGit(repo, [treeScript], {
    timeoutMs: 5000,
    checkCancelled: () => treeCancelled,
    rawExecutableArgs: true,
  });
  while (!fs.existsSync(childPidFile)) await new Promise(resolve => setTimeout(resolve, 20));
  const childPid = Number(fs.readFileSync(childPidFile, 'utf8'));
  treeCancelled = true;
  await expectCode(treeRun, 'GIT_CANCELLED');
  await new Promise(resolve => setTimeout(resolve, 500));
  const childAlive = isProcessAlive(childPid);
  if (childAlive && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(childPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
  }
  assert.equal(childAlive, false, 'Abort must terminate the process tree');

  const policyRepo = path.join(authorized, 'Teemo-safe-git-policy-repo');
  fs.mkdirSync(policyRepo);
  git(policyRepo, ['init', '--initial-branch=main']);
  git(policyRepo, ['config', 'user.name', 'Teemo Test']);
  git(policyRepo, ['config', 'user.email', 'teemo-test@example.invalid']);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-policy-base.md'), 'base\n', 'utf8');
  git(policyRepo, ['add', '--', 'Teemo-policy-base.md']);
  git(policyRepo, ['commit', '-m', 'Policy baseline']);
  const policyGitDir = git(policyRepo, ['rev-parse', '--absolute-git-dir']).trim();
  const policyService = new TeemoGitService({ fileService, timeoutMs: 5000 });

  const preCommitMarker = path.join(sandbox, 'Teemo-pre-commit.marker');
  const postCommitMarker = path.join(sandbox, 'Teemo-post-commit.marker');
  writeHook(path.join(policyGitDir, 'hooks', 'pre-commit'), preCommitMarker);
  writeHook(path.join(policyGitDir, 'hooks', 'post-commit'), postCommitMarker);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-hook-test.md'), 'hook safe\n', 'utf8');
  await policyService.executePrepared(await policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['Teemo-hook-test.md'],
  }, roots), roots);
  await policyService.executePrepared(await policyService.prepareOperation('git_commit', {
    repo: policyRepo, message: 'Teemo hook policy test',
  }, roots), roots);
  assert.equal(fs.existsSync(preCommitMarker), false, 'pre-commit must not execute');
  assert.equal(fs.existsSync(postCommitMarker), false, 'post-commit must not execute');

  const customHooksDirectory = path.join(policyRepo, 'Teemo-malicious-hooks');
  fs.mkdirSync(customHooksDirectory);
  const customHookMarker = path.join(sandbox, 'Teemo-custom-hook.marker');
  writeHook(path.join(customHooksDirectory, 'pre-commit'), customHookMarker);
  git(policyRepo, ['config', 'core.hooksPath', customHooksDirectory]);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-custom-hook-test.md'), 'custom hook safe\n', 'utf8');
  await policyService.executePrepared(await policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['Teemo-custom-hook-test.md'],
  }, roots), roots);
  await policyService.executePrepared(await policyService.prepareOperation('git_commit', {
    repo: policyRepo, message: 'Teemo custom hook policy test',
  }, roots), roots);
  assert.equal(fs.existsSync(customHookMarker), false, 'custom core.hooksPath must not execute');

  const signingMarker = path.join(sandbox, 'Teemo-signing.marker');
  const signingExecutable = writeMarkerExecutable(sandbox, 'Teemo-fake-gpg', signingMarker);
  git(policyRepo, ['config', 'commit.gpgSign', 'true']);
  git(policyRepo, ['config', 'gpg.program', signingExecutable]);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-signing-test.md'), 'signing safe\n', 'utf8');
  await policyService.executePrepared(await policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['Teemo-signing-test.md'],
  }, roots), roots);
  await policyService.executePrepared(await policyService.prepareOperation('git_commit', {
    repo: policyRepo, message: 'Teemo signing policy test',
  }, roots), roots);
  assert.equal(fs.existsSync(signingMarker), false, 'commit signing program must not execute');

  const filterMarker = path.join(sandbox, 'Teemo-filter.marker');
  const filterScript = path.join(sandbox, 'Teemo-filter.js');
  fs.writeFileSync(filterScript, [
    "const fs=require('fs');",
    `fs.writeFileSync(${JSON.stringify(filterMarker)},'filter');`,
    'process.stdin.pipe(process.stdout);',
  ].join('\n'), 'utf8');
  git(policyRepo, ['config', 'filter.evil.clean', `"${process.execPath}" "${filterScript}"`]);
  fs.writeFileSync(path.join(policyRepo, '.gitattributes'), 'Teemo-filter.txt filter=evil\n', 'utf8');
  fs.writeFileSync(path.join(policyRepo, 'Teemo-filter.txt'), 'must not filter\n', 'utf8');
  await expectCode(policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['Teemo-filter.txt'],
  }, roots), 'GIT_EXTERNAL_FILTER_NOT_ALLOWED');
  await expectCode(policyService.prepareOperation('git_diff', {
    repo: policyRepo, staged: false, file: 'Teemo-filter.txt',
  }, roots), 'GIT_EXTERNAL_FILTER_NOT_ALLOWED');
  assert.equal(fs.existsSync(filterMarker), false, 'clean/process filter must not execute');
  assert.equal(git(policyRepo, ['diff', '--cached', '--name-only']).split(/\r?\n/).includes('Teemo-filter.txt'), false);

  const fsmonitorMarker = path.join(sandbox, 'Teemo-fsmonitor.marker');
  const fsmonitorExecutable = writeMarkerExecutable(sandbox, 'Teemo-fake-fsmonitor', fsmonitorMarker);
  git(policyRepo, ['config', 'core.fsmonitor', fsmonitorExecutable]);
  const safeStatus = await policyService.executePrepared(await policyService.prepareOperation('git_status', {
    repo: policyRepo,
  }, roots), roots);
  assert.equal(safeStatus.repo, policyRepo);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-fsmonitor-test.md'), 'fsmonitor safe\n', 'utf8');
  await policyService.executePrepared(await policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['Teemo-fsmonitor-test.md'],
  }, roots), roots);
  assert.equal(fs.existsSync(fsmonitorMarker), false, 'fsmonitor program must not execute for read or write Git tools');
  assert.equal(fs.existsSync(filterMarker), false, 'Git status must not execute configured clean/process filters');

  fs.writeFileSync(path.join(policyRepo, '.gitattributes'), [
    'Teemo-filter.txt filter=evil',
    '*.tc diff=evil',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(policyRepo, 'Teemo-textconv.tc'), 'textconv baseline\n', 'utf8');
  await policyService.executePrepared(await policyService.prepareOperation('git_stage_files', {
    repo: policyRepo, files: ['.gitattributes', 'Teemo-textconv.tc'],
  }, roots), roots);
  await policyService.executePrepared(await policyService.prepareOperation('git_commit', {
    repo: policyRepo, message: 'Teemo textconv baseline',
  }, roots), roots);
  const textconvMarker = path.join(sandbox, 'Teemo-textconv.marker');
  const textconvExecutable = writeMarkerExecutable(sandbox, 'Teemo-fake-textconv', textconvMarker);
  git(policyRepo, ['config', 'diff.evil.textconv', textconvExecutable]);
  fs.writeFileSync(path.join(policyRepo, 'Teemo-textconv.tc'), 'textconv changed\n', 'utf8');
  const safeTextconvDiff = await policyService.executePrepared(await policyService.prepareOperation('git_diff', {
    repo: policyRepo, staged: false, file: 'Teemo-textconv.tc',
  }, roots), roots);
  assert.match(safeTextconvDiff.diff, /textconv changed/);
  const safeTextconvShow = await policyService.executePrepared(await policyService.prepareOperation('git_show', {
    repo: policyRepo, revision: 'HEAD', file: 'Teemo-textconv.tc',
  }, roots), roots);
  assert.match(safeTextconvShow.output, /textconv baseline/);
  assert.equal(fs.existsSync(textconvMarker), false, 'git_diff/git_show textconv external process start count must be 0');

  const oldRepo = path.join(authorized, 'Teemo-old-repo');
  const replacePrepared = await service.prepareOperation('git_status', { repo }, roots);
  fs.renameSync(repo, oldRepo);
  fs.mkdirSync(repo);
  git(repo, ['init', '--initial-branch=main']);
  await expectCode(service.executePrepared(replacePrepared, roots), 'GIT_RESOURCE_CHANGED');

  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log('TeemoGitTools tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
