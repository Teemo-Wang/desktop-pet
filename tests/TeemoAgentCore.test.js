const assert = require('node:assert/strict');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoBuiltinTools = require('../src/tools/TeemoBuiltinTools');

function createRegistry(extraDefinitions = []) {
  const registry = TeemoBuiltinTools.createRegistry();
  for (const definition of extraDefinitions) registry.register(definition);
  return registry;
}

function emptyObjectSchema() {
  return { type: 'object', properties: {}, required: [], additionalProperties: false };
}

function sequenceAI(values, options = {}) {
  let index = 0;
  return {
    calls: [],
    async send(messages, opts) {
      this.calls.push({ messages, opts });
      if (options.wait) await options.wait(opts && opts.signal);
      return values[Math.min(index++, values.length - 1)];
    },
  };
}

async function main() {
  {
    const ai = sequenceAI(['普通回答']);
    const result = await new TeemoAgentCore({ aiService: ai }).run({ messages: [{ role: 'user', content: '你好' }] });
    assert.equal(result.ok, true);
    assert.equal(result.content, '普通回答');
    assert.equal(result.run.status, 'completed');
    assert.equal(result.run.step, 1);
  }

  {
    const ai = sequenceAI([
      JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: 'hello' } }),
      JSON.stringify({ type: 'final_response', content: '工具已完成' }),
    ]);
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: createRegistry() }).run({ messages: [{ role: 'user', content: '测试工具' }] });
    assert.equal(result.content, '工具已完成');
    assert.equal(result.run.toolCalls.length, 1);
    assert.equal(ai.calls.length, 2);
    const toolMessage = JSON.parse(ai.calls[1].messages.at(-1).content);
    assert.equal(toolMessage.ok, true);
    assert.equal(toolMessage.tool, 'echo');
    assert.deepEqual(toolMessage.data, { text: 'hello' });
    assert.equal(result.run.toolCalls[0].toolCallId, toolMessage.toolCallId);
  }

  {
    let call = 0;
    const ai = {
      async sendWithTools(messages, options) {
        assert.equal(options.tools.some(tool => tool.function.name === 'echo'), true);
        if (call++ === 0) return {
          type: 'tool_request', tool: 'echo', arguments: { text: 'native' },
          providerMessage: { role: 'assistant', content: null, tool_calls: [{ id: 'call_native', type: 'function', function: { name: 'echo', arguments: '{"text":"native"}' } }] },
          providerToolCallId: 'call_native',
        };
        assert.equal(messages.at(-1).tool_call_id, 'call_native');
        return { type: 'final_response', content: 'native done' };
      },
    };
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: createRegistry() }).runNativeTools({ messages: [{ role: 'user', content: 'native test' }] });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'native done');
    assert.equal(result.run.toolCalls.length, 1);
  }

  {
    const ai = sequenceAI([
      JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: 'one' } }),
      JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: 'two' } }),
      JSON.stringify({ type: 'final_response', content: '完成' }),
    ]);
    const result = await new TeemoAgentCore({ aiService: ai, maxSteps: 3, toolRegistry: createRegistry() }).run({ messages: [] });
    assert.equal(result.run.toolCalls.length, 2);
    assert.equal(result.run.step, 3);
  }

  {
    const ai = sequenceAI([JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: '' } })]);
    const result = await new TeemoAgentCore({ aiService: ai, maxSteps: 1, toolRegistry: createRegistry() }).run({ messages: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'MAX_STEPS');
    assert.equal(result.run.status, 'failed');
  }

  {
    const ai = sequenceAI([JSON.stringify({ type: 'tool_request', tool: 'not_allowed', arguments: {} })]);
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: createRegistry() }).run({ messages: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'UNKNOWN_TOOL');
  }

  {
    const ai = sequenceAI([JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: {} })]);
    const registry = new TeemoToolRegistry();
    registry.register({
      name: 'echo', description: 'Fail safely.', inputSchema: emptyObjectSchema(),
      metadata: { permission: 'none' },
      handler: async () => { throw new Error('boom'); },
    });
    const core = new TeemoAgentCore({ aiService: ai, toolRegistry: registry });
    const result = await core.run({ messages: [] });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'TOOL_HANDLER_FAILED');
  }

  {
    const controller = new AbortController();
    controller.abort();
    const ai = sequenceAI(['never']);
    const result = await new TeemoAgentCore({ aiService: ai }).run({ messages: [], signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'AGENT_CANCELLED');
    assert.equal(result.run.status, 'cancelled');
  }

  {
    const controller = new AbortController();
    const ai = sequenceAI([JSON.stringify({ type: 'tool_request', tool: 'stop_now', arguments: {} })]);
    const registry = new TeemoToolRegistry();
    registry.register({
      name: 'stop_now', description: 'Abort the current test run.', inputSchema: emptyObjectSchema(),
      metadata: { permission: 'none' },
      handler: async () => controller.abort(),
    });
    const core = new TeemoAgentCore({ aiService: ai, toolRegistry: registry });
    const result = await core.run({ messages: [], signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'AGENT_CANCELLED');
  }

  for (const invalidAction of [
    '{}',
    JSON.stringify({ type: 'tool_request', arguments: {} }),
    JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: 'invalid' }),
    JSON.stringify({ type: 'unknown_action', content: 'bad' }),
    '```json\n{"type":"tool_request","tool":""}\n```',
  ]) {
    const ai = sequenceAI([invalidAction]);
    const result = await new TeemoAgentCore({ aiService: ai }).run({ messages: [] });
    assert.equal(result.ok, false, `invalid action should fail: ${invalidAction}`);
    assert.equal(result.error.code, 'INVALID_ACTION');
    assert.equal(result.run.toolCalls.length, 0);
    assert.equal(result.run.status, 'failed');
  }

  {
    const controllerA = new AbortController();
    const aiA = sequenceAI([
      JSON.stringify({ type: 'tool_request', tool: 'wait_for_abort', arguments: {} }),
      JSON.stringify({ type: 'final_response', content: 'A should not finish' }),
    ]);
    const aiB = sequenceAI([
      JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: 'B only' } }),
      JSON.stringify({ type: 'final_response', content: 'B completed' }),
    ]);
    const core = new TeemoAgentCore({
      toolRegistry: createRegistry([{
        name: 'wait_for_abort',
        description: 'Abort one isolated test run.',
        inputSchema: emptyObjectSchema(),
        metadata: { permission: 'none' },
        handler: async (_args, context) => {
          controllerA.abort();
          return { runId: context.runId };
        },
      }]),
    });
    const [runA, runB] = await Promise.all([
      core.run({ aiService: aiA, messages: [{ role: 'user', content: 'A' }], sessionId: 'session-A', signal: controllerA.signal }),
      core.run({ aiService: aiB, messages: [{ role: 'user', content: 'B' }], sessionId: 'session-B' }),
    ]);
    assert.equal(runA.ok, false);
    assert.equal(runA.error.code, 'AGENT_CANCELLED');
    assert.equal(runA.run.sessionId, 'session-A');
    assert.equal(runB.ok, true);
    assert.equal(runB.content, 'B completed');
    assert.equal(runB.run.sessionId, 'session-B');
    assert.equal(runB.run.toolCalls[0].name, 'echo');
    assert.match(runB.run.messages.at(-1).content, /B only/);
    assert.ok(!runB.run.messages.some(message => String(message.content).includes('A should not finish')));
  }

  {
    const responses = [
      JSON.stringify({ type: 'tool_request', tool: 'echo', arguments: { text: 'streamed' } }),
      JSON.stringify({ type: 'final_response', content: '流式闭环完成' }),
    ];
    let index = 0;
    const ai = {
      async stream(messages, onChunk) {
        const response = responses[index++];
        onChunk(response, response);
        return response;
      },
    };
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: createRegistry() }).runStream({ messages: [] });
    assert.equal(result.ok, true);
    assert.equal(result.content, '流式闭环完成');
    assert.equal(result.run.toolCalls[0].name, 'echo');
  }

  assert.deepEqual(TeemoAgentCore.normalizeAction('plain'), { type: 'direct_response', content: 'plain' });
  console.log('TeemoAgentCore tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
