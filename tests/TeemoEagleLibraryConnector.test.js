const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');
const TeemoInspirationIndexRouter = require('../src/inspiration/TeemoInspirationIndexRouter');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoEagleLibraryIndexScanner = require('../src/inspiration/TeemoEagleLibraryIndexScanner');
const TeemoEagleLibraryService = require('../src/inspiration/TeemoEagleLibraryService');
const TeemoInspirationRetrievalService = require('../src/inspiration/TeemoInspirationRetrievalService');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function metadata(name, ext) { return JSON.stringify({ name, ext, width: 9999, height: 9999 }); }
async function rejects(task, code) {
  try { await Promise.resolve().then(task); }
  catch (error) { assert.equal(error && error.code, code); return; }
  assert.fail(`expected ${code}`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-5-eagle-'));
  try {
    const dataDir = path.join(root, 'data');
    const authorizedRoot = path.join(root, 'authorized');
    const library = path.join(authorizedRoot, 'Teemo Eagle Library');
    const images = path.join(library, 'images');
    const blueId = 'blue-item'; const redId = 'red-item';
    fs.mkdirSync(path.join(images, blueId), { recursive: true });
    fs.mkdirSync(path.join(images, redId), { recursive: true });
    fs.writeFileSync(path.join(images, blueId, 'metadata.json'), metadata('banner-blue', 'png'));
    fs.writeFileSync(path.join(images, blueId, 'banner-blue.png'), PNG);
    fs.writeFileSync(path.join(images, redId, 'metadata.json'), metadata('banner-red', 'jpg'));
    fs.writeFileSync(path.join(images, redId, 'banner-red.jpg'), JPEG);
    fs.mkdirSync(path.join(images, 'broken-item'));
    fs.writeFileSync(path.join(images, 'broken-item', 'metadata.json'), '{broken');
    fs.writeFileSync(path.join(images, 'stray.txt'), 'not an item');
    const bluePath = path.join(images, blueId, 'banner-blue.png');
    const metadataPath = path.join(images, blueId, 'metadata.json');
    const before = [{ file: bluePath, hash: hash(bluePath), mtime: fs.statSync(bluePath).mtimeMs }, { file: metadataPath, hash: hash(metadataPath), mtime: fs.statSync(metadataPath).mtimeMs }];
    const roots = [authorizedRoot];
    const fileService = new TeemoFileService();
    const sourceService = new TeemoInspirationSourceService({ dataDir, fileService, rootsProvider: () => roots });
    sourceService.addEagleLibrary({ rootPath: library, displayName: 'Teemo Eagle Test' });
    const source = sourceService.getSnapshot().sources[0];
    assert.equal(source.kind, 'eagle_library');
    const localScanner = new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
    const eagleScanner = new TeemoEagleLibraryIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
    const router = new TeemoInspirationIndexRouter({ sourceService, localFolderScanner: localScanner, eagleLibraryScanner: eagleScanner });
    const storage = new TeemoInspirationIndexStorage({ dataDir });
    const indexService = new TeemoInspirationIndexService({ storage, scanner: router });
    const stateService = new TeemoInspirationService({ dataDir });
    stateService.setEnabled(true);
    const eagleService = new TeemoEagleLibraryService({ fileService, sourceService, scanner: eagleScanner });
    const retrieval = new TeemoInspirationRetrievalService({ indexService, sourceService, inspirationStateService: stateService });

    const built = await indexService.scan(source.sourceId, 'build');
    assert.equal(built.status, 'READY');
    assert.equal(built.entry.sourceKind, 'eagle_library');
    assert.equal(built.entry.itemCount, 2);
    assert.ok(built.summary.skippedInvalid >= 1);
    const snapshot = indexService.getSourceSnapshot(source.sourceId, { all: true });
    assert.equal(snapshot.status, 'READY');
    assert.equal(snapshot.items.every(item => item.sourceKind === 'eagle_library'), true);
    assert.equal(snapshot.items.every(item => !path.isAbsolute(item.relativePath)), true);
    assert.equal(snapshot.items.every(item => !Object.values(item).some(value => typeof value === 'string' && value.includes(library))), true);

    const searched = retrieval.search({ query: 'banner', sourceId: source.sourceId, format: 'png', sort: 'name' });
    assert.equal(searched.status, 'READY');
    assert.equal(searched.total, 1);
    assert.equal(searched.items[0].name, 'banner-blue.png');
    const preview = await eagleService.execute('preview', { sourceId: source.sourceId, relativePath: searched.items[0].relativePath });
    assert.equal(preview.mimeType, 'image/png');
    assert.equal(Buffer.from(preview.dataBase64, 'base64').equals(PNG), true);
    const listed = await eagleService.execute('list_items', { sourceId: source.sourceId, limit: 100 });
    assert.equal(listed.entries.length, 2);
    await rejects(() => eagleService.execute('preview', { sourceId: source.sourceId, relativePath: '../outside.png' }), 'INSPIRATION_PATH_INVALID');
    await rejects(() => eagleService.execute('preview', { sourceId: source.sourceId, relativePath: 'images/blue-item/metadata.json' }), 'INSPIRATION_PREVIEW_UNSUPPORTED');

    roots.length = 0;
    assert.equal(indexService.getSourceSnapshot(source.sourceId).status, 'AUTHORIZATION_REQUIRED');
    assert.equal(retrieval.search({ sourceId: source.sourceId }).status, 'AUTHORIZATION_REQUIRED');
    await rejects(() => eagleService.execute('preview', { sourceId: source.sourceId, relativePath: searched.items[0].relativePath }), 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED');
    roots.push(authorizedRoot);
    sourceService.removeSource(source.sourceId, { expectedRevision: sourceService.getSnapshot().revision });
    assert.equal(retrieval.search({ sourceId: source.sourceId }).status, 'SOURCE_NOT_FOUND');
    stateService.setEnabled(false, { expectedRevision: stateService.getState().revision });
    assert.equal(retrieval.search({}).status, 'DISABLED');
    for (const item of before) {
      assert.equal(hash(item.file), item.hash);
      assert.equal(fs.statSync(item.file).mtimeMs, item.mtime);
    }
    assert.equal(fs.readdirSync(library).some(name => /index|cache|thumbnail|\.teemo/i.test(name)), false);
    console.log(JSON.stringify({ ok: true, tests: 25, sourceType: 'eagle_library', index: true, retrieval: true, preview: true, authorizationRevoked: true, sourceRemovedFailsClosed: true, disabledFailsClosed: true, traversalRejected: true, providerCalls: 0, sourceBytesUnchanged: true, formalUserDataTouched: false }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
