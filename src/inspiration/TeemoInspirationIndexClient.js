(function (root, factory) {
  const Client = factory();
  if (root) root.TeemoInspirationIndexClient = Client;
  if (typeof window !== 'undefined') window.TeemoInspirationIndexClient = Client;
  if (typeof module === 'object' && module.exports) module.exports = Client;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    getSource: 'teemo-inspiration-index:get-source',
    scan: 'teemo-inspiration-index:scan',
    cancel: 'teemo-inspiration-index:cancel',
    discardAuthorization: 'teemo-inspiration-index:discard-authorization',
    progress: 'teemo-inspiration-index:progress',
    resetCorrupt: 'teemo-inspiration-index:reset-corrupt',
  });

  function safeError(payload, fallback = '灵感索引暂不可用') {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoInspirationIndexClientError';
    error.code = payload && payload.code ? payload.code : 'INSPIRATION_INDEX_FAILED';
    error.teemoSafe = true;
    return error;
  }

  function makeRequestId() {
    return `inspiration_index_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  class TeemoInspirationIndexClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
      this.accessGuard = options.accessGuard || null;
      this.progressListeners = new Map();
      if (this.ipcRenderer && typeof this.ipcRenderer.on === 'function') {
        this.ipcRenderer.on(CHANNELS.progress, (_event, payload = {}) => {
          const listener = this.progressListeners.get(String(payload.requestId || ''));
          if (listener) listener(payload.progress || {});
        });
      }
    }

    _invoke(channel, payload) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        return Promise.reject(safeError(null));
      }
      return this.ipcRenderer.invoke(channel, payload);
    }

    async getSource(sourceId, options = {}) {
      const result = await this._invoke(CHANNELS.getSource, {
        sourceId,
        offset: options.offset,
        limit: options.limit,
      });
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.snapshot;
    }

    startScan(sourceId, mode, context = {}) {
      const requestId = makeRequestId();
      const onProgress = typeof context.onProgress === 'function' ? context.onProgress : null;
      const controller = new AbortController();
      const externalSignal = context.signal || null;
      let cancelled = Boolean(externalSignal && externalSignal.aborted);
      const externalAbort = externalSignal ? () => {
        cancelled = true;
        controller.abort();
      } : null;
      if (externalSignal && !externalSignal.aborted) externalSignal.addEventListener('abort', externalAbort, { once: true });
      if (cancelled) controller.abort();
      if (onProgress) this.progressListeners.set(requestId, onProgress);
      const promise = (async () => {
        try {
          if (!this.accessGuard || typeof this.accessGuard.authorizeIndexScan !== 'function') {
            throw safeError({ code: 'INSPIRATION_PERMISSION_DENIED', message: '灵感索引授权不可用' });
          }
          const authorization = await this.accessGuard.authorizeIndexScan(sourceId, {
            signal: controller.signal,
            toolCallId: requestId,
            runId: context.runId || null,
            sessionId: context.sessionId || null,
          });
          if (cancelled || controller.signal.aborted) {
            await this._invoke(CHANNELS.discardAuthorization, { toolCallId: requestId });
            throw safeError({ code: 'INSPIRATION_ABORTED', message: '已取消灵感索引' });
          }
          const result = await this._invoke(CHANNELS.scan, {
            requestId,
            sourceId,
            mode,
            toolCallId: authorization.toolCallId,
            runId: authorization.runId,
            sessionId: authorization.sessionId,
          });
          if (!result || !result.ok) throw safeError(result && result.error);
          return result.data;
        } catch (error) {
          if (cancelled || controller.signal.aborted) {
            await this._invoke(CHANNELS.discardAuthorization, { toolCallId: requestId }).catch(() => {});
          }
          throw error;
        }
      })().finally(() => {
        this.progressListeners.delete(requestId);
        if (externalSignal && externalAbort) externalSignal.removeEventListener('abort', externalAbort);
      });
      return {
        requestId,
        promise,
        cancel: () => {
          cancelled = true;
          controller.abort();
          return Promise.all([
            this._invoke(CHANNELS.cancel, { requestId }),
            this._invoke(CHANNELS.discardAuthorization, { toolCallId: requestId }),
          ]).then(results => results.some(Boolean));
        },
      };
    }

    async resetCorruptIndex() {
      const result = await this._invoke(CHANNELS.resetCorrupt, {});
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.data;
    }
  }

  TeemoInspirationIndexClient.CHANNELS = CHANNELS;
  return TeemoInspirationIndexClient;
});
