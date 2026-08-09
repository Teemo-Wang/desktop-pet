/* Renderer IPC client for Main-owned controlled process execution. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoExecuteClient = api;
  if (typeof window !== 'undefined') window.TeemoExecuteClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    prepare: 'teemo-execute-tool:prepare',
    execute: 'teemo-execute-tool:execute',
    release: 'teemo-execute-tool:release',
    cancel: 'teemo-execute-tool:cancel',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoExecuteClientError';
    error.code = payload && payload.code ? payload.code : 'EXECUTION_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoExecuteClient {
    constructor(options = {}) { this.ipcRenderer = options.ipcRenderer || null; }

    async prepare(tool, args, context = {}) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'Execute service is unavailable.');
      }
      const signal = context.signal || null;
      const toolCallId = context.toolCallId || null;
      const abortListener = signal ? () => {
        this.ipcRenderer.invoke(CHANNELS.cancel, { toolCallId }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        const result = await this.ipcRenderer.invoke(CHANNELS.prepare, {
          tool, args, toolCallId,
          runId: context.runId || null,
          sessionId: context.sessionId || null,
        });
        if (!result || !result.ok) throw safeError(result && result.error, 'Execution could not be prepared.');
        return { resource: result.resource, reason: result.reason, preparation: { operationId: result.operationId } };
      } finally {
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      }
    }

    async execute(preparation, options = {}) {
      const operationId = preparation && preparation.operationId;
      if (!operationId) throw safeError({ code: 'EXECUTION_START_FAILED' }, 'Prepared execution is invalid.');
      const signal = options.signal || null;
      if (signal && signal.aborted) throw safeError({ code: 'EXECUTION_CANCELLED' }, 'Execution was cancelled.');
      const abortListener = signal ? () => {
        this.ipcRenderer.invoke(CHANNELS.cancel, { operationId }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        const result = await this.ipcRenderer.invoke(CHANNELS.execute, { operationId });
        if (!result || !result.ok) throw safeError(result && result.error, 'Controlled execution failed.');
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

  TeemoExecuteClient.CHANNELS = CHANNELS;
  return TeemoExecuteClient;
});
