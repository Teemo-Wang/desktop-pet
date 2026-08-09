const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoFileService = require('../../src/services/TeemoFileService');
const TeemoPermissionService = require('../../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../../src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('../../src/tools/file/TeemoFileToolIpc');

const dataDir = path.resolve(process.env.TEEMO_ASSISTANT_DATA_DIR || path.join(__dirname, '.Teemo-smoke-data'));
const authorizedRoot = path.join(dataDir, 'Teemo-authorized-root');
fs.mkdirSync(authorizedRoot, { recursive: true });
const sourcePath = path.join(authorizedRoot, 'source.txt');
fs.writeFileSync(sourcePath, 'before needle\n', 'utf8');

const providerCalls = new Map();
const permissionService = new TeemoPermissionService({
  timeoutMs: 1000,
  decisionProvider: async request => {
    const count = (providerCalls.get(request.toolName) || 0) + 1;
    providerCalls.set(request.toolName, count);
    if (request.toolName === 'read_file') return { decision: 'allow', scope: 'session' };
    if (request.toolName === 'create_file' || request.toolName === 'patch_file') return { decision: 'allow', scope: 'once' };
    if (request.toolName === 'search_files') {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { decision: 'allow', scope: 'once' };
    }
    return { decision: 'deny', reason: 'user_denied' };
  },
});
const fileService = new TeemoFileService();
registerTeemoPermissionIpc(ipcMain, permissionService);
registerTeemoFileToolIpc(ipcMain, fileService, {
  rootsProvider: () => [authorizedRoot],
  permissionService,
});

function createClient() {
  return new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false },
  });
}

async function loadClient(window) {
  await window.loadFile(path.join(__dirname, 'TeemoFileToolsElectronSmoke.html'));
  await window.webContents.executeJavaScript('window.TeemoFileToolsSmokeReady');
}

function js(value) { return JSON.stringify(value); }

app.whenReady().then(async () => {
  const clientA = createClient();
  const clientB = createClient();
  try {
    await Promise.all([loadClient(clientA), loadClient(clientB)]);

    const readA = await clientA.webContents.executeJavaScript(`window.runFileTool('read_file', ${js({ path: sourcePath })})`);
    const readB = await clientB.webContents.executeJavaScript(`window.runFileTool('read_file', ${js({ path: sourcePath })})`);
    assert.equal(readA.ok, true, JSON.stringify(readA));
    assert.equal(readB.ok, true, JSON.stringify(readB));
    assert.equal(providerCalls.get('read_file'), 1, 'both renderers must share the central session grant');

    const denied = await clientB.webContents.executeJavaScript(`window.runFileTool('list_directory', ${js({ path: authorizedRoot })})`);
    assert.equal(denied.error.code, 'PERMISSION_DENIED');

    const createdPath = path.join(authorizedRoot, 'Teemo-electron-created.md');
    const created = await clientA.webContents.executeJavaScript(`window.runFileTool('create_file', ${js({ path: createdPath, content: '# Electron smoke\n' })})`);
    assert.equal(created.ok, true);
    assert.equal(fs.readFileSync(createdPath, 'utf8'), '# Electron smoke\n');

    const expectedSha256 = crypto.createHash('sha256').update('before needle\n').digest('hex');
    const patched = await clientB.webContents.executeJavaScript(`window.runFileTool('patch_file', ${js({
      path: sourcePath,
      expectedSha256,
      edits: [{ oldText: 'before', newText: 'after' }],
    })})`);
    assert.equal(patched.ok, true);
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'after needle\n');

    const aborted = await clientA.webContents.executeJavaScript(`window.runAbortedFileTool('search_files', ${js({ path: authorizedRoot, query: 'source' })})`);
    assert.equal(aborted.error.code, 'TOOL_CANCELLED');

    console.log(JSON.stringify({
      marker: 'TEEMO_FILE_TOOLS_ELECTRON_SMOKE_PASS',
      definitionsA: await clientA.webContents.executeJavaScript('window.TeemoFileTools.createDefinitions({fileClient:{prepare(){},execute(){}}}).map(item => item.name)'),
      definitionsB: await clientB.webContents.executeJavaScript('window.TeemoFileTools.createDefinitions({fileClient:{prepare(){},execute(){}}}).map(item => item.name)'),
      providerCalls: Object.fromEntries(providerCalls),
      auditEvents: permissionService.listAudit().length,
    }));
    app.exit(0);
  } catch (error) {
    console.error('TEEMO_FILE_TOOLS_ELECTRON_SMOKE_FAIL', error);
    app.exit(1);
  }
});
