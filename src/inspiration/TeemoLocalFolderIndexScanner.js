const fs = require('fs');
const path = require('path');
const TeemoInspirationIndexStorage = require('./TeemoInspirationIndexStorage');

const MAX_DEPTH = 16;
const MAX_DIRECTORIES = 10000;
const MAX_DIRENTS = 50000;
const MAX_ITEMS = 25000;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_HEADER_BYTES = 1024 * 1024;
const DEFAULT_SCAN_TIMEOUT_MS = 120000;
const DEFAULT_HEADER_TIMEOUT_MS = 3000;
const REVALIDATE_EVERY = 100;
const YIELD_EVERY = 50;
const MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
});

class TeemoLocalFolderIndexError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoLocalFolderIndexError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoLocalFolderIndexError(code, message);
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? String(left).toLowerCase() === String(right).toLowerCase()
    : String(left) === String(right);
}

function statNs(stat, field) {
  const ns = stat[`${field}Ns`];
  if (typeof ns === 'bigint') return ns.toString();
  const ms = stat[`${field}Ms`];
  return BigInt(Math.trunc(Number(ms) * 1000000)).toString();
}

function statIdentity(stat) {
  const birth = typeof stat.birthtimeNs === 'bigint' ? stat.birthtimeNs : stat.birthtimeMs;
  return `${stat.dev}:${stat.ino}:${birth}`;
}

function sameOpenedStat(left, right) {
  return statIdentity(left) === statIdentity(right)
    && left.size === right.size
    && statNs(left, 'mtime') === statNs(right, 'mtime')
    && statNs(left, 'ctime') === statNs(right, 'ctime');
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function parsePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
    || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { mime: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function parseGif(buffer) {
  if (buffer.length < 10 || !['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return null;
  return { mime: 'image/gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (sof.has(marker)) {
      if (length < 7) return null;
      return { mime: 'image/jpeg', width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    if (marker === 0xda) break;
    offset += length;
  }
  return null;
}

function parseWebp(buffer) {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.subarray(offset, offset + 4).toString('ascii');
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > buffer.length) return null;
    if (kind === 'VP8X' && length >= 10) {
      return { mime: 'image/webp', width: readUInt24LE(buffer, data + 4) + 1, height: readUInt24LE(buffer, data + 7) + 1 };
    }
    if (kind === 'VP8 ' && length >= 10 && buffer[data + 3] === 0x9d
      && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return { mime: 'image/webp', width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (kind === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        mime: 'image/webp',
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
      };
    }
    offset = data + length + (length % 2);
  }
  return null;
}

function parseImageHeader(buffer) {
  const parsed = parsePng(buffer) || parseGif(buffer) || parseJpeg(buffer) || parseWebp(buffer);
  if (!parsed || !Number.isSafeInteger(parsed.width) || parsed.width <= 0
    || !Number.isSafeInteger(parsed.height) || parsed.height <= 0) return null;
  return parsed;
}

class TeemoLocalFolderIndexScanner {
  constructor(options = {}) {
    if (!options.fileService || !options.sourceService) {
      throw new Error('TeemoLocalFolderIndexScanner requires fileService and sourceService.');
    }
    this.fileService = options.fileService;
    this.sourceService = options.sourceService;
    this.rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this.hooks = options.hooks || {};
    this.limits = Object.freeze({
      maxDepth: Number(options.maxDepth) || MAX_DEPTH,
      maxDirectories: Number(options.maxDirectories) || MAX_DIRECTORIES,
      maxDirents: Number(options.maxDirents) || MAX_DIRENTS,
      maxItems: Number(options.maxItems) || MAX_ITEMS,
      maxFileBytes: Number(options.maxFileBytes) || MAX_FILE_BYTES,
      maxHeaderBytes: Number(options.maxHeaderBytes) || MAX_HEADER_BYTES,
      scanTimeoutMs: Number(options.scanTimeoutMs) || DEFAULT_SCAN_TIMEOUT_MS,
      headerTimeoutMs: Number(options.headerTimeoutMs) || DEFAULT_HEADER_TIMEOUT_MS,
    });
  }

  _sourceSnapshot(sourceId) {
    const snapshot = this.sourceService.reload();
    if (snapshot.stateError) fail(snapshot.stateError.code || 'INSPIRATION_SOURCES_UNREADABLE', snapshot.stateError.message);
    const source = snapshot.sources.find(item => item.sourceId === String(sourceId || ''));
    if (!source) fail('INSPIRATION_SOURCE_NOT_FOUND', '找不到该灵感来源');
    if (source.kind !== 'local_folder') fail('INSPIRATION_SOURCE_INVALID', '灵感来源类型无效');
    return { snapshot, source };
  }

  inspectSource(sourceId) {
    const { snapshot, source } = this._sourceSnapshot(sourceId);
    let resolved;
    try { resolved = this.fileService.resolveAuthorizedPath(source.rootPath, this.rootsProvider()); }
    catch (error) {
      if (error && error.code === 'FILE_NOT_FOUND') fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在');
      fail('INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', '该灵感来源需要重新授权');
    }
    let lstat;
    let stat;
    try {
      lstat = fs.lstatSync(source.rootPath, { bigint: true });
      stat = fs.statSync(resolved.target, { bigint: true });
    } catch (_) {
      fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在');
    }
    if (lstat.isSymbolicLink()) fail('INSPIRATION_LINK_UNSUPPORTED', '不支持链接或联接来源');
    if (!stat.isDirectory()) fail('INSPIRATION_SOURCE_INVALID', '灵感来源必须是文件夹');
    return {
      source: JSON.parse(JSON.stringify(source)),
      sourceRegistryRevision: snapshot.revision,
      sourceRoot: resolved.target,
      authorizedRoot: resolved.root,
      rootIdentity: statIdentity(stat),
    };
  }

  revalidateSource(expected) {
    const latest = this.inspectSource(expected.source.sourceId);
    if (latest.sourceRegistryRevision !== expected.sourceRegistryRevision
      || !samePath(latest.source.rootPath, expected.source.rootPath)
      || !samePath(latest.sourceRoot, expected.sourceRoot)
      || !samePath(latest.authorizedRoot, expected.authorizedRoot)
      || latest.rootIdentity !== expected.rootIdentity) {
      fail('INSPIRATION_SOURCE_CHANGED', '灵感来源在索引期间发生变化');
    }
    return latest;
  }

  _assertActive(context) {
    if ((context.signal && context.signal.aborted)
      || (typeof context.checkCancelled === 'function' && context.checkCancelled())) {
      fail('INSPIRATION_ABORTED', '已取消灵感索引');
    }
    if (Date.now() > context.deadline) fail('INSPIRATION_TIMEOUT', '建立灵感索引超时');
  }

  async _checkpoint(context, forceSourceCheck = false) {
    this._assertActive(context);
    if (forceSourceCheck || (context.summary.entriesInspected > 0
      && context.summary.entriesInspected % REVALIDATE_EVERY === 0)) {
      this.revalidateSource(context.sourceContext);
    }
    if (forceSourceCheck || context.summary.entriesInspected % YIELD_EVERY === 0) {
      await new Promise(resolve => setImmediate(resolve));
      this._assertActive(context);
    }
  }

  _relativePath(sourceRoot, candidate) {
    const relative = path.relative(sourceRoot, candidate).split(path.sep).join('/');
    if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
      fail('INSPIRATION_PATH_OUTSIDE_SOURCE', '索引目标超出灵感来源范围');
    }
    return relative;
  }

  _pathKey(relativePath) {
    return TeemoInspirationIndexStorage.pathKeyFor(relativePath);
  }

  _assertContainment(sourceContext, canonical) {
    if (!this.fileService.isPathWithinRoot(sourceContext.sourceRoot, canonical)
      || !this.fileService.isPathWithinRoot(sourceContext.authorizedRoot, canonical)) {
      fail('INSPIRATION_PATH_OUTSIDE_SOURCE', '索引目标超出授权范围');
    }
  }

  async _readMetadata(candidate, extension, relativePath, pathKey, inventoryStat, context) {
    this._assertActive(context);
    if (typeof this.hooks.beforeHeaderOpen === 'function') {
      await this.hooks.beforeHeaderOpen(candidate, context);
    }
    this._assertActive(context);
    let before;
    let canonical;
    try {
      before = fs.lstatSync(candidate, { bigint: true });
      if (before.isSymbolicLink() || !before.isFile()) return null;
      if (!sameOpenedStat(inventoryStat, before)) fail('INSPIRATION_SOURCE_CHANGED', '图片在枚举后发生变化');
      canonical = fs.realpathSync.native(candidate);
    } catch (_) {
      fail('INSPIRATION_SOURCE_CHANGED', '图片在读取前发生变化');
    }
    this._assertContainment(context.sourceContext, canonical);
    const started = Date.now();
    let handle;
    try {
      handle = fs.openSync(canonical, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(handle, { bigint: true });
      if (!opened.isFile() || !sameOpenedStat(before, opened)) fail('INSPIRATION_SOURCE_CHANGED', '图片在打开前发生变化');
      const sizeBytes = Number(opened.size);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return null;
      const length = Math.min(sizeBytes, this.limits.maxHeaderBytes);
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        this._assertActive(context);
        const read = fs.readSync(handle, buffer, offset, length - offset, offset);
        if (read <= 0) break;
        offset += read;
        if (Date.now() - started > this.limits.headerTimeoutMs) fail('INSPIRATION_TIMEOUT', '读取图片头部超时');
      }
      if (typeof this.hooks.afterHeaderRead === 'function') {
        await this.hooks.afterHeaderRead(candidate, context);
      }
      this._assertActive(context);
      const after = fs.fstatSync(handle, { bigint: true });
      if (!sameOpenedStat(opened, after)) fail('INSPIRATION_SOURCE_CHANGED', '图片在读取期间发生变化');
      const parsed = parseImageHeader(buffer.subarray(0, offset));
      if (!parsed || MIME_BY_EXTENSION[extension] !== parsed.mime) return null;
      const item = {
        schemaVersion: TeemoInspirationIndexStorage.SCHEMA_VERSION,
        itemId: TeemoInspirationIndexStorage.itemIdFor('local_folder', context.sourceContext.source.sourceId, pathKey),
        sourceId: context.sourceContext.source.sourceId,
        sourceKind: 'local_folder',
        relativePath,
        pathKey,
        name: path.posix.basename(relativePath),
        extension,
        mime: parsed.mime,
        sizeBytes,
        mtimeNs: statNs(opened, 'mtime'),
        ctimeNs: statNs(opened, 'ctime'),
        width: parsed.width,
        height: parsed.height,
        metadataFingerprint: '',
        observedAt: this.clock().toISOString(),
      };
      item.metadataFingerprint = TeemoInspirationIndexStorage.metadataFingerprintFor(item);
      if (typeof this.hooks.onHeaderRead === 'function') this.hooks.onHeaderRead(item, context);
      return item;
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }

  async scan(sourceId, options = {}) {
    const mode = ['full', 'incremental', 'rebuild'].includes(options.mode) ? options.mode : 'incremental';
    const sourceContext = options.sourceContext || this.inspectSource(sourceId);
    const existingItems = Array.isArray(options.existingItems) ? options.existingItems : [];
    const existingByPath = new Map(existingItems.map(item => [item.pathKey, item]));
    const seenPathKeys = new Set();
    const summary = {
      directories: 0,
      entriesInspected: 0,
      indexed: 0,
      reused: 0,
      updated: 0,
      added: 0,
      removed: 0,
      skippedUnsupported: 0,
      skippedInvalid: 0,
      skippedTooLarge: 0,
      skippedLink: 0,
    };
    const context = {
      ...options,
      sourceContext,
      summary,
      deadline: Date.now() + Math.max(1, Number(options.timeoutMs) || this.limits.scanTimeoutMs),
    };
    const items = [];
    const stack = [{ directory: sourceContext.sourceRoot, depth: 0 }];
    if (typeof this.hooks.beforeScan === 'function') await this.hooks.beforeScan(context);

    while (stack.length) {
      const current = stack.pop();
      if (current.depth > this.limits.maxDepth) fail('INSPIRATION_DEPTH_EXCEEDED', '目录层级超过 16 层限制');
      summary.directories += 1;
      if (summary.directories > this.limits.maxDirectories) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', '灵感来源目录数量超过限制');
      await this._checkpoint(context, true);
      if (typeof this.hooks.beforeDirectory === 'function') await this.hooks.beforeDirectory(current, context);
      let directory;
      try { directory = fs.opendirSync(current.directory); }
      catch (_) { fail('INSPIRATION_SOURCE_CHANGED', '索引目录在扫描期间不可用'); }
      try {
        let entry;
        while ((entry = directory.readSync())) {
          summary.entriesInspected += 1;
          if (summary.entriesInspected > this.limits.maxDirents) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', '灵感来源项目数量超过扫描限制');
          await this._checkpoint(context);
          const candidate = path.join(current.directory, entry.name);
          let stat;
          try { stat = fs.lstatSync(candidate, { bigint: true }); }
          catch (_) { summary.skippedInvalid += 1; continue; }
          if (stat.isSymbolicLink() || entry.isSymbolicLink()) {
            summary.skippedLink += 1;
            continue;
          }
          if (stat.isDirectory()) {
            const nextDepth = current.depth + 1;
            if (nextDepth > this.limits.maxDepth) fail('INSPIRATION_DEPTH_EXCEEDED', '目录层级超过 16 层限制');
            let canonical;
            try { canonical = fs.realpathSync.native(candidate); }
            catch (_) { fail('INSPIRATION_SOURCE_CHANGED', '索引目录在扫描期间不可用'); }
            this._assertContainment(sourceContext, canonical);
            stack.push({ directory: canonical, depth: nextDepth });
            continue;
          }
          if (!stat.isFile()) {
            summary.skippedUnsupported += 1;
            continue;
          }
          const extension = path.extname(entry.name).toLowerCase();
          if (!MIME_BY_EXTENSION[extension]) {
            summary.skippedUnsupported += 1;
            continue;
          }
          const sizeBytes = Number(stat.size);
          if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
            summary.skippedInvalid += 1;
            continue;
          }
          if (sizeBytes > this.limits.maxFileBytes) {
            summary.skippedTooLarge += 1;
            continue;
          }
          const relativePath = this._relativePath(sourceContext.sourceRoot, candidate);
          const pathKey = this._pathKey(relativePath);
          if (seenPathKeys.has(pathKey)) fail('INSPIRATION_INDEX_CORRUPT', '来源中出现重复的标准化路径');
          seenPathKeys.add(pathKey);
          const existing = existingByPath.get(pathKey);
          const unchanged = mode === 'incremental' && existing
            && existing.sizeBytes === sizeBytes
            && existing.mtimeNs === statNs(stat, 'mtime')
            && existing.ctimeNs === statNs(stat, 'ctime');
          let item;
          if (unchanged) {
            item = { ...existing, relativePath, name: path.posix.basename(relativePath) };
            summary.reused += 1;
          } else {
            item = await this._readMetadata(candidate, extension, relativePath, pathKey, stat, context);
            if (!item) {
              summary.skippedInvalid += 1;
              continue;
            }
            if (existing) summary.updated += 1;
            else summary.added += 1;
          }
          items.push(item);
          if (items.length > this.limits.maxItems) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', '单个灵感来源索引项目超过限制');
          summary.indexed = items.length;
          if (typeof options.onProgress === 'function') options.onProgress({ ...summary });
        }
      } finally {
        directory.closeSync();
      }
    }

    const indexedPathKeys = new Set(items.map(item => item.pathKey));
    summary.removed = existingItems.filter(item => !indexedPathKeys.has(item.pathKey)).length;
    await this._checkpoint(context, true);
    if (typeof this.hooks.beforeComplete === 'function') await this.hooks.beforeComplete(context, items);
    this._assertActive(context);
    items.sort((left, right) => left.pathKey.localeCompare(right.pathKey));
    return { sourceContext, items, summary, mode };
  }
}

TeemoLocalFolderIndexScanner.MAX_DEPTH = MAX_DEPTH;
TeemoLocalFolderIndexScanner.MAX_DIRECTORIES = MAX_DIRECTORIES;
TeemoLocalFolderIndexScanner.MAX_DIRENTS = MAX_DIRENTS;
TeemoLocalFolderIndexScanner.MAX_ITEMS = MAX_ITEMS;
TeemoLocalFolderIndexScanner.MAX_FILE_BYTES = MAX_FILE_BYTES;
TeemoLocalFolderIndexScanner.MAX_HEADER_BYTES = MAX_HEADER_BYTES;
TeemoLocalFolderIndexScanner.DEFAULT_SCAN_TIMEOUT_MS = DEFAULT_SCAN_TIMEOUT_MS;
TeemoLocalFolderIndexScanner.DEFAULT_HEADER_TIMEOUT_MS = DEFAULT_HEADER_TIMEOUT_MS;
TeemoLocalFolderIndexScanner.MIME_BY_EXTENSION = MIME_BY_EXTENSION;
TeemoLocalFolderIndexScanner.parseImageHeader = parseImageHeader;
TeemoLocalFolderIndexScanner.TeemoLocalFolderIndexError = TeemoLocalFolderIndexError;
module.exports = TeemoLocalFolderIndexScanner;
