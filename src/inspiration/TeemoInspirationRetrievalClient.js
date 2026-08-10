(function (root, factory) {
  const Client = factory();
  if (root) root.TeemoInspirationRetrievalClient = Client;
  if (typeof window !== 'undefined') window.TeemoInspirationRetrievalClient = Client;
  if (typeof module === 'object' && module.exports) module.exports = Client;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    search: 'teemo-inspiration-retrieval:search',
  });

  function safeError(payload, fallback = '灵感检索暂不可用') {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoInspirationRetrievalClientError';
    error.code = payload && payload.code ? payload.code : 'INSPIRATION_RETRIEVAL_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoInspirationRetrievalClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
    }

    async search(input = {}) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') throw safeError(null);
      const result = await this.ipcRenderer.invoke(CHANNELS.search, {
        query: input.query,
        sourceId: input.sourceId,
        format: input.format,
        orientation: input.orientation,
        minWidth: input.minWidth,
        minHeight: input.minHeight,
        sort: input.sort,
        offset: input.offset,
        limit: input.limit,
      });
      if (!result || !result.ok) throw safeError(result && result.error);
      return result.result;
    }
  }

  TeemoInspirationRetrievalClient.CHANNELS = CHANNELS;
  return TeemoInspirationRetrievalClient;
});
