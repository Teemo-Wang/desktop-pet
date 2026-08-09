/* P1-6B controlled execute definitions. No arbitrary shell string is accepted. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoExecuteTools = api;
  if (typeof window !== 'undefined') window.TeemoExecuteTools = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pathProperty = { type: 'string', minLength: 1, maxLength: 32767 };
  const argsProperty = { type: 'array', items: { type: 'string', maxLength: 500 } };
  const timeoutProperty = { type: 'integer', minimum: 100, maximum: 120000 };

  function createDefinitions(options = {}) {
    const executeClient = options.executeClient;
    if (!executeClient || typeof executeClient.prepare !== 'function' || typeof executeClient.execute !== 'function') {
      throw new Error('TeemoExecuteTools requires a trusted execute client.');
    }
    const make = (name, description, properties, required) => ({
      name,
      description,
      inputSchema: { type: 'object', properties, required, additionalProperties: false },
      metadata: { category: 'execute', permission: 'execute', sideEffect: 'controlled-process' },
      resolvePermissionResource: (args, context) => executeClient.prepare(name, args, context),
      releasePermissionResource: preparation => executeClient.release(preparation),
      handler: (_args, context) => executeClient.execute(context.permissionPreparation, { signal: context.signal }),
    });
    return [
      make('run_npm_script', 'Run one package.json-declared npm script in an authorized project with bounded arguments and lifetime.', {
        projectPath: pathProperty,
        script: { type: 'string', minLength: 1, maxLength: 100 },
        args: argsProperty,
        timeoutMs: timeoutProperty,
      }, ['projectPath', 'script']),
      make('run_process', 'Run trusted Node.js on one hash-bound .js/.cjs/.mjs file inside an authorized cwd.', {
        executable: { type: 'string', enum: ['node', 'node.exe'] },
        cwd: pathProperty,
        scriptPath: pathProperty,
        args: argsProperty,
        timeoutMs: timeoutProperty,
      }, ['executable', 'cwd', 'scriptPath']),
    ];
  }

  function register(registry, options = {}) {
    return createDefinitions(options).map(definition => registry.register(definition));
  }

  return Object.freeze({ createDefinitions, register });
});
