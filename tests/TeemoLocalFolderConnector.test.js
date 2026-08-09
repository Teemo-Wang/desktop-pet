const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const TeemoInspirationContracts = require('../src/inspiration/TeemoInspirationContracts');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoLocalFolderService = require('../src/inspiration/TeemoLocalFolderService');
const TeemoLocalFolderConnector = require('../src/inspiration/TeemoLocalFolderConnector');
const TeemoInspirationConnectorRegistry = require('../src/inspiration/TeemoInspirationConnectorRegistry');
const TeemoInspirationAccessGuard = require('../src/inspiration/TeemoInspirationAccessGuard');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoLocalFolderClient = require('../src/inspiration/TeemoLocalFolderClient');
const registerTeemoLocalFolderIpc = require('../src/inspiration/TeemoLocalFolderIpc');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const WEBP = Buffer.from('RIFF0000WEBP', 'ascii');
const GIF = Buffer.from('GIF89a0000', 'ascii');

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function expectCode(action, code) {
  assert.throws(action, error => error && error.code === code, `expected ${code}`);
}

async function rejectCode(action, code) {
  await assert.rejects(Promise.resolve().then(action), error => error && error.code === code, `expected ${code}`);
}

function treeEntries(root) {
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      entries.push(relative);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path.join(directory, entry.name), relative);
    }
  };
  visit(root);
  return entries.sort();
}

function sourceService(dataDir, fileService, roots, options = {}) {
  return new TeemoInspirationSourceService({
    dataDir,
    fileService,
    rootsProvider: () => roots,
    ...options,
  });
}

class FakeIpcMain {
  constructor() { this.handlers = new Map(); }
  handle(channel, handler) { this.handlers.set(channel, handler); }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-2-local-folder-'));
  const authorizedParent = path.join(root, 'authorized');
  const sourceRoot = path.join(authorizedParent, 'Teemo Synthetic Source');
  const secondRoot = path.join(authorizedParent, 'Teemo Synthetic Source B');
  const outsideRoot = path.join(root, 'outside');
  const dataDir = path.join(root, 'source-data');
  fs.mkdirSync(path.join(sourceRoot, 'subfolder'), { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'cover.png'), PNG);
  fs.writeFileSync(path.join(sourceRoot, 'photo.jpg'), JPEG);
  fs.writeFileSync(path.join(sourceRoot, 'photo.jpeg'), JPEG);
  fs.writeFileSync(path.join(sourceRoot, 'motion.webp'), WEBP);
  fs.writeFileSync(path.join(sourceRoot, 'loop.gif'), GIF);
  fs.writeFileSync(path.join(sourceRoot, 'note.txt'), 'synthetic note');
  fs.writeFileSync(path.join(sourceRoot, 'vector.svg'), '<svg></svg>');
  fs.writeFileSync(path.join(sourceRoot, 'mismatch.png'), Buffer.from('not a png'));
  fs.writeFileSync(path.join(sourceRoot, 'subfolder', 'inner.webp'), WEBP);
  fs.writeFileSync(path.join(outsideRoot, 'outside.png'), PNG);

  const deepParts = [];
  let deepPath = sourceRoot;
  for (let index = 1; index <= 17; index += 1) {
    deepParts.push(`d${index}`);
    deepPath = path.join(deepPath, `d${index}`);
    fs.mkdirSync(deepPath);
  }
  const largeDirectory = path.join(sourceRoot, 'large');
  fs.mkdirSync(largeDirectory);
  for (let index = 0; index < 205; index += 1) {
    fs.writeFileSync(path.join(largeDirectory, `item-${String(index).padStart(3, '0')}.txt`), 'x');
  }
  const tooLargePath = path.join(sourceRoot, 'too-large.png');
  fs.writeFileSync(tooLargePath, PNG);
  fs.truncateSync(tooLargePath, TeemoLocalFolderService.MAX_PREVIEW_BYTES + 1);

  let junctionSupported = true;
  let junctionReason = null;
  const childJunction = path.join(sourceRoot, 'outside-link');
  const rootJunction = path.join(authorizedParent, 'source-link');
  try {
    fs.symlinkSync(outsideRoot, childJunction, process.platform === 'win32' ? 'junction' : 'dir');
    fs.symlinkSync(sourceRoot, rootJunction, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    junctionSupported = false;
    junctionReason = error.code || error.message;
  }

  const fileService = new TeemoFileService();
  const roots = [];
  let nextId = 1;
  const sources = sourceService(dataDir, fileService, roots, { idFactory: () => uuid(nextId++) });

  try {
    assert.deepEqual(sources.getSnapshot(), { schemaVersion: 1, revision: 0, sources: [] });
    expectCode(
      () => sources.addLocalFolder({ rootPath: sourceRoot }),
      'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED',
    );

    roots.push(authorizedParent);
    const firstSnapshot = sources.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Synthetic References' }, { expectedRevision: 0 });
    assert.equal(firstSnapshot.revision, 1);
    assert.equal(firstSnapshot.sources.length, 1);
    const firstSource = firstSnapshot.sources[0];
    assert.equal(firstSource.sourceId, uuid(1));
    assert.equal(firstSource.rootPath, fileService.canonicalPath(sourceRoot));
    assert.equal(sources.getSource(firstSource.sourceId).sourceId, firstSource.sourceId, 'sourceId must remain stable');
    expectCode(
      () => sources.addLocalFolder({ rootPath: sourceRoot, displayName: 'Duplicate name' }),
      'INSPIRATION_SOURCE_ALREADY_EXISTS',
    );
    expectCode(
      () => sources.addLocalFolder({ rootPath: secondRoot }, { expectedRevision: 0 }),
      'INSPIRATION_SOURCES_CHANGED',
    );
    const rootsBeforeRemove = [...roots];
    const removed = sources.removeSource(firstSource.sourceId, { expectedRevision: 1 });
    assert.equal(removed.revision, 2);
    assert.equal(removed.sources.length, 0);
    assert.deepEqual(roots, rootsBeforeRemove, 'removing a source must not revoke P1 roots');
    assert.equal(fs.existsSync(sourceRoot), true, 'removing a source must not delete its folder');
    const readded = sources.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Synthetic References' }, { expectedRevision: 2 });
    const sourceA = readded.sources[0];
    assert.notEqual(sourceA.sourceId, firstSource.sourceId, 're-adding a path must create a new sourceId');
    const withB = sources.addLocalFolder({ rootPath: secondRoot, displayName: 'Teemo Synthetic B' }, { expectedRevision: 3 });
    const sourceB = withB.sources.find(source => source.rootPath === fileService.canonicalPath(secondRoot));
    assert.ok(sourceB);

    if (junctionSupported) {
      expectCode(() => sources.addLocalFolder({ rootPath: rootJunction }), 'INSPIRATION_LINK_UNSUPPORTED');
    }

    const corruptDir = path.join(root, 'corrupt-data');
    fs.mkdirSync(corruptDir, { recursive: true });
    const corruptPath = path.join(corruptDir, TeemoInspirationSourceService.SOURCE_FILE);
    const corruptBytes = Buffer.from('{broken-source-config', 'utf8');
    fs.writeFileSync(corruptPath, corruptBytes);
    const corruptSources = sourceService(corruptDir, fileService, roots);
    assert.equal(corruptSources.getSnapshot().stateError.code, 'INSPIRATION_SOURCES_UNREADABLE');
    expectCode(() => corruptSources.addLocalFolder({ rootPath: sourceRoot }), 'INSPIRATION_SOURCES_UNREADABLE');
    assert.ok(fs.readFileSync(corruptPath).equals(corruptBytes), 'corrupt source bytes must not be overwritten');

    const invalidDir = path.join(root, 'invalid-data');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, TeemoInspirationSourceService.SOURCE_FILE), JSON.stringify({ schemaVersion: 99, revision: 0, sources: [] }));
    assert.equal(sourceService(invalidDir, fileService, roots).getSnapshot().stateError.code, 'INSPIRATION_SOURCES_UNREADABLE');

    const limitRoot = path.join(authorizedParent, 'source-limit');
    const limitData = path.join(root, 'limit-data');
    fs.mkdirSync(limitRoot);
    const limitSources = sourceService(limitData, fileService, roots, { idFactory: (() => { let id = 100; return () => uuid(id++); })() });
    for (let index = 0; index < TeemoInspirationSourceService.MAX_SOURCES; index += 1) {
      const directory = path.join(limitRoot, `source-${index}`);
      fs.mkdirSync(directory);
      limitSources.addLocalFolder({ rootPath: directory });
    }
    const source21 = path.join(limitRoot, 'source-20');
    fs.mkdirSync(source21);
    expectCode(() => limitSources.addLocalFolder({ rootPath: source21 }), 'INSPIRATION_SOURCE_LIMIT_REACHED');

    const localFolder = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
    });
    const connector = new TeemoLocalFolderConnector({ client: { execute: (operation, request, context) => localFolder.execute(operation, request, context) } });
    const definition = connector.getDefinition();
    assert.deepEqual(definition.capabilities, ['health', 'list_items', 'item_metadata', 'preview']);
    assert.equal(definition.readOnly, true);
    for (const method of ['createItem', 'updateItem', 'deleteItem', 'moveItem', 'renameItem', 'writeItem', 'copyItem', 'uploadItem', 'createDirectory', 'syncWrite']) {
      assert.equal(typeof connector[method], 'undefined', `${method} must not exist`);
    }

    const rootBrowse = await localFolder.execute('list_items', { sourceId: sourceA.sourceId });
    assert.equal(rootBrowse.relativeDirectory, '');
    assert.ok(rootBrowse.entries.some(entry => entry.name === 'subfolder' && entry.type === 'directory'));
    assert.ok(rootBrowse.entries.some(entry => entry.name === 'note.txt' && entry.type === 'regular_file' && !entry.previewable));
    if (junctionSupported) {
      assert.ok(rootBrowse.entries.some(entry => entry.name === 'outside-link' && entry.type === 'unsupported_link'));
      await rejectCode(() => localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: 'outside-link' }), 'INSPIRATION_LINK_UNSUPPORTED');
    }
    const childBrowse = await localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: 'subfolder' });
    assert.equal(childBrowse.entries[0].name, 'inner.webp');
    for (const unsafePath of ['..', '../outside', sourceRoot, 'C:\\escape', '\\\\server\\share', '\\\\?\\C:\\escape', '\\\\.\\C:\\escape']) {
      await rejectCode(() => localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: unsafePath }), 'INSPIRATION_PATH_INVALID');
    }
    const depth16 = deepParts.slice(0, 16).join('/');
    assert.equal((await localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: depth16 })).relativeDirectory, depth16);
    await rejectCode(
      () => localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: deepParts.join('/') }),
      'INSPIRATION_DEPTH_EXCEEDED',
    );
    const defaultLimited = await localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: 'large' });
    assert.equal(defaultLimited.limit, 100);
    assert.equal(defaultLimited.entries.length, 100);
    assert.equal(defaultLimited.truncated, true);
    const hardLimited = await localFolder.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: 'large', limit: 9999 });
    assert.equal(hardLimited.limit, 200);
    assert.equal(hardLimited.entries.length, 200);
    assert.equal(hardLimited.truncated, true);

    const metadata = await localFolder.execute('item_metadata', { sourceId: sourceA.sourceId, relativePath: 'cover.png' });
    assert.equal(metadata.type, 'regular_file');
    assert.equal(metadata.size, PNG.length);
    for (const [fileName, mimeType, expected] of [
      ['cover.png', 'image/png', PNG],
      ['photo.jpg', 'image/jpeg', JPEG],
      ['photo.jpeg', 'image/jpeg', JPEG],
      ['motion.webp', 'image/webp', WEBP],
      ['loop.gif', 'image/gif', GIF],
    ]) {
      const preview = await localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: fileName });
      assert.equal(preview.mimeType, mimeType);
      assert.ok(Buffer.from(preview.dataBase64, 'base64').equals(expected));
    }
    await rejectCode(() => localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'note.txt' }), 'INSPIRATION_PREVIEW_UNSUPPORTED');
    await rejectCode(() => localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'vector.svg' }), 'INSPIRATION_PREVIEW_UNSUPPORTED');
    await rejectCode(() => localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'mismatch.png' }), 'INSPIRATION_FILE_TYPE_MISMATCH');
    await rejectCode(() => localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'subfolder' }), 'INSPIRATION_NOT_FILE');
    let oversizedOpenCount = 0;
    const sizeGuardService = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      hooks: { beforeOpen: () => { oversizedOpenCount += 1; } },
    });
    await rejectCode(() => sizeGuardService.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'too-large.png' }), 'INSPIRATION_FILE_TOO_LARGE');
    assert.equal(oversizedOpenCount, 0, 'oversized preview must be rejected before file open');

    const immutableBytes = fs.readFileSync(path.join(sourceRoot, 'cover.png'));
    const immutableMtime = fs.statSync(path.join(sourceRoot, 'cover.png')).mtimeMs;
    const immutableTree = treeEntries(sourceRoot);
    await localFolder.execute('list_items', { sourceId: sourceA.sourceId });
    await localFolder.execute('item_metadata', { sourceId: sourceA.sourceId, relativePath: 'cover.png' });
    await localFolder.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'cover.png' });
    assert.ok(fs.readFileSync(path.join(sourceRoot, 'cover.png')).equals(immutableBytes));
    assert.equal(fs.statSync(path.join(sourceRoot, 'cover.png')).mtimeMs, immutableMtime);
    assert.deepEqual(treeEntries(sourceRoot), immutableTree, 'browse must not create cache or thumbnail files');

    const rootsForRevoke = [...roots];
    roots.splice(0, roots.length);
    await rejectCode(() => localFolder.execute('health', { sourceId: sourceA.sourceId }), 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED');
    await rejectCode(() => localFolder.execute('list_items', { sourceId: sourceA.sourceId }), 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED');
    roots.push(...rootsForRevoke);
    assert.equal((await localFolder.execute('health', { sourceId: sourceA.sourceId })).status, 'AVAILABLE');

    const healthRoot = path.join(authorizedParent, 'health-source');
    const healthData = path.join(root, 'health-data');
    fs.mkdirSync(healthRoot);
    const healthSources = sourceService(healthData, fileService, roots, { idFactory: () => uuid(450) });
    const healthSource = healthSources.addLocalFolder({ rootPath: healthRoot }).sources[0];
    const healthService = new TeemoLocalFolderService({ fileService, sourceService: healthSources, rootsProvider: () => roots });
    fs.rmSync(healthRoot, { recursive: true });
    await rejectCode(() => healthService.execute('health', { sourceId: healthSource.sourceId }), 'INSPIRATION_SOURCE_MISSING');
    fs.writeFileSync(healthRoot, 'not a directory');
    await rejectCode(() => healthService.execute('health', { sourceId: healthSource.sourceId }), 'INSPIRATION_SOURCE_INVALID');

    const permissionRequests = [];
    let guardedInvocations = 0;
    const registry = new TeemoInspirationConnectorRegistry();
    registry.register(new TeemoLocalFolderConnector({
      client: {
        execute: async (operation, request, context) => {
          guardedInvocations += 1;
          return localFolder.execute(operation, request, { signal: context.signal });
        },
      },
    }));
    const makeReadService = authorize => {
      const guard = new TeemoInspirationAccessGuard({ registry, permissionService: { authorize } });
      const service = new TeemoInspirationService({ dataDir: path.join(root, `guard-state-${Math.random()}`), registry, accessGuard: guard });
      assert.equal(service.setEnabled(true, { expectedRevision: 0 }).ok, true);
      return service;
    };
    const sourceAResource = `inspiration://local-folder/${sourceA.sourceId}`;
    const sourceBResource = `inspiration://local-folder/${sourceB.sourceId}`;
    assert.notEqual(sourceAResource, sourceBResource);
    const selective = makeReadService(async request => {
      permissionRequests.push(request);
      return { decision: request.resource === sourceAResource ? 'allow' : 'deny' };
    });
    assert.equal((await selective.readLocalFolder(sourceA.sourceId, 'health')).ok, true);
    assert.equal((await selective.readLocalFolder(sourceB.sourceId, 'health')).ok, false, 'Source A permission must not authorize Source B');
    assert.equal(guardedInvocations, 1);
    assert.equal(permissionRequests[0].resource, sourceAResource);
    assert.equal(permissionRequests[1].resource, sourceBResource);
    assert.equal(permissionRequests[0].toolName, 'inspiration_local_folder');
    assert.equal(permissionRequests[0].requiresExecutionAuthorization, true);
    const beforeDenied = guardedInvocations;
    assert.equal((await makeReadService(async () => ({ decision: 'deny' })).readLocalFolder(sourceA.sourceId, 'health')).ok, false);
    assert.equal((await makeReadService(async () => null).readLocalFolder(sourceA.sourceId, 'health')).ok, false);
    assert.equal((await makeReadService(async () => { throw new Error('private permission detail'); }).readLocalFolder(sourceA.sourceId, 'health')).ok, false);
    const preAborted = new AbortController();
    preAborted.abort();
    assert.equal((await selective.readLocalFolder(sourceA.sourceId, 'health', {}, { signal: preAborted.signal })).ok, false);
    assert.equal(guardedInvocations, beforeDenied, 'deny/null/error/pre-abort must not invoke connector');

    const ipcMain = new FakeIpcMain();
    const permissionService = new TeemoPermissionService();
    let ipcFsInvocations = 0;
    const ipcLocalFolder = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      hooks: { beforeOperation: () => { ipcFsInvocations += 1; } },
    });
    registerTeemoLocalFolderIpc(ipcMain, {
      sourceService: sources,
      localFolderService: ipcLocalFolder,
      permissionService,
      fileService,
      rootsProvider: () => roots,
      saveRoots: next => roots.splice(0, roots.length, ...next),
      selectFolder: async () => sourceRoot,
    });
    const executeHandler = ipcMain.handlers.get(TeemoLocalFolderClient.CHANNELS.execute);
    const event = { sender: { id: 7 } };
    const authorizeOnce = async (toolCallId, sourceId) => permissionService.requestPermission({
      toolCallId,
      runId: 'run-local',
      sessionId: 'session-local',
      toolName: 'inspiration_local_folder',
      permission: 'read',
      resource: `inspiration://local-folder/${sourceId}`,
      requiresExecutionAuthorization: true,
    }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
    await authorizeOnce('local-once-a', sourceA.sourceId);
    const executePayload = {
      requestId: 'request-a',
      operation: 'health',
      request: { sourceId: sourceA.sourceId },
      toolCallId: 'local-once-a',
      runId: 'run-local',
      sessionId: 'session-local',
    };
    assert.equal((await executeHandler(event, executePayload)).ok, true);
    assert.equal(ipcFsInvocations, 1);
    assert.equal((await executeHandler(event, { ...executePayload, requestId: 'request-replay' })).ok, false, 'one-time authorization must not replay');
    assert.equal(ipcFsInvocations, 1);
    await authorizeOnce('local-a-not-b', sourceA.sourceId);
    assert.equal((await executeHandler(event, {
      ...executePayload,
      requestId: 'request-cross-source',
      request: { sourceId: sourceB.sourceId },
      toolCallId: 'local-a-not-b',
    })).ok, false, 'Source A execution authorization must not authorize Source B');
    assert.equal(ipcFsInvocations, 1);

    let preAbortHookCount = 0;
    const abortController = new AbortController();
    abortController.abort();
    const preAbortService = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      hooks: { beforeOperation: () => { preAbortHookCount += 1; } },
    });
    await rejectCode(() => preAbortService.execute('list_items', { sourceId: sourceA.sourceId }, { signal: abortController.signal }), 'INSPIRATION_ABORTED');
    assert.equal(preAbortHookCount, 0, 'pre-abort must stop before connector I/O hook');

    const midListController = new AbortController();
    const midListService = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      hooks: { afterListEntry: (_item, count) => { if (count === 1) midListController.abort(); } },
    });
    await rejectCode(
      () => midListService.execute('list_items', { sourceId: sourceA.sourceId, relativeDirectory: 'large' }, { signal: midListController.signal }),
      'INSPIRATION_ABORTED',
    );
    const midPreviewController = new AbortController();
    const midPreviewService = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      hooks: { beforeOpen: () => midPreviewController.abort() },
    });
    await rejectCode(
      () => midPreviewService.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'cover.png' }, { signal: midPreviewController.signal }),
      'INSPIRATION_ABORTED',
    );

    let lateFilesystemStarted = 0;
    const timeoutStateBefore = fs.readFileSync(path.join(dataDir, TeemoInspirationSourceService.SOURCE_FILE));
    const timeoutService = new TeemoLocalFolderService({
      fileService,
      sourceService: sources,
      rootsProvider: () => roots,
      listTimeoutMs: 10,
      previewTimeoutMs: 10,
      hooks: {
        beforeOperation: () => new Promise(resolve => setTimeout(resolve, 35)),
        afterListEntry: () => { lateFilesystemStarted += 1; },
        beforeOpen: () => { lateFilesystemStarted += 1; },
      },
    });
    await rejectCode(() => timeoutService.execute('list_items', { sourceId: sourceA.sourceId }), 'INSPIRATION_TIMEOUT');
    await rejectCode(() => timeoutService.execute('preview', { sourceId: sourceA.sourceId, relativePath: 'cover.png' }), 'INSPIRATION_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 55));
    assert.equal(lateFilesystemStarted, 0, 'timed-out synthetic request must not begin late filesystem work');
    assert.ok(fs.readFileSync(path.join(dataDir, TeemoInspirationSourceService.SOURCE_FILE)).equals(timeoutStateBefore));

    const raceData = path.join(root, 'race-data');
    let raceId = 500;
    const raceSources = sourceService(raceData, fileService, roots, { idFactory: () => uuid(raceId++) });
    const raceRoot = path.join(authorizedParent, 'race-source');
    fs.mkdirSync(raceRoot);
    const raceImage = path.join(raceRoot, 'race.png');
    fs.writeFileSync(raceImage, PNG);
    let raceSource = raceSources.addLocalFolder({ rootPath: raceRoot }).sources[0];
    const staleSourceService = new TeemoLocalFolderService({
      fileService,
      sourceService: raceSources,
      rootsProvider: () => roots,
      hooks: { beforeOperation: () => raceSources.removeSource(raceSource.sourceId) },
    });
    await rejectCode(() => staleSourceService.execute('item_metadata', { sourceId: raceSource.sourceId, relativePath: 'race.png' }), 'INSPIRATION_SOURCE_NOT_FOUND');

    raceSource = raceSources.addLocalFolder({ rootPath: raceRoot }).sources[0];
    const replacementPath = path.join(raceRoot, 'replacement.png');
    fs.writeFileSync(replacementPath, PNG);
    const replacementService = new TeemoLocalFolderService({
      fileService,
      sourceService: raceSources,
      rootsProvider: () => roots,
      hooks: {
        beforeOpen: () => {
          fs.unlinkSync(raceImage);
          fs.renameSync(replacementPath, raceImage);
        },
      },
    });
    await rejectCode(() => replacementService.execute('preview', { sourceId: raceSource.sourceId, relativePath: 'race.png' }), 'INSPIRATION_SOURCE_CHANGED');
    fs.writeFileSync(raceImage, PNG);
    const sizeRaceService = new TeemoLocalFolderService({
      fileService,
      sourceService: raceSources,
      rootsProvider: () => roots,
      hooks: { beforeOpen: () => fs.appendFileSync(raceImage, Buffer.from([0])) },
    });
    await rejectCode(() => sizeRaceService.execute('preview', { sourceId: raceSource.sourceId, relativePath: 'race.png' }), 'INSPIRATION_SOURCE_CHANGED');

    const sourceConfig = JSON.parse(fs.readFileSync(path.join(dataDir, TeemoInspirationSourceService.SOURCE_FILE), 'utf8'));
    assert.deepEqual(Object.keys(sourceConfig).sort(), ['revision', 'schemaVersion', 'sources']);
    assert.deepEqual(Object.keys(sourceConfig.sources[0]).sort(), ['createdAt', 'displayName', 'kind', 'rootPath', 'sourceId', 'updatedAt']);
    assert.equal(JSON.stringify(sourceConfig).includes('cover.png'), false, 'source config must not become a metadata index');

    console.log(JSON.stringify({
      ok: true,
      tests: 68,
      permissionResourcesDistinct: sourceAResource !== sourceBResource,
      denyNullErrorPreAbortInvocations: 0,
      sourceBytesUnchanged: true,
      sourceMtimeUnchanged: true,
      sourceFileCountUnchanged: true,
      junctionSupported,
      junctionReason,
      formalUserDataTouched: false,
      realPersonalInspirationContentUsed: false,
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
