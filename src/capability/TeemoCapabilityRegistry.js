/*
 * Teemo Capability Registry
 * Maps capability names to the Plugin that currently provides them.
 * Does not grant permission and does not execute tools by itself.
 */
(function (root, factory) {
  const Registry = factory();
  if (root) root.TeemoCapabilityRegistry = Registry;
  if (typeof window !== 'undefined') window.TeemoCapabilityRegistry = Registry;
  if (typeof module === 'object' && module.exports) module.exports = Registry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LABELS = Object.freeze({
    'image.generate': '生图',
    'workflow.execute': '执行工作流',
    'image.edit': '改图',
    'image.inspect': '看图',
    'video.generate': '生成视频',
  });

  function capabilityLabel(name) {
    return LABELS[name] || name;
  }

  class TeemoCapabilityRegistry {
    constructor() {
      this.handlers = new Map();
    }

    register(capability, plugin) {
      const name = String(capability || '').trim();
      if (!name) throw new Error('Capability 名称不能为空');
      if (!plugin || typeof plugin.execute !== 'function') {
        throw new Error('Plugin 必须提供 execute()');
      }
      this.handlers.set(name, plugin);
      return name;
    }

    unregister(capability, pluginId) {
      const name = String(capability || '').trim();
      const current = this.handlers.get(name);
      if (!current) return false;
      if (pluginId && current.pluginId && current.pluginId !== pluginId) return false;
      this.handlers.delete(name);
      return true;
    }

    has(capability) {
      return this.handlers.has(String(capability || '').trim());
    }

    list() {
      return Array.from(this.handlers.keys());
    }

    getPlugin(capability) {
      return this.handlers.get(String(capability || '').trim()) || null;
    }

    async invoke(capability, input, context) {
      const name = String(capability || '').trim();
      const plugin = this.handlers.get(name);
      if (!plugin) {
        throw new Error(`当前没有可用的「${capabilityLabel(name)}」能力。请先在设置里开启本机 ComfyUI。`);
      }
      return plugin.execute(name, input || {}, context || {});
    }
  }

  TeemoCapabilityRegistry.capabilityLabel = capabilityLabel;
  return TeemoCapabilityRegistry;
});
