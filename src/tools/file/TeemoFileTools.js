/* P1-5 model-neutral file tool definitions. All I/O stays in the Main process. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoFileTools = api;
  if (typeof window !== 'undefined') window.TeemoFileTools = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pathProperty = { type: 'string', minLength: 1, maxLength: 32767 };
  const rootIdProperty = { type: 'string', minLength: 6, maxLength: 64 };
  const rootReferenceProperty = { type: 'string', minLength: 1, maxLength: 255 };
  const relativePathProperty = { type: 'string', maxLength: 32767 };
  const hashProperty = { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' };

  function targetProperties(extra = {}) {
    return {
      rootId: rootIdProperty,
      rootReference: rootReferenceProperty,
      relativePath: relativePathProperty,
      path: pathProperty,
      ...extra,
    };
  }

  function createDefinitions(options = {}) {
    const fileClient = options.fileClient;
    if (!fileClient || typeof fileClient.prepare !== 'function' || typeof fileClient.execute !== 'function') {
      throw new Error('TeemoFileTools requires a trusted file client.');
    }
    const make = (name, description, permission, properties, required) => {
      const definition = {
        name,
        description,
        inputSchema: { type: 'object', properties, required, additionalProperties: false },
        metadata: { category: 'file', permission, sideEffect: permission === 'write' ? 'local-write' : 'local-read' },
        resolvePermissionResource: (args, context) => fileClient.prepare(name, args, context),
        releasePermissionResource: preparation => fileClient.release(preparation),
        handler: (_args, context) => fileClient.execute(context.permissionPreparation, { signal: context.signal }),
      };
      if (typeof fileClient.normalize === 'function') {
        definition.normalizeArguments = args => fileClient.normalize(name, args);
      }
      return definition;
    };

    return [
      make('list_directory', 'List entries in an authorized directory. Use rootId + relativePath from the authorized-root summary; rootReference accepts one exact display name or alias. Exact absolute path is compatibility input and is grounded locally.', 'read',
        targetProperties(), []),
      make('read_file', 'Read bounded text from an authorized root. Use rootId + relativePath; rootReference accepts one exact display name or alias. Exact absolute path is grounded locally.', 'read',
        targetProperties(), []),
      make('search_files', 'Search file names below an authorized directory. Use rootId + relativePath; rootReference accepts one exact display name or alias.', 'read',
        targetProperties({ query: { type: 'string', minLength: 1, maxLength: 500 } }), ['query']),
      make('search_text', 'Search UTF-8 text below an authorized directory. Use rootId + relativePath; rootReference accepts one exact display name or alias.', 'read',
        targetProperties({ query: { type: 'string', minLength: 1, maxLength: 500 } }), ['query']),
      make('create_file', 'Create one approved UTF-8 text file without overwriting. Use rootId + relativePath; rootReference accepts one exact display name or alias.', 'write',
        targetProperties({ content: { type: 'string', maxLength: 1048576 } }), ['content']),
      make('create_directory', 'Create one directory in an authorized root without overwriting. Use rootId + relativePath; rootReference accepts one exact display name or alias.', 'write',
        targetProperties(), []),
      make('patch_file', 'Apply deterministic exact-text edits to one approved UTF-8 file after hash verification.', 'write', {
        ...targetProperties(),
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
      }, ['expectedSha256', 'edits']),
      make('rename_file', 'Rename one regular file inside the same authorized root. Use rootId + relativePath + newRelativePath; rootReference accepts one exact display name or alias.', 'write',
        targetProperties({ newRelativePath: relativePathProperty, newPath: pathProperty, expectedSha256: hashProperty }), ['expectedSha256']),
    ];
  }

  function register(registry, options = {}) {
    const registered = [];
    for (const definition of createDefinitions(options)) registered.push(registry.register(definition));
    return registered;
  }

  return Object.freeze({ createDefinitions, register });
});
