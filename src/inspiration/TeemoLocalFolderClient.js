(function (root, factory) {
  const api = factory();
  if (root) root.TeemoLocalFolderClient = api;
  if (typeof window !== 'undefined') window.TeemoLocalFolderClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    listSources: 'teemo-inspiration-local:list-sources',
    selectAndAdd: 'teemo-inspiration-local:select-and-add',
    reauthorize: 'teemo-inspiration-local:reauthorize',
    removeSource: 'teemo-inspiration-local:remove-source',
    execute: 'teemo-inspiration-local:execute',
    cancel: 'teemo-inspiration-local:cancel',
  });

  function safeError(payload, fallback = '本地灵感来源暂不可用') {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoLocalFolderClientError';
    error.code = payload && payload.code ? payload.code : 'INSPIRATION_CONNECTOR_UNAVAILABLE';
    error.teemoSafe = true;
    return error;
  }

  function requestId() {
    return `local_folder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  class TeemoLocalFolderClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
    }

    _invoke(channel, payload) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        return Promise.reject(safeError(null));
      }
      return this.ipcRenderer.invoke(channel, payload);
    }

    async listSources() {
      const result = await this._invoke(CHANNELS.listSources, {});
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.snapshot;
    }

    async selectAndAdd(options = {}) {
      const result = await this._invoke(CHANNELS.selectAndAdd, {
        expectedRevision: options.expectedRevision,
      });
      if (!result || !result.ok) {
        if (result && result.canceled) return { canceled: true };
        throw safeError(result && result.error);
      }
      return { canceled: false, snapshot: result.snapshot };
    }

    async removeSource(sourceId, options = {}) {
      const result = await this._invoke(CHANNELS.removeSource, {
        sourceId,
        expectedRevision: options.expectedRevision,
      });
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.snapshot;
    }

    async reauthorize(sourceId) {
      const result = await this._invoke(CHANNELS.reauthorize, { sourceId });
      if (!result || !result.ok) {
        if (result && result.canceled) return { canceled: true };
        throw safeError(result && result.error);
      }
      return { canceled: false, snapshot: result.snapshot };
    }

    async execute(operation, request = {}, context = {}) {
      const id = requestId();
      const signal = context.signal || null;
      if (signal && signal.aborted) throw safeError({ code: 'INSPIRATION_ABORTED', message: '已取消读取本地灵感来源' });
      const abortListener = signal ? () => {
        this._invoke(CHANNELS.cancel, { requestId: id }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        const result = await this._invoke(CHANNELS.execute, {
          requestId: id,
          operation,
          request,
          toolCallId: context.toolCallId || null,
          runId: context.runId || null,
          sessionId: context.sessionId || null,
        });
        if (!result || !result.ok) throw safeError(result && result.error);
        return result.data;
      } finally {
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      }
    }
  }

  TeemoLocalFolderClient.CHANNELS = CHANNELS;
  return TeemoLocalFolderClient;
});
