const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoLocalFolderService = require('../src/inspiration/TeemoLocalFolderService');
const registerTeemoLocalFolderIpc = require('../src/inspiration/TeemoLocalFolderIpc');
const TeemoEagleLibraryService = require('../src/inspiration/TeemoEagleLibraryService');
const registerTeemoEagleLibraryIpc = require('../src/inspiration/TeemoEagleLibraryIpc');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoEagleLibraryIndexScanner = require('../src/inspiration/TeemoEagleLibraryIndexScanner');
const TeemoInspirationIndexRouter = require('../src/inspiration/TeemoInspirationIndexRouter');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');
const TeemoInspirationRetrievalService = require('../src/inspiration/TeemoInspirationRetrievalService');
const registerTeemoInspirationIndexIpc = require('../src/inspiration/TeemoInspirationIndexIpc');
const registerTeemoInspirationRetrievalIpc = require('../src/inspiration/TeemoInspirationRetrievalIpc');
const packageVersion = require('../package.json').version;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-5-electron-'));
const profile = path.join(root, 'profile'); const dataDir = path.join(root, 'data');
const authorizedRoot = path.join(root, 'authorized'); const library = path.join(authorizedRoot, 'Teemo Eagle UI.library');
const images = path.join(library, 'images'); const item = path.join(images, 'Teemo-banner');
fs.mkdirSync(item, { recursive: true }); fs.mkdirSync(profile, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(item, 'metadata.json'), JSON.stringify({ name: 'banner-eagle', ext: 'png' }));
fs.writeFileSync(path.join(item, 'banner-eagle.png'), PNG);
const sourceBytes = fs.readFileSync(path.join(item, 'banner-eagle.png'));
process.env.TEEMO_ASSISTANT_DATA_DIR = dataDir;
if (typeof app.setVersion === 'function') app.setVersion(packageVersion);
app.setPath('userData', profile); app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService(); let roots = [authorizedRoot];
const permissionResources = [];
const permissionService = new TeemoPermissionService({ decisionProvider: async request => { permissionResources.push(request.resource); return { decision: 'allow', scope: 'once' }; } });
registerTeemoPermissionIpc(ipcMain, permissionService);
const sourceService = new TeemoInspirationSourceService({ dataDir, fileService, rootsProvider: () => roots });
const stateService = new TeemoInspirationService({ dataDir });
const localScanner = new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
const eagleScanner = new TeemoEagleLibraryIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
const router = new TeemoInspirationIndexRouter({ sourceService, localFolderScanner: localScanner, eagleLibraryScanner: eagleScanner });
const indexService = new TeemoInspirationIndexService({ storage: new TeemoInspirationIndexStorage({ dataDir }), scanner: router });
const localService = new TeemoLocalFolderService({ fileService, sourceService, rootsProvider: () => roots });
const eagleService = new TeemoEagleLibraryService({ fileService, sourceService, scanner: eagleScanner });
const retrievalService = new TeemoInspirationRetrievalService({ indexService, sourceService, inspirationStateService: stateService });
registerTeemoInspirationIndexIpc(ipcMain, { indexService, sourceService, permissionService, inspirationStateService: stateService });
registerTeemoInspirationRetrievalIpc(ipcMain, { retrievalService });
registerTeemoLocalFolderIpc(ipcMain, { sourceService, localFolderService: localService, indexService, permissionService, fileService, rootsProvider: () => roots, saveRoots: next => { roots = next; }, selectFolder: async () => authorizedRoot });
registerTeemoEagleLibraryIpc(ipcMain, { sourceService, eagleLibraryService: eagleService, permissionService, fileService, rootsProvider: () => roots, saveRoots: next => { roots = next; }, selectFolder: async () => library });
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [...roots] }));
ipcMain.handle('teemo:local-access-remove', (_event, payload = {}) => { roots = roots.filter(rootPath => rootPath !== String(payload.rootPath || '')); return { ok: true, roots: [...roots] }; });
ipcMain.handle('get-app-version', () => app.getVersion());

async function createWindow() {
  const window = new BrowserWindow({ width: 1480, height: 940, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
  await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  return window;
}

async function run(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = async (check, label) => { const started = Date.now(); while (!check()) { if (Date.now() - started > 7000) throw new Error('Timed out: ' + label); await new Promise(resolve => setTimeout(resolve, 25)); } };
    const get = id => document.getElementById(id);
    get('TeemoInspirationButton').click(); await wait(() => !get('TeemoInspirationView').hidden && get('TeemoInspirationSourceList').textContent.trim(), 'inspiration');
    if (!get('TeemoInspirationEnabled').checked) get('TeemoInspirationEnabled').click();
    await wait(() => get('TeemoInspirationEnabled').checked && !get('TeemoInspirationAddEagleButton').disabled, 'enabled');
    get('TeemoInspirationAddEagleButton').click(); await wait(() => /Teemo Eagle UI\.library/.test(get('TeemoInspirationSourceList').textContent), 'eagle source');
    const source = get('TeemoInspirationSourceList').querySelector('[data-source-id]');
    source.querySelector('[data-source-index="build"]').click(); await wait(() => !get('TeemoInspirationIndexPanel').hidden, 'index');
    get('TeemoInspirationSearchInput').value = 'banner'; get('TeemoInspirationSearchButton').click();
    await wait(() => get('TeemoInspirationSearchResults').querySelectorAll('.teemo-inspiration-search-result').length === 1, 'retrieval');
    get('TeemoInspirationSearchResults').querySelector('.teemo-inspiration-search-result').click();
    await wait(() => Boolean(get('TeemoInspirationPreview').querySelector('img')), 'preview');
    const sourceId = source.dataset.sourceId;
    const forgedToolCallId = 'eagle_smoke_forged_source_kind';
    const forgedAuthorization = await window.teemoInspirationService.accessGuard.authorizeIndexScan(sourceId, {
      toolCallId: forgedToolCallId,
      sourceKind: 'local_folder',
      sessionId: 'eagle-smoke',
    });
    const forged = await require('electron').ipcRenderer.invoke('teemo-inspiration-index:scan', {
      requestId: 'eagle_smoke_forged_request', sourceId, mode: 'refresh',
      toolCallId: forgedAuthorization.toolCallId, runId: forgedAuthorization.runId,
      sessionId: forgedAuthorization.sessionId, sourceKind: 'local_folder',
    });
    return { sourceId, eagleAddVisible: !get('TeemoInspirationAddEagleButton').hidden, sourceText: source.textContent, indexItems: get('TeemoInspirationIndexList').querySelectorAll('.teemo-inspiration-index-item').length, results: get('TeemoInspirationResultCount').textContent, preview: Boolean(get('TeemoInspirationPreview').querySelector('img')), sourceKindTamperRejected: !forged.ok && forged.error && forged.error.code === 'INSPIRATION_PERMISSION_DENIED' };
  })()`);
}

app.whenReady().then(async () => {
  let window;
  try {
    window = await createWindow(); const ui = await run(window);
    if (!ui.eagleAddVisible || !/Eagle-compatible/.test(ui.sourceText) || ui.indexItems !== 1 || !/1 项结果/.test(ui.results) || !ui.preview || !ui.sourceKindTamperRejected) throw new Error(`P3-5 UI smoke assertion failed: ${JSON.stringify(ui)}`);
    const eagleResource = `inspiration://eagle-library/${ui.sourceId}`;
    const forgedResource = `inspiration://local-folder/${ui.sourceId}`;
    if (!permissionResources.includes(eagleResource)
      || permissionResources.some(resource => resource !== eagleResource && resource !== forgedResource)) {
      throw new Error('Eagle Permission resource mismatch');
    }
    if (!fs.readFileSync(path.join(item, 'banner-eagle.png')).equals(sourceBytes)) throw new Error('Eagle source bytes changed');
    if (fs.readdirSync(library).some(name => /index|cache|thumbnail|\.teemo/i.test(name))) throw new Error('Eagle source sidecar created');
    console.log(JSON.stringify({ ok: true, appVersion: app.getVersion(), ui, index: true, retrieval: true, previewReused: true, providerCalls: 0, agentContextChanged: false, sourceBytesUnchanged: true, formalUserDataTouched: false })); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  finally { if (window && !window.isDestroyed()) window.destroy(); }
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} });
