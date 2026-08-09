/* Renderer IPC client for owner-bound file operations prepared and executed in Main. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoFileClient = api;
  if (typeof window !== 'undefined') window.TeemoFileClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    prepare: 'teemo-file-tool:prepare',
    execute: 'teemo-file-tool:execute',
    release: 'teemo-file-tool:release',
    cancel: 'teemo-file-tool:cancel',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoFileClientError';
    error.code = payload && payload.code ? payload.code : 'FILE_IPC_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoFileClient {
    constructor(options = {}) {
      this.ipcRenderer = options.ipcRenderer || null;
    }

    async prepare(tool, args, context = {}) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'File service is unavailable.');
      }
      const result = await this.ipcRenderer.invoke(CHANNELS.prepare, {
        tool,
        args,
        toolCallId: context.toolCallId || null,
        runId: context.runId || null,
        sessionId: context.sessionId || null,
      });
      if (!result || !result.ok) throw safeError(result && result.error, 'File resource could not be prepared.');
      return { resource: result.resource, reason: result.reason, preparation: { operationId: result.operationId } };
    }

    async execute(preparation, options = {}) {
      const operationId = preparation && preparation.operationId;
      if (!operationId) throw safeError({ code: 'FILE_PREPARATION_INVALID' }, 'Prepared file operation is invalid.');
      const signal = options.signal || null;
      if (signal && signal.aborted) throw safeError({ code: 'TOOL_CANCELLED' }, 'Tool execution was cancelled.');
      const abortListener = signal ? () => {
        this.ipcRenderer.invoke(CHANNELS.cancel, { operationId }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        const result = await this.ipcRenderer.invoke(CHANNELS.execute, { operationId });
        if (!result || !result.ok) throw safeError(result && result.error, 'File operation failed.');
        return result.data;
      } finally {
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      }
    }

    async release(preparation) {
      const operationId = preparation && preparation.operationId;
      if (!operationId || !this.ipcRenderer) return false;
      return this.ipcRenderer.invoke(CHANNELS.release, { operationId });
    }
  }

  TeemoFileClient.CHANNELS = CHANNELS;
  return TeemoFileClient;
});
