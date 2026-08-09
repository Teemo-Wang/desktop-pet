/* P1-5 model-neutral file tool definitions. All I/O stays in the Main process. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoFileTools = api;
  if (typeof window !== 'undefined') window.TeemoFileTools = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pathProperty = { type: 'string', minLength: 1, maxLength: 32767 };
  const hashProperty = { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' };

  function createDefinitions(options = {}) {
    const fileClient = options.fileClient;
    if (!fileClient || typeof fileClient.prepare !== 'function' || typeof fileClient.execute !== 'function') {
      throw new Error('TeemoFileTools requires a trusted file client.');
    }
    const make = (name, description, permission, properties, required) => ({
      name,
      description,
      inputSchema: { type: 'object', properties, required, additionalProperties: false },
      metadata: { category: 'file', permission, sideEffect: permission === 'write' ? 'local-write' : 'local-read' },
      resolvePermissionResource: (args, context) => fileClient.prepare(name, args, context),
      releasePermissionResource: preparation => fileClient.release(preparation),
      handler: (_args, context) => fileClient.execute(context.permissionPreparation, { signal: context.signal }),
    });

    return [
      make('list_directory', 'List a bounded number of entries in an authorized local directory.', 'read',
        { path: pathProperty }, ['path']),
      make('read_file', 'Read bounded text or extract text from a supported document in an authorized folder.', 'read',
        { path: pathProperty }, ['path']),
      make('search_files', 'Search file names below an authorized local directory with bounded depth and results.', 'read',
        { path: pathProperty, query: { type: 'string', minLength: 1, maxLength: 500 } }, ['path', 'query']),
      make('search_text', 'Search UTF-8 text below an authorized local directory with bounded work and results.', 'read',
        { path: pathProperty, query: { type: 'string', minLength: 1, maxLength: 500 } }, ['path', 'query']),
      make('create_file', 'Create one new approved UTF-8 text file without overwriting an existing file.', 'write',
        { path: pathProperty, content: { type: 'string', maxLength: 1048576 } }, ['path', 'content']),
      make('patch_file', 'Apply deterministic exact-text edits to one approved UTF-8 file after hash verification.', 'write', {
        path: pathProperty,
        expectedSha256: hashProperty,
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', minLength: 1, maxLength: 1048576 },
              newText: { type: 'string', maxLength: 1048576 },
            },
            required: ['oldText', 'newText'],
            additionalProperties: false,
          },
        },
      }, ['path', 'expectedSha256', 'edits']),
      make('rename_file', 'Rename one regular file inside the same authorized folder without overwriting.', 'write',
        { path: pathProperty, newPath: pathProperty, expectedSha256: hashProperty }, ['path', 'newPath', 'expectedSha256']),
    ];
  }

  function register(registry, options = {}) {
    const registered = [];
    for (const definition of createDefinitions(options)) registered.push(registry.register(definition));
    return registered;
  }

  return Object.freeze({ createDefinitions, register });
});
