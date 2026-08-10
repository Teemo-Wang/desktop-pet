/* Renderer IPC client for P4-3. It transports only a bounded prompt, bounded dimensions, and opaque IDs. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoComfyWorkflowClient = api;
  if (typeof window !== 'undefined') window.TeemoComfyWorkflowClient = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CHANNELS = Object.freeze({
    prepare: 'teemo-comfy-workflow:prepare',
    execute: 'teemo-comfy-workflow:execute',
    getPreview: 'teemo-comfy-workflow:get-preview',
    discard: 'teemo-comfy-workflow:discard',
    release: 'teemo-comfy-workflow:release',
  });

  function safeError(payload, fallback) {
    const error = new Error(payload && payload.message ? payload.message : fallback);
    error.code = payload && payload.code ? payload.code : 'COMFYUI_IPC_FAILED';
    error.teemoSafe = true;
    return error;
  }

  class TeemoComfyWorkflowClient {
    constructor(options = {}) { this.ipcRenderer = options.ipcRenderer || null; }

    _invoke(channel, payload) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        throw safeError(null, 'Local ComfyUI render is unavailable.');
      }
      return this.ipcRenderer.invoke(channel, payload);
    }

    async prepare(input = {}, context = {}) {
      const result = await this._invoke(CHANNELS.prepare, {
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        toolCallId: context.toolCallId || null,
        runId: context.runId || null,
        sessionId: null,
      });
      if (!result || !result.ok) throw safeError(result && result.error, 'Local render could not be prepared.');
      return Object.freeze({
        resource: result.resource,
        reason: result.reason,
        expiresAt: result.expiresAt,
        preparation: Object.freeze({ actionId: result.actionId }),
      });
    }

    async execute(preparation) {
      const result = await this._invoke(CHANNELS.execute, { actionId: preparation && preparation.actionId });
      if (!result || !result.ok) throw safeError(result && result.error, 'Local render failed safely.');
      return result.result;
    }

    async getPreview(previewId) {
      const result = await this._invoke(CHANNELS.getPreview, { previewId });
      if (!result || !result.ok) throw safeError(result && result.error, 'Local render preview is unavailable.');
      return result.preview;
    }

    async discard(previewId) {
      const result = await this._invoke(CHANNELS.discard, { previewId });
      return !!(result && result.ok && result.discarded);
    }

    async release(preparation) {
      const actionId = preparation && preparation.actionId;
      if (!actionId) return false;
      const result = await this._invoke(CHANNELS.release, { actionId });
      return !!(result && result.ok && result.released);
    }
  }

  TeemoComfyWorkflowClient.CHANNELS = CHANNELS;
  return TeemoComfyWorkflowClient;
});
