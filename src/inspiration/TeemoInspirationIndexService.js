const crypto = require('crypto');
const TeemoInspirationIndexStorage = require('./TeemoInspirationIndexStorage');

class TeemoInspirationIndexService {
  constructor(options = {}) {
    if (!options.scanner) throw new Error('TeemoInspirationIndexService requires scanner.');
    this.storage = options.storage || new TeemoInspirationIndexStorage(options);
    this.scanner = options.scanner;
    this.activeScan = null;
  }

  _publicFailure(error) {
    const code = error && error.code ? error.code : 'INSPIRATION_INDEX_FAILED';
    const statusByCode = {
      INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
      INSPIRATION_SOURCE_MISSING: 'SOURCE_MISSING',
      INSPIRATION_SOURCE_NOT_FOUND: 'SOURCE_MISSING',
      INSPIRATION_SOURCE_INVALID: 'SOURCE_MISSING',
      INSPIRATION_LINK_UNSUPPORTED: 'SOURCE_MISSING',
      INSPIRATION_INDEX_LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
      INSPIRATION_INDEX_STORAGE_LIMIT: 'LIMIT_EXCEEDED',
      INSPIRATION_INDEX_CORRUPT: 'CORRUPT',
      INSPIRATION_INDEX_UNREADABLE: 'INDEX_UNREADABLE',
    };
    return { status: statusByCode[code] || 'FAILED', code };
  }

  getSourceSnapshot(sourceId, options = {}) {
    const id = String(sourceId || '');
    if (this.activeScan && this.activeScan.sourceId === id && options.preferRuntime === true) {
      return {
        status: 'SCANNING',
        sourceId: id,
        mode: this.activeScan.mode,
        progress: { ...this.activeScan.progress },
        items: [],
      };
    }
    try {
      this.scanner.inspectSource(id);
    } catch (error) {
      return { sourceId: id, ...this._publicFailure(error), items: [], total: 0, hasMore: false };
    }
    const snapshot = this.storage.readSourceSnapshot(id, options);
    return {
      sourceId: id,
      ...snapshot,
      manifest: undefined,
    };
  }

  getManifestStatus() {
    const manifest = this.storage.getManifestSnapshot();
    return manifest.stateError
      ? { status: 'INDEX_UNREADABLE', revision: 0 }
      : { status: 'READY', revision: manifest.revision };
  }

  getSourceStatus(sourceId) {
    const snapshot = this.getSourceSnapshot(sourceId, { limit: 1, preferRuntime: true });
    return {
      status: snapshot.status,
      itemCount: snapshot.status === 'READY' && snapshot.entry ? snapshot.entry.itemCount : 0,
      lastSuccessfulScanAt: snapshot.status === 'READY' && snapshot.entry ? snapshot.entry.lastSuccessfulScanAt : null,
      lastScanMode: snapshot.status === 'READY' && snapshot.entry ? snapshot.entry.lastScanMode : null,
      summary: snapshot.status === 'READY' && snapshot.entry ? snapshot.entry.summary : null,
      progress: snapshot.status === 'SCANNING' ? snapshot.progress : null,
    };
  }

  async scan(sourceId, requestedMode, options = {}) {
    const id = String(sourceId || '');
    if (this.activeScan) {
      const error = new Error('灵感索引正在更新，请稍后重试');
      error.code = 'INSPIRATION_INDEX_BUSY';
      throw error;
    }
    const requested = String(requestedMode || 'refresh');
    if (!['build', 'refresh', 'rebuild'].includes(requested)) {
      const error = new Error('灵感索引操作无效');
      error.code = 'INSPIRATION_REQUEST_INVALID';
      throw error;
    }
    const sourceContext = this.scanner.inspectSource(id);
    const initial = this.storage.readSourceSnapshot(id, { all: true });
    if (initial.status === 'INDEX_UNREADABLE') {
      const error = new Error('灵感索引状态无法读取，已安全停用');
      error.code = 'INSPIRATION_INDEX_UNREADABLE';
      throw error;
    }
    if (requested === 'build' && initial.status !== 'NOT_INDEXED') {
      const error = new Error('该灵感来源已经建立索引');
      error.code = 'INSPIRATION_INDEX_CHANGED';
      throw error;
    }
    if (requested === 'refresh' && initial.status !== 'READY') {
      const error = new Error(initial.status === 'CORRUPT' ? '该素材来源的索引已损坏，需要重建' : '该灵感来源尚未建立索引');
      error.code = initial.status === 'CORRUPT' ? 'INSPIRATION_INDEX_CORRUPT' : 'INSPIRATION_INDEX_NOT_FOUND';
      throw error;
    }
    const existingItems = initial.status === 'READY' ? initial.items : [];
    const expectedManifestRevision = Number(initial.manifest && initial.manifest.revision) || 0;
    const expectedIndexRevision = Number(initial.entry && initial.entry.indexRevision) || 0;
    const mode = requested === 'build' ? 'full' : requested === 'refresh' ? 'incremental' : 'rebuild';
    const active = {
      scanId: String(options.scanId || crypto.randomUUID()),
      sourceId: id,
      mode,
      progress: {
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
      },
    };
    this.activeScan = active;
    try {
      const result = await this.scanner.scan(id, {
        mode,
        sourceContext,
        existingItems,
        signal: options.signal || null,
        checkCancelled: options.checkCancelled,
        timeoutMs: options.timeoutMs,
        onProgress: progress => {
          active.progress = { ...progress };
          if (typeof options.onProgress === 'function') options.onProgress({ ...progress, scanId: active.scanId, mode });
        },
      });
      if ((options.signal && options.signal.aborted)
        || (typeof options.checkCancelled === 'function' && options.checkCancelled())) {
        const error = new Error('已取消灵感索引');
        error.code = 'INSPIRATION_ABORTED';
        throw error;
      }
      if (typeof this.scanner.hooks.beforeCommit === 'function') {
        await this.scanner.hooks.beforeCommit(result, options);
      }
      this.scanner.revalidateSource(sourceContext);
      const committed = this.storage.commitSourceSnapshot({
        scanId: active.scanId,
        sourceId: id,
        sourceRegistryRevision: sourceContext.sourceRegistryRevision,
        mode,
        items: result.items,
        summary: result.summary,
      }, {
        expectedManifestRevision,
        expectedIndexRevision,
        validateBeforeCommit: () => {
          if ((options.signal && options.signal.aborted)
            || (typeof options.checkCancelled === 'function' && options.checkCancelled())) {
            const error = new Error('已取消灵感索引');
            error.code = 'INSPIRATION_ABORTED';
            throw error;
          }
          this.scanner.revalidateSource(sourceContext);
        },
      });
      return {
        status: 'READY',
        sourceId: id,
        entry: committed.entry,
        summary: committed.entry.summary,
      };
    } finally {
      if (this.activeScan === active) this.activeScan = null;
    }
  }

  cancelActive(sourceId) {
    if (!this.activeScan || this.activeScan.sourceId !== String(sourceId || '')) return false;
    return true;
  }

  removeSourceIndex(sourceId) {
    return this.storage.removeSourceIndex(sourceId);
  }

  cleanupRemovedSources(activeSourceIds = []) {
    const active = new Set(Array.isArray(activeSourceIds) ? activeSourceIds.map(String) : []);
    const manifest = this.storage.getManifestSnapshot();
    if (manifest.stateError) return { removed: [], failed: [] };
    const removed = [];
    const failed = [];
    for (const sourceId of Object.keys(manifest.sources)) {
      if (active.has(sourceId)) continue;
      try {
        const result = this.storage.removeSourceIndex(sourceId);
        if (result.removed) removed.push(sourceId);
        if (result.cleanupFailed) failed.push(sourceId);
      } catch (_) {
        failed.push(sourceId);
      }
    }
    return { removed, failed };
  }

  resetCorruptIndex() {
    if (this.activeScan) {
      const error = new Error('灵感索引正在更新，请稍后重试');
      error.code = 'INSPIRATION_INDEX_BUSY';
      throw error;
    }
    return this.storage.resetCorruptIndex();
  }
}

module.exports = TeemoInspirationIndexService;
