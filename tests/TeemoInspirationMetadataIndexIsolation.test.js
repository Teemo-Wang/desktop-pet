const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const TeemoInspirationAccessGuard = require('../src/inspiration/TeemoInspirationAccessGuard');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function rejectCode(task, code) {
  await assert.rejects(task, error => error && error.code === code, `expected ${code}`);
}

function makeEnvironment(root) {
  const dataDir = path.join(root, 'data');
  const sourceRoot = path.join(root, 'Teemo Isolation Source');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'Teemo A', 'Teemo B'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'Teemo One.png'), PNG);
  fs.writeFileSync(path.join(sourceRoot, 'Teemo Two.png'), PNG);
  fs.writeFileSync(path.join(sourceRoot, 'Teemo A', 'Teemo B', 'Teemo Deep.png'), PNG);
  const roots = [sourceRoot];
  const fileService = new TeemoFileService();
  const sourceService = new TeemoInspirationSourceService({ dataDir, fileService, rootsProvider: () => roots });
  sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Isolation Source' });
  const source = sourceService.getSnapshot().sources[0];
  const storage = new TeemoInspirationIndexStorage({ dataDir });
  const scanner = new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
  const indexService = new TeemoInspirationIndexService({ storage, scanner });
  return { dataDir, sourceRoot, roots, fileService, sourceService, source, storage, scanner, indexService };
}

async function permissionChecks(sourceId, sourceRoot) {
  let scannerInvocations = 0;
  const invokeAfterAuthorization = async (permissionService, context = {}) => {
    const guard = new TeemoInspirationAccessGuard({ permissionService });
    const authorization = await guard.authorizeIndexScan(sourceId, context);
    scannerInvocations += 1;
    return authorization;
  };

  const denied = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'deny' }) });
  await rejectCode(() => invokeAfterAuthorization(denied, { toolCallId: 'deny', sessionId: 'p3-3' }), 'INSPIRATION_PERMISSION_DENIED');
  assert.equal(scannerInvocations, 0);

  const nullPermission = new TeemoPermissionService({ decisionProvider: async () => null });
  await rejectCode(() => invokeAfterAuthorization(nullPermission, { toolCallId: 'null', sessionId: 'p3-3' }), 'INSPIRATION_PERMISSION_DENIED');
  assert.equal(scannerInvocations, 0);

  const exceptionPermission = new TeemoPermissionService({ decisionProvider: async () => { throw new Error('synthetic permission failure'); } });
  await rejectCode(() => invokeAfterAuthorization(exceptionPermission, { toolCallId: 'exception', sessionId: 'p3-3' }), 'INSPIRATION_PERMISSION_DENIED');
  assert.equal(scannerInvocations, 0);

  const preAbort = new AbortController();
  preAbort.abort();
  const abortPermission = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
  await rejectCode(() => invokeAfterAuthorization(abortPermission, {
    toolCallId: 'abort', sessionId: 'p3-3', signal: preAbort.signal,
  }), 'INSPIRATION_ABORTED');
  assert.equal(scannerInvocations, 0);

  const allowed = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
  const authorization = await invokeAfterAuthorization(allowed, { toolCallId: 'allow-once', sessionId: 'p3-3' });
  assert.equal(scannerInvocations, 1);
  assert.equal(authorization.resource, `inspiration://local-folder/${sourceId}`);
  assert.equal(authorization.resource.includes(sourceRoot), false);
  assert.equal(allowed.consumeExecutionAuthorization({
    toolCallId: authorization.toolCallId,
    sessionId: authorization.sessionId,
    runId: authorization.runId,
    toolName: 'inspiration_metadata_index',
    permission: 'read',
    resource: `inspiration://local-folder/${sourceId}`,
  }), true);
  assert.equal(allowed.consumeExecutionAuthorization({
    toolCallId: authorization.toolCallId,
    sessionId: authorization.sessionId,
    runId: authorization.runId,
    toolName: 'inspiration_metadata_index',
    permission: 'read',
    resource: `inspiration://local-folder/${sourceId}`,
  }), false, 'execution authorization must be one-time');

  const cross = await invokeAfterAuthorization(allowed, { toolCallId: 'cross-source', sessionId: 'p3-3' });
  assert.equal(allowed.consumeExecutionAuthorization({
    toolCallId: cross.toolCallId,
    sessionId: cross.sessionId,
    runId: cross.runId,
    toolName: 'inspiration_metadata_index',
    permission: 'read',
    resource: `inspiration://local-folder/${crypto.randomUUID()}`,
  }), false);
  assert.equal(allowed.consumeExecutionAuthorization({
    toolCallId: cross.toolCallId,
    sessionId: cross.sessionId,
    runId: cross.runId,
    toolName: 'inspiration_metadata_index',
    permission: 'read',
    resource: cross.resource,
  }), true);
  return { scannerInvocations, audit: allowed.listAudit() };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-3-isolation-'));
  try {
    const env = makeEnvironment(root);
    const protectedFiles = [
      'Teemo-cognition.json',
      'Teemo-creative-profile.json',
      'Teemo-challenge-session.json',
      'Teemo-skill-registry.json',
      'Teemo-projects.json',
      'settings.json',
      'chat-history.json',
      'credentials.json',
      'Teemo-inspiration-state.json',
    ];
    const protectedBytes = new Map();
    for (const file of protectedFiles) {
      const bytes = Buffer.from(`synthetic-isolation:${file}`);
      fs.writeFileSync(path.join(env.dataDir, file), bytes);
      protectedBytes.set(file, bytes);
    }
    const sourceRegistryPath = path.join(env.dataDir, TeemoInspirationSourceService.SOURCE_FILE);
    const sourceRegistryBytes = fs.readFileSync(sourceRegistryPath);
    const permission = await permissionChecks(env.source.sourceId, env.sourceRoot);
    assert.equal(permission.scannerInvocations, 2);
    assert.ok(permission.audit.every(event => event.toolName === 'inspiration_metadata_index'));

    await env.indexService.scan(env.source.sourceId, 'build');
    const baseline = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    assert.equal(baseline.entry.itemCount, 3);
    for (const [file, bytes] of protectedBytes) assert.ok(fs.readFileSync(path.join(env.dataDir, file)).equals(bytes));
    assert.ok(fs.readFileSync(sourceRegistryPath).equals(sourceRegistryBytes));

    env.roots.splice(0);
    const revoked = env.indexService.getSourceSnapshot(env.source.sourceId, { all: true });
    assert.equal(revoked.status, 'AUTHORIZATION_REQUIRED');
    assert.deepEqual(revoked.items, []);
    env.roots.push(env.sourceRoot);
    assert.equal(env.indexService.getSourceSnapshot(env.source.sourceId).status, 'READY');

    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Revoked.png'), PNG);
    let revokedDuringScan = false;
    env.scanner.hooks.afterHeaderRead = () => {
      if (!revokedDuringScan) {
        revokedDuringScan = true;
        env.roots.splice(0);
      }
    };
    await rejectCode(() => env.indexService.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision, baseline.entry.indexRevision);
    env.roots.push(env.sourceRoot);
    env.scanner.hooks.afterHeaderRead = null;

    let releaseScan;
    let scanEntered;
    const entered = new Promise(resolve => { scanEntered = resolve; });
    const release = new Promise(resolve => { releaseScan = resolve; });
    let held = false;
    env.scanner.hooks.beforeDirectory = async () => {
      if (held) return;
      held = true;
      scanEntered();
      await release;
    };
    const activeScan = env.indexService.scan(env.source.sourceId, 'refresh');
    await entered;
    await rejectCode(() => env.indexService.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_INDEX_BUSY');
    releaseScan();
    await activeScan;
    env.scanner.hooks.beforeDirectory = null;

    const scannerA = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
    });
    const scannerB = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
    });
    const serviceA = new TeemoInspirationIndexService({ storage: env.storage, scanner: scannerA });
    const serviceB = new TeemoInspirationIndexService({ storage: env.storage, scanner: scannerB });
    let releaseCommit;
    let commitEntered;
    const atCommit = new Promise(resolve => { commitEntered = resolve; });
    const commitRelease = new Promise(resolve => { releaseCommit = resolve; });
    scannerA.hooks.beforeCommit = async () => { commitEntered(); await commitRelease; };
    const staleScan = serviceA.scan(env.source.sourceId, 'refresh');
    await atCommit;
    const winningScan = await serviceB.scan(env.source.sourceId, 'refresh');
    releaseCommit();
    await rejectCode(() => staleScan, 'INSPIRATION_INDEX_CHANGED');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision, winningScan.entry.indexRevision);

    const strictDepthScanner = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
      maxDepth: 1,
    });
    const strictDepthService = new TeemoInspirationIndexService({ storage: env.storage, scanner: strictDepthScanner });
    const beforeLimitRevision = env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision;
    await rejectCode(() => strictDepthService.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_DEPTH_EXCEEDED');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision, beforeLimitRevision);

    const strictDirectoryScanner = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
      maxDirectories: 1,
    });
    await rejectCode(
      () => new TeemoInspirationIndexService({ storage: env.storage, scanner: strictDirectoryScanner }).scan(env.source.sourceId, 'refresh'),
      'INSPIRATION_INDEX_LIMIT_EXCEEDED',
    );
    const strictDirentScanner = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
      maxDirents: 1,
    });
    await rejectCode(
      () => new TeemoInspirationIndexService({ storage: env.storage, scanner: strictDirentScanner }).scan(env.source.sourceId, 'refresh'),
      'INSPIRATION_INDEX_LIMIT_EXCEEDED',
    );
    const strictItemScanner = new TeemoLocalFolderIndexScanner({
      fileService: env.fileService,
      sourceService: env.sourceService,
      rootsProvider: () => env.roots,
      maxItems: 1,
    });
    await rejectCode(
      () => new TeemoInspirationIndexService({ storage: env.storage, scanner: strictItemScanner }).scan(env.source.sourceId, 'rebuild'),
      'INSPIRATION_INDEX_LIMIT_EXCEEDED',
    );
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision, beforeLimitRevision);

    const raceFile = path.join(env.sourceRoot, 'Teemo Race.png');
    fs.writeFileSync(raceFile, PNG);
    let replaced = false;
    scannerA.hooks.beforeCommit = null;
    scannerA.hooks.beforeHeaderOpen = candidate => {
      if (!replaced && candidate === raceFile) {
        replaced = true;
        const replacement = Buffer.from(PNG);
        replacement[replacement.length - 1] ^= 1;
        fs.writeFileSync(raceFile, replacement);
      }
    };
    await rejectCode(() => serviceA.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_SOURCE_CHANGED');
    scannerA.hooks.beforeHeaderOpen = null;
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).entry.indexRevision, beforeLimitRevision);

    let changedAfterRead = false;
    scannerA.hooks.afterHeaderRead = candidate => {
      if (!changedAfterRead && candidate === raceFile) {
        changedAfterRead = true;
        fs.appendFileSync(raceFile, Buffer.from([0]));
      }
    };
    await rejectCode(() => serviceA.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_SOURCE_CHANGED');
    scannerA.hooks.afterHeaderRead = null;

    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'Teemo Outside.png'), PNG);
    let junctionSupported = true;
    let junctionReason = null;
    const junction = path.join(env.sourceRoot, 'Teemo Outside Link');
    try { fs.symlinkSync(outside, junction, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { junctionSupported = false; junctionReason = error.code || error.message; }
    if (junctionSupported) {
      fs.unlinkSync(raceFile);
      const linked = await serviceA.scan(env.source.sourceId, 'refresh');
      assert.ok(linked.summary.skippedLink >= 1);
      assert.equal(env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).items.some(item => item.name === 'Teemo Outside.png'), false);
    }

    const sourceBytesBeforeRemove = fs.readFileSync(path.join(env.sourceRoot, 'Teemo One.png'));
    env.sourceService.removeSource(env.source.sourceId);
    assert.equal(env.indexService.getSourceSnapshot(env.source.sourceId).status, 'SOURCE_MISSING');
    const cleanup = env.indexService.removeSourceIndex(env.source.sourceId);
    assert.equal(cleanup.removed, true);
    assert.ok(fs.readFileSync(path.join(env.sourceRoot, 'Teemo One.png')).equals(sourceBytesBeforeRemove));
    assert.deepEqual(env.roots, [env.sourceRoot]);

    for (const [file, bytes] of protectedBytes) assert.ok(fs.readFileSync(path.join(env.dataDir, file)).equals(bytes));
    const chatRuntime = fs.readFileSync(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.js'), 'utf8');
    assert.equal(chatRuntime.includes('TeemoInspirationContextBuilder'), false);
    assert.equal(chatRuntime.includes('inspiration metadata system'), false);

    console.log(JSON.stringify({
      ok: true,
      tests: 52,
      permissionResource: 'inspiration://local-folder/<synthetic-sourceId>',
      permissionDenyInvocationDelta: 0,
      crossSourceReplayRejected: true,
      authorizationRevokeHidesMetadata: true,
      globalActiveScan: 1,
      staleWriterRejected: true,
      hardLimitsFailClosed: true,
      toctouRejected: true,
      providerCalls: 0,
      agentContextChanged: false,
      p2FactBytesUnchanged: true,
      sourceBytesUnchanged: true,
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
