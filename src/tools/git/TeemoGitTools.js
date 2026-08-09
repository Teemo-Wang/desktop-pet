/* P1-6A controlled local Git tool definitions. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoGitTools = api;
  if (typeof window !== 'undefined') window.TeemoGitTools = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const repo = { type: 'string', minLength: 1, maxLength: 32767 };
  const relativeFile = { type: 'string', minLength: 1, maxLength: 4096 };

  function createDefinitions(options = {}) {
    const gitClient = options.gitClient;
    if (!gitClient || typeof gitClient.prepare !== 'function' || typeof gitClient.execute !== 'function') {
      throw new Error('TeemoGitTools requires a trusted Git client.');
    }
    const make = (name, description, permission, properties, required) => ({
      name,
      description,
      inputSchema: { type: 'object', properties, required, additionalProperties: false },
      metadata: { category: 'git', permission, sideEffect: permission === 'write' ? 'local-git-write' : 'local-git-read' },
      resolvePermissionResource: (args, context) => gitClient.prepare(name, args, context),
      releasePermissionResource: preparation => gitClient.release(preparation),
      handler: (_args, context) => gitClient.execute(context.permissionPreparation, { signal: context.signal }),
    });
    return [
      make('git_status', 'Return bounded structured status for one authorized local Git repository.', 'read', { repo }, ['repo']),
      make('git_diff', 'Return a bounded working-tree or staged diff, optionally for one explicit file.', 'read', {
        repo,
        staged: { type: 'boolean' },
        file: relativeFile,
      }, ['repo']),
      make('git_log', 'Return a bounded local commit history for one authorized repository.', 'read', {
        repo,
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      }, ['repo']),
      make('git_show', 'Show bounded metadata and patch for one local commit, optionally one explicit file.', 'read', {
        repo,
        revision: { type: 'string', minLength: 1, maxLength: 200 },
        file: relativeFile,
      }, ['repo', 'revision']),
      make('git_stage_files', 'Stage only an explicit bounded list of repository-relative files.', 'write', {
        repo,
        files: { type: 'array', items: relativeFile },
      }, ['repo', 'files']),
      make('git_commit', 'Commit only changes that are already staged in an authorized local repository.', 'write', {
        repo,
        message: { type: 'string', minLength: 1, maxLength: 200 },
      }, ['repo', 'message']),
    ];
  }

  function register(registry, options = {}) {
    return createDefinitions(options).map(definition => registry.register(definition));
  }

  return Object.freeze({ createDefinitions, register });
});
