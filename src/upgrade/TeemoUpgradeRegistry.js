/* Dedicated P5-3 registries. These tools are never registered on ordinary Chat. */
(function (root, factory) {
  const api = factory(
    root && root.TeemoToolRegistry,
    root && root.TeemoFileTools,
    root && root.TeemoGitTools,
    root && root.TeemoExecuteTools,
  );
  if (root) root.TeemoUpgradeRegistry = api;
  if (typeof window !== 'undefined') window.TeemoUpgradeRegistry = api;
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(
      require('../tools/TeemoToolRegistry'),
      require('../tools/file/TeemoFileTools'),
      require('../tools/git/TeemoGitTools'),
      require('../tools/execute/TeemoExecuteTools'),
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  TeemoToolRegistry,
  TeemoFileTools,
  TeemoGitTools,
  TeemoExecuteTools,
) {
  const DISCOVERY_TOOLS = Object.freeze(['read_file', 'search_files', 'search_text']);
  const UPGRADE_TOOLS = Object.freeze([
    ...DISCOVERY_TOOLS,
    'patch_file',
    'git_status',
    'git_diff',
    'run_npm_script',
  ]);

  function requireDependencies() {
    if (!TeemoToolRegistry || !TeemoFileTools || !TeemoGitTools || !TeemoExecuteTools) {
      throw new Error('P5-3 upgrade registry dependencies are unavailable.');
    }
  }

  function registerSelected(registry, definitions, names) {
    const allowed = new Set(names);
    definitions.filter(definition => allowed.has(definition.name)).forEach(definition => registry.register(definition));
  }

  function create(options = {}) {
    requireDependencies();
    const permissionService = options.permissionService || null;
    const registry = new TeemoToolRegistry({ permissionService });
    const discoveryRegistry = new TeemoToolRegistry({ permissionService });
    const fileDefinitions = TeemoFileTools.createDefinitions({ fileClient: options.fileClient });
    const gitDefinitions = TeemoGitTools.createDefinitions({ gitClient: options.gitClient });
    const executeDefinitions = TeemoExecuteTools.createDefinitions({ executeClient: options.executeClient });
    registerSelected(registry, fileDefinitions, UPGRADE_TOOLS);
    registerSelected(registry, gitDefinitions, UPGRADE_TOOLS);
    registerSelected(registry, executeDefinitions, UPGRADE_TOOLS);
    registerSelected(discoveryRegistry, fileDefinitions, DISCOVERY_TOOLS);
    return Object.freeze({ registry, discoveryRegistry });
  }

  return Object.freeze({ create, DISCOVERY_TOOLS, UPGRADE_TOOLS });
});
