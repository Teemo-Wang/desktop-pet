const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00]);
const WEBP = (() => {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(5, 24, 3);
  buffer.writeUIntLE(6, 27, 3);
  return buffer;
})();

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function cloneItemForSource(item, sourceId, relativePath) {
  const pathKey = TeemoInspirationIndexStorage.pathKeyFor(relativePath);
  const cloned = {
    ...item,
    sourceId,
    relativePath,
    pathKey,
    name: path.posix.basename(relativePath),
    itemId: TeemoInspirationIndexStorage.itemIdFor('local_folder', sourceId, pathKey),
    metadataFingerprint: '',
  };
  cloned.metadataFingerprint = TeemoInspirationIndexStorage.metadataFingerprintFor(cloned);
  return cloned;
}

async function rejectCode(task, code) {
  await assert.rejects(task, error => error && error.code === code, `expected ${code}`);
}

function setup(root, name = 'Teemo Synthetic Source') {
  const dataDir = path.join(root, 'data');
  const sourceRoot = path.join(root, name);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  const roots = [sourceRoot];
  const fileService = new TeemoFileService();
  const sourceService = new TeemoInspirationSourceService({
    dataDir,
    fileService,
    rootsProvider: () => roots,
  });
  sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: name });
  const source = sourceService.getSnapshot().sources[0];
  const storage = new TeemoInspirationIndexStorage({ dataDir });
  let headerReads = 0;
  const scanner = new TeemoLocalFolderIndexScanner({
    fileService,
    sourceService,
    rootsProvider: () => roots,
    hooks: { beforeHeaderOpen: () => { headerReads += 1; } },
  });
  const indexService = new TeemoInspirationIndexService({ storage, scanner });
  return { dataDir, sourceRoot, roots, fileService, sourceService, source, storage, scanner, indexService, headerReads: () => headerReads };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-3-index-'));
  try {
    const env = setup(root);
    const nested = path.join(env.sourceRoot, 'Teemo Nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo One.png'), PNG);
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Two.jpg'), JPEG);
    fs.writeFileSync(path.join(nested, 'Teemo Three.gif'), GIF);
    fs.writeFileSync(path.join(nested, 'Teemo Four.webp'), WEBP);
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Note.txt'), 'synthetic unsupported');
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Broken.png'), Buffer.from('not-png'));
    const oversizedPath = path.join(env.sourceRoot, 'Teemo Oversized.png');
    const oversizedHandle = fs.openSync(oversizedPath, 'w');
    fs.ftruncateSync(oversizedHandle, TeemoLocalFolderIndexScanner.MAX_FILE_BYTES + 1);
    fs.closeSync(oversizedHandle);
    const longHeader = Buffer.alloc(TeemoLocalFolderIndexScanner.MAX_HEADER_BYTES + 128);
    longHeader[0] = 0xff;
    longHeader[1] = 0xd8;
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Long Header.jpg'), longHeader);
    const sourceFiles = [
      path.join(env.sourceRoot, 'Teemo One.png'),
      path.join(env.sourceRoot, 'Teemo Two.jpg'),
      path.join(nested, 'Teemo Three.gif'),
      path.join(nested, 'Teemo Four.webp'),
    ];
    const before = sourceFiles.map(file => ({ file, hash: digest(file), mtime: fs.statSync(file).mtimeMs }));

    const empty = env.storage.readSourceSnapshot(env.source.sourceId);
    assert.equal(empty.status, 'NOT_INDEXED');
    assert.equal(empty.manifest.revision, 0);
    assert.equal(fs.existsSync(path.join(env.dataDir, 'Teemo-inspiration-index', 'manifest.json')), false);

    const built = await env.indexService.scan(env.source.sourceId, 'build');
    assert.equal(built.status, 'READY');
    assert.equal(built.entry.indexRevision, 1);
    assert.equal(built.entry.itemCount, 4);
    assert.equal(built.summary.indexed, 4);
    assert.equal(built.summary.added, 4);
    assert.equal(built.summary.skippedUnsupported, 1);
    assert.equal(built.summary.skippedInvalid, 2);
    assert.equal(built.summary.skippedTooLarge, 1);
    assert.equal(env.headerReads(), 6, 'invalid supported images still consume one bounded header read each');
    for (const item of before) {
      assert.equal(digest(item.file), item.hash);
      assert.equal(fs.statSync(item.file).mtimeMs, item.mtime);
    }

    const first = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    assert.equal(first.status, 'READY');
    assert.equal(first.manifest.revision, 1);
    assert.equal(first.entry.sourceRegistryRevision, 1);
    assert.match(first.entry.shardFile, new RegExp(`^sources/${env.source.sourceId}\\.1\\.jsonl$`));
    const shardPath = path.join(env.storage.indexRoot, ...first.entry.shardFile.split('/'));
    assert.equal(digest(shardPath), first.entry.shardSha256);
    assert.equal(first.items.length, 4);
    assert.deepEqual(first.items.map(item => item.mime).sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
    const jpeg = first.items.find(item => item.extension === '.jpg');
    const gif = first.items.find(item => item.extension === '.gif');
    const webp = first.items.find(item => item.extension === '.webp');
    assert.deepEqual([jpeg.width, jpeg.height], [3, 2]);
    assert.deepEqual([gif.width, gif.height], [4, 5]);
    assert.deepEqual([webp.width, webp.height], [6, 7]);
    for (const item of first.items) {
      assert.match(item.itemId, /^[a-f0-9]{64}$/);
      assert.match(item.metadataFingerprint, /^[a-f0-9]{64}$/);
      assert.match(item.mtimeNs, /^\d+$/);
      assert.match(item.ctimeNs, /^\d+$/);
      assert.equal(Object.hasOwn(item, 'contentHash'), false);
      assert.equal(Object.values(item).some(value => typeof value === 'string' && value.includes(env.sourceRoot)), false);
      assert.equal(path.isAbsolute(item.relativePath), false);
      assert.equal(TeemoInspirationIndexStorage.validItem(item, env.source.sourceId), true);
    }
    assert.equal(TeemoInspirationIndexStorage.pathKeyFor('Folder\\IMAGE.PNG', 'win32'), 'folder/image.png');
    assert.equal(
      TeemoInspirationIndexStorage.itemIdFor('local_folder', env.source.sourceId, first.items[0].pathKey),
      first.items[0].itemId,
    );
    assert.notEqual(
      TeemoInspirationIndexStorage.itemIdFor('local_folder', crypto.randomUUID(), first.items[0].pathKey),
      first.items[0].itemId,
    );

    const readsAfterBuild = env.headerReads();
    const refreshed = await env.indexService.scan(env.source.sourceId, 'refresh');
    assert.equal(refreshed.entry.indexRevision, 2);
    assert.equal(refreshed.summary.reused, 4);
    assert.equal(refreshed.summary.updated, 0);
    assert.equal(refreshed.summary.added, 0);
    assert.equal(env.headerReads(), readsAfterBuild + 2, 'only invalid supported inputs are rechecked');

    const oldGif = env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).items.find(item => item.extension === '.gif');
    fs.renameSync(path.join(nested, 'Teemo Three.gif'), path.join(nested, 'Teemo Renamed.gif'));
    fs.unlinkSync(path.join(env.sourceRoot, 'Teemo One.png'));
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Added.png'), PNG);
    const changed = await env.indexService.scan(env.source.sourceId, 'refresh');
    assert.equal(changed.summary.added, 2);
    assert.equal(changed.summary.removed, 2);
    assert.equal(changed.summary.reused, 2);
    const changedSnapshot = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    assert.equal(changedSnapshot.items.some(item => item.relativePath === 'Teemo One.png'), false);
    const renamedGif = changedSnapshot.items.find(item => item.relativePath.endsWith('Teemo Renamed.gif'));
    assert.ok(renamedGif);
    assert.notEqual(renamedGif.itemId, oldGif.itemId);

    const beforeInvalidation = changedSnapshot.entry.indexRevision;
    fs.writeFileSync(path.join(env.sourceRoot, 'Teemo Two.jpg'), Buffer.from('changed-invalid-image'));
    const invalidated = await env.indexService.scan(env.source.sourceId, 'refresh');
    assert.equal(invalidated.entry.indexRevision, beforeInvalidation + 1);
    assert.equal(invalidated.summary.removed, 1);
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).items.some(item => item.extension === '.jpg'), false);

    const stable = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    env.scanner.hooks.beforeCommit = () => {
      const error = new Error('synthetic commit failure');
      error.code = 'INSPIRATION_INDEX_FAILED';
      throw error;
    };
    await rejectCode(() => env.indexService.scan(env.source.sourceId, 'refresh'), 'INSPIRATION_INDEX_FAILED');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).entry.indexRevision, stable.entry.indexRevision);
    env.scanner.hooks.beforeCommit = null;

    const controller = new AbortController();
    controller.abort();
    await rejectCode(() => env.indexService.scan(env.source.sourceId, 'refresh', { signal: controller.signal }), 'INSPIRATION_ABORTED');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).entry.indexRevision, stable.entry.indexRevision);

    env.scanner.hooks.beforeDirectory = () => new Promise(resolve => setTimeout(resolve, 8));
    await rejectCode(() => env.indexService.scan(env.source.sourceId, 'refresh', { timeoutMs: 1 }), 'INSPIRATION_TIMEOUT');
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId, { all: true }).entry.indexRevision, stable.entry.indexRevision);
    env.scanner.hooks.beforeDirectory = null;

    const corruptSnapshot = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    const corruptShardPath = path.join(env.storage.indexRoot, ...corruptSnapshot.entry.shardFile.split('/'));
    fs.appendFileSync(corruptShardPath, Buffer.from('{corrupt}\n'));
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).status, 'CORRUPT');
    const rebuilt = await env.indexService.scan(env.source.sourceId, 'rebuild');
    assert.equal(rebuilt.entry.indexRevision, stable.entry.indexRevision + 1);
    assert.equal(rebuilt.summary.reused, 0);
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).status, 'READY');
    assert.equal(fs.existsSync(corruptShardPath), false, 'old corrupt shard is removed only after successful rebuild');

    const unchangedWebp = before.find(item => item.file.endsWith('Teemo Four.webp'));
    assert.equal(digest(unchangedWebp.file), unchangedWebp.hash);
    assert.equal(fs.statSync(unchangedWebp.file).mtimeMs, unchangedWebp.mtime);
    assert.equal(fs.existsSync(path.join(env.sourceRoot, '.teemo')), false);
    assert.equal(fs.readdirSync(env.sourceRoot).some(name => /index|cache|thumbnail/i.test(name)), false);

    const active = env.storage.readSourceSnapshot(env.source.sourceId, { all: true });
    const activeShard = path.join(env.storage.indexRoot, ...active.entry.shardFile.split('/'));

    const storageSummary = { ...active.entry.summary };
    const twoItems = active.items.slice(0, 2);
    const perSourceStorage = new TeemoInspirationIndexStorage({
      dataDir: path.join(root, 'limit-per-source'),
      maxItemsPerSource: 1,
    });
    await rejectCode(() => Promise.resolve().then(() => perSourceStorage.commitSourceSnapshot({
      sourceId: env.source.sourceId,
      sourceRegistryRevision: 1,
      mode: 'full',
      items: twoItems,
      summary: storageSummary,
    }, { expectedManifestRevision: 0, expectedIndexRevision: 0 })), 'INSPIRATION_INDEX_LIMIT_EXCEEDED');

    const profileStorage = new TeemoInspirationIndexStorage({
      dataDir: path.join(root, 'limit-profile'),
      maxItemsProfile: 1,
    });
    profileStorage.commitSourceSnapshot({
      sourceId: env.source.sourceId,
      sourceRegistryRevision: 1,
      mode: 'full',
      items: [twoItems[0]],
      summary: storageSummary,
    }, { expectedManifestRevision: 0, expectedIndexRevision: 0 });
    const secondSourceId = crypto.randomUUID();
    const secondItem = cloneItemForSource(twoItems[1], secondSourceId, 'Teemo Second.png');
    await rejectCode(() => Promise.resolve().then(() => profileStorage.commitSourceSnapshot({
      sourceId: secondSourceId,
      sourceRegistryRevision: 2,
      mode: 'full',
      items: [secondItem],
      summary: storageSummary,
    }, { expectedManifestRevision: 1, expectedIndexRevision: 0 })), 'INSPIRATION_INDEX_LIMIT_EXCEEDED');

    const shardStorage = new TeemoInspirationIndexStorage({
      dataDir: path.join(root, 'limit-shard'),
      maxSourceShardBytes: 32,
    });
    await rejectCode(() => Promise.resolve().then(() => shardStorage.commitSourceSnapshot({
      sourceId: env.source.sourceId,
      sourceRegistryRevision: 1,
      mode: 'full',
      items: [twoItems[0]],
      summary: storageSummary,
    }, { expectedManifestRevision: 0, expectedIndexRevision: 0 })), 'INSPIRATION_INDEX_STORAGE_LIMIT');

    const diskStorage = new TeemoInspirationIndexStorage({
      dataDir: path.join(root, 'limit-disk'),
      maxCommittedIndexBytes: 32,
    });
    await rejectCode(() => Promise.resolve().then(() => diskStorage.commitSourceSnapshot({
      sourceId: env.source.sourceId,
      sourceRegistryRevision: 1,
      mode: 'full',
      items: [twoItems[0]],
      summary: storageSummary,
    }, { expectedManifestRevision: 0, expectedIndexRevision: 0 })), 'INSPIRATION_INDEX_STORAGE_LIMIT');

    const orphanStorage = new TeemoInspirationIndexStorage({ dataDir: path.join(root, 'orphan-recovery') });
    const orphanPath = path.join(orphanStorage.sourcesRoot, `${env.source.sourceId}.1.jsonl`);
    fs.writeFileSync(orphanPath, 'synthetic-crash-orphan');
    orphanStorage.commitSourceSnapshot({
      sourceId: env.source.sourceId,
      sourceRegistryRevision: 1,
      mode: 'full',
      items: [twoItems[0]],
      summary: storageSummary,
    }, { expectedManifestRevision: 0, expectedIndexRevision: 0 });
    assert.equal(orphanStorage.readSourceSnapshot(env.source.sourceId).status, 'READY');
    assert.equal(fs.readFileSync(orphanPath, 'utf8').includes('synthetic-crash-orphan'), false);

    fs.writeFileSync(path.join(env.storage.indexRoot, 'manifest.json'), '{broken-index-manifest');
    const unreadableBytes = fs.readFileSync(path.join(env.storage.indexRoot, 'manifest.json'));
    assert.equal(env.storage.getManifestSnapshot().stateError.code, 'INSPIRATION_INDEX_UNREADABLE');
    assert.equal(env.indexService.getManifestStatus().status, 'INDEX_UNREADABLE');
    assert.equal(env.indexService.getSourceSnapshot(env.source.sourceId).status, 'INDEX_UNREADABLE');
    assert.ok(fs.existsSync(activeShard));
    const reset = env.indexService.resetCorruptIndex();
    assert.equal(reset.reset, true);
    assert.equal(env.storage.readSourceSnapshot(env.source.sourceId).status, 'NOT_INDEXED');
    assert.ok(fs.existsSync(path.join(env.storage.indexRoot, reset.backupFile)));
    assert.ok(fs.readFileSync(path.join(env.storage.indexRoot, reset.backupFile)).equals(unreadableBytes));

    console.log(JSON.stringify({
      ok: true,
      tests: 73,
      types: ['PNG', 'JPEG', 'WEBP', 'GIF'],
      itemIdentity: 'sourceId+normalizedPathKey',
      sourceContentHash: false,
      metadataFingerprint: true,
      shardSha256: true,
      incrementalReuse: true,
      renameAsRemoveAdd: true,
      corruptRebuild: true,
      sourceBytesUnchanged: true,
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
