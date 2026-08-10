(function (root, factory) {
  const Client = factory();
  if (root) root.TeemoEagleLibraryClient = Client;
  if (typeof window !== 'undefined') window.TeemoEagleLibraryClient = Client;
  if (typeof module === 'object' && module.exports) module.exports = Client;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    selectAndAdd: 'teemo-inspiration-eagle:select-and-add',
    reauthorize: 'teemo-inspiration-eagle:reauthorize',
    execute: 'teemo-inspiration-eagle:execute',
    cancel: 'teemo-inspiration-eagle:cancel',
  });
  function safeError(payload) {
    const error = new Error(payload && payload.message ? payload.message : 'Eagle 灵感库暂不可用');
    error.code = payload && payload.code ? payload.code : 'INSPIRATION_CONNECTOR_UNAVAILABLE';
    error.teemoSafe = true;
    return error;
  }
  class TeemoEagleLibraryClient {
    constructor(options = {}) { this.ipcRenderer = options.ipcRenderer || null; }
    _invoke(channel, payload) { return this.ipcRenderer && this.ipcRenderer.invoke ? this.ipcRenderer.invoke(channel, payload) : Promise.reject(safeError()); }
    async selectAndAdd(options = {}) {
      const result = await this._invoke(CHANNELS.selectAndAdd, { expectedRevision: options.expectedRevision });
      if (!result || !result.ok) { if (result && result.canceled) return { canceled: true }; throw safeError(result && result.error); }
      return { canceled: false, snapshot: result.snapshot };
    }
    async reauthorize(sourceId) {
      const result = await this._invoke(CHANNELS.reauthorize, { sourceId });
      if (!result || !result.ok) { if (result && result.canceled) return { canceled: true }; throw safeError(result && result.error); }
      return { canceled: false, snapshot: result.snapshot };
    }
    async execute(operation, request = {}, context = {}) {
      const requestId = `eagle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const result = await this._invoke(CHANNELS.execute, { requestId, operation, request, toolCallId: context.toolCallId || null, runId: context.runId || null, sessionId: context.sessionId || null });
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.data;
    }
  }
  TeemoEagleLibraryClient.CHANNELS = CHANNELS;
  return TeemoEagleLibraryClient;
});
