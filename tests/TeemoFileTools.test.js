const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoFileTools = require('../src/tools/file/TeemoFileTools');
const TeemoFileClient = require('../src/tools/file/TeemoFileClient');
const TeemoAuthorizedRootGrounding = require('../src/tools/file/TeemoAuthorizedRootGrounding');
const registerTeemoFileToolIpc = require('../src/tools/file/TeemoFileToolIpc');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

function hash(value) {
  return crypto.createHash('sha256').update(Buffer.from(value)).digest('hex');
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error && error.code === code);
}

function makeIpcHarness(service, rootsProvider, permissionService) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const registered = registerTeemoFileToolIpc(ipcMain, service, { rootsProvider, permissionService });
  const sender = { id: 101 };
  const foreign = { id: 202 };
  const invoke = (owner, channel, payload) => handlers.get(channel)({ sender: owner }, payload);
  return { handlers, registered, sender, foreign, invoke };
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'Teemo-P1-5-file-tools-'));
  const root = path.join(sandbox, 'authorized');
  const similarRoot = path.join(sandbox, 'authorized-copy');
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.mkdirSync(similarRoot, { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'hello.txt'), 'alpha\nbeta needle\ngamma\n', 'utf8');
  fs.writeFileSync(path.join(root, 'long.txt'), 'x'.repeat(100), 'utf8');
  fs.writeFileSync(path.join(root, 'duplicate.txt'), 'same same', 'utf8');
  fs.writeFileSync(path.join(root, 'data.json'), '{"enabled":true}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.txt'), 'needle', 'utf8');
  fs.writeFileSync(path.join(similarRoot, 'outside.txt'), 'outside', 'utf8');

  const service = new TeemoFileService({
    maxReadBytes: 4096,
    maxReturnedText: 50,
    maxPatchBytes: 4096,
    maxCreateBytes: 1024,
    maxSearchResults: 20,
  });
  const roots = [root];

  const listPrepared = service.prepareOperation('list_directory', { path: root }, roots);
  assert.ok(listPrepared.resource.startsWith('file:///'));
  const listed = await service.executePrepared(listPrepared, roots);
  assert.equal(listed.type, 'directory');
  assert.ok(listed.entries.some(entry => entry.name === 'hello.txt'));

  const readPrepared = service.prepareOperation('read_file', { path: path.join(root, 'hello.txt') }, roots);
  const read = await service.executePrepared(readPrepared, roots);
  assert.equal(read.path, fs.realpathSync.native(path.join(root, 'hello.txt')));
  assert.equal(read.sha256, hash('alpha\nbeta needle\ngamma\n'));
  assert.equal(read.truncated, false);
  const longRead = await service.executePrepared(service.prepareOperation('read_file', {
    path: path.join(root, 'long.txt'),
  }, roots), roots);
  assert.equal(longRead.truncated, true);
  assert.equal(longRead.content.length, 50);
  await expectCode(service.executePrepared(service.prepareOperation('patch_file', {
    path: path.join(root, 'long.txt'),
    expectedSha256: hash('x'.repeat(100)),
    edits: [{ oldText: 'xxxxx', newText: 'yyyyy' }],
  }, roots), roots), 'FILE_TRUNCATED_CANNOT_PATCH');

  const names = await service.executePrepared(service.prepareOperation('search_files', {
    path: root, query: 'hello',
  }, roots), roots);
  assert.equal(names.results.length, 1);
  const text = await service.executePrepared(service.prepareOperation('search_text', {
    path: root, query: 'needle',
  }, roots), roots);
  assert.equal(text.results.length, 1, 'default ignore folders must exclude node_modules');
  assert.equal(text.results[0].line, 2);

  for (const unsafe of [
    `${root}${path.sep}..${path.sep}authorized-copy${path.sep}outside.txt`,
    '\\\\server\\share\\file.txt',
    '\\\\?\\C:\\file.txt',
    `${path.join(root, 'hello.txt')}:stream`,
  ]) {
    assert.throws(() => service.prepareOperation('read_file', { path: unsafe }, roots), error => (
      ['FILE_PATH_TRAVERSAL', 'FILE_PATH_UNSAFE'].includes(error.code)
    ));
  }
  assert.throws(
    () => service.prepareOperation('read_file', { path: path.join(similarRoot, 'outside.txt') }, roots),
    error => error.code === 'FILE_OUTSIDE_AUTHORIZED_ROOT',
  );

  const outside = path.join(sandbox, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret', 'utf8');
  const link = path.join(root, 'escape-link');
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => service.prepareOperation('read_file', { path: path.join(link, 'secret.txt') }, roots),
      error => error.code === 'FILE_OUTSIDE_AUTHORIZED_ROOT',
    );
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
  }

  const createdPath = path.join(root, 'Teemo-created.md');
  const createPrepared = service.prepareOperation('create_file', { path: createdPath, content: '# Teemo\n' }, roots);
  const created = await service.executePrepared(createPrepared, roots);
  assert.equal(created.created, true);
  assert.equal(fs.readFileSync(createdPath, 'utf8'), '# Teemo\n');
  assert.throws(
    () => service.prepareOperation('create_file', { path: createdPath, content: 'overwrite' }, roots),
    error => error.code === 'FILE_ALREADY_EXISTS',
  );
  const createdDirectoryPath = path.join(root, 'Teemo-created-directory');
  const directoryPrepared = service.prepareOperation('create_directory', { path: createdDirectoryPath }, roots);
  const createdDirectory = await service.executePrepared(directoryPrepared, roots);
  assert.equal(createdDirectory.created, true);
  assert.equal(fs.statSync(createdDirectoryPath).isDirectory(), true);
  assert.throws(
    () => service.prepareOperation('create_directory', { path: createdDirectoryPath }, roots),
    error => error.code === 'FILE_ALREADY_EXISTS',
  );
  const staleDirectory = service.prepareOperation('create_directory', { path: path.join(root, 'Teemo-raced-directory') }, roots);
  fs.mkdirSync(path.join(root, 'Teemo-raced-directory'));
  await expectCode(service.executePrepared(staleDirectory, roots), 'FILE_RESOURCE_CHANGED');
  for (const unsafeDirectory of [
    `${root}${path.sep}..${path.sep}authorized-copy${path.sep}Teemo-escape`,
    '\\\\server\\share\\Teemo-escape',
    '\\\\?\\C:\\Teemo-escape',
  ]) {
    assert.throws(() => service.prepareOperation('create_directory', { path: unsafeDirectory }, roots), error => (
      ['FILE_PATH_TRAVERSAL', 'FILE_PATH_UNSAFE'].includes(error.code)
    ));
  }
  assert.throws(
    () => service.prepareOperation('create_file', { path: path.join(root, 'blocked.exe'), content: 'x' }, roots),
    error => error.code === 'FILE_TYPE_NOT_WRITABLE',
  );
  await expectCode(service.executePrepared(
    service.prepareOperation('create_file', { path: path.join(root, 'race.txt'), content: 'one' }, roots),
    roots,
  ).then(async first => {
    assert.equal(first.created, true);
    const stale = service.prepareOperation('create_file', { path: path.join(root, 'wait.txt'), content: 'new' }, roots);
    fs.writeFileSync(path.join(root, 'wait.txt'), 'raced', 'utf8');
    return service.executePrepared(stale, roots);
  }), 'FILE_RESOURCE_CHANGED');

  const helloPath = path.join(root, 'hello.txt');
  const fullHello = fs.readFileSync(helloPath, 'utf8');
  const patchPrepared = service.prepareOperation('patch_file', {
    path: helloPath,
    expectedSha256: hash(fullHello),
    edits: [{ oldText: 'beta needle', newText: 'beta changed' }],
  }, roots);
  const patched = await service.executePrepared(patchPrepared, roots);
  assert.equal(patched.previousSha256, hash(fullHello));
  assert.equal(fs.readFileSync(helloPath, 'utf8').includes('beta changed'), true);
  await expectCode(service.executePrepared(service.prepareOperation('patch_file', {
    path: helloPath, expectedSha256: patched.sha256, edits: [{ oldText: 'missing', newText: 'x' }],
  }, roots), roots), 'PATCH_TARGET_NOT_FOUND');
  await expectCode(service.executePrepared(service.prepareOperation('patch_file', {
    path: path.join(root, 'duplicate.txt'), expectedSha256: hash('same same'), edits: [{ oldText: 'same', newText: 'x' }],
  }, roots), roots), 'PATCH_TARGET_AMBIGUOUS');
  await expectCode(service.executePrepared(service.prepareOperation('patch_file', {
    path: path.join(root, 'data.json'), expectedSha256: hash('{"enabled":true}\n'), edits: [{ oldText: 'true', newText: 'broken' }],
  }, roots), roots), 'FILE_CONTENT_VALIDATION_FAILED');

  const conflictPath = path.join(root, 'conflict.txt');
  fs.writeFileSync(conflictPath, 'before', 'utf8');
  const conflictArgs = { path: conflictPath, expectedSha256: hash('before'), edits: [{ oldText: 'before', newText: 'after' }] };
  const conflictA = service.prepareOperation('patch_file', conflictArgs, roots);
  const conflictB = service.prepareOperation('patch_file', conflictArgs, roots);
  const concurrent = await Promise.allSettled([
    service.executePrepared(conflictA, roots), service.executePrepared(conflictB, roots),
  ]);
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
  assert.ok(['FILE_HASH_MISMATCH', 'FILE_RESOURCE_CHANGED'].includes(
    concurrent.find(item => item.status === 'rejected').reason.code,
  ));

  const renameSource = path.join(root, 'rename-me.txt');
  const renameTarget = path.join(root, 'Teemo-renamed.txt');
  fs.writeFileSync(renameSource, 'rename', 'utf8');
  const renamed = await service.executePrepared(service.prepareOperation('rename_file', {
    path: renameSource, newPath: renameTarget, expectedSha256: hash('rename'),
  }, roots), roots);
  assert.equal(renamed.renamed, true);
  assert.equal(fs.existsSync(renameTarget), true);
  assert.throws(() => service.prepareOperation('rename_file', {
    path: renameTarget, newPath: path.join(similarRoot, 'moved.txt'), expectedSha256: hash('rename'),
  }, roots), error => error.code === 'FILE_OUTSIDE_AUTHORIZED_ROOT');

  const staleRootPrepared = service.prepareOperation('read_file', { path: helloPath }, roots);
  await expectCode(service.executePrepared(staleRootPrepared, []), 'FILE_RESOURCE_CHANGED');
  const replacedPrepared = service.prepareOperation('read_file', { path: helloPath }, roots);
  const oldHelloPath = path.join(root, 'old-hello.txt');
  fs.renameSync(helloPath, oldHelloPath);
  fs.writeFileSync(helloPath, 'replacement', 'utf8');
  await expectCode(service.executePrepared(replacedPrepared, roots), 'FILE_RESOURCE_CHANGED');
  await expectCode(service.executePrepared(readPrepared, roots, { checkCancelled: () => true }), 'TOOL_CANCELLED');

  const ipcPermission = new TeemoPermissionService({
    decisionProvider: async () => ({ decision: 'allow', scope: 'once' }),
  });
  const ipc = makeIpcHarness(service, () => roots, ipcPermission);
  const ipcRootId = new TeemoAuthorizedRootGrounding({ fileService: service }).summarize(roots)[0].rootId;
  const normalizedOverIpc = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.normalize, {
    tool: 'read_file',
    args: { rootId: ipcRootId,
      rootReference: path.basename(root), relativePath: 'hello.txt', path: helloPath },
  });
  assert.equal(normalizedOverIpc.ok, true);
  assert.deepEqual(Object.keys(normalizedOverIpc.args).sort(), ['relativePath', 'rootId']);
  assert.equal(normalizedOverIpc.args.relativePath, 'hello.txt');
  const preparedOverIpc = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.prepare, {
    tool: 'read_file', args: { path: helloPath }, toolCallId: 'ipc-tool-call',
    runId: 'ipc-run', sessionId: 'ipc-session',
  });
  assert.equal(preparedOverIpc.ok, true);
  const foreignResult = await ipc.invoke(ipc.foreign, TeemoFileClient.CHANNELS.execute, {
    operationId: preparedOverIpc.operationId,
  });
  assert.equal(foreignResult.error.code, 'FILE_PREPARATION_INVALID');
  await ipcPermission.requestPermission({
    toolCallId: 'ipc-tool-call', runId: 'ipc-run', sessionId: 'ipc-session',
    toolName: 'read_file', permission: 'read', resource: preparedOverIpc.resource,
    requiresExecutionAuthorization: true,
  });
  const ownerResult = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.execute, {
    operationId: preparedOverIpc.operationId,
  });
  assert.equal(ownerResult.ok, true);
  const replay = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.execute, {
    operationId: preparedOverIpc.operationId,
  });
  assert.equal(replay.error.code, 'FILE_PREPARATION_INVALID');
  const bypassPrepared = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.prepare, {
    tool: 'read_file', args: { path: helloPath }, toolCallId: 'ipc-bypass',
    runId: 'ipc-run', sessionId: 'ipc-session',
  });
  const bypass = await ipc.invoke(ipc.sender, TeemoFileClient.CHANNELS.execute, {
    operationId: bypassPrepared.operationId,
  });
  assert.equal(bypass.error.code, 'PERMISSION_CHECK_FAILED', 'direct file IPC must not bypass central permission');

  const makeRegistryFileClient = (permissionService) => {
    const protectedIpc = makeIpcHarness(service, () => roots, permissionService);
    const client = new TeemoFileClient({ ipcRenderer: { invoke: (channel, payload) => protectedIpc.invoke(protectedIpc.sender, channel, payload) } });
    const protectedRegistry = new TeemoToolRegistry({ permissionService: { authorize: request => permissionService.requestPermission(request) } });
    TeemoFileTools.register(protectedRegistry, { fileClient: client });
    return protectedRegistry;
  };
  const deniedDirectoryPath = path.join(root, 'Teemo-denied-directory');
  const deniedDirectoryRegistry = makeRegistryFileClient(new TeemoPermissionService({
    decisionProvider: async () => ({ decision: 'deny' }),
  }));
  const deniedDirectory = await deniedDirectoryRegistry.execute('create_directory', { path: deniedDirectoryPath }, { runId: 'deny-run', sessionId: 'deny-session' });
  assert.equal(deniedDirectory.error.code, 'PERMISSION_DENIED');
  assert.equal(fs.existsSync(deniedDirectoryPath), false, 'denied directory creation must not execute');
  const allowedDirectoryPath = path.join(root, 'Teemo-allowed-directory');
  const allowedDirectoryRegistry = makeRegistryFileClient(new TeemoPermissionService({
    decisionProvider: async () => ({ decision: 'allow', scope: 'once' }),
  }));
  const allowedDirectory = await allowedDirectoryRegistry.execute('create_directory', { path: allowedDirectoryPath }, { runId: 'allow-run', sessionId: 'allow-session' });
  assert.equal(allowedDirectory.ok, true);
  assert.equal(fs.statSync(allowedDirectoryPath).isDirectory(), true);

  let allowedRequest = null;
  let released = 0;
  let executed = 0;
  const fakeClient = {
    prepare: async (tool, args) => ({
      resource: service.prepareOperation(tool, args, roots).resource,
      reason: 'trusted reason', preparation: { operationId: 'test-op' },
    }),
    execute: async preparation => { executed += 1; assert.equal(preparation.operationId, 'test-op'); return { content: 'safe' }; },
    release: async () => { released += 1; return true; },
  };
  const registry = new TeemoToolRegistry({
    permissionService: { authorize: async request => { allowedRequest = request; return { decision: 'allow' }; } },
  });
  TeemoFileTools.register(registry, { fileClient: fakeClient });
  assert.deepEqual(registry.list().sort(), [
    'create_directory', 'create_file', 'list_directory', 'patch_file', 'read_file', 'rename_file', 'search_files', 'search_text',
  ]);
  const toolResult = await registry.execute('read_file', { path: helloPath }, { runId: 'run-file', sessionId: 'session-file' });
  assert.equal(toolResult.ok, true);
  assert.ok(allowedRequest.resource.startsWith('file:///'));
  assert.equal(allowedRequest.resource.includes('..'), false);
  assert.equal(executed, 1);
  assert.equal(released, 1);

  const deniedRegistry = new TeemoToolRegistry({
    permissionService: { authorize: async () => ({ decision: 'deny' }) },
  });
  TeemoFileTools.register(deniedRegistry, { fileClient: fakeClient });
  const denied = await deniedRegistry.execute('read_file', { path: helloPath });
  assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.equal(executed, 1, 'denied permission must not execute I/O');
  assert.equal(released, 2);

  const controller = new AbortController();
  const lateRegistry = new TeemoToolRegistry({
    permissionService: { authorize: async () => new Promise(resolve => setTimeout(() => resolve({ decision: 'allow' }), 20)) },
  });
  TeemoFileTools.register(lateRegistry, { fileClient: fakeClient });
  const late = lateRegistry.execute('read_file', { path: helloPath }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  const lateResult = await late;
  assert.equal(lateResult.error.code, 'TOOL_CANCELLED');
  assert.equal(executed, 1, 'late allow after abort must not execute I/O');
  assert.equal(released, 3);

  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log('TeemoFileTools tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
