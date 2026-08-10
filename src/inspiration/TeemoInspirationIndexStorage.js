const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const TeemoStorageService = require('../services/TeemoStorageService');

const INDEX_DIRECTORY = 'Teemo-inspiration-index';
const MANIFEST_FILE = 'manifest.json';
const SOURCES_DIRECTORY = 'sources';
const SCHEMA_VERSION = 1;
const SCANNER_VERSION = 1;
const MAX_SOURCE_SHARD_BYTES = 64 * 1024 * 1024;
const MAX_COMMITTED_INDEX_BYTES = 256 * 1024 * 1024;
const MAX_ITEMS_PER_SOURCE = 25000;
const MAX_ITEMS_PROFILE = 100000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const SHARD_PATTERN = /^sources\/([0-9a-f-]{36})\.(\d+)\.jsonl$/i;
const INDEX_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const INDEX_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SOURCE_KINDS = new Set(['local_folder', 'eagle_library']);

class TeemoInspirationIndexError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoInspirationIndexError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoInspirationIndexError(code, message);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function defaultManifest() {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, updatedAt: null, sources: {} };
}

function validIso(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validCount(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function validSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
  const fields = [
    'directories', 'entriesInspected', 'indexed', 'reused', 'updated', 'added', 'removed',
    'skippedUnsupported', 'skippedInvalid', 'skippedTooLarge', 'skippedLink',
  ];
  return fields.every(field => validCount(summary[field]));
}

function validManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION || !validCount(value.revision) || !validIso(value.updatedAt, true)) return false;
  if (!value.sources || typeof value.sources !== 'object' || Array.isArray(value.sources)) return false;
  const shardFiles = new Set();
  for (const [sourceId, entry] of Object.entries(value.sources)) {
    if (!UUID_PATTERN.test(sourceId) || !entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (entry.sourceId !== sourceId || !SOURCE_KINDS.has(entry.sourceKind)) return false;
    if (!validCount(entry.indexRevision) || entry.indexRevision < 1 || !validCount(entry.sourceRegistryRevision)) return false;
    const shardMatch = SHARD_PATTERN.exec(String(entry.shardFile || ''));
    if (!shardMatch || shardMatch[1].toLowerCase() !== sourceId.toLowerCase()
      || Number(shardMatch[2]) !== entry.indexRevision || shardFiles.has(entry.shardFile)) return false;
    shardFiles.add(entry.shardFile);
    if (!HASH_PATTERN.test(String(entry.shardSha256 || '')) || !validCount(entry.itemCount, MAX_ITEMS_PER_SOURCE)) return false;
    if (!validIso(entry.lastSuccessfulScanAt) || !['full', 'incremental', 'rebuild'].includes(entry.lastScanMode)) return false;
    if (entry.scannerVersion !== SCANNER_VERSION || !validSummary(entry.summary)) return false;
  }
  return Object.values(value.sources).reduce((sum, entry) => sum + entry.itemCount, 0) <= MAX_ITEMS_PROFILE;
}

function itemIdFor(sourceKind, sourceId, pathKey) {
  return sha256(`${sourceKind}\u0000${sourceId}\u0000${pathKey}`);
}

function metadataFingerprintFor(item) {
  return sha256([
    item.sourceId,
    item.pathKey,
    String(item.sizeBytes),
    item.mtimeNs,
    item.ctimeNs,
    item.mime,
    String(item.width),
    String(item.height),
  ].join('\u0000'));
}

function validRelativePath(value) {
  const text = String(value || '');
  if (!text || text.includes('\u0000') || path.isAbsolute(text) || path.win32.isAbsolute(text) || /^[A-Za-z]:/.test(text)) return false;
  const parts = text.replace(/\\/g, '/').split('/');
  return parts.every(part => part && part !== '.' && part !== '..' && !part.includes(':'));
}

function pathKeyFor(relativePath, platform = process.platform) {
  const text = String(relativePath || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(text);
  if (!validRelativePath(normalized)) return '';
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function validItem(item, expectedSourceId = null) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.schemaVersion !== SCHEMA_VERSION) return false;
  if (!UUID_PATTERN.test(String(item.sourceId || '')) || (expectedSourceId && item.sourceId !== expectedSourceId)) return false;
  if (!SOURCE_KINDS.has(item.sourceKind) || !HASH_PATTERN.test(String(item.itemId || ''))) return false;
  if (!validRelativePath(item.relativePath) || !validRelativePath(item.pathKey)
    || item.relativePath.includes('\\') || item.pathKey.includes('\\')
    || item.pathKey !== pathKeyFor(item.relativePath)) return false;
  if (typeof item.name !== 'string' || !item.name || item.name !== path.posix.basename(item.relativePath)) return false;
  if (!INDEX_EXTENSIONS.has(item.extension) || !INDEX_MIMES.has(item.mime)) return false;
  if (!validCount(item.sizeBytes, 256 * 1024 * 1024) || !/^\d+$/.test(String(item.mtimeNs || '')) || !/^\d+$/.test(String(item.ctimeNs || ''))) return false;
  if (!Number.isSafeInteger(item.width) || item.width <= 0 || !Number.isSafeInteger(item.height) || item.height <= 0) return false;
  if (!HASH_PATTERN.test(String(item.metadataFingerprint || '')) || !validIso(item.observedAt)) return false;
  return item.itemId === itemIdFor(item.sourceKind, item.sourceId, item.pathKey)
    && item.metadataFingerprint === metadataFingerprintFor(item);
}

class TeemoInspirationIndexStorage {
  constructor(options = {}) {
    const baseStorage = options.baseStorage || new TeemoStorageService(options);
    this.indexRoot = path.join(baseStorage.getDir(), INDEX_DIRECTORY);
    this.storage = options.storage || new TeemoStorageService({ dataDir: this.indexRoot });
    this.sourcesRoot = path.join(this.indexRoot, SOURCES_DIRECTORY);
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this.idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => crypto.randomUUID();
    this.limits = Object.freeze({
      maxSourceShardBytes: Number(options.maxSourceShardBytes) || MAX_SOURCE_SHARD_BYTES,
      maxCommittedIndexBytes: Number(options.maxCommittedIndexBytes) || MAX_COMMITTED_INDEX_BYTES,
      maxItemsPerSource: Number(options.maxItemsPerSource) || MAX_ITEMS_PER_SOURCE,
      maxItemsProfile: Number(options.maxItemsProfile) || MAX_ITEMS_PROFILE,
    });
    fs.mkdirSync(this.sourcesRoot, { recursive: true });
  }

  _loadManifest() {
    if (!this.storage.exists(MANIFEST_FILE)) return defaultManifest();
    const value = this.storage.readJson(MANIFEST_FILE, null);
    if (!validManifest(value)) {
      return {
        ...defaultManifest(),
        stateError: {
          code: 'INSPIRATION_INDEX_UNREADABLE',
          message: '灵感索引状态无法读取，已安全停用',
        },
      };
    }
    return clone(value);
  }

  getManifestSnapshot() {
    return this._loadManifest();
  }

  _shardPath(shardFile) {
    if (!SHARD_PATTERN.test(String(shardFile || ''))) fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引文件无效');
    const target = path.resolve(this.indexRoot, ...String(shardFile).split('/'));
    if (!target.startsWith(`${path.resolve(this.sourcesRoot)}${path.sep}`)) fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引路径无效');
    return target;
  }

  _readShard(entry) {
    const shardPath = this._shardPath(entry.shardFile);
    let stat;
    try { stat = fs.statSync(shardPath); } catch (_) { fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引文件缺失'); }
    if (!stat.isFile() || stat.size > this.limits.maxSourceShardBytes) fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引文件无效');
    let bytes;
    try { bytes = fs.readFileSync(shardPath); } catch (_) { fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引无法读取'); }
    if (sha256(bytes) !== entry.shardSha256) fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引完整性校验失败');
    const text = bytes.toString('utf8');
    const lines = text ? text.split('\n').filter(line => line.length > 0) : [];
    if (lines.length !== entry.itemCount) fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引项目数量不一致');
    const items = [];
    const itemIds = new Set();
    const pathKeys = new Set();
    for (const line of lines) {
      let item;
      try { item = JSON.parse(line); } catch (_) { fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引内容损坏'); }
      if (!validItem(item, entry.sourceId) || itemIds.has(item.itemId) || pathKeys.has(item.pathKey)) {
        fail('INSPIRATION_INDEX_CORRUPT', '灵感来源索引项目无效');
      }
      itemIds.add(item.itemId);
      pathKeys.add(item.pathKey);
      items.push(item);
    }
    items.sort((left, right) => left.pathKey.localeCompare(right.pathKey));
    return items;
  }

  readSourceSnapshot(sourceId, options = {}) {
    const manifest = this._loadManifest();
    if (manifest.stateError) return { status: 'INDEX_UNREADABLE', manifest, items: [] };
    const entry = manifest.sources[String(sourceId || '')];
    if (!entry) return { status: 'NOT_INDEXED', manifest, entry: null, items: [] };
    try {
      const items = this._readShard(entry);
      const offset = Math.max(0, Number(options.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(options.limit) || 100));
      return {
        status: 'READY',
        manifest,
        entry: clone(entry),
        items: options.all === true ? clone(items) : clone(items.slice(offset, offset + limit)),
        offset,
        limit,
        total: items.length,
        hasMore: offset + limit < items.length,
      };
    } catch (error) {
      return {
        status: 'CORRUPT',
        manifest,
        entry: clone(entry),
        items: [],
        error: { code: error.code || 'INSPIRATION_INDEX_CORRUPT', message: error.message || '该素材来源的索引已损坏，需要重建' },
      };
    }
  }

  _activeIndexBytes(manifest, excludedSourceId = null) {
    let total = 0;
    for (const entry of Object.values(manifest.sources)) {
      if (entry.sourceId === excludedSourceId) continue;
      try { total += fs.statSync(this._shardPath(entry.shardFile)).size; } catch (_) { fail('INSPIRATION_INDEX_CORRUPT', '活动索引文件缺失'); }
    }
    return total;
  }

  _safeDeleteShard(shardFile) {
    if (!shardFile || !SHARD_PATTERN.test(shardFile)) return false;
    const target = this._shardPath(shardFile);
    try { fs.unlinkSync(target); return true; } catch (_) { return false; }
  }

  _writeTempShard(sourceId, indexRevision, scanId, items) {
    if (!UUID_PATTERN.test(sourceId) || !Array.isArray(items) || items.length > this.limits.maxItemsPerSource) {
      fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', '灵感来源索引项目超过限制');
    }
    const sorted = [...items].sort((left, right) => left.pathKey.localeCompare(right.pathKey));
    const itemIds = new Set();
    const pathKeys = new Set();
    const safeScanId = String(scanId || this.idFactory()).replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || this.idFactory();
    const tempPath = path.join(this.sourcesRoot, `.${sourceId}.${indexRevision}.${safeScanId}.tmp`);
    const hash = crypto.createHash('sha256');
    let handle;
    let size = 0;
    try {
      handle = fs.openSync(tempPath, 'wx');
      for (const item of sorted) {
        if (!validItem(item, sourceId) || itemIds.has(item.itemId) || pathKeys.has(item.pathKey)) {
          fail('INSPIRATION_INDEX_CORRUPT', '待提交索引项目无效');
        }
        itemIds.add(item.itemId);
        pathKeys.add(item.pathKey);
        const line = Buffer.from(`${JSON.stringify(item)}\n`, 'utf8');
        size += line.length;
        if (size > this.limits.maxSourceShardBytes) fail('INSPIRATION_INDEX_STORAGE_LIMIT', '单个灵感来源索引超过存储限制');
        fs.writeSync(handle, line);
        hash.update(line);
      }
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      return { tempPath, size, sha256: hash.digest('hex'), items: sorted };
    } catch (error) {
      if (handle != null) { try { fs.closeSync(handle); } catch (_) {} }
      try { fs.unlinkSync(tempPath); } catch (_) {}
      throw error;
    }
  }

  commitSourceSnapshot(input = {}, options = {}) {
    const sourceId = String(input.sourceId || '');
    const expectedIndexRevision = Number(options.expectedIndexRevision) || 0;
    const nextIndexRevision = expectedIndexRevision + 1;
    const prepared = this._writeTempShard(sourceId, nextIndexRevision, input.scanId, input.items || []);
    let finalPath = null;
    let oldShardFile = null;
    try {
      const locked = this.storage.withFileLock(MANIFEST_FILE, () => {
        const latest = this._loadManifest();
        if (latest.stateError) fail(latest.stateError.code, latest.stateError.message);
        const current = latest.sources[sourceId] || null;
        if (Number(options.expectedManifestRevision) !== latest.revision
          || (current ? current.indexRevision : 0) !== expectedIndexRevision) {
          fail('INSPIRATION_INDEX_CHANGED', '灵感索引已在其他窗口更新，请刷新后重试');
        }
        if (typeof options.validateBeforeCommit === 'function') options.validateBeforeCommit(latest, current);
        const projectedItems = Object.values(latest.sources)
          .filter(entry => entry.sourceId !== sourceId)
          .reduce((sum, entry) => sum + entry.itemCount, 0) + prepared.items.length;
        if (projectedItems > this.limits.maxItemsProfile) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', '灵感索引总项目数超过限制');
        const projectedBytes = this._activeIndexBytes(latest, sourceId) + prepared.size;
        if (projectedBytes > this.limits.maxCommittedIndexBytes) fail('INSPIRATION_INDEX_STORAGE_LIMIT', '灵感索引总存储超过限制');
        const shardFile = `${SOURCES_DIRECTORY}/${sourceId}.${nextIndexRevision}.jsonl`;
        finalPath = this._shardPath(shardFile);
        if (fs.existsSync(finalPath)) {
          const referenced = Object.values(latest.sources).some(entry => entry.shardFile === shardFile);
          if (referenced) fail('INSPIRATION_INDEX_CHANGED', '索引修订文件已存在，请刷新后重试');
          try { fs.unlinkSync(finalPath); }
          catch (_) { fail('INSPIRATION_INDEX_CHANGED', '索引修订文件正在使用，请刷新后重试'); }
        }
        fs.renameSync(prepared.tempPath, finalPath);
        oldShardFile = current ? current.shardFile : null;
        const now = this.clock().toISOString();
        const entry = {
          sourceId,
          sourceKind: SOURCE_KINDS.has(input.sourceKind) ? input.sourceKind : 'local_folder',
          indexRevision: nextIndexRevision,
          sourceRegistryRevision: input.sourceRegistryRevision,
          shardFile,
          shardSha256: prepared.sha256,
          itemCount: prepared.items.length,
          lastSuccessfulScanAt: now,
          lastScanMode: input.mode,
          scannerVersion: SCANNER_VERSION,
          summary: clone(input.summary),
        };
        const next = {
          schemaVersion: SCHEMA_VERSION,
          revision: latest.revision + 1,
          updatedAt: now,
          sources: { ...latest.sources, [sourceId]: entry },
        };
        if (!validManifest(next)) fail('INSPIRATION_INDEX_CORRUPT', '待提交索引清单无效');
        this.storage.writeJson(MANIFEST_FILE, next);
        return { manifest: next, entry };
      });
      if (!locked.acquired) fail('INSPIRATION_INDEX_BUSY', '灵感索引正在更新，请稍后重试');
      if (oldShardFile && oldShardFile !== locked.value.entry.shardFile) this._safeDeleteShard(oldShardFile);
      return clone(locked.value);
    } catch (error) {
      if (finalPath && fs.existsSync(finalPath)) {
        const manifest = this._loadManifest();
        const active = !manifest.stateError && Object.values(manifest.sources).some(entry => this._shardPath(entry.shardFile) === finalPath);
        if (!active) { try { fs.unlinkSync(finalPath); } catch (_) {} }
      }
      throw error;
    } finally {
      try { if (fs.existsSync(prepared.tempPath)) fs.unlinkSync(prepared.tempPath); } catch (_) {}
    }
  }

  removeSourceIndex(sourceId) {
    const id = String(sourceId || '');
    let oldShardFile = null;
    const locked = this.storage.withFileLock(MANIFEST_FILE, () => {
      const latest = this._loadManifest();
      if (latest.stateError) fail(latest.stateError.code, latest.stateError.message);
      const current = latest.sources[id];
      if (!current) return { manifest: latest, removed: false };
      oldShardFile = current.shardFile;
      const sources = { ...latest.sources };
      delete sources[id];
      const next = {
        schemaVersion: SCHEMA_VERSION,
        revision: latest.revision + 1,
        updatedAt: this.clock().toISOString(),
        sources,
      };
      this.storage.writeJson(MANIFEST_FILE, next);
      return { manifest: next, removed: true };
    });
    if (!locked.acquired) fail('INSPIRATION_INDEX_BUSY', '灵感索引正在更新，请稍后重试');
    const cleanupFailed = oldShardFile ? !this._safeDeleteShard(oldShardFile) : false;
    return { ...clone(locked.value), cleanupFailed };
  }

  resetCorruptIndex() {
    const current = this._loadManifest();
    if (!current.stateError) return { reset: false, manifest: current };
    const manifestPath = path.join(this.indexRoot, MANIFEST_FILE);
    const backupPath = path.join(this.indexRoot, `manifest.corrupt-${Date.now()}.json`);
    if (fs.existsSync(manifestPath)) fs.renameSync(manifestPath, backupPath);
    const freshStorage = new TeemoStorageService({ dataDir: this.indexRoot });
    freshStorage.writeJson(MANIFEST_FILE, defaultManifest());
    this.storage = freshStorage;
    for (const name of fs.readdirSync(this.sourcesRoot)) {
      if (SHARD_PATTERN.test(`${SOURCES_DIRECTORY}/${name}`) || /^\.[0-9a-f-]{36}\.\d+\.[a-z0-9_-]+\.tmp$/i.test(name)) {
        try { fs.unlinkSync(path.join(this.sourcesRoot, name)); } catch (_) {}
      }
    }
    return { reset: true, manifest: defaultManifest(), backupFile: path.basename(backupPath) };
  }
}

TeemoInspirationIndexStorage.INDEX_DIRECTORY = INDEX_DIRECTORY;
TeemoInspirationIndexStorage.MANIFEST_FILE = MANIFEST_FILE;
TeemoInspirationIndexStorage.SOURCES_DIRECTORY = SOURCES_DIRECTORY;
TeemoInspirationIndexStorage.SCHEMA_VERSION = SCHEMA_VERSION;
TeemoInspirationIndexStorage.SCANNER_VERSION = SCANNER_VERSION;
TeemoInspirationIndexStorage.MAX_SOURCE_SHARD_BYTES = MAX_SOURCE_SHARD_BYTES;
TeemoInspirationIndexStorage.MAX_COMMITTED_INDEX_BYTES = MAX_COMMITTED_INDEX_BYTES;
TeemoInspirationIndexStorage.MAX_ITEMS_PER_SOURCE = MAX_ITEMS_PER_SOURCE;
TeemoInspirationIndexStorage.MAX_ITEMS_PROFILE = MAX_ITEMS_PROFILE;
TeemoInspirationIndexStorage.SOURCE_KINDS = SOURCE_KINDS;
TeemoInspirationIndexStorage.itemIdFor = itemIdFor;
TeemoInspirationIndexStorage.metadataFingerprintFor = metadataFingerprintFor;
TeemoInspirationIndexStorage.pathKeyFor = pathKeyFor;
TeemoInspirationIndexStorage.validManifest = validManifest;
TeemoInspirationIndexStorage.validItem = validItem;
TeemoInspirationIndexStorage.TeemoInspirationIndexError = TeemoInspirationIndexError;
module.exports = TeemoInspirationIndexStorage;
