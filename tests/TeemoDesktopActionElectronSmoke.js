const assert = require('node:assert/strict');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const TeemoScreenService = require('../src/runtime/TeemoScreenService');
const registerTeemoScreenIpc = require('../src/runtime/TeemoScreenIpc');
const TeemoDesktopActionService = require('../src/runtime/TeemoDesktopActionService');
const registerTeemoDesktopActionIpc = require('../src/runtime/TeemoDesktopActionIpc');

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
let displays = [{ nativeId: 'synthetic-private-display', x: 50, y: -70, width: 1280, height: 720 }];
const inputCalls = [];

ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [] }));
ipcMain.handle('get-app-version', () => app.getVersion());
const permissionService = new TeemoPermissionService({ timeoutMs: 1000 });
const screenService = new TeemoScreenService({
  displayProvider: { list: async () => displays },
  captureProvider: { capture: async () => ({ png: TEST_PNG, width: 1, height: 1 }) },
  snapshotTtlMs: 5000,
});
const desktopActionService = new TeemoDesktopActionService({
  screenService,
  actionTtlMs: 5000,
  inputAdapter: {
    async clickPrimaryAt(point) {
      inputCalls.push(point);
      return { dispatched: true };
    },
  },
});
registerTeemoPermissionIpc(ipcMain, permissionService);
const desktopActionIpc = registerTeemoDesktopActionIpc(ipcMain, {
  desktopActionService,
  permissionService,
  operationTtlMs: 5000,
});
registerTeemoScreenIpc(ipcMain, {
  screenService,
  permissionService,
  operationTtlMs: 5000,
  onSnapshotDiscarded: (owner, snapshotId) => desktopActionIpc.discardSnapshot(owner, snapshotId),
});

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
  await client.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  await client.webContents.executeJavaScript('Boolean(window.teemoScreenClient && window.teemoDesktopActionClient && window.teemoPermissionClient)');
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

    const uiDenied = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const button = document.getElementById('TeemoRuntimeButton');
      const select = document.getElementById('TeemoRuntimeDisplay');
      const capture = document.getElementById('TeemoRuntimeCaptureButton');
      const preview = document.getElementById('TeemoRuntimePreview');
      const confirm = document.getElementById('TeemoRuntimeConfirmClickButton');
      const summary = document.getElementById('TeemoRuntimePointSummary');
      const status = document.getElementById('TeemoRuntimeStatus');
      window.TeemoPermissionPrompt = { request: async request => request.toolName === 'screen_snapshot'
        ? { decision: 'allow', scope: 'once' }
        : { decision: 'deny', reason: 'user_denied' } };
      button.click();
      for (let i = 0; i < 100 && !select.value; i += 1) await delay(10);
      if (!select.value) throw new Error('runtime display UI was not populated');
      capture.click();
      for (let i = 0; i < 100 && !preview.querySelector('img'); i += 1) await delay(10);
      const image = preview.querySelector('img');
      if (!image) throw new Error('runtime preview was not captured');
      const rect = image.getBoundingClientRect();
      image.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + Math.max(rect.width, 1) / 2, clientY: rect.top + Math.max(rect.height, 1) / 2 }));
      if (confirm.disabled) throw new Error('runtime point selection did not enable confirmation');
      confirm.click();
      for (let i = 0; i < 100 && !status.textContent.includes('未取得本次主键点击权限'); i += 1) await delay(10);
      return {
        runtimeVisible: !document.getElementById('TeemoRuntimeView').hidden,
        summary: summary.textContent,
        denied: status.textContent.includes('未取得本次主键点击权限'),
        previewStillLocal: !!preview.querySelector('img'),
        confirmEnabledAfterSelection: !confirm.disabled,
      };
    })()`);
    assert.equal(uiDenied.runtimeVisible, true);
    assert.match(uiDenied.summary, /横向/);
    assert.equal(uiDenied.denied, true);
    assert.equal(uiDenied.previewStillLocal, true);
    assert.equal(inputCalls.length, 0, 'permission deny must call no input adapter');

    const uiAllowed = await clientA.webContents.executeJavaScript(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const preview = document.getElementById('TeemoRuntimePreview');
      const confirm = document.getElementById('TeemoRuntimeConfirmClickButton');
      const status = document.getElementById('TeemoRuntimeStatus');
      window.TeemoPermissionPrompt = { request: async () => ({ decision: 'allow', scope: 'once' }) };
      confirm.click();
      for (let i = 0; i < 100 && !status.textContent.includes('已发送一次主键点击'); i += 1) await delay(10);
      return { dispatched: status.textContent.includes('已发送一次主键点击'), previewDiscarded: !preview.querySelector('img') };
    })()`);
    assert.deepEqual(uiAllowed, { dispatched: true, previewDiscarded: true });
    assert.equal(inputCalls.length, 1);
    assert.equal(inputCalls[0].x, 690);
    assert.ok(inputCalls[0].y >= -70 && inputCalls[0].y < 650, 'Main Process must resolve a bounded display coordinate');

    const directDisplays = await clientA.webContents.executeJavaScript('window.teemoScreenClient.listDisplays()');
    const freshCapture = await clientA.webContents.executeJavaScript(`(async () => {
      const toolCallId = 'desktop-smoke-screen-capture';
      const prepared = await window.teemoScreenClient.prepare(${js(directDisplays[0].displayRef)}, { toolCallId, sessionId: null });
      const permission = await window.teemoPermissionClient.authorize({ toolCallId, runId: null, sessionId: null, toolName: 'screen_snapshot', permission: 'read', resource: prepared.resource, requiresExecutionAuthorization: true, reason: prepared.reason }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
      const snapshot = await window.teemoScreenClient.execute(prepared.preparation);
      return { snapshotId: snapshot.snapshotId };
    })()`);

    const missingAuthorization = await clientA.webContents.executeJavaScript(`window.teemoDesktopActionClient.prepare(${js(freshCapture.snapshotId)}, { x: 0.2, y: 0.2 }, { toolCallId: 'desktop-smoke-missing-auth' })`);
    const missingAuthorizationResult = await result(clientA, `window.teemoDesktopActionClient.execute(${js(missingAuthorization.preparation)})`);
    assert.equal(missingAuthorizationResult.ok, false);
    assert.equal(missingAuthorizationResult.code, 'PERMISSION_CHECK_FAILED');
    assert.equal(inputCalls.length, 1, 'missing execution authorization must call no input adapter');

    const crossRenderer = await result(clientB, `window.teemoDesktopActionClient.prepare(${js(freshCapture.snapshotId)}, { x: 0.2, y: 0.2 }, { toolCallId: 'desktop-smoke-cross-owner' })`);
    assert.equal(crossRenderer.ok, false);
    assert.equal(crossRenderer.code, 'SCREEN_SNAPSHOT_UNAVAILABLE');

    const discardedAction = await clientA.webContents.executeJavaScript(`(async () => {
      const toolCallId = 'desktop-smoke-discarded';
      const prepared = await window.teemoDesktopActionClient.prepare(${js(freshCapture.snapshotId)}, { x: 0.3, y: 0.3 }, { toolCallId });
      await window.teemoPermissionClient.authorize({ toolCallId, runId: null, sessionId: null, toolName: 'desktop_primary_click', permission: 'execute', resource: prepared.resource, requiresExecutionAuthorization: true, reason: prepared.reason }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
      await window.teemoScreenClient.discard(${js(freshCapture.snapshotId)});
      return prepared.preparation;
    })()`);
    const discardedActionResult = await result(clientA, `window.teemoDesktopActionClient.execute(${js(discardedAction)})`);
    assert.equal(discardedActionResult.ok, false);
    assert.equal(discardedActionResult.code, 'DESKTOP_ACTION_UNAVAILABLE');
    assert.equal(inputCalls.length, 1, 'discarded preview must call no input adapter');

    const changedDisplays = await clientA.webContents.executeJavaScript('window.teemoScreenClient.listDisplays()');
    const changedCapture = await clientA.webContents.executeJavaScript(`(async () => {
      const toolCallId = 'desktop-smoke-changed-screen';
      const prepared = await window.teemoScreenClient.prepare(${js(changedDisplays[0].displayRef)}, { toolCallId, sessionId: null });
      await window.teemoPermissionClient.authorize({ toolCallId, runId: null, sessionId: null, toolName: 'screen_snapshot', permission: 'read', resource: prepared.resource, requiresExecutionAuthorization: true, reason: prepared.reason }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
      const snapshot = await window.teemoScreenClient.execute(prepared.preparation);
      const actionToolCallId = 'desktop-smoke-display-changed';
      const action = await window.teemoDesktopActionClient.prepare(snapshot.snapshotId, { x: 0.4, y: 0.4 }, { toolCallId: actionToolCallId });
      await window.teemoPermissionClient.authorize({ toolCallId: actionToolCallId, runId: null, sessionId: null, toolName: 'desktop_primary_click', permission: 'execute', resource: action.resource, requiresExecutionAuthorization: true, reason: action.reason }, { decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
      return action.preparation;
    })()`);
    displays = [{ nativeId: 'synthetic-private-display', x: 51, y: -70, width: 1280, height: 720 }];
    const changedResult = await result(clientA, `window.teemoDesktopActionClient.execute(${js(changedCapture)})`);
    assert.equal(changedResult.ok, false);
    assert.equal(changedResult.code, 'DESKTOP_ACTION_DISPLAY_CHANGED');
    assert.equal(inputCalls.length, 1, 'display mismatch must call no input adapter');

    const boundaryChecks = await clientA.webContents.executeJavaScript(`({
      desktopActionInChatRegistry: window.teemoToolRegistry.list().includes('desktop_primary_click'),
      directNativeInput: /koffi|user32|mouse_event|SetCursorPos/.test(String(window.TeemoDesktopActionClient)),
      screenDataInDesktopClient: /desktopCapturer|getDisplayMedia/.test(String(window.TeemoDesktopActionClient)),
      ordinaryChatHasShell: window.teemoToolRegistry.list().includes('controlled_execute'),
    })`);
    assert.deepEqual(boundaryChecks, {
      desktopActionInChatRegistry: false,
      directNativeInput: false,
      screenDataInDesktopClient: false,
      ordinaryChatHasShell: false,
    });

    console.log(JSON.stringify({
      marker: 'TEEMO_DESKTOP_ACTION_ELECTRON_SMOKE_PASS',
      assertions: 28,
      fakeInputCalls: inputCalls.length,
      permissionAuditEvents: permissionService.listAudit().length,
      providerCallsForDesktopAction: 0,
      realDisplayCapture: false,
      realOsInput: false,
      rendererDirectInput: false,
      pendingDesktopOperations: desktopActionIpc.operations.size,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_DESKTOP_ACTION_ELECTRON_SMOKE_FAIL', error);
    if (clientA && !clientA.isDestroyed()) clientA.destroy();
    if (clientB && !clientB.isDestroyed()) clientB.destroy();
    app.exit(1);
  }
});
