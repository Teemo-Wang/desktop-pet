/*
 * Teemo Plugin Runtime
 * Loads and unloads Plugins. Closing a plugin must not break ordinary chat.
 */
(function (root, factory) {
  const Runtime = factory();
  if (root) root.TeemoPluginRuntime = Runtime;
  if (typeof window !== 'undefined') window.TeemoPluginRuntime = Runtime;
  if (typeof module === 'object' && module.exports) module.exports = Runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class TeemoPluginRuntime {
    constructor(options = {}) {
      this.registry = options.registry || null;
      this.plugins = new Map();
    }

    register(plugin) {
      if (!plugin || !plugin.pluginId) throw new Error('Plugin 必须提供 pluginId');
      this.plugins.set(plugin.pluginId, plugin);
      return plugin.pluginId;
    }

    get(pluginId) {
      return this.plugins.get(pluginId) || null;
    }

    list() {
      return Array.from(this.plugins.keys());
    }

    activate(pluginId, context) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) return false;
      if (typeof plugin.activate === 'function') return plugin.activate(context || {});
      return false;
    }

    deactivate(pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) return false;
      if (typeof plugin.deactivate === 'function') {
        plugin.deactivate();
        return true;
      }
      return false;
    }

    activateAll(context) {
      const result = {};
      this.plugins.forEach((plugin, id) => {
        try {
          result[id] = this.activate(id, context);
        } catch (error) {
          console.warn('[TeemoPluginRuntime] activate failed:', id, error && error.message);
          result[id] = false;
        }
      });
      return result;
    }

    deactivateAll() {
      this.plugins.forEach((plugin, id) => {
        try { this.deactivate(id); } catch (error) {
          console.warn('[TeemoPluginRuntime] deactivate failed:', id, error && error.message);
        }
      });
    }
  }

  return TeemoPluginRuntime;
});
