const fs = require('fs');
const path = require('path');
const TeemoInspirationIndexStorage = require('./TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('./TeemoLocalFolderIndexScanner');

const MAX_METADATA_BYTES = 64 * 1024;
const METADATA_FILE = 'metadata.json';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  throw error;
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? String(left).toLowerCase() === String(right).toLowerCase()
    : String(left) === String(right);
}

function statNs(stat, field) {
  const ns = stat[`${field}Ns`];
  if (typeof ns === 'bigint') return ns.toString();
  return BigInt(Math.trunc(Number(stat[`${field}Ms`]) * 1000000)).toString();
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

function safeAssetName(metadata) {
  const name = String(metadata && metadata.name || '').trim();
  const ext = String(metadata && metadata.ext || '').trim().toLowerCase().replace(/^\./, '');
  if (!name || name.length > 240 || /[\\/:\0]/.test(name) || name === '.' || name === '..') return '';
  if (!/^(png|jpe?g|webp|gif)$/.test(ext)) return '';
  return path.extname(name).toLowerCase() === `.${ext}` ? name : `${name}.${ext}`;
}

class TeemoEagleLibraryIndexScanner extends TeemoLocalFolderIndexScanner {
  _sourceSnapshot(sourceId) {
    const snapshot = this.sourceService.reload();
    if (snapshot.stateError) fail(snapshot.stateError.code || 'INSPIRATION_SOURCES_UNREADABLE', snapshot.stateError.message);
    const source = snapshot.sources.find(item => item.sourceId === String(sourceId || ''));
    if (!source) fail('INSPIRATION_SOURCE_NOT_FOUND', '找不到 Eagle 灵感库');
    if (source.kind !== 'eagle_library') fail('INSPIRATION_SOURCE_INVALID', '灵感来源类型无效');
    return { snapshot, source };
  }

  inspectSource(sourceId) {
    const { snapshot, source } = this._sourceSnapshot(sourceId);
    let resolved;
    try { resolved = this.fileService.resolveAuthorizedPath(source.rootPath, this.rootsProvider()); }
    catch (error) {
      if (error && error.code === 'FILE_NOT_FOUND') fail('INSPIRATION_SOURCE_MISSING', 'Eagle 灵感库不存在');
      fail('INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', '该 Eagle 灵感库需要重新授权');
    }
    const imagesCandidate = path.join(resolved.target, 'images');
    let rootLstat; let rootStat; let imagesLstat; let imagesStat; let imagesRoot;
    try {
      rootLstat = fs.lstatSync(source.rootPath, { bigint: true });
      rootStat = fs.statSync(resolved.target, { bigint: true });
      imagesLstat = fs.lstatSync(imagesCandidate, { bigint: true });
      if (imagesLstat.isSymbolicLink()) fail('INSPIRATION_LINK_UNSUPPORTED', '不支持链接或联接的 Eagle images 目录');
      imagesRoot = fs.realpathSync.native(imagesCandidate);
      imagesStat = fs.statSync(imagesRoot, { bigint: true });
    } catch (error) {
      if (error && error.teemoSafe) throw error;
      fail('INSPIRATION_SOURCE_INVALID', '不支持的 Eagle-compatible library 结构');
    }
    if (rootLstat.isSymbolicLink() || !rootStat.isDirectory() || !imagesStat.isDirectory()
      || !this.fileService.isPathWithinRoot(resolved.target, imagesRoot)
      || !this.fileService.isPathWithinRoot(resolved.root, imagesRoot)) {
      fail('INSPIRATION_SOURCE_INVALID', '不支持的 Eagle-compatible library 结构');
    }
    return {
      source: JSON.parse(JSON.stringify(source)),
      sourceRegistryRevision: snapshot.revision,
      sourceRoot: resolved.target,
      authorizedRoot: resolved.root,
      scanRoot: imagesRoot,
      rootIdentity: `${statIdentity(rootStat)}:${statIdentity(imagesStat)}`,
    };
  }

  revalidateSource(expected) {
    const latest = this.inspectSource(expected.source.sourceId);
    if (latest.sourceRegistryRevision !== expected.sourceRegistryRevision
      || !samePath(latest.source.rootPath, expected.source.rootPath)
      || !samePath(latest.sourceRoot, expected.sourceRoot)
      || !samePath(latest.authorizedRoot, expected.authorizedRoot)
      || !samePath(latest.scanRoot, expected.scanRoot)
      || latest.rootIdentity !== expected.rootIdentity) {
      fail('INSPIRATION_SOURCE_CHANGED', 'Eagle 灵感库在索引期间发生变化');
    }
    return latest;
  }

  _readEagleMetadata(itemDirectory, sourceContext) {
    const metadataPath = path.join(itemDirectory, METADATA_FILE);
    let stat; let handle;
    try {
      stat = fs.lstatSync(metadataPath, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isFile() || Number(stat.size) > MAX_METADATA_BYTES) return null;
      const canonical = fs.realpathSync.native(metadataPath);
      this._assertContainment(sourceContext, canonical);
      handle = fs.openSync(canonical, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(handle, { bigint: true });
      if (!opened.isFile() || !sameOpenedStat(stat, opened)) return null;
      const bytes = fs.readFileSync(handle);
      const after = fs.fstatSync(handle, { bigint: true });
      if (!sameOpenedStat(opened, after) || bytes.length > MAX_METADATA_BYTES) fail('INSPIRATION_SOURCE_CHANGED', 'Eagle metadata 在读取期间发生变化');
      const metadata = JSON.parse(bytes.toString('utf8'));
      return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : null;
    } catch (error) {
      if (error && error.teemoSafe) throw error;
      return null;
    } finally { if (handle !== undefined) fs.closeSync(handle); }
  }

  async scan(sourceId, options = {}) {
    const mode = ['full', 'incremental', 'rebuild'].includes(options.mode) ? options.mode : 'incremental';
    const sourceContext = options.sourceContext || this.inspectSource(sourceId);
    const existingItems = Array.isArray(options.existingItems) ? options.existingItems : [];
    const existingByPath = new Map(existingItems.map(item => [item.pathKey, item]));
    const seenPathKeys = new Set();
    const summary = { directories: 1, entriesInspected: 0, indexed: 0, reused: 0, updated: 0, added: 0, removed: 0, skippedUnsupported: 0, skippedInvalid: 0, skippedTooLarge: 0, skippedLink: 0 };
    const context = { ...options, sourceContext, summary, deadline: Date.now() + Math.max(1, Number(options.timeoutMs) || this.limits.scanTimeoutMs) };
    const items = [];
    let directory;
    try { directory = fs.opendirSync(sourceContext.scanRoot); }
    catch (_) { fail('INSPIRATION_SOURCE_CHANGED', 'Eagle images 目录在读取时不可用'); }
    try {
      let entry;
      while ((entry = directory.readSync())) {
        summary.entriesInspected += 1;
        if (summary.entriesInspected > this.limits.maxDirents) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', 'Eagle 项目数量超过扫描限制');
        await this._checkpoint(context);
        const itemDirectory = path.join(sourceContext.scanRoot, entry.name);
        let dirStat;
        try { dirStat = fs.lstatSync(itemDirectory, { bigint: true }); } catch (_) { summary.skippedInvalid += 1; continue; }
        if (entry.isSymbolicLink() || dirStat.isSymbolicLink()) { summary.skippedLink += 1; continue; }
        if (!entry.isDirectory() || !dirStat.isDirectory()) { summary.skippedUnsupported += 1; continue; }
        let canonicalDirectory;
        try { canonicalDirectory = fs.realpathSync.native(itemDirectory); this._assertContainment(sourceContext, canonicalDirectory); }
        catch (error) { if (error && error.teemoSafe) throw error; summary.skippedInvalid += 1; continue; }
        summary.directories += 1;
        if (summary.directories > this.limits.maxDirectories) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', 'Eagle 目录数量超过限制');
        const metadata = this._readEagleMetadata(canonicalDirectory, sourceContext);
        const assetName = metadata && safeAssetName(metadata);
        if (!assetName) { summary.skippedInvalid += 1; continue; }
        const candidate = path.join(canonicalDirectory, assetName);
        let assetStat;
        try { assetStat = fs.lstatSync(candidate, { bigint: true }); } catch (_) { summary.skippedInvalid += 1; continue; }
        if (assetStat.isSymbolicLink()) { summary.skippedLink += 1; continue; }
        if (!assetStat.isFile()) { summary.skippedInvalid += 1; continue; }
        const extension = path.extname(assetName).toLowerCase();
        if (!TeemoLocalFolderIndexScanner.MIME_BY_EXTENSION[extension]) { summary.skippedUnsupported += 1; continue; }
        if (Number(assetStat.size) > this.limits.maxFileBytes) { summary.skippedTooLarge += 1; continue; }
        const relativePath = this._relativePath(sourceContext.sourceRoot, candidate);
        const pathKey = this._pathKey(relativePath);
        if (!pathKey || seenPathKeys.has(pathKey)) fail('INSPIRATION_INDEX_CORRUPT', 'Eagle library 出现重复的标准化路径');
        seenPathKeys.add(pathKey);
        const existing = existingByPath.get(pathKey);
        const unchanged = mode === 'incremental' && existing && existing.sizeBytes === Number(assetStat.size)
          && existing.mtimeNs === statNs(assetStat, 'mtime') && existing.ctimeNs === statNs(assetStat, 'ctime');
        let item;
        if (unchanged) { item = { ...existing, relativePath, name: path.posix.basename(relativePath) }; summary.reused += 1; }
        else {
          item = await super._readMetadata(candidate, extension, relativePath, pathKey, assetStat, context);
          if (!item) { summary.skippedInvalid += 1; continue; }
          item.itemId = TeemoInspirationIndexStorage.itemIdFor('eagle_library', sourceContext.source.sourceId, pathKey);
          item.sourceKind = 'eagle_library';
          item.metadataFingerprint = TeemoInspirationIndexStorage.metadataFingerprintFor(item);
          if (existing) summary.updated += 1; else summary.added += 1;
        }
        items.push(item);
        if (items.length > this.limits.maxItems) fail('INSPIRATION_INDEX_LIMIT_EXCEEDED', 'Eagle 单个来源索引项目超过限制');
        summary.indexed = items.length;
        if (typeof options.onProgress === 'function') options.onProgress({ ...summary });
      }
    } finally { directory.closeSync(); }
    const indexedPathKeys = new Set(items.map(item => item.pathKey));
    summary.removed = existingItems.filter(item => !indexedPathKeys.has(item.pathKey)).length;
    await this._checkpoint(context, true);
    items.sort((left, right) => left.pathKey.localeCompare(right.pathKey));
    return { sourceContext, items, summary, mode };
  }
}

TeemoEagleLibraryIndexScanner.MAX_METADATA_BYTES = MAX_METADATA_BYTES;
TeemoEagleLibraryIndexScanner.METADATA_FILE = METADATA_FILE;
TeemoEagleLibraryIndexScanner.safeAssetName = safeAssetName;
module.exports = TeemoEagleLibraryIndexScanner;
