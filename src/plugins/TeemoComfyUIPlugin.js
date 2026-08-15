/*
 * Teemo ComfyUI Plugin
 * Thin wrapper around existing TeemoComfyUIService. Does not rewrite ComfyUI.
 */
(function (root, factory) {
  const Plugin = factory();
  if (root) root.TeemoComfyUIPlugin = Plugin;
  if (typeof window !== 'undefined') window.TeemoComfyUIPlugin = Plugin;
  if (typeof module === 'object' && module.exports) module.exports = Plugin;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CAPABILITIES = Object.freeze(['image.generate', 'workflow.execute']);

  class TeemoComfyUIPlugin {
    constructor(options = {}) {
      this.pluginId = 'teemo-comfyui';
      this.service = options.service || null;
      this.registry = options.registry || null;
      this.active = false;
    }

    registerCapability() {
      return CAPABILITIES.slice();
    }

    activate() {
      if (!this.service || typeof this.service.isEnabled !== 'function') return false;
      if (typeof this.service.reload === 'function') this.service.reload();
      if (!this.service.isEnabled()) {
        this.deactivate();
        return false;
      }
      if (!this.registry) return false;
      CAPABILITIES.forEach(name => this.registry.register(name, this));
      this.active = true;
      return true;
    }

    deactivate() {
      if (this.registry) {
        CAPABILITIES.forEach(name => this.registry.unregister(name, this.pluginId));
      }
      this.active = false;
    }

    async execute(capability, input, context) {
      if (!this.active) {
        throw new Error('ComfyUI 插件未启用。请在设置中开启本机 ComfyUI。');
      }
      if (CAPABILITIES.indexOf(capability) < 0) {
        throw new Error(`ComfyUI 插件不支持能力：${capability}`);
      }
      if (!this.service || typeof this.service.generate !== 'function') {
        throw new Error('ComfyUI 服务不可用。');
      }
      const payload = input || {};
      const extras = context || {};
      return this.service.generate({
        prompt: payload.prompt,
        workflowId: payload.workflowId,
        workflowName: payload.workflowName,
        size: payload.size,
        width: payload.width,
        height: payload.height,
        negativePrompt: payload.negativePrompt,
        seed: payload.seed,
        onProgress: payload.onProgress || extras.onProgress,
        signal: payload.signal || extras.signal,
      });
    }
  }

  TeemoComfyUIPlugin.CAPABILITIES = CAPABILITIES;
  return TeemoComfyUIPlugin;
});
