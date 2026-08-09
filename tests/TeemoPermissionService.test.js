const assert = require('node:assert/strict');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const TeemoPermissionClient = require('../src/permissions/TeemoPermissionClient');
const TeemoToolRegistry = require('../src/tools/TeemoToolRegistry');
const TeemoAgentCore = require('../src/agent/TeemoAgentCore');

function permissionRequest(overrides = {}) {
  return {
    toolCallId: 'tool-call-1',
    runId: 'run-1',
    sessionId: 'session-A',
    toolName: 'test_write_action',
    permission: 'write',
    resource: 'teemo-test://project-a/root',
    reason: 'Verify a harmless mock action.',
    ...overrides,
  };
}

function registerMock(registry, options = {}) {
  const calls = options.calls || { count: 0 };
  registry.register({
    name: options.name || 'test_write_action',
    description: 'Run a harmless in-memory permission test.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    metadata: {
      category: 'test',
      permission: options.permission || 'write',
      resource: options.resource === undefined ? 'teemo-test://project-a/root' : options.resource,
      permissionReason: 'Verify a harmless mock action.',
      sideEffect: 'mock_only',
    },
    handler: async () => {
      calls.count += 1;
      return { mock: true, calls: calls.count };
    },
  });
  return calls;
}

async function main() {
  {
    const service = new TeemoPermissionService();
    const fileRequest = permissionRequest({ resource: 'file:///D:/Teemo/project/file.txt' });
    assert.equal(service.evaluate(fileRequest).decision, 'prompt');
    assert.ok(service.grant(fileRequest, { scope: 'resource' }));
    assert.equal(service.evaluate(permissionRequest({
      toolCallId: 'file-child', resource: 'file:///D:/Teemo/project/file.txt/child',
    })).decision, 'allow');
    assert.equal(service.evaluate(permissionRequest({
      toolCallId: 'file-prefix', resource: 'file:///D:/Teemo/project/file.txt-other',
    })).decision, 'prompt');
    assert.equal(service.evaluate(permissionRequest({
      toolCallId: 'file-unc', resource: 'file://server/share/file.txt',
    })).decision, 'deny');
  }

  {
    const service = new TeemoPermissionService();
    assert.deepEqual(
      service.evaluate(permissionRequest({ permission: 'none' })),
      { decision: 'allow', source: 'none_required' },
    );
    for (const permission of ['read', 'write', 'execute']) {
      const result = service.evaluate(permissionRequest({ permission }));
      assert.equal(result.decision, 'prompt');
      assert.equal(result.permission, permission);
    }
    assert.equal(service.evaluate(permissionRequest({ permission: 'invalid' })).decision, 'deny');
  }

  {
    let prompts = 0;
    const service = new TeemoPermissionService({
      decisionProvider: async request => {
        prompts += 1;
        assert.equal(Object.isFrozen(request), true);
        return { decision: 'allow', scope: 'once' };
      },
    });
    const registry = new TeemoToolRegistry({ permissionService: service });
    const calls = registerMock(registry);
    const first = await registry.execute('test_write_action', {}, { runId: 'run-1', sessionId: 'session-A', step: 1 });
    const second = await registry.execute('test_write_action', {}, { runId: 'run-2', sessionId: 'session-A', step: 1 });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(calls.count, 2);
    assert.equal(prompts, 2, 'allow once must prompt again for a new toolCallId');
    assert.equal(service.listGrants().length, 0);
  }

  {
    let prompts = 0;
    const service = new TeemoPermissionService({
      decisionProvider: async () => { prompts += 1; return { decision: 'allow', scope: 'session' }; },
    });
    const registry = new TeemoToolRegistry({ permissionService: service });
    registerMock(registry);
    assert.equal((await registry.execute('test_write_action', {}, { sessionId: 'session-A' })).ok, true);
    assert.equal((await registry.execute('test_write_action', {}, { sessionId: 'session-A' })).ok, true);
    assert.equal(prompts, 1, 'matching session grant must be shared by later calls');
    const otherSession = service.evaluate(permissionRequest({ toolCallId: 'other', sessionId: 'session-B' }));
    assert.equal(otherSession.decision, 'prompt');
    assert.equal(service.listGrants({ sessionId: 'session-A' }).length, 1);
    assert.equal(service.clearSessionGrants('session-A'), 1);
    assert.equal(service.listGrants().length, 0);
  }

  {
    const service = new TeemoPermissionService();
    const request = permissionRequest({ resource: 'teemo-test://project-a/root' });
    const grant = service.grant(request, { scope: 'resource' });
    assert.ok(grant && grant.grantId);
    assert.equal(service.evaluate(permissionRequest({ toolCallId: 'child', resource: 'teemo-test://project-a/root/file' })).decision, 'allow');
    assert.equal(service.evaluate(permissionRequest({ toolCallId: 'sibling', resource: 'teemo-test://project-b/root' })).decision, 'prompt');
    assert.equal(service.evaluate(permissionRequest({ toolCallId: 'prefix', resource: 'teemo-test://project-a/rooted' })).decision, 'prompt');
    assert.equal(service.revoke(grant.grantId), true);
    assert.equal(service.evaluate(permissionRequest({ toolCallId: 'after-revoke' })).decision, 'prompt');
  }

  {
    const service = new TeemoPermissionService({
      decisionProvider: async () => ({ decision: 'deny', reason: 'user_denied' }),
    });
    const registry = new TeemoToolRegistry({ permissionService: service });
    const calls = registerMock(registry);
    const denied = await registry.execute('test_write_action', {}, { sessionId: 'session-A' });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, 'PERMISSION_DENIED');
    assert.equal(calls.count, 0);
  }

  {
    const service = new TeemoPermissionService({ timeoutMs: 5000 });
    const registry = new TeemoToolRegistry({ permissionService: service });
    const calls = registerMock(registry);
    const controller = new AbortController();
    let promptedRequest;
    let releasePrompt;
    const prompted = new Promise(resolve => { releasePrompt = resolve; });
    const execution = registry.execute('test_write_action', {}, {
      sessionId: 'session-A',
      signal: controller.signal,
      onPermissionWaiting: request => { promptedRequest = request; releasePrompt(); },
    });
    await prompted;
    controller.abort();
    const cancelled = await execution;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.error.code, 'TOOL_CANCELLED');
    assert.equal(calls.count, 0);
    assert.equal(service.respond(promptedRequest.permissionRequestId, { decision: 'allow', scope: 'once' }), false);
    assert.equal(calls.count, 0, 'late allow must never execute a cancelled tool');
  }

  {
    const service = new TeemoPermissionService({ timeoutMs: 15 });
    const registry = new TeemoToolRegistry({ permissionService: service });
    const calls = registerMock(registry);
    const timedOut = await registry.execute('test_write_action', {}, { sessionId: 'session-A' });
    assert.equal(timedOut.error.code, 'PERMISSION_TIMEOUT');
    assert.equal(calls.count, 0);
  }

  {
    const brokenService = { async authorize() { throw new Error('private failure'); } };
    const highRegistry = new TeemoToolRegistry({ permissionService: brokenService });
    const highCalls = registerMock(highRegistry);
    const high = await highRegistry.execute('test_write_action', {});
    assert.equal(high.error.code, 'PERMISSION_CHECK_FAILED');
    assert.equal(highCalls.count, 0);

    const noneRegistry = new TeemoToolRegistry({ permissionService: brokenService });
    const noneCalls = registerMock(noneRegistry, { name: 'test_none_action', permission: 'none', resource: null });
    const none = await noneRegistry.execute('test_none_action', {});
    assert.equal(none.ok, true);
    assert.equal(noneCalls.count, 1);

    const missingRegistry = new TeemoToolRegistry();
    let missingCalls = 0;
    missingRegistry.register({
      name: 'test_missing_permission', description: 'Fail closed.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      metadata: { category: 'test' },
      handler: async () => { missingCalls += 1; },
    });
    const missing = await missingRegistry.execute('test_missing_permission', {});
    assert.equal(missing.error.code, 'PERMISSION_CHECK_FAILED');
    assert.equal(missingCalls, 0);
  }

  {
    const sharedService = new TeemoPermissionService({
      decisionProvider: async () => ({ decision: 'allow', scope: 'session' }),
    });
    const clientA = new TeemoToolRegistry({ permissionService: sharedService });
    const clientB = new TeemoToolRegistry({ permissionService: sharedService });
    registerMock(clientA);
    registerMock(clientB);
    assert.equal((await clientA.execute('test_write_action', {}, { sessionId: 'shared-session' })).ok, true);
    assert.equal((await clientB.execute('test_write_action', {}, { sessionId: 'shared-session' })).ok, true);
    assert.equal(sharedService.listGrants({ sessionId: 'shared-session' }).length, 1);
    assert.equal(sharedService.evaluate(permissionRequest({ toolCallId: 'isolated', sessionId: 'other-session' })).decision, 'prompt');
  }

  {
    const handlers = new Map();
    const fakeIpcMain = { handle(channel, handler) { handlers.set(channel, handler); } };
    const service = new TeemoPermissionService({ timeoutMs: 1000 });
    registerTeemoPermissionIpc(fakeIpcMain, service);
    let promptPayload;
    const senderA = { id: 101, isDestroyed: () => false, send: (_channel, payload) => { promptPayload = payload; } };
    const senderB = { id: 202, isDestroyed: () => false, send: () => {} };
    const requestPromise = handlers.get(TeemoPermissionClient.CHANNELS.request)(
      { sender: senderA }, permissionRequest({ toolCallId: 'owned-call' }),
    );
    await Promise.resolve();
    assert.ok(promptPayload && promptPayload.permissionRequestId);
    const foreignResponse = handlers.get(TeemoPermissionClient.CHANNELS.respond)({ sender: senderB }, {
      permissionRequestId: promptPayload.permissionRequestId,
      response: { decision: 'allow', scope: 'session' },
    });
    assert.equal(foreignResponse, false, 'another renderer must not resolve this request');
    const ownerResponse = handlers.get(TeemoPermissionClient.CHANNELS.respond)({ sender: senderA }, {
      permissionRequestId: promptPayload.permissionRequestId,
      response: { decision: 'allow', scope: 'session' },
    });
    assert.equal(ownerResponse, true);
    assert.equal((await requestPromise).decision, 'allow');
  }

  {
    const service = new TeemoPermissionService();
    let publicRequest;
    const pending = service.requestPermission({
      ...permissionRequest(),
      apiKey: 'sk-sensitive-value',
      token: 'sensitive-token',
      password: 'sensitive-password',
      arguments: { content: 'private file contents' },
    }, { onPrompt: request => { publicRequest = request; } });
    assert.ok(publicRequest);
    assert.equal(JSON.stringify(publicRequest).includes('sensitive'), false);
    service.deny(publicRequest.permissionRequestId);
    await pending;
    const auditJson = JSON.stringify(service.listAudit());
    assert.equal(auditJson.includes('sensitive'), false);
    assert.equal(auditJson.includes('private file contents'), false);
    assert.deepEqual(Object.keys(service.listAudit()[0]).sort(), [
      'createdAt', 'decision', 'permission', 'permissionRequestId', 'resolvedAt',
      'runId', 'scope', 'sessionId', 'toolCallId', 'toolName',
    ]);
  }

  {
    const service = new TeemoPermissionService({
      decisionProvider: async () => ({ decision: 'allow', scope: 'once' }),
    });
    const registry = new TeemoToolRegistry({ permissionService: service });
    registerMock(registry);
    let index = 0;
    const responses = [
      JSON.stringify({ type: 'tool_request', tool: 'test_write_action', arguments: {} }),
      JSON.stringify({ type: 'final_response', content: 'permission flow complete' }),
    ];
    const statuses = [];
    const ai = { async send() { return responses[index++]; } };
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: registry }).run({
      messages: [], sessionId: 'agent-session', onStatus: status => statuses.push(status),
    });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'permission flow complete');
    assert.ok(statuses.some(status => status.includes('等待 Tool 权限')));
    assert.equal(result.run.toolCalls[0].status, 'completed');
  }

  {
    const service = new TeemoPermissionService({
      decisionProvider: async () => ({ decision: 'deny', reason: 'user_denied' }),
    });
    const registry = new TeemoToolRegistry({ permissionService: service });
    const calls = registerMock(registry);
    let aiCalls = 0;
    const ai = {
      async send() {
        aiCalls += 1;
        return JSON.stringify({ type: 'tool_request', tool: 'test_write_action', arguments: {} });
      },
    };
    const result = await new TeemoAgentCore({ aiService: ai, toolRegistry: registry }).run({
      messages: [], sessionId: 'denied-agent-session',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PERMISSION_DENIED');
    assert.equal(result.run.toolCalls[0].error.code, 'PERMISSION_DENIED');
    assert.equal(calls.count, 0);
    assert.equal(aiCalls, 1, 'denied calls cannot retry inside the failed run');
  }

  console.log('TeemoPermissionService tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
