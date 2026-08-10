const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const TeemoComfyWorkflowService = require('../src/runtime/TeemoComfyWorkflowService');
const registerTeemoComfyWorkflowIpc = require('../src/runtime/TeemoComfyWorkflowIpc');

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p4-3-smoke-'));
process.env.TEEMO_ASSISTANT_DATA_DIR = profileDir;
let transportCalls = 0;
let staticWorkflow = null;

ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [] }));
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('teemo-screen:list', () => ({ ok: true, displays: [] }));
const permissionService = new TeemoPermissionService({ timeoutMs: 1000 });
const workflowService = new TeemoComfyWorkflowService({
  transport: {
    async render(input) {
      transportCalls += 1;
      staticWorkflow = JSON.parse(JSON.stringify(input.workflow));
      return { png: Buffer.from(TEST_PNG) };
    },
  },
  ttlMs: 5000,
  previewTtlMs: 5000,
});
registerTeemoPermissionIpc(ipcMain, permissionService);
const workflowIpc = registerTeemoComfyWorkflowIpc(ipcMain, { workflowService, permissionService, operationTtlMs: 5000 });

function js(value) { return JSON.stringify(value); }

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
}

async function loadClient(client) {
  await client.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  const available = await client.webContents.executeJavaScript('Boolean(window.teemoComfyWorkflowClient && window.teemoPermissionClient)');
  assert.equal(available, true);
}

async function result(client, expression) {
  return client.webContents.executeJavaScript(`Promise.resolve(${expression}).then(value => ({ ok: true, value }), error => ({ ok: false, code: error && error.code, message: error && error.message }))`);
}

app.whenReady().then(async () => {
  let clientA;
  let clientB;
  try {
    clientA = createClient();
    clientB = createClient();
    await Promise.all([loadClient(clientA), loadClient(clientB)]);

    const denied = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const button = document.getElementById('TeemoRuntimeButton');
      const prompt = document.getElementById('TeemoRuntimeComfyPrompt');
      const render = document.getElementById('TeemoRuntimeComfyRenderButton');
      const status = document.getElementById('TeemoRuntimeComfyStatus');
      button.click();
      prompt.value = 'synthetic local poster';
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      window.TeemoPermissionPrompt = { request: async () => ({ decision: 'deny', reason: 'user_denied' }) };
      render.click();
      for (let i = 0; i < 100 && !status.textContent.includes('未取得本次本地渲染权限'); i += 1) await delay(10);
      return { runtimeVisible: !document.getElementById('TeemoRuntimeView').hidden, denied: status.textContent.includes('未取得本次本地渲染权限'), preview: !!document.getElementById('TeemoRuntimeComfyPreview').querySelector('img') };
    })()`);
    assert.deepEqual(denied, { runtimeVisible: true, denied: true, preview: false });
    assert.equal(transportCalls, 0, 'permission deny makes no local transport call');

    const allowed = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const prompt = document.getElementById('TeemoRuntimeComfyPrompt');
      const render = document.getElementById('TeemoRuntimeComfyRenderButton');
      const status = document.getElementById('TeemoRuntimeComfyStatus');
      const preview = document.getElementById('TeemoRuntimeComfyPreview');
      prompt.value = 'synthetic geometric poster';
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      window.TeemoPermissionPrompt = { request: async () => ({ decision: 'allow', scope: 'once' }) };
      render.click();
      for (let i = 0; i < 100 && !preview.querySelector('img'); i += 1) await delay(10);
      return { preview: !!preview.querySelector('img'), completed: status.textContent.includes('本地渲染已完成') };
    })()`);
    assert.deepEqual(allowed, { preview: true, completed: true });
    assert.equal(transportCalls, 1);
    assert.equal(staticWorkflow['2'].inputs.text, 'synthetic geometric poster');
    assert.deepEqual(staticWorkflow['4'].inputs, { width: 1024, height: 1024, batch_size: 1 });
    assert.equal(staticWorkflow['1'].inputs.ckpt_name, TeemoComfyWorkflowService.CHECKPOINT);
    assert.equal(JSON.stringify(staticWorkflow).includes('http://'), false, 'Main builds a static graph with no renderer endpoint');

    const previewId = Array.from(workflowService.previews.keys())[0];
    assert.ok(previewId, 'permitted render creates one owner-bound preview');
    const crossOwner = await result(clientB, `window.teemoComfyWorkflowClient.getPreview(${js(previewId)})`);
    assert.equal(crossOwner.ok, false);
    assert.equal(crossOwner.code, 'COMFYUI_PREVIEW_UNAVAILABLE');

    const missingPreparation = await clientA.webContents.executeJavaScript(`window.teemoComfyWorkflowClient.prepare({ prompt: 'synthetic missing authorization', width: 512, height: 512 }, { toolCallId: 'comfy-smoke-missing-authorization' })`);
    const missingAuthorization = await result(clientA, `window.teemoComfyWorkflowClient.execute(${js(missingPreparation.preparation)})`);
    assert.equal(missingAuthorization.ok, false);
    assert.equal(missingAuthorization.code, 'PERMISSION_CHECK_FAILED');
    assert.equal(transportCalls, 1, 'missing one-shot authorization makes no transport call');

    const invalid = await result(clientA, "window.teemoComfyWorkflowClient.prepare({ prompt: '', width: 512, height: 512 }, { toolCallId: 'comfy-smoke-invalid' })");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, 'COMFYUI_RENDER_INVALID');
    assert.equal(transportCalls, 1, 'invalid renderer input makes no transport call');

    const boundaries = await clientA.webContents.executeJavaScript(`({
      clientAvailable: !!window.TeemoComfyWorkflowClient,
      clientHasDirectFetch: /fetch\\s*\\(|http:\\/\\//.test(String(window.TeemoComfyWorkflowClient)),
      chatToolExposed: window.teemoToolRegistry.list().includes('comfyui_builtin_render'),
      chatShellExposed: window.teemoToolRegistry.list().includes('controlled_execute'),
      uiHasEndpointControl: Array.from(document.getElementById('TeemoRuntimeView').querySelectorAll('input, select, textarea, button')).some(node => /endpoint|workflow/i.test(String(node.id || '') + ' ' + String(node.name || ''))),
      uiHasModelControl: Array.from(document.getElementById('TeemoRuntimeView').querySelectorAll('input, select, textarea, button')).some(node => /model|path/i.test(String(node.id || '') + ' ' + String(node.name || ''))),
    })`);
    assert.deepEqual(boundaries, {
      clientAvailable: true,
      clientHasDirectFetch: false,
      chatToolExposed: false,
      chatShellExposed: false,
      uiHasEndpointControl: false,
      uiHasModelControl: false,
    });
    const comfyAudit = permissionService.listAudit().filter(item => item.toolName === 'comfyui_builtin_render');
    assert.equal(comfyAudit.length, 2);
    assert.deepEqual(comfyAudit.map(item => item.decision), ['deny', 'allow']);
    assert.equal(comfyAudit[1].scope, 'once');
    assert.equal(permissionService.listGrants().length, 0);

    const discarded = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const discard = document.getElementById('TeemoRuntimeComfyDiscardButton');
      const preview = document.getElementById('TeemoRuntimeComfyPreview');
      discard.click();
      for (let i = 0; i < 100 && preview.querySelector('img'); i += 1) await delay(10);
      return !preview.querySelector('img');
    })()`);
    assert.equal(discarded, true);
    assert.equal(workflowService.previews.size, 0, 'discard clears Main-memory preview bytes');
    const stalePreview = await result(clientA, `window.teemoComfyWorkflowClient.getPreview(${js(previewId)})`);
    assert.equal(stalePreview.ok, false);
    assert.equal(stalePreview.code, 'COMFYUI_PREVIEW_UNAVAILABLE');
    assert.equal(workflowIpc.operations.size, 0);

    console.log(JSON.stringify({
      marker: 'TEEMO_COMFY_WORKFLOW_ELECTRON_SMOKE_PASS',
      assertions: 29,
      fakeTransportCalls: transportCalls,
      permissionAuditEvents: permissionService.listAudit().length,
      providerCallsForWorkflow: 0,
      realComfyUiOrGpu: false,
      rendererDirectLocalNetwork: false,
      formalUserProfileUsed: false,
    }));
    clientA.destroy();
    clientB.destroy();
    fs.rmSync(profileDir, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_COMFY_WORKFLOW_ELECTRON_SMOKE_FAIL', error);
    if (clientA && !clientA.isDestroyed()) clientA.destroy();
    if (clientB && !clientB.isDestroyed()) clientB.destroy();
    fs.rmSync(profileDir, { recursive: true, force: true });
    app.exit(1);
    return;
  }
});
