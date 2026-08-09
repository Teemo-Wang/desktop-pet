const assert = require('node:assert/strict');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoPermissionService = require('../../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../../src/permissions/TeemoPermissionIpc');

const providerCalls = new Map();
const service = new TeemoPermissionService({
  timeoutMs: 1000,
  decisionProvider: async request => {
    const count = (providerCalls.get(request.toolName) || 0) + 1;
    providerCalls.set(request.toolName, count);
    if (request.toolName === 'test_session_action') return { decision: 'allow', scope: 'session' };
    if (request.toolName === 'test_once_action') {
      return count === 1
        ? { decision: 'allow', scope: 'once' }
        : { decision: 'deny', reason: 'user_denied' };
    }
    if (request.toolName === 'test_abort_action') {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { decision: 'allow', scope: 'once' };
    }
    return { decision: 'deny', reason: 'user_denied' };
  },
});
registerTeemoPermissionIpc(ipcMain, service);

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false },
  });
}

async function loadClient(window) {
  await window.loadFile(path.join(__dirname, 'TeemoPermissionElectronSmoke.html'));
  await window.webContents.executeJavaScript('window.teemoPermissionSmokeReady');
}

app.whenReady().then(async () => {
  const clientA = createClient();
  const clientB = createClient();
  try {
    await Promise.all([loadClient(clientA), loadClient(clientB)]);

    const none = await clientA.webContents.executeJavaScript("window.runTool('test_none_action','shared-session')");
    assert.equal(none.result.ok, true);
    assert.equal(providerCalls.get('test_none_action') || 0, 0);

    const sessionA = await clientA.webContents.executeJavaScript("window.runTool('test_session_action','shared-session')");
    const sessionB = await clientB.webContents.executeJavaScript("window.runTool('test_session_action','shared-session')");
    assert.equal(sessionA.result.ok, true);
    assert.equal(sessionB.result.ok, true);
    assert.equal(providerCalls.get('test_session_action'), 1, 'two renderers must share the Main grant');

    const onceFirst = await clientA.webContents.executeJavaScript("window.runTool('test_once_action','once-session')");
    const onceSecond = await clientA.webContents.executeJavaScript("window.runTool('test_once_action','once-session')");
    assert.equal(onceFirst.result.ok, true);
    assert.equal(onceSecond.result.error.code, 'PERMISSION_DENIED');
    assert.equal(onceSecond.calls, 1);

    const denied = await clientB.webContents.executeJavaScript("window.runTool('test_deny_action','deny-session')");
    assert.equal(denied.result.error.code, 'PERMISSION_DENIED');
    assert.equal(denied.calls, 0);

    const aborted = await clientB.webContents.executeJavaScript("window.runAbortTool('abort-session')");
    assert.equal(aborted.result.error.code, 'TOOL_CANCELLED');
    assert.equal(aborted.calls, 0);

    console.log(JSON.stringify({
      marker: 'TEEMO_PERMISSION_ELECTRON_SMOKE_PASS',
      sharedGrantCount: service.listGrants({ sessionId: 'shared-session' }).length,
      providerCalls: Object.fromEntries(providerCalls),
      auditEvents: service.listAudit().length,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_PERMISSION_ELECTRON_SMOKE_FAIL', error);
    app.exit(1);
  }
});
