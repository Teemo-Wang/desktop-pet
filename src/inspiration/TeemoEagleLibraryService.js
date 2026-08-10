const fs = require('fs');
const path = require('path');
const TeemoEagleLibraryIndexScanner = require('./TeemoEagleLibraryIndexScanner');

const MAX_LIST_LIMIT = 200;
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
const PREVIEW_MIMES = Object.freeze({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
});

function validSignature(extension, buffer) {
  if (extension === '.png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === '.gif') return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  return extension === '.webp' && buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  throw error;
}

function identity(stat) {
  const birth = typeof stat.birthtimeNs === 'bigint' ? stat.birthtimeNs : stat.birthtimeMs;
  return `${stat.dev}:${stat.ino}:${birth}`;
}

class TeemoEagleLibraryService {
  constructor(options = {}) {
    if (!options.fileService || !options.sourceService || !options.scanner) {
      throw new Error('TeemoEagleLibraryService requires file service, source service, and scanner.');
    }
    this.fileService = options.fileService;
    this.sourceService = options.sourceService;
    this.scanner = options.scanner;
    this.limits = Object.freeze({ previewBytes: Number(options.maxPreviewBytes) || MAX_PREVIEW_BYTES, listLimit: Number(options.maxListLimit) || MAX_LIST_LIMIT });
  }

  _source(sourceId) {
    const context = this.scanner.inspectSource(sourceId);
    if (context.source.kind !== 'eagle_library') fail('INSPIRATION_SOURCE_INVALID', '灵感来源类型无效');
    return context;
  }

  _parts(value) {
    const input = String(value || '').trim();
    if (!input || input.includes('\0') || path.isAbsolute(input) || path.win32.isAbsolute(input)
      || /^\\/.test(input) || /^[A-Za-z]:/.test(input)) fail('INSPIRATION_PATH_INVALID', '只能访问 Eagle 灵感库内的相对路径');
    const parts = input.replace(/\\/g, '/').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) fail('INSPIRATION_PATH_INVALID', '相对路径无效');
    return parts;
  }

  _resolveItem(sourceId, relativePath) {
    const context = this._source(sourceId);
    const parts = this._parts(relativePath);
    if (parts.length !== 3 || parts[0] !== 'images' || parts[1].length > 180) fail('INSPIRATION_PATH_INVALID', 'Eagle 预览路径无效');
    const candidate = path.join(context.sourceRoot, ...parts);
    let before; let canonical;
    try {
      before = fs.lstatSync(candidate);
      if (before.isSymbolicLink() || !before.isFile()) fail('INSPIRATION_NOT_FILE', '请求项目不是普通文件');
      canonical = fs.realpathSync.native(candidate);
    } catch (error) {
      if (error && error.teemoSafe) throw error;
      fail('INSPIRATION_SOURCE_MISSING', 'Eagle 素材不存在');
    }
    if (!this.fileService.isPathWithinRoot(context.sourceRoot, canonical)
      || !this.fileService.isPathWithinRoot(context.authorizedRoot, canonical)) {
      fail('INSPIRATION_PATH_OUTSIDE_SOURCE', '请求路径超出 Eagle 灵感库范围');
    }
    return { context, canonical, before };
  }

  _list(sourceId, request = {}) {
    const context = this._source(sourceId);
    const requested = Math.max(1, Math.min(this.limits.listLimit, Number(request.limit) || 100));
    const rows = [];
    let directory;
    try { directory = fs.opendirSync(context.scanRoot); } catch (_) { fail('INSPIRATION_SOURCE_MISSING', 'Eagle images 目录不可用'); }
    try {
      let entry;
      while (rows.length < requested && (entry = directory.readSync())) {
        const itemDirectory = path.join(context.scanRoot, entry.name);
        let stat;
        try { stat = fs.lstatSync(itemDirectory); } catch (_) { continue; }
        if (entry.isSymbolicLink() || stat.isSymbolicLink() || !entry.isDirectory()) continue;
        const metadata = this.scanner._readEagleMetadata(itemDirectory, context);
        const assetName = TeemoEagleLibraryIndexScanner.safeAssetName(metadata);
        if (!assetName) continue;
        const relativePath = `images/${entry.name}/${assetName}`;
        const ext = path.extname(assetName).toLowerCase();
        rows.push({ name: assetName, relativePath, type: 'regular_file', previewable: Boolean(PREVIEW_MIMES[ext]), size: null, modifiedAt: null });
      }
    } finally { directory.closeSync(); }
    return { sourceId: context.source.sourceId, relativeDirectory: '', entries: rows, truncated: false, limit: requested };
  }

  _metadata(sourceId, request = {}) {
    const resolved = this._resolveItem(sourceId, request.relativePath);
    const stat = fs.statSync(resolved.canonical);
    return { sourceId: resolved.context.source.sourceId, relativePath: request.relativePath, type: 'regular_file', size: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString() };
  }

  _preview(sourceId, request = {}) {
    const resolved = this._resolveItem(sourceId, request.relativePath);
    const extension = path.extname(resolved.canonical).toLowerCase();
    const mimeType = PREVIEW_MIMES[extension];
    if (!mimeType) fail('INSPIRATION_PREVIEW_UNSUPPORTED', '该 Eagle 素材类型不支持预览');
    if (resolved.before.size > this.limits.previewBytes) fail('INSPIRATION_FILE_TOO_LARGE', '图片超过预览大小限制');
    let handle;
    try {
      handle = fs.openSync(resolved.canonical, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(handle);
      if (!opened.isFile() || identity(opened) !== identity(resolved.before) || opened.size !== resolved.before.size) fail('INSPIRATION_SOURCE_CHANGED', 'Eagle 素材在读取前发生变化');
      const data = fs.readFileSync(handle);
      const after = fs.fstatSync(handle);
      if (identity(after) !== identity(opened) || after.size !== opened.size) fail('INSPIRATION_SOURCE_CHANGED', 'Eagle 素材在读取期间发生变化');
      if (!validSignature(extension, data)) fail('INSPIRATION_FILE_TYPE_MISMATCH', 'Eagle 素材扩展名与文件内容不一致');
      return { sourceId: resolved.context.source.sourceId, relativePath: request.relativePath, mimeType, size: data.length, dataBase64: data.toString('base64') };
    } finally { if (handle !== undefined) fs.closeSync(handle); }
  }

  execute(operation, request = {}) {
    const sourceId = String(request.sourceId || '');
    if (operation === 'health') { const context = this._source(sourceId); return Promise.resolve({ sourceId: context.source.sourceId, status: 'AVAILABLE' }); }
    if (operation === 'list_items') return Promise.resolve(this._list(sourceId, request));
    if (operation === 'item_metadata') return Promise.resolve(this._metadata(sourceId, request));
    if (operation === 'preview') return Promise.resolve(this._preview(sourceId, request));
    return Promise.reject(Object.assign(new Error('不支持的 Eagle 只读操作'), { code: 'INSPIRATION_CONNECTOR_INVALID' }));
  }
}

TeemoEagleLibraryService.MAX_PREVIEW_BYTES = MAX_PREVIEW_BYTES;
module.exports = TeemoEagleLibraryService;
