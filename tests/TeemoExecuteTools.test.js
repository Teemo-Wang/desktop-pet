const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoExecuteService = require('../src/services/TeemoExecuteService');
const TeemoExecuteTools = require('../src/tools/execute/TeemoExecuteTools');
const TeemoExecuteClient = require('../src/tools/execute/TeemoExecuteClient');
const registerTeemoExecuteToolIpc = require('../src/tools/execute/TeemoExecuteToolIpc');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error && error.code === code);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeIpcHarness(executeService, rootsProvider, permissionService) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  registerTeemoExecuteToolIpc(ipcMain, executeService, { rootsProvider, permissionService });
  const sender = { id: 501 };
  const foreign = { id: 502 };
  const invoke = (owner, channel, payload) => handlers.get(channel)({ sender: owner }, payload);
  return { sender, foreign, invoke };
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P1-6B-execute-'));
  const authorized = path.join(sandbox, 'authorized');
  const project = path.join(authorized, 'Teemo-project');
  const outside = path.join(sandbox, 'outside');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  const okScript = path.join(project, 'Teemo-ok.js');
  const envScript = path.join(project, 'Teemo-env.js');
  const controlScript = path.join(project, 'Teemo-control.js');
  const longScript = path.join(project, 'Teemo-long.js');
  const stdoutScript = path.join(project, 'Teemo-stdout.js');
  const stderrScript = path.join(project, 'Teemo-stderr.js');
  fs.writeFileSync(okScript, "console.log('TEEMO_OK', JSON.stringify(process.argv.slice(2)));\n", 'utf8');
  fs.writeFileSync(envScript, "console.log(process.env.OPENAI_API_KEY ? 'LEAK' : 'CLEAN');\n", 'utf8');
  fs.writeFileSync(controlScript, "process.stdout.write('safe\\u001b[31m-red\\u001b[0m\\u0001-end');\n", 'utf8');
  fs.writeFileSync(longScript, 'setTimeout(() => {}, 10000);\n', 'utf8');
  fs.writeFileSync(stdoutScript, "process.stdout.write('x'.repeat(5000));\n", 'utf8');
  fs.writeFileSync(stderrScript, "process.stderr.write('e'.repeat(5000));\n", 'utf8');
  const packagePath = path.join(project, 'package.json');
  const packageJson = {
    name: 'teemo-execute-test',
    private: true,
    scripts: {
      teemo_ok: 'node Teemo-ok.js',
      teemo_long: 'node Teemo-long.js',
    },
  };
  writeJson(packagePath, packageJson);

  const fileService = new TeemoFileService();
  const service = new TeemoExecuteService({ fileService, defaultTimeoutMs: 5000 });
  const roots = [authorized];

  const npmPrepared = service.prepareOperation('run_npm_script', {
    projectPath: project, script: 'teemo_ok', args: ['alpha'], timeoutMs: 5000,
  }, roots);
  assert.ok(npmPrepared.resource.startsWith('exec+file:///'));
  assert.ok(npmPrepared.resource.includes('operation=npm-script'));
  assert.ok(npmPrepared.resource.includes('executable=file%3A'));
  assert.ok(npmPrepared.resource.includes('npmCli=file%3A'));
  const npmResult = await service.executePrepared(npmPrepared, roots);
  assert.equal(npmResult.exitCode, 0);
  assert.equal(npmResult.stdout.includes('TEEMO_OK'), true);
  assert.equal(npmResult.stdout.includes('alpha'), true);

  for (const badArgs of [['&&'], [';'], ['$HOME'], ['"quoted"']]) {
    assert.throws(() => service.prepareOperation('run_npm_script', {
      projectPath: project, script: 'teemo_ok', args: badArgs,
    }, roots), error => error.code === 'EXECUTION_START_FAILED');
  }
  assert.throws(() => service.prepareOperation('run_npm_script', {
    projectPath: project, script: 'missing',
  }, roots), error => error.code === 'NPM_SCRIPT_NOT_FOUND');
  assert.throws(() => service.prepareOperation('run_npm_script', {
    projectPath: outside, script: 'teemo_ok',
  }, roots), error => error.code === 'EXECUTION_CWD_NOT_AUTHORIZED');

  const invalidProject = path.join(authorized, 'Teemo-invalid-package');
  fs.mkdirSync(invalidProject);
  fs.writeFileSync(path.join(invalidProject, 'package.json'), '{broken', 'utf8');
  assert.throws(() => service.prepareOperation('run_npm_script', {
    projectPath: invalidProject, script: 'test',
  }, roots), error => error.code === 'PACKAGE_JSON_INVALID');

  const npmToctou = service.prepareOperation('run_npm_script', {
    projectPath: project, script: 'teemo_ok',
  }, roots);
  packageJson.scripts.teemo_ok = 'node Teemo-env.js';
  writeJson(packagePath, packageJson);
  await expectCode(service.executePrepared(npmToctou, roots), 'EXECUTION_RESOURCE_CHANGED');
  packageJson.scripts.teemo_ok = 'node Teemo-ok.js';
  writeJson(packagePath, packageJson);

  const processPrepared = service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: okScript, args: ['beta'], timeoutMs: 5000,
  }, roots);
  assert.ok(processPrepared.resource.includes('operation=node-script'));
  assert.ok(processPrepared.resource.includes('executable=file%3A'));
  const processResult = await service.executePrepared(processPrepared, roots);
  assert.equal(processResult.stdout.includes('beta'), true);
  assert.equal(processResult.truncated, false);

  assert.throws(() => service.prepareOperation('run_process', {
    executable: 'git', cwd: project, scriptPath: okScript,
  }, roots), error => error.code === 'EXECUTABLE_NOT_ALLOWED');
  assert.throws(() => service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: path.join(outside, 'outside.js'),
  }, roots), error => error.code === 'EXECUTION_CWD_NOT_AUTHORIZED');
  const textScript = path.join(project, 'Teemo-not-code.txt');
  fs.writeFileSync(textScript, 'not code', 'utf8');
  assert.throws(() => service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: textScript,
  }, roots), error => error.code === 'EXECUTABLE_NOT_ALLOWED');

  const nodeToctou = service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: okScript,
  }, roots);
  fs.appendFileSync(okScript, '// changed\n', 'utf8');
  await expectCode(service.executePrepared(nodeToctou, roots), 'EXECUTION_RESOURCE_CHANGED');

  const previousSyntheticSecret = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-secret-never-log';
  const envResult = await service.executePrepared(service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: envScript,
  }, roots), roots);
  if (previousSyntheticSecret === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousSyntheticSecret;
  assert.equal(envResult.stdout.trim(), 'CLEAN');

  const controlResult = await service.executePrepared(service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: controlScript,
  }, roots), roots);
  assert.equal(controlResult.stdout.includes('\u001b'), false);
  assert.equal(controlResult.stdout.includes('\u0001'), false);
  assert.equal(controlResult.stdout.includes('safe-red-end'), true);

  const outputService = new TeemoExecuteService({ fileService, maxOutputBytes: 200, maxErrorBytes: 200, defaultTimeoutMs: 5000 });
  await expectCode(outputService.executePrepared(outputService.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: stdoutScript,
  }, roots), roots), 'EXECUTION_OUTPUT_LIMIT');
  await expectCode(outputService.executePrepared(outputService.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: stderrScript,
  }, roots), roots), 'EXECUTION_OUTPUT_LIMIT');

  await expectCode(service.executePrepared(service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: longScript, timeoutMs: 150,
  }, roots), roots), 'EXECUTION_TIMEOUT');
  let cancelled = false;
  const abortRun = service.executePrepared(service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: longScript, timeoutMs: 5000,
  }, roots), roots, { checkCancelled: () => cancelled });
  setTimeout(() => { cancelled = true; }, 100);
  await expectCode(abortRun, 'EXECUTION_CANCELLED');

  const childPidFile = path.join(project, 'Teemo-child.pid');
  const treeScript = path.join(project, 'Teemo-tree.js');
  fs.writeFileSync(treeScript, [
    "const fs=require('fs');",
    "const {spawn}=require('child_process');",
    "const child=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{windowsHide:true});",
    `fs.writeFileSync(${JSON.stringify(childPidFile)},String(child.pid));`,
    'setTimeout(()=>{},10000);',
  ].join('\n'), 'utf8');
  let treeCancelled = false;
  const treeRun = service.executePrepared(service.prepareOperation('run_process', {
    executable: 'node', cwd: project, scriptPath: treeScript, timeoutMs: 5000,
  }, roots), roots, { checkCancelled: () => treeCancelled });
  while (!fs.existsSync(childPidFile)) await new Promise(resolve => setTimeout(resolve, 20));
  const childPid = Number(fs.readFileSync(childPidFile, 'utf8'));
  treeCancelled = true;
  await expectCode(treeRun, 'EXECUTION_CANCELLED');
  await new Promise(resolve => setTimeout(resolve, 500));
  const childAlive = isProcessAlive(childPid);
  if (childAlive && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(childPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
  }
  assert.equal(childAlive, false, 'Abort must terminate the full process tree');

  const definitions = TeemoExecuteTools.createDefinitions({
    executeClient: { prepare() {}, execute() {}, release() {} },
  });
  assert.deepEqual(definitions.map(item => item.name), ['run_npm_script', 'run_process']);
  assert.equal(definitions.every(item => item.metadata.permission === 'execute'), true);
  assert.equal(definitions.some(item => /shell|powershell|git/i.test(item.name)), false);

  let executeCalls = 0;
  const fakeClient = {
    prepare: async (tool, args) => {
      const prepared = service.prepareOperation(tool, args, roots);
      return { resource: prepared.resource, reason: prepared.reason, preparation: { operationId: 'execute-test-op' } };
    },
    execute: async () => { executeCalls += 1; return { exitCode: 0 }; },
    release: async () => true,
  };
  const deniedRegistry = new TeemoToolRegistry({
    permissionService: { authorize: async () => ({ decision: 'deny' }) },
  });
  TeemoExecuteTools.register(deniedRegistry, { executeClient: fakeClient });
  const denied = await deniedRegistry.execute('run_process', {
    executable: 'node', cwd: project, scriptPath: okScript,
  });
  assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.equal(executeCalls, 0);

  const ipcPermission = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
  const ipc = makeIpcHarness(service, () => roots, ipcPermission);
  const ipcPayload = {
    tool: 'run_process',
    args: { executable: 'node', cwd: project, scriptPath: okScript },
    toolCallId: 'execute-ipc-call', runId: 'execute-ipc-run', sessionId: 'execute-ipc-session',
  };
  const ipcPrepared = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.prepare, ipcPayload);
  assert.equal(ipcPrepared.ok, true);
  const wrongOwner = await ipc.invoke(ipc.foreign, TeemoExecuteClient.CHANNELS.execute, { operationId: ipcPrepared.operationId });
  assert.equal(wrongOwner.error.code, 'EXECUTION_START_FAILED');
  await ipcPermission.requestPermission({
    toolCallId: 'wrong-tool-call', runId: 'execute-ipc-run', sessionId: 'execute-ipc-session',
    toolName: 'run_process', permission: 'execute', resource: ipcPrepared.resource,
    requiresExecutionAuthorization: true,
  });
  const wrongProof = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.execute, { operationId: ipcPrepared.operationId });
  assert.equal(wrongProof.error.code, 'EXECUTION_PERMISSION_REQUIRED');

  const validPrepared = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.prepare, {
    ...ipcPayload, toolCallId: 'execute-valid-call',
  });
  await ipcPermission.requestPermission({
    toolCallId: 'execute-valid-call', runId: 'execute-ipc-run', sessionId: 'execute-ipc-session',
    toolName: 'run_process', permission: 'execute', resource: validPrepared.resource,
    requiresExecutionAuthorization: true,
  });
  const valid = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.execute, { operationId: validPrepared.operationId });
  assert.equal(valid.ok, true);
  const replay = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.execute, { operationId: validPrepared.operationId });
  assert.equal(replay.error.code, 'EXECUTION_START_FAILED');
  const bypassPrepared = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.prepare, {
    ...ipcPayload, toolCallId: 'execute-bypass',
  });
  const bypass = await ipc.invoke(ipc.sender, TeemoExecuteClient.CHANNELS.execute, { operationId: bypassPrepared.operationId });
  assert.equal(bypass.error.code, 'EXECUTION_PERMISSION_REQUIRED');

  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log('TeemoExecuteTools tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
