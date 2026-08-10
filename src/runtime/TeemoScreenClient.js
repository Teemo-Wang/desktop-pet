/* Renderer IPC client for P4-1 screen awareness. It has no Electron capture capability. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoScreenClient = api;
  if (typeof window !== 'undefined') window.TeemoScreenClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    list: 'teemo-screen:list',
    prepare: 'teemo-screen:prepare',
    execute: 'teemo-screen:execute',
    getPreview: 'teemo-screen:get-preview',
    discard: 'teemo-screen:discard',
    release: 'teemo-screen:release',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.code = payload && payload.code ? payload.code : 'SCREEN_IPC_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoScreenClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
    }

    _invoke(channel, payload) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'Screen awareness is unavailable.');
      }
      return this.ipcRenderer.invoke(channel, payload);
    }

    async listDisplays() {
      const result = await this._invoke(CHANNELS.list, {});
      if (!result || !result.ok) throw safeError(result && result.error, 'Screen displays are unavailable.');
      return result.displays || [];
    }

    async prepare(displayRef, context = {}) {
      const result = await this._invoke(CHANNELS.prepare, {
        displayRef,
        toolCallId: context.toolCallId || null,
        runId: context.runId || null,
        sessionId: context.sessionId || null,
      });
      if (!result || !result.ok) throw safeError(result && result.error, 'Screen capture could not be prepared.');
      return Object.freeze({
        resource: result.resource,
        reason: result.reason,
        preparation: Object.freeze({ operationId: result.operationId }),
      });
    }

    async execute(preparation) {
      const operationId = preparation && preparation.operationId;
      const result = await this._invoke(CHANNELS.execute, { operationId });
      if (!result || !result.ok) throw safeError(result && result.error, 'Screen capture failed safely.');
      return result.snapshot;
    }

    async getPreview(snapshotId) {
      const result = await this._invoke(CHANNELS.getPreview, { snapshotId });
      if (!result || !result.ok) throw safeError(result && result.error, 'Screen preview is unavailable.');
      return result.preview;
    }

    async discard(snapshotId) {
      const result = await this._invoke(CHANNELS.discard, { snapshotId });
      return !!(result && result.ok && result.discarded);
    }

    async release(preparation) {
      const operationId = preparation && preparation.operationId;
      if (!operationId) return false;
      const result = await this._invoke(CHANNELS.release, { operationId });
      return !!(result && result.ok && result.released);
    }
  }

  TeemoScreenClient.CHANNELS = CHANNELS;
  return TeemoScreenClient;
});
