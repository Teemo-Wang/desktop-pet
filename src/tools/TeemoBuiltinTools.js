/* Safe, side-effect-free tools available during the P1 foundation phase. */
(function (root, factory) {
  const Registry = root && root.TeemoToolRegistry
    ? root.TeemoToolRegistry
    : (typeof module === 'object' && module.exports ? require('./TeemoToolRegistry') : null);
  const api = factory(Registry);
  if (root) root.TeemoBuiltinTools = api;
  if (typeof window !== 'undefined') window.TeemoBuiltinTools = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TeemoToolRegistry) {
  const definitions = [
    {
      name: 'echo',
      description: 'Return the provided text without side effects.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      metadata: { category: 'system', sideEffect: 'none' },
      handler: async args => ({ text: args.text }),
    },
    {
      name: 'get_agent_runtime_info',
      description: 'Return non-sensitive identifiers for the current Agent run.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      metadata: { category: 'system', sideEffect: 'none' },
      handler: async (_args, context) => ({
        runId: context.runId,
        sessionId: context.sessionId,
        step: context.step,
        test: true,
      }),
    },
  ];

  function createDefinitions() {
    return definitions.map(definition => ({
      ...definition,
      inputSchema: JSON.parse(JSON.stringify(definition.inputSchema)),
      metadata: JSON.parse(JSON.stringify(definition.metadata)),
    }));
  }

  function createRegistry() {
    if (typeof TeemoToolRegistry !== 'function') throw new Error('TeemoToolRegistry is not available.');
    const registry = new TeemoToolRegistry();
    for (const definition of createDefinitions()) registry.register(definition);
    return registry;
  }

  return Object.freeze({ createRegistry });
});
