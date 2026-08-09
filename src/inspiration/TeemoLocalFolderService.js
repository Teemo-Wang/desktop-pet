const fs = require('fs');
const path = require('path');

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const MAX_DEPTH = 16;
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
const PREVIEW_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
});

class TeemoLocalFolderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoLocalFolderError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoLocalFolderError(code, message);
}

function identity(stat) {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

function validSignature(extension, buffer) {
  if (extension === '.png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === '.gif') return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (extension === '.webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

class TeemoLocalFolderService {
  constructor(options = {}) {
    if (!options.fileService || !options.sourceService) throw new Error('TeemoLocalFolderService requires fileService and sourceService.');
    this.fileService = options.fileService;
    this.sourceService = options.sourceService;
    this.rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
    this.hooks = options.hooks || {};
    this.timeouts = Object.freeze({
      health: Number(options.healthTimeoutMs) || 3000,
      list_items: Number(options.listTimeoutMs) || 5000,
      item_metadata: Number(options.metadataTimeoutMs) || 3000,
      preview: Number(options.previewTimeoutMs) || 10000,
    });
  }

  _assertActive(options = {}) {
    if ((options.signal && options.signal.aborted) || (typeof options.checkCancelled === 'function' && options.checkCancelled())) {
      fail('INSPIRATION_ABORTED', '已取消读取本地灵感来源');
    }
  }

  _relativeParts(value, allowEmpty = true) {
    const input = String(value || '').trim();
    if (!input && allowEmpty) return [];
    if (!input || input.includes('\u0000') || path.isAbsolute(input) || path.win32.isAbsolute(input)
      || /^\\\\/.test(input) || /^\\\\[?.]\\/.test(input) || /^[A-Za-z]:/.test(input)) {
      fail('INSPIRATION_PATH_INVALID', '只能访问灵感来源内的相对路径');
    }
    const parts = input.replace(/\\/g, '/').split('/').filter(part => part && part !== '.');
    if (parts.some(part => part === '..' || part.includes(':'))) fail('INSPIRATION_PATH_INVALID', '相对路径不能离开灵感来源');
    if (parts.length > MAX_DEPTH) fail('INSPIRATION_DEPTH_EXCEEDED', '目录层级超过 16 层限制');
    return parts;
  }

  _assertNoLinks(root, parts) {
    let current = root;
    const rootLstat = fs.lstatSync(root);
    if (rootLstat.isSymbolicLink()) fail('INSPIRATION_LINK_UNSUPPORTED', '不支持链接或联接目录');
    for (const part of parts) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) fail('INSPIRATION_LINK_UNSUPPORTED', '不支持访问链接或联接目标');
    }
  }

  _resolve(sourceId, relativePath = '', kind = null) {
    const source = this.sourceService.getSource(sourceId);
    if (source.kind !== 'local_folder') fail('INSPIRATION_SOURCE_INVALID', '灵感来源类型无效');
    const parts = this._relativeParts(relativePath, true);
    let sourceResolved;
    try { sourceResolved = this.fileService.resolveAuthorizedPath(source.rootPath, this.rootsProvider()); }
    catch (error) {
      if (error && error.code === 'FILE_NOT_FOUND') fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在');
      fail('INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', '该灵感来源需要重新授权');
    }
    try { this._assertNoLinks(source.rootPath, parts); }
    catch (error) {
      if (error && error.teemoSafe) throw error;
      fail('INSPIRATION_SOURCE_MISSING', '本地灵感项目不存在');
    }
    let requested = sourceResolved.target;
    if (parts.length) requested = path.join(sourceResolved.target, ...parts);
    let canonical;
    try { canonical = this.fileService.canonicalPath(requested); }
    catch (_) { fail('INSPIRATION_SOURCE_MISSING', '本地灵感项目不存在'); }
    if (!this.fileService.isPathWithinRoot(sourceResolved.target, canonical)
      || !this.fileService.isPathWithinRoot(sourceResolved.root, canonical)) {
      fail('INSPIRATION_PATH_OUTSIDE_SOURCE', '请求路径超出灵感来源范围');
    }
    let stat;
    try { stat = fs.statSync(canonical); } catch (_) { fail('INSPIRATION_SOURCE_MISSING', '本地灵感项目不存在'); }
    if (kind === 'directory' && !stat.isDirectory()) {
      if (!parts.length) fail('INSPIRATION_SOURCE_INVALID', '灵感来源必须是文件夹');
      fail('INSPIRATION_NOT_DIRECTORY', '请求项目不是文件夹');
    }
    if (kind === 'file' && !stat.isFile()) fail('INSPIRATION_NOT_FILE', '请求项目不是普通文件');
    return { source, sourceRoot: sourceResolved.target, authorizedRoot: sourceResolved.root, target: canonical, parts, stat };
  }

  _entry(root, directory, entry) {
    const candidate = path.join(directory, entry.name);
    let stat;
    try { stat = fs.lstatSync(candidate); } catch (_) { return null; }
    const relativePath = path.relative(root, candidate).split(path.sep).join('/');
    if (stat.isSymbolicLink()) return { name: entry.name, relativePath, type: 'unsupported_link', previewable: false };
    if (stat.isDirectory()) return { name: entry.name, relativePath, type: 'directory', modifiedAt: new Date(stat.mtimeMs).toISOString(), previewable: false };
    if (!stat.isFile()) return { name: entry.name, relativePath, type: 'unsupported', previewable: false };
    const extension = path.extname(entry.name).toLowerCase();
    return {
      name: entry.name,
      relativePath,
      type: 'regular_file',
      extension,
      size: stat.size,
      modifiedAt: new Date(stat.mtimeMs).toISOString(),
      previewable: Boolean(PREVIEW_TYPES[extension]) && stat.size <= MAX_PREVIEW_BYTES,
    };
  }

  _list(request, options) {
    const resolved = this._resolve(request.sourceId, request.relativeDirectory || '', 'directory');
    const requestedLimit = Number(request.limit) || DEFAULT_LIST_LIMIT;
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, requestedLimit));
    const entries = [];
    let inspected = 0;
    const directory = fs.opendirSync(resolved.target);
    try {
      let entry;
      while (inspected <= limit && (entry = directory.readSync())) {
        inspected += 1;
        this._assertActive(options);
        const item = this._entry(resolved.sourceRoot, resolved.target, entry);
        if (item) entries.push(item);
        if (typeof this.hooks.afterListEntry === 'function') {
          this.hooks.afterListEntry(item, entries.length, options);
        }
      }
    } finally {
      directory.closeSync();
    }
    return {
      sourceId: resolved.source.sourceId,
      relativeDirectory: resolved.parts.join('/'),
      entries: entries.slice(0, limit).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      truncated: inspected > limit,
      limit,
    };
  }

  _metadata(request) {
    const resolved = this._resolve(request.sourceId, request.relativePath || '');
    return {
      sourceId: resolved.source.sourceId,
      relativePath: resolved.parts.join('/'),
      type: resolved.stat.isDirectory() ? 'directory' : (resolved.stat.isFile() ? 'regular_file' : 'unsupported'),
      size: resolved.stat.isFile() ? resolved.stat.size : null,
      modifiedAt: new Date(resolved.stat.mtimeMs).toISOString(),
    };
  }

  async _preview(request, options) {
    const resolved = this._resolve(request.sourceId, request.relativePath || '', 'file');
    const extension = path.extname(resolved.target).toLowerCase();
    const mimeType = PREVIEW_TYPES[extension];
    if (!mimeType) fail('INSPIRATION_PREVIEW_UNSUPPORTED', '该文件类型不支持预览');
    if (resolved.stat.size > MAX_PREVIEW_BYTES) fail('INSPIRATION_FILE_TOO_LARGE', '图片超过 25 MiB 预览限制');
    if (typeof this.hooks.beforeOpen === 'function') await this.hooks.beforeOpen(resolved, options);
    this._assertActive(options);
    let handle;
    try {
      const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
      handle = fs.openSync(resolved.target, flags);
      const opened = fs.fstatSync(handle);
      if (!opened.isFile() || identity(opened) !== identity(resolved.stat) || opened.size !== resolved.stat.size) {
        fail('INSPIRATION_SOURCE_CHANGED', '图片在读取前发生变化');
      }
      if (opened.size > MAX_PREVIEW_BYTES) fail('INSPIRATION_FILE_TOO_LARGE', '图片超过 25 MiB 预览限制');
      this._assertActive(options);
      const buffer = fs.readFileSync(handle);
      const after = fs.fstatSync(handle);
      if (identity(after) !== identity(opened) || after.size !== opened.size) fail('INSPIRATION_SOURCE_CHANGED', '图片在读取过程中发生变化');
      if (!validSignature(extension, buffer)) fail('INSPIRATION_FILE_TYPE_MISMATCH', '图片扩展名与文件内容不一致');
      return {
        sourceId: resolved.source.sourceId,
        relativePath: resolved.parts.join('/'),
        mimeType,
        size: buffer.length,
        dataBase64: buffer.toString('base64'),
      };
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }

  async _runBounded(operation, task, options) {
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || this.timeouts[operation] || 5000);
    let timer;
    let timedOut = false;
    const boundedOptions = {
      ...options,
      checkCancelled: () => timedOut || (typeof options.checkCancelled === 'function' && options.checkCancelled()),
    };
    try {
      return await Promise.race([
        (async () => {
          if (typeof this.hooks.beforeOperation === 'function') await this.hooks.beforeOperation(operation, boundedOptions);
          this._assertActive(boundedOptions);
          const result = await task(boundedOptions);
          this._assertActive(boundedOptions);
          return result;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new TeemoLocalFolderError('INSPIRATION_TIMEOUT', '读取本地灵感来源超时'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  execute(operation, request = {}, options = {}) {
    const op = String(operation || '');
    try { this._assertActive(options); }
    catch (error) { return Promise.reject(error); }
    if (!['health', 'list_items', 'item_metadata', 'preview'].includes(op)) {
      return Promise.reject(new TeemoLocalFolderError('INSPIRATION_CONNECTOR_INVALID', '不支持的本地灵感操作'));
    }
    return this._runBounded(op, async boundedOptions => {
      if (op === 'health') {
        const resolved = this._resolve(request.sourceId, '', 'directory');
        return { sourceId: resolved.source.sourceId, status: 'AVAILABLE' };
      }
      if (op === 'list_items') return this._list(request, boundedOptions);
      if (op === 'item_metadata') return this._metadata(request);
      return this._preview(request, boundedOptions);
    }, options);
  }
}

TeemoLocalFolderService.DEFAULT_LIST_LIMIT = DEFAULT_LIST_LIMIT;
TeemoLocalFolderService.MAX_LIST_LIMIT = MAX_LIST_LIMIT;
TeemoLocalFolderService.MAX_DEPTH = MAX_DEPTH;
TeemoLocalFolderService.MAX_PREVIEW_BYTES = MAX_PREVIEW_BYTES;
TeemoLocalFolderService.PREVIEW_TYPES = PREVIEW_TYPES;
TeemoLocalFolderService.TeemoLocalFolderError = TeemoLocalFolderError;
module.exports = TeemoLocalFolderService;
