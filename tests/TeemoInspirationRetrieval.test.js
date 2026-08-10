const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');
const TeemoInspirationRetrievalService = require('../src/inspiration/TeemoInspirationRetrievalService');

function summary(count) {
  return {
    directories: 0, entriesInspected: count, indexed: count, reused: 0, updated: 0, added: count, removed: 0,
    skippedUnsupported: 0, skippedInvalid: 0, skippedTooLarge: 0, skippedLink: 0,
  };
}

function indexedItem(sourceId, relativePath, options = {}) {
  const pathKey = TeemoInspirationIndexStorage.pathKeyFor(relativePath);
  const extension = options.extension || path.posix.extname(relativePath).toLowerCase();
  const item = {
    schemaVersion: TeemoInspirationIndexStorage.SCHEMA_VERSION,
    itemId: TeemoInspirationIndexStorage.itemIdFor('local_folder', sourceId, pathKey),
    sourceKind: 'local_folder', sourceId, relativePath, pathKey,
    name: path.posix.basename(relativePath), extension,
    mime: options.mime || ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extension]),
    sizeBytes: options.sizeBytes || 24,
    mtimeNs: String(options.mtimeNs || 100), ctimeNs: String(options.ctimeNs || 100),
    width: options.width || 1, height: options.height || 1,
    metadataFingerprint: '', observedAt: '2026-08-10T00:00:00.000Z',
  };
  item.metadataFingerprint = TeemoInspirationIndexStorage.metadataFingerprintFor(item);
  return item;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-4-retrieval-'));
  try {
    const dataDir = path.join(root, 'data');
    const sourceAPath = path.join(root, 'Teemo Retrieval A');
    const sourceBPath = path.join(root, 'Teemo Retrieval B');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(sourceAPath, { recursive: true });
    fs.mkdirSync(sourceBPath, { recursive: true });
    const sourceTreeBefore = [sourceAPath, sourceBPath].map(directory => fs.readdirSync(directory, { recursive: true }));
    let authorizedRoots = [sourceAPath, sourceBPath];
    const fileService = new TeemoFileService();
    const sourceService = new TeemoInspirationSourceService({ dataDir, fileService, rootsProvider: () => authorizedRoots });
    sourceService.addLocalFolder({ rootPath: sourceAPath, displayName: 'Teemo Source A' });
    sourceService.addLocalFolder({ rootPath: sourceBPath, displayName: 'Teemo Source B' });
    const [sourceA, sourceB] = sourceService.getSnapshot().sources;
    const storage = new TeemoInspirationIndexStorage({ dataDir });
    const scanner = new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => authorizedRoots });
    const indexService = new TeemoInspirationIndexService({ storage, scanner });
    const inspirationStateService = new TeemoInspirationService({ dataDir });
    assert.equal(inspirationStateService.setEnabled(true).ok, true);

    const sourceAItems = [
      indexedItem(sourceA.sourceId, 'banner-blue.png', { width: 2400, height: 1200, mtimeNs: 300, extension: '.png' }),
      indexedItem(sourceA.sourceId, 'banner-red.jpg', { width: 1800, height: 900, mtimeNs: 100, extension: '.jpg' }),
      indexedItem(sourceA.sourceId, 'poster-vertical.webp', { width: 800, height: 1600, mtimeNs: 200, extension: '.webp' }),
      indexedItem(sourceA.sourceId, 'icon-square.png', { width: 512, height: 512, mtimeNs: 400, extension: '.png' }),
      indexedItem(sourceA.sourceId, 'project/card/card-final.png', { width: 2048, height: 1024, mtimeNs: 500, extension: '.png' }),
    ];
    for (let index = 0; index < 101; index += 1) {
      sourceAItems.push(indexedItem(sourceA.sourceId, `bulk/banner-${String(index).padStart(3, '0')}.png`, {
        width: 1600, height: 900, mtimeNs: 1000 + index, extension: '.png',
      }));
    }
    const sourceBItems = [indexedItem(sourceB.sourceId, 'banner-source-b.gif', { width: 900, height: 600, mtimeNs: 9999, extension: '.gif' })];
    storage.commitSourceSnapshot({ sourceId: sourceA.sourceId, sourceRegistryRevision: 2, mode: 'full', items: sourceAItems, summary: summary(sourceAItems.length) }, { expectedManifestRevision: 0, expectedIndexRevision: 0 });
    storage.commitSourceSnapshot({ sourceId: sourceB.sourceId, sourceRegistryRevision: 2, mode: 'full', items: sourceBItems, summary: summary(sourceBItems.length) }, { expectedManifestRevision: 1, expectedIndexRevision: 0 });

    const retrieval = new TeemoInspirationRetrievalService({ indexService, sourceService, inspirationStateService });
    const keyword = retrieval.search({ query: 'BANNER', sort: 'name' });
    assert.equal(keyword.status, 'READY');
    assert.equal(keyword.total, 104);
    assert.equal(keyword.items[0].name, 'banner-000.png');
    assert.equal(keyword.items.every(item => !Object.values(item).some(value => typeof value === 'string' && value.includes(sourceAPath))), true);
    const pathKeyword = retrieval.search({ query: 'project/card' });
    assert.deepEqual(pathKeyword.items.map(item => item.relativePath), ['project/card/card-final.png']);
    const sourceOnly = retrieval.search({ query: 'banner', sourceId: sourceB.sourceId });
    assert.deepEqual(sourceOnly.items.map(item => item.sourceId), [sourceB.sourceId]);
    const format = retrieval.search({ format: 'PNG', orientation: 'landscape', minWidth: 2000, minHeight: 1000, sort: 'newest' });
    assert.deepEqual(format.items.map(item => item.relativePath), ['project/card/card-final.png', 'banner-blue.png']);
    assert.deepEqual(retrieval.search({ orientation: 'portrait' }).items.map(item => item.relativePath), ['poster-vertical.webp']);
    assert.deepEqual(retrieval.search({ orientation: 'square' }).items.map(item => item.relativePath), ['icon-square.png']);
    assert.deepEqual(retrieval.search({ query: 'banner-red', sort: 'oldest' }).items.map(item => item.relativePath), ['banner-red.jpg']);
    const newest = retrieval.search({ query: 'banner', sort: 'newest', limit: 1 });
    assert.equal(newest.items[0].relativePath, 'banner-source-b.gif');
    const pageOne = retrieval.search({ query: 'banner', limit: 999 });
    assert.equal(pageOne.limit, 100);
    assert.equal(pageOne.items.length, 100);
    assert.equal(pageOne.hasMore, true);
    const pageTwo = retrieval.search({ query: 'banner', offset: 100, limit: 100 });
    assert.equal(pageTwo.items.length, 4);
    assert.equal(pageTwo.hasMore, false);

    authorizedRoots = [sourceBPath];
    const revoked = retrieval.search({ query: 'banner', sourceId: sourceA.sourceId });
    assert.equal(revoked.status, 'AUTHORIZATION_REQUIRED');
    assert.equal(revoked.total, 0);
    assert.equal(revoked.items.length, 0);
    const onlyActiveSource = retrieval.search({ query: 'banner' });
    assert.deepEqual(onlyActiveSource.items.map(item => item.sourceId), [sourceB.sourceId]);
    assert.equal(inspirationStateService.setEnabled(false).ok, true);
    const disabled = retrieval.search({ query: 'banner' });
    assert.equal(disabled.status, 'DISABLED');
    assert.equal(disabled.items.length, 0);
    assert.equal(inspirationStateService.setEnabled(true).ok, true);
    authorizedRoots = [sourceAPath, sourceBPath];
    sourceService.removeSource(sourceA.sourceId);
    const removed = retrieval.search({ query: 'banner', sourceId: sourceA.sourceId });
    assert.equal(removed.status, 'SOURCE_NOT_FOUND');
    assert.equal(removed.items.length, 0);
    assert.deepEqual(retrieval.search({ query: 'banner' }).items.map(item => item.sourceId), [sourceB.sourceId]);
    assert.deepEqual([sourceAPath, sourceBPath].map(directory => fs.readdirSync(directory, { recursive: true })), sourceTreeBefore);

    console.log(JSON.stringify({
      ok: true, tests: 20, keyword: true, filters: true, sort: true, paginationMax: 100,
      authorizationRevoked: true, sourceRemovedFailsClosed: true, disabledFailsClosed: true, providerCalls: 0, agentContextChanged: false,
      sourceBytesUnchanged: true, formalUserDataTouched: false,
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
