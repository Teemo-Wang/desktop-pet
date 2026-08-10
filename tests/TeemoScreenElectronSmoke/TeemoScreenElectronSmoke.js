const assert = require('node:assert/strict');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoPermissionService = require('../../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../../src/permissions/TeemoPermissionIpc');
const TeemoScreenService = require('../../src/runtime/TeemoScreenService');
const registerTeemoScreenIpc = require('../../src/runtime/TeemoScreenIpc');

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
let captureCalls = 0;
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [] }));
ipcMain.handle('get-app-version', () => app.getVersion());
const permissionService = new TeemoPermissionService({ timeoutMs: 1000 });
const screenService = new TeemoScreenService({
  displayProvider: { list: async () => [{ nativeId: 'synthetic-private-display', width: 1280, height: 720 }] },
  captureProvider: {
    capture: async nativeId => {
      captureCalls += 1;
      assert.equal(nativeId, 'synthetic-private-display');
      return { png: TEST_PNG, width: 1, height: 1 };
    },
  },
  snapshotTtlMs: 1000,
});
registerTeemoPermissionIpc(ipcMain, permissionService);
const screenIpc = registerTeemoScreenIpc(ipcMain, { screenService, permissionService, operationTtlMs: 1000 });

function js(value) {
  return JSON.stringify(value);
}

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
}

async function loadClient(client) {
  await client.loadFile(path.join(__dirname, '..', '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  await client.webContents.executeJavaScript('Boolean(window.teemoScreenClient && window.teemoPermissionClient)');
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

    const uiResult = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const button = document.getElementById('TeemoRuntimeButton');
      const select = document.getElementById('TeemoRuntimeDisplay');
      const capture = document.getElementById('TeemoRuntimeCaptureButton');
      const discard = document.getElementById('TeemoRuntimeDiscardButton');
      const preview = document.getElementById('TeemoRuntimePreview');
      const status = document.getElementById('TeemoRuntimeStatus');
      button.click();
      for (let i = 0; i < 100 && !select.value; i += 1) await delay(10);
      if (!select.value) throw new Error('runtime display UI was not populated');
      window.TeemoPermissionPrompt = { request: async () => ({ decision: 'deny', reason: 'user_denied' }) };
      capture.click();
      for (let i = 0; i < 100 && !status.classList.contains('error'); i += 1) await delay(10);
      const denied = { error: status.classList.contains('error'), preview: !!preview.querySelector('img') };
      window.TeemoPermissionPrompt = { request: async () => ({ decision: 'allow', scope: 'once' }) };
      capture.click();
      for (let i = 0; i < 100 && !preview.querySelector('img'); i += 1) await delay(10);
      const allowed = { preview: !!preview.querySelector('img'), status: status.textContent };
      discard.click();
      for (let i = 0; i < 100 && preview.querySelector('img'); i += 1) await delay(10);
      const registry = window.teemoToolRegistry.list();
      return {
        runtimeVisible: !document.getElementById('TeemoRuntimeView').hidden,
        displayLabels: Array.from(select.options).map(item => item.textContent),
        denied,
        allowed,
        discarded: !preview.querySelector('img'),
        ordinaryChatExposesScreenTool: registry.includes('screen_snapshot'),
        clientUsesDirectCapture: /desktopCapturer|getDisplayMedia/.test(String(window.TeemoScreenClient)),
      };
    })()`);
    assert.equal(uiResult.runtimeVisible, true);
    assert.deepEqual(uiResult.displayLabels, ['显示器 1']);
    assert.deepEqual(uiResult.denied, { error: true, preview: false });
    assert.deepEqual(uiResult.allowed, { preview: true, status: '本地预览已获取，未发送给模型。' });
    assert.equal(uiResult.discarded, true);
    assert.equal(uiResult.ordinaryChatExposesScreenTool, false);
    assert.equal(uiResult.clientUsesDirectCapture, false);
    assert.equal(captureCalls, 1, 'denied permission must not call the capture provider');

    const displays = await clientA.webContents.executeJavaScript('window.teemoScreenClient.listDisplays()');
    assert.equal(displays.length, 1);
    assert.equal(JSON.stringify(displays).includes('synthetic-private-display'), false);

    const missingAuth = await clientA.webContents.executeJavaScript(`window.teemoScreenClient.prepare(${js(displays[0].displayRef)}, { toolCallId: 'screen_smoke_missing_auth', sessionId: null })`);
    const missingAuthResult = await result(clientA, `window.teemoScreenClient.execute(${js(missingAuth.preparation)})`);
    assert.equal(missingAuthResult.ok, false);
    assert.equal(missingAuthResult.code, 'PERMISSION_CHECK_FAILED');
    assert.equal(captureCalls, 1, 'missing execution authorization must not call the capture provider');

    const prepared = await clientA.webContents.executeJavaScript(`(async () => {
      const toolCallId = 'screen_smoke_allowed';
      const prepared = await window.teemoScreenClient.prepare(${js(displays[0].displayRef)}, { toolCallId, sessionId: null });
      const permission = await window.teemoPermissionClient.authorize({ toolCallId, runId: null, sessionId: null, toolName: 'screen_snapshot', permission: 'read', resource: prepared.resource, requiresExecutionAuthorization: true, reason: prepared.reason }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
      return { prepared, permission };
    })()`);
    assert.equal(prepared.permission.decision, 'allow');
    const snapshot = await clientA.webContents.executeJavaScript(`window.teemoScreenClient.execute(${js(prepared.prepared.preparation)})`);
    assert.equal(captureCalls, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'dataUrl'), false);
    const preview = await clientA.webContents.executeJavaScript(`window.teemoScreenClient.getPreview(${js(snapshot.snapshotId)})`);
    assert.match(preview.dataUrl, /^data:image\/png;base64,/);

    const crossRendererPreview = await result(clientB, `window.teemoScreenClient.getPreview(${js(snapshot.snapshotId)})`);
    assert.equal(crossRendererPreview.ok, false);
    assert.equal(crossRendererPreview.code, 'SCREEN_SNAPSHOT_UNAVAILABLE');
    const crossRendererPrepare = await result(clientB, `window.teemoScreenClient.prepare(${js(displays[0].displayRef)}, { toolCallId: 'screen_smoke_cross_renderer', sessionId: null })`);
    assert.equal(crossRendererPrepare.ok, false);
    assert.equal(crossRendererPrepare.code, 'SCREEN_REFERENCE_INVALID');

    assert.equal(await clientA.webContents.executeJavaScript(`window.teemoScreenClient.discard(${js(snapshot.snapshotId)})`), true);
    const discardedPreview = await result(clientA, `window.teemoScreenClient.getPreview(${js(snapshot.snapshotId)})`);
    assert.equal(discardedPreview.ok, false);
    assert.equal(discardedPreview.code, 'SCREEN_SNAPSHOT_UNAVAILABLE');

    console.log(JSON.stringify({
      marker: 'TEEMO_SCREEN_ELECTRON_SMOKE_PASS',
      assertions: 25,
      captureCalls,
      permissionAuditEvents: permissionService.listAudit().length,
      providerCallsForScreenData: 0,
      realDisplayCapture: false,
      rendererDirectCapture: false,
      pendingOperations: screenIpc.operations.size,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_SCREEN_ELECTRON_SMOKE_FAIL', error);
    if (clientA && !clientA.isDestroyed()) clientA.destroy();
    if (clientB && !clientB.isDestroyed()) clientB.destroy();
    app.exit(1);
  }
});
