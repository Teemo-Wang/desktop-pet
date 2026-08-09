/* Renderer IPC client for Main-owned, permission-bound Git operations. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoGitClient = api;
  if (typeof window !== 'undefined') window.TeemoGitClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    prepare: 'teemo-git-tool:prepare',
    execute: 'teemo-git-tool:execute',
    release: 'teemo-git-tool:release',
    cancel: 'teemo-git-tool:cancel',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.name = 'TeemoGitClientError';
    error.code = payload && payload.code ? payload.code : 'GIT_OPERATION_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoGitClient {
    constructor(options = {}) { this.ipcRenderer = options.ipcRenderer || null; }

    async prepare(tool, args, context = {}) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'Git service is unavailable.');
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
        if (!result || !result.ok) throw safeError(result && result.error, 'Git operation could not be prepared.');
        return { resource: result.resource, reason: result.reason, preparation: { operationId: result.operationId } };
      } finally {
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      }
    }

    async execute(preparation, options = {}) {
      const operationId = preparation && preparation.operationId;
      if (!operationId) throw safeError({ code: 'GIT_PATH_INVALID' }, 'Prepared Git operation is invalid.');
      const signal = options.signal || null;
      if (signal && signal.aborted) throw safeError({ code: 'GIT_CANCELLED' }, 'Git operation was cancelled.');
      const abortListener = signal ? () => {
        this.ipcRenderer.invoke(CHANNELS.cancel, { operationId }).catch(() => {});
      } : null;
      if (signal) signal.addEventListener('abort', abortListener, { once: true });
      try {
        const result = await this.ipcRenderer.invoke(CHANNELS.execute, { operationId });
        if (!result || !result.ok) throw safeError(result && result.error, 'Git operation failed.');
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

  TeemoGitClient.CHANNELS = CHANNELS;
  return TeemoGitClient;
});
