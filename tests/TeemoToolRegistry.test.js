const assert = require('node:assert/strict');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoBuiltinTools = require('../src/tools/TeemoBuiltinTools');

function definition(overrides = {}) {
  return {
    name: 'add_numbers',
    description: 'Add two numbers in memory.',
    inputSchema: {
      type: 'object',
      properties: { left: { type: 'number' }, right: { type: 'number' } },
      required: ['left', 'right'],
      additionalProperties: false,
    },
    metadata: { category: 'test', permission: 'none', sideEffect: 'none', privateNote: 'not public' },
    handler: async args => ({ total: args.left + args.right }),
    ...overrides,
  };
}

async function main() {
  const registry = new TeemoToolRegistry();
  const registered = registry.register(definition());
  assert.equal(registered.name, 'add_numbers');
  assert.equal(registry.has('add_numbers'), true);
  assert.equal(registry.get('add_numbers').metadata.sideEffect, 'none');
  assert.deepEqual(registry.list(), ['add_numbers']);

  const publicDefinitions = registry.listDefinitions();
  assert.deepEqual(Object.keys(publicDefinitions[0]).sort(), ['description', 'inputSchema', 'name']);
  assert.equal(publicDefinitions[0].handler, undefined);
  assert.equal(publicDefinitions[0].metadata, undefined);
  publicDefinitions[0].inputSchema.required.length = 0;
  assert.deepEqual(registry.listDefinitions()[0].inputSchema.required, ['left', 'right']);

  assert.throws(() => registry.register(definition()), error => error.code === 'TOOL_ALREADY_REGISTERED');
  for (const invalid of [
    null,
    definition({ name: 'Bad Name' }),
    definition({ description: '' }),
    definition({ inputSchema: null }),
    definition({ metadata: 'private' }),
    definition({ handler: 'not-a-function' }),
    definition({ normalizeArguments: 'not-a-function' }),
    definition({ resolvePermissionResource: 'not-a-function' }),
  ]) {
    const isolatedRegistry = new TeemoToolRegistry();
    assert.throws(() => isolatedRegistry.register(invalid), error => error.code === 'INVALID_TOOL_DEFINITION');
  }
  const circularSchema = { type: 'object', properties: {}, additionalProperties: false };
  circularSchema.properties.self = circularSchema;
  assert.throws(
    () => new TeemoToolRegistry().register(definition({ inputSchema: circularSchema })),
    error => error.code === 'INVALID_TOOL_DEFINITION',
  );
  assert.equal(registry.has('add_numbers'), true, 'failed registration must not remove valid tools');

  const success = await registry.execute('add_numbers', { left: 2, right: 3 }, {
    runId: 'run-1', sessionId: 'session-1', step: 2,
  });
  assert.equal(success.ok, true);
  assert.equal(success.status, 'completed');
  assert.equal(success.tool, 'add_numbers');
  assert.deepEqual(success.data, { total: 5 });
  assert.ok(success.toolCallId.startsWith('tool_call_'));
  assert.ok(success.startedAt && success.finishedAt);

  let handlerCalls = 0;
  const validationRegistry = new TeemoToolRegistry();
  validationRegistry.register(definition({ handler: async () => { handlerCalls += 1; return {}; } }));
  for (const args of [
    null,
    { left: 1 },
    { left: '1', right: 2 },
    { left: 1, right: 2, extra: true },
  ]) {
    const result = await validationRegistry.execute('add_numbers', args);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'TOOL_ARGUMENT_VALIDATION_FAILED');
  }
  assert.equal(handlerCalls, 0, 'invalid arguments must never reach the handler');

  let normalizedObservation = null;
  let normalizedHandlerInput = null;
  const normalizationRegistry = new TeemoToolRegistry();
  normalizationRegistry.register(definition({
    normalizeArguments: async args => ({ left: Number(args.left), right: Number(args.right) }),
    handler: async args => { normalizedHandlerInput = args; return { total: args.left + args.right }; },
  }));
  const normalizedResult = await normalizationRegistry.execute('add_numbers', {
    left: '4', right: '5', legacy: true,
  }, {
    onArgumentsNormalized: args => { normalizedObservation = args; },
  });
  assert.equal(normalizedResult.ok, true, 'normalization must run before schema validation');
  assert.deepEqual(normalizedObservation, { left: 4, right: 5 });
  assert.deepEqual(normalizedHandlerInput, { left: 4, right: 5 });
  assert.equal(Object.prototype.hasOwnProperty.call(registry.listDefinitions()[0], 'normalizeArguments'), false);

  const normalizationFailureRegistry = new TeemoToolRegistry();
  normalizationFailureRegistry.register(definition({
    normalizeArguments: async () => {
      const error = new Error('normalized safely');
      error.code = 'TEST_NORMALIZATION_FAILED';
      error.teemoSafe = true;
      throw error;
    },
  }));
  const normalizationFailure = await normalizationFailureRegistry.execute('add_numbers', { left: 1, right: 2 });
  assert.equal(normalizationFailure.ok, false);
  assert.equal(normalizationFailure.error.code, 'TEST_NORMALIZATION_FAILED');

  const builtins = TeemoBuiltinTools.createRegistry();
  const echo = await builtins.execute('echo', { text: 'hello' });
  assert.deepEqual(echo.data, { text: 'hello' });
  const runtime = await builtins.execute('get_agent_runtime_info', {}, {
    runId: 'run-2', sessionId: 'session-2', step: 3,
    apiKey: 'must-not-be-exposed', settings: { secret: true },
  });
  assert.deepEqual(runtime.data, {
    runId: 'run-2', sessionId: 'session-2', step: 3, test: true,
  });

  const unknown = await builtins.execute('missing_tool', {});
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_TOOL');

  const failing = new TeemoToolRegistry();
  failing.register(definition({ handler: async () => { throw new Error('sensitive handler detail'); } }));
  const failed = await failing.execute('add_numbers', { left: 1, right: 2 });
  assert.equal(failed.error.code, 'TOOL_HANDLER_FAILED');
  assert.equal(failed.error.message.includes('sensitive handler detail'), false);

  const beforeAbort = new AbortController();
  beforeAbort.abort();
  const abortedBefore = await validationRegistry.execute('add_numbers', { left: 1, right: 2 }, {
    signal: beforeAbort.signal,
  });
  assert.equal(abortedBefore.status, 'cancelled');
  assert.equal(abortedBefore.error.code, 'TOOL_CANCELLED');
  assert.equal(handlerCalls, 0);

  const duringAbort = new AbortController();
  const cancelling = new TeemoToolRegistry();
  cancelling.register(definition({
    handler: async (_args, context) => {
      duringAbort.abort();
      assert.equal(context.signal, duringAbort.signal);
      assert.deepEqual(Object.keys(context).sort(), [
        'permissionPreparation', 'permissionResource', 'runId', 'sessionId', 'signal', 'step',
      ]);
      return { ignored: true };
    },
  }));
  const cancelled = await cancelling.execute('add_numbers', { left: 1, right: 2 }, { signal: duringAbort.signal });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error.code, 'TOOL_CANCELLED');

  const ids = await Promise.all(Array.from({ length: 20 }, () => builtins.execute('echo', { text: 'id' })));
  assert.equal(new Set(ids.map(item => item.toolCallId)).size, ids.length);
  for (const envelope of [success, unknown, failed, cancelled]) {
    assert.equal(typeof envelope.ok, 'boolean');
    assert.equal(typeof envelope.tool, 'string');
    assert.equal(typeof envelope.toolCallId, 'string');
    assert.equal(typeof envelope.status, 'string');
    assert.equal(typeof envelope.startedAt, 'string');
    assert.equal(typeof envelope.finishedAt, 'string');
  }

  console.log('TeemoToolRegistry tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
