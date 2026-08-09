const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const TeemoStorageService = require('../services/TeemoStorageService');

const SOURCE_FILE = 'Teemo-inspiration-sources.json';
const SCHEMA_VERSION = 1;
const MAX_SOURCES = 20;

class TeemoInspirationSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TeemoInspirationSourceError';
    this.code = code;
    this.teemoSafe = true;
  }
}

function fail(code, message) {
  throw new TeemoInspirationSourceError(code, message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultState() {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, sources: [] };
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validSource(source) {
  return Boolean(source && typeof source === 'object' && !Array.isArray(source)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(source.sourceId || ''))
    && source.kind === 'local_folder'
    && typeof source.displayName === 'string' && source.displayName.trim()
    && source.displayName.length <= 100
    && path.isAbsolute(String(source.rootPath || ''))
    && !/^\\\\/.test(String(source.rootPath || ''))
    && validIso(source.createdAt)
    && validIso(source.updatedAt));
}

function validState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  if (!Array.isArray(value.sources) || value.sources.length > MAX_SOURCES) return false;
  if (!value.sources.every(validSource)) return false;
  const sourceIds = value.sources.map(source => source.sourceId.toLowerCase());
  const roots = value.sources.map(source => {
    const normalized = path.normalize(source.rootPath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  });
  return new Set(sourceIds).size === value.sources.length
    && new Set(roots).size === value.sources.length;
}

class TeemoInspirationSourceService {
  constructor(options = {}) {
    this.storage = options.storage || new TeemoStorageService(options);
    this.fileService = options.fileService || null;
    this.rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this.idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => crypto.randomUUID();
    this.fileName = options.fileName || SOURCE_FILE;
    this.state = this._load();
  }

  _load() {
    if (!this.storage.exists(this.fileName)) return defaultState();
    const value = this.storage.readJson(this.fileName, null);
    if (!validState(value)) {
      return {
        ...defaultState(),
        stateError: {
          code: 'INSPIRATION_SOURCES_UNREADABLE',
          message: '灵感来源配置无法读取，已安全停用',
        },
      };
    }
    return clone(value);
  }

  _samePath(left, right) {
    return process.platform === 'win32'
      ? String(left).toLowerCase() === String(right).toLowerCase()
      : String(left) === String(right);
  }

  _canonicalAuthorizedRoot(rootPath) {
    if (!this.fileService) fail('INSPIRATION_SOURCE_UNAVAILABLE', '本地文件服务不可用');
    let resolved;
    try {
      resolved = this.fileService.resolveAuthorizedPath(rootPath, this.rootsProvider());
    } catch (error) {
      if (error && error.code === 'FILE_NOT_FOUND') fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在');
      fail('INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED', '该文件夹需要本地读取授权');
    }
    let lstat;
    try { lstat = fs.lstatSync(path.resolve(rootPath)); } catch (_) { fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在'); }
    if (lstat.isSymbolicLink()) fail('INSPIRATION_LINK_UNSUPPORTED', '不能将链接或联接目录添加为灵感来源');
    let stat;
    try { stat = fs.statSync(resolved.target); } catch (_) { fail('INSPIRATION_SOURCE_MISSING', '本地灵感文件夹不存在'); }
    if (!stat.isDirectory()) fail('INSPIRATION_SOURCE_INVALID', '灵感来源必须是文件夹');
    return resolved.target;
  }

  reload() {
    this.state = this._load();
    return this.getSnapshot();
  }

  getSnapshot() {
    return clone(this.state);
  }

  getSource(sourceId) {
    this.reload();
    if (this.state.stateError) fail(this.state.stateError.code, this.state.stateError.message);
    const source = this.state.sources.find(item => item.sourceId === String(sourceId || ''));
    if (!source) fail('INSPIRATION_SOURCE_NOT_FOUND', '找不到该灵感来源');
    return clone(source);
  }

  addLocalFolder(input = {}, options = {}) {
    const canonicalRoot = this._canonicalAuthorizedRoot(input.rootPath);
    const displayName = String(input.displayName || path.basename(canonicalRoot) || '本地灵感').trim().slice(0, 100);
    if (!displayName) fail('INSPIRATION_SOURCE_INVALID', '灵感来源名称不能为空');
    const expectedRevision = options.expectedRevision == null ? null : Number(options.expectedRevision);
    const locked = this.storage.withFileLock(this.fileName, () => {
      const latest = this._load();
      if (latest.stateError) fail(latest.stateError.code, latest.stateError.message);
      if (expectedRevision != null && expectedRevision !== latest.revision) {
        fail('INSPIRATION_SOURCES_CHANGED', '灵感来源已在其他窗口更新，请刷新后重试');
      }
      const checkedRoot = this._canonicalAuthorizedRoot(canonicalRoot);
      if (latest.sources.some(source => this._samePath(source.rootPath, checkedRoot))) {
        fail('INSPIRATION_SOURCE_ALREADY_EXISTS', '该文件夹已经是灵感来源');
      }
      if (latest.sources.length >= MAX_SOURCES) fail('INSPIRATION_SOURCE_LIMIT_REACHED', '本地灵感来源最多可添加 20 个');
      const now = this.clock().toISOString();
      const source = {
        sourceId: this.idFactory(),
        kind: 'local_folder',
        displayName,
        rootPath: checkedRoot,
        createdAt: now,
        updatedAt: now,
      };
      if (!validSource(source)) fail('INSPIRATION_SOURCE_INVALID', '灵感来源配置无效');
      const next = { schemaVersion: SCHEMA_VERSION, revision: latest.revision + 1, sources: [...latest.sources, source] };
      this.storage.writeJson(this.fileName, next);
      return next;
    });
    if (!locked.acquired) fail('INSPIRATION_SOURCES_CHANGED', '灵感来源正在其他窗口更新，请稍后重试');
    this.state = locked.value;
    return this.getSnapshot();
  }

  removeSource(sourceId, options = {}) {
    const id = String(sourceId || '');
    const expectedRevision = options.expectedRevision == null ? null : Number(options.expectedRevision);
    const locked = this.storage.withFileLock(this.fileName, () => {
      const latest = this._load();
      if (latest.stateError) fail(latest.stateError.code, latest.stateError.message);
      if (expectedRevision != null && expectedRevision !== latest.revision) {
        fail('INSPIRATION_SOURCES_CHANGED', '灵感来源已在其他窗口更新，请刷新后重试');
      }
      if (!latest.sources.some(source => source.sourceId === id)) fail('INSPIRATION_SOURCE_NOT_FOUND', '找不到该灵感来源');
      const next = {
        schemaVersion: SCHEMA_VERSION,
        revision: latest.revision + 1,
        sources: latest.sources.filter(source => source.sourceId !== id),
      };
      this.storage.writeJson(this.fileName, next);
      return next;
    });
    if (!locked.acquired) fail('INSPIRATION_SOURCES_CHANGED', '灵感来源正在其他窗口更新，请稍后重试');
    this.state = locked.value;
    return this.getSnapshot();
  }
}

TeemoInspirationSourceService.SOURCE_FILE = SOURCE_FILE;
TeemoInspirationSourceService.SCHEMA_VERSION = SCHEMA_VERSION;
TeemoInspirationSourceService.MAX_SOURCES = MAX_SOURCES;
TeemoInspirationSourceService.TeemoInspirationSourceError = TeemoInspirationSourceError;
module.exports = TeemoInspirationSourceService;
