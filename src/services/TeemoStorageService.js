/**
 * TeemoStorageService
 * 统一管理 Teemo 助理现有的本地 JSON / Markdown 存储。
 * 数据目录默认保持 ~/.hellobike-pet；测试时可用 TEEMO_ASSISTANT_DATA_DIR 隔离。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TeemoStorageService = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  class TeemoStorageService {
    constructor(options = {}) {
      const configured = options.dataDir || process.env.TEEMO_ASSISTANT_DATA_DIR;
      this.dataDir = path.resolve(configured || path.join(os.homedir(), '.hellobike-pet'));
      this.readStates = new Map();
      this.ensureDir();
    }

    getDir() { return this.dataDir; }

    getPath(fileName) {
      const value = String(fileName || '');
      return path.isAbsolute(value) ? value : path.join(this.dataDir, value);
    }

    ensureDir() {
      fs.mkdirSync(this.dataDir, { recursive: true });
      return this.dataDir;
    }

    exists(fileName) { return fs.existsSync(this.getPath(fileName)); }

    getReadState(fileName) { return this.readStates.get(this.getPath(fileName)) || 'unknown'; }

    _setReadState(filePath, state) {
      this.readStates.set(filePath, state);
    }

    _assertWritable(filePath) {
      if (this.readStates.get(filePath) === 'error' && fs.existsSync(filePath)) {
        throw new Error(`拒绝覆盖读取失败的存储文件：${path.basename(filePath)}`);
      }
    }

    _replaceFile(tempPath, filePath) {
      try {
        fs.renameSync(tempPath, filePath);
        return;
      } catch (error) {
        if (process.platform !== 'win32' || !fs.existsSync(filePath)) throw error;
      }

      // Windows cannot rename over an existing file. Keep a recoverable backup
      // while replacing, and restore it if the copy fails.
      const backupPath = `${filePath}.teemo-backup-${process.pid}-${Date.now()}`;
      fs.copyFileSync(filePath, backupPath);
      try {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
        fs.unlinkSync(backupPath);
      } catch (error) {
        try { fs.copyFileSync(backupPath, filePath); } catch (_) { /* preserve original error */ }
        throw error;
      }
    }

    _writeAtomically(filePath, text, validate) {
      const tempPath = `${filePath}.teemo-temp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      try {
        fs.writeFileSync(tempPath, text, 'utf8');
        if (validate) validate(tempPath);
        this._replaceFile(tempPath, filePath);
      } catch (error) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) { /* preserve original error */ }
        throw error;
      }
    }

    readJson(fileName, fallback = null) {
      const filePath = this.getPath(fileName);
      if (!fs.existsSync(filePath)) {
        this._setReadState(filePath, 'missing');
        return fallback;
      }
      try {
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this._setReadState(filePath, 'ok');
        return value;
      } catch (error) {
        this._setReadState(filePath, 'error');
        return fallback;
      }
    }

    writeJson(fileName, value) {
      const filePath = this.getPath(fileName);
      this._assertWritable(filePath);
      const serialized = JSON.stringify(value, null, 2);
      if (serialized === undefined) throw new Error('无法序列化 JSON 存储值');
      this._writeAtomically(filePath, serialized, tempPath => {
        JSON.parse(fs.readFileSync(tempPath, 'utf8'));
      });
      this._setReadState(filePath, 'ok');
      return value;
    }

    withFileLock(fileName, callback, options = {}) {
      const filePath = this.getPath(fileName);
      const lockPath = `${filePath}.teemo-lock`;
      const staleMs = Math.max(5000, Number(options.staleMs) || 30000);
      let handle = null;
      try {
        try {
          handle = fs.openSync(lockPath, 'wx');
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          let stale = false;
          try { stale = Date.now() - fs.statSync(lockPath).mtimeMs > staleMs; } catch (_) { stale = true; }
          if (!stale) return { acquired: false, value: null };
          try { fs.unlinkSync(lockPath); } catch (_) { return { acquired: false, value: null }; }
          try { handle = fs.openSync(lockPath, 'wx'); } catch (_) { return { acquired: false, value: null }; }
        }
        fs.writeFileSync(handle, `${process.pid}\n${Date.now()}`, 'utf8');
        return { acquired: true, value: callback() };
      } finally {
        if (handle != null) {
          try { fs.closeSync(handle); } catch (_) { /* preserve callback result/error */ }
          try { fs.unlinkSync(lockPath); } catch (_) { /* lock is stale-safe */ }
        }
      }
    }

    readText(fileName, fallback = '') {
      const filePath = this.getPath(fileName);
      if (!fs.existsSync(filePath)) {
        this._setReadState(filePath, 'missing');
        return fallback;
      }
      try {
        const value = fs.readFileSync(filePath, 'utf8');
        this._setReadState(filePath, 'ok');
        return value;
      } catch (error) {
        this._setReadState(filePath, 'error');
        return fallback;
      }
    }

    writeText(fileName, text) {
      const filePath = this.getPath(fileName);
      this._assertWritable(filePath);
      const value = String(text == null ? '' : text);
      this._writeAtomically(filePath, value);
      this._setReadState(filePath, 'ok');
      return value;
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.TeemoStorageService = TeemoStorageService;
    globalThis.StorageService = TeemoStorageService;
  }
  return TeemoStorageService;
});
