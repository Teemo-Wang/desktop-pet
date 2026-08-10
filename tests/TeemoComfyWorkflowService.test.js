const assert = require('node:assert/strict');
const TeemoComfyWorkflowService = require('../src/runtime/TeemoComfyWorkflowService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function expectCode(action, code) {
  try {
    await action();
  } catch (error) {
    assert.equal(error && error.code, code);
    return;
  }
  assert.fail(`Expected ${code} rejection.`);
}

function request(toolCallId) {
  return {
    toolCallId,
    runId: null,
    sessionId: null,
    toolName: 'comfyui_builtin_render',
    permission: 'execute',
    resource: TeemoComfyWorkflowService.RESOURCE,
    requiresExecutionAuthorization: true,
  };
}

function fakeResponse(bytes, options = {}) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return {
    ok: options.ok !== false,
    headers: { get: name => String(name).toLowerCase() === 'content-length' ? String(data.length) : null },
    async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); },
  };
}

async function run() {
  let now = 1000;
  const calls = [];
  let block = false;
  const transport = {
    async render(input) {
      calls.push({ workflow: input.workflow, adapterId: input.adapterId });
      if (block) {
        await new Promise((resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'COMFYUI_CANCELLED', teemoSafe: true })), { once: true });
        });
      }
      return { png: Buffer.from(TEST_PNG) };
    },
  };
  const service = new TeemoComfyWorkflowService({ transport, now: () => now, ttlMs: 100, previewTtlMs: 100 });
  const permissionService = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });

  const permission = await permissionService.requestPermission(request('comfy-node-success'));
  assert.equal(permission.decision, 'allow');
  assert.equal(permission.scope, 'once');
  assert.equal(permissionService.listGrants().length, 0, 'fixed ComfyUI renders cannot create persistent grants');
  assert.equal(permissionService.consumeExecutionAuthorization(request('comfy-node-success')), true);
  assert.equal(permissionService.consumeExecutionAuthorization(request('comfy-node-success')), false, 'execution authorization is one-shot');
  assert.equal(permissionService.grant(request('comfy-node-session'), { scope: 'session' }), null, 'session grants are rejected');
  assert.equal(permissionService.grant(request('comfy-node-resource'), { scope: 'resource' }), null, 'resource grants are rejected');

  const prepared = service.prepare('webcontents_1', { prompt: 'synthetic geometric poster', width: 1024, height: 768, endpoint: 'http://invalid.example' });
  assert.equal(prepared.resource, TeemoComfyWorkflowService.RESOURCE);
  assert.equal(prepared.resource.includes('synthetic geometric poster'), false);
  const completed = await service.execute('webcontents_1', prepared.actionId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].adapterId, TeemoComfyWorkflowService.ADAPTER_ID);
  assert.equal(calls[0].workflow['2'].inputs.text, 'synthetic geometric poster');
  assert.deepEqual(calls[0].workflow['4'].inputs, { width: 1024, height: 768, batch_size: 1 });
  assert.equal(calls[0].workflow['1'].inputs.ckpt_name, TeemoComfyWorkflowService.CHECKPOINT);
  assert.equal(calls[0].workflow['5'].inputs.steps, 26);
  assert.equal(calls[0].workflow['7'].inputs.filename_prefix, 'Teemo_P4_3');
  assert.equal(JSON.stringify(calls[0].workflow).includes('invalid.example'), false, 'Renderer extras cannot reach the static workflow');

  const preview = service.getPreview('webcontents_1', completed.previewId);
  assert.match(preview.dataUrl, /^data:image\/png;base64,/);
  await expectCode(() => Promise.resolve(service.getPreview('webcontents_2', completed.previewId)), 'COMFYUI_PREVIEW_UNAVAILABLE');
  assert.equal(service.discard('webcontents_1', completed.previewId), true);
  await expectCode(() => Promise.resolve(service.getPreview('webcontents_1', completed.previewId)), 'COMFYUI_PREVIEW_UNAVAILABLE');

  const crossOwner = service.prepare('webcontents_1', { prompt: 'synthetic cross owner', width: 512, height: 512 });
  await expectCode(() => service.execute('webcontents_2', crossOwner.actionId), 'COMFYUI_RENDER_UNAVAILABLE');
  assert.equal(service.cancel('webcontents_1', crossOwner.actionId), true);
  await expectCode(() => service.execute('webcontents_1', crossOwner.actionId), 'COMFYUI_RENDER_UNAVAILABLE');
  assert.equal(calls.length, 1, 'stale or cross-owner actions make no transport call');

  await expectCode(() => Promise.resolve(service.prepare('webcontents_1', { prompt: '', width: 512, height: 512 })), 'COMFYUI_RENDER_INVALID');
  await expectCode(() => Promise.resolve(service.prepare('webcontents_1', { prompt: 'synthetic', width: 513, height: 512 })), 'COMFYUI_RENDER_INVALID');
  await expectCode(() => Promise.resolve(service.prepare('webcontents_1', { prompt: 'x'.repeat(1201), width: 512, height: 512 })), 'COMFYUI_RENDER_INVALID');
  assert.equal(calls.length, 1, 'invalid input makes no transport call');

  const expired = service.prepare('webcontents_1', { prompt: 'synthetic expiry', width: 512, height: 512 });
  now += 101;
  await expectCode(() => service.execute('webcontents_1', expired.actionId), 'COMFYUI_RENDER_UNAVAILABLE');
  assert.equal(calls.length, 1, 'expired actions make no transport call');

  now += 1;
  block = true;
  const cancellable = service.prepare('webcontents_1', { prompt: 'synthetic cancellation', width: 512, height: 512 });
  const running = service.execute('webcontents_1', cancellable.actionId);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.cancel('webcontents_1', cancellable.actionId), true);
  await expectCode(() => running, 'COMFYUI_CANCELLED');
  assert.equal(service.previews.size, 0, 'cancelled renders retain no preview');
  block = false;

  const invalidService = new TeemoComfyWorkflowService({ transport: { async render() { return { png: Buffer.from('not-a-png') }; } } });
  const invalid = invalidService.prepare('webcontents_3', { prompt: 'synthetic invalid result', width: 512, height: 512 });
  await expectCode(() => invalidService.execute('webcontents_3', invalid.actionId), 'COMFYUI_RESULT_INVALID');
  assert.equal(invalidService.previews.size, 0, 'malformed results retain no preview');

  const fetchCalls = [];
  const responses = [
    fakeResponse(JSON.stringify({ prompt_id: 'synthetic_prompt_1' })),
    fakeResponse(JSON.stringify({ synthetic_prompt_1: { outputs: { '7': { images: [{ filename: 'synthetic.png', subfolder: '', type: 'output' }] } } } })),
    fakeResponse(TEST_PNG),
  ];
  const loopback = new TeemoComfyWorkflowService.TeemoComfyLoopbackTransport({
    requestTimeoutMs: 1000,
    timeoutMs: 1000,
    fetch: async (url, options) => {
      fetchCalls.push({ url, method: options.method, redirect: options.redirect, hasSignal: !!options.signal });
      return responses.shift();
    },
  });
  const loopbackResult = await loopback.render({ workflow: TeemoComfyWorkflowService.buildWorkflow({ prompt: 'synthetic', width: 512, height: 512 }), signal: new AbortController().signal });
  assert.deepEqual(loopbackResult.png, TEST_PNG);
  assert.deepEqual(fetchCalls.map(item => item.url), [
    'http://127.0.0.1:8188/prompt',
    'http://127.0.0.1:8188/history/synthetic_prompt_1',
    'http://127.0.0.1:8188/view?filename=synthetic.png&type=output',
  ]);
  assert.ok(fetchCalls.every(item => item.redirect === 'error' && item.hasSignal), 'all local requests reject redirects and have an abort signal');

  const malformedResponses = [
    fakeResponse(JSON.stringify({ prompt_id: 'synthetic_prompt_2' })),
    fakeResponse(JSON.stringify({ synthetic_prompt_2: { outputs: { '7': { images: [{ filename: 'synthetic.png', subfolder: '', type: 'output' }] } } } })),
    fakeResponse(Buffer.from('not-a-png')),
  ];
  const malformedTransport = new TeemoComfyWorkflowService.TeemoComfyLoopbackTransport({
    requestTimeoutMs: 1000,
    timeoutMs: 1000,
    fetch: async () => malformedResponses.shift(),
  });
  await expectCode(() => malformedTransport.render({ workflow: {}, signal: new AbortController().signal }), 'COMFYUI_RESULT_INVALID');

  console.log(JSON.stringify({
    marker: 'TEEMO_COMFY_WORKFLOW_SERVICE_TEST_PASS',
    assertions: 38,
    fakeTransportCalls: calls.length,
    fakeLoopbackRequests: fetchCalls.length,
    providerCallsForWorkflow: 0,
    realComfyUiOrGpu: false,
    filesystemCalls: 0,
  }));
}

run().catch(error => {
  console.error('TEEMO_COMFY_WORKFLOW_SERVICE_TEST_FAIL', error);
  process.exitCode = 1;
});
