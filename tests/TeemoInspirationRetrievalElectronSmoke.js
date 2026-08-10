const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
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
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');
const TeemoInspirationRetrievalService = require('../src/inspiration/TeemoInspirationRetrievalService');
const registerTeemoInspirationIndexIpc = require('../src/inspiration/TeemoInspirationIndexIpc');
const registerTeemoInspirationRetrievalIpc = require('../src/inspiration/TeemoInspirationRetrievalIpc');
const packageVersion = require('../package.json').version;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-4-electron-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
const sourceRoot = path.join(isolatedRoot, 'Teemo Retrieval Source');
const authorizedRootsFile = path.join(isolatedProfile, 'local-file-access.json');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
fs.mkdirSync(sourceRoot, { recursive: true });
fs.writeFileSync(path.join(sourceRoot, 'banner-blue.png'), PNG);
fs.writeFileSync(path.join(sourceRoot, 'banner-red.jpg'), JPEG);
fs.writeFileSync(path.join(sourceRoot, 'icon-square.png'), PNG);
const sourceBytesBefore = fs.readFileSync(path.join(sourceRoot, 'banner-blue.png'));

process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
if (typeof app.setVersion === 'function') app.setVersion(packageVersion);
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
let authorizedRoots = fileService.saveAuthorizedRoots(authorizedRootsFile, [sourceRoot]);
function saveRoots(next) { authorizedRoots = fileService.saveAuthorizedRoots(authorizedRootsFile, next); }
const permissionService = new TeemoPermissionService({ decisionProvider: async () => ({ decision: 'allow', scope: 'once' }) });
registerTeemoPermissionIpc(ipcMain, permissionService);
const sourceService = new TeemoInspirationSourceService({ dataDir: isolatedData, fileService, rootsProvider: () => authorizedRoots });
sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Retrieval Source' });
const sourceId = sourceService.getSnapshot().sources[0].sourceId;
const inspirationStateService = new TeemoInspirationService({ dataDir: isolatedData });
const localFolderService = new TeemoLocalFolderService({ fileService, sourceService, rootsProvider: () => authorizedRoots });
const indexStorage = new TeemoInspirationIndexStorage({ dataDir: isolatedData });
const indexService = new TeemoInspirationIndexService({
  storage: indexStorage,
  scanner: new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => authorizedRoots }),
});
const retrievalService = new TeemoInspirationRetrievalService({ indexService, sourceService, inspirationStateService });
registerTeemoInspirationIndexIpc(ipcMain, { indexService, permissionService, inspirationStateService });
registerTeemoInspirationRetrievalIpc(ipcMain, { retrievalService });
registerTeemoLocalFolderIpc(ipcMain, {
  sourceService, localFolderService, indexService, permissionService, fileService,
  rootsProvider: () => authorizedRoots, saveRoots, selectFolder: async () => sourceRoot,
});
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [...authorizedRoots] }));
ipcMain.handle('teemo:local-access-remove', (_event, { rootPath } = {}) => {
  saveRoots(authorizedRoots.filter(root => root !== String(rootPath || '')));
  return { ok: true, roots: [...authorizedRoots] };
});
ipcMain.handle('get-app-version', () => app.getVersion());

async function createWindow() {
  const window = new BrowserWindow({
    width: 1480, height: 940, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  return window;
}

async function runSmoke(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 7000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationButton').click();
    await waitFor(() => !get('TeemoInspirationView').hidden, 'open inspiration');
    await waitFor(() => /Teemo Retrieval Source/.test(get('TeemoInspirationSourceList').textContent), 'source visible');
    if (!get('TeemoInspirationEnabled').checked) get('TeemoInspirationEnabled').click();
    await waitFor(() => get('TeemoInspirationEnabled').checked, 'enable inspiration');
    get('TeemoInspirationSourceList').querySelector('[data-source-index="build"]').click();
    await waitFor(() => !get('TeemoInspirationIndexPanel').hidden, 'index build');
    const metadataView = get('TeemoInspirationIndexList').querySelectorAll('.teemo-inspiration-index-item').length === 3;
    get('TeemoInspirationSearchInput').value = 'banner';
    get('TeemoInspirationSearchFormat').value = 'png';
    get('TeemoInspirationSearchButton').click();
    await waitFor(() => get('TeemoInspirationSearchResults').querySelectorAll('.teemo-inspiration-search-result').length === 1, 'search result');
    const result = get('TeemoInspirationSearchResults').querySelector('.teemo-inspiration-search-result');
    const resultText = result.textContent;
    result.click();
    await waitFor(() => !get('TeemoInspirationBrowser').hidden, 'preview container');
    await waitFor(() => Boolean(get('TeemoInspirationPreview').querySelector('img')), 'existing preview');
    return {
      retrievalVisible: !get('TeemoInspirationRetrieval').hidden,
      metadataView,
      resultCount: get('TeemoInspirationResultCount').textContent,
      resultText,
      preview: Boolean(get('TeemoInspirationPreview').querySelector('img')),
      indexSearchUntouched: !get('TeemoInspirationIndexPanel').querySelector('input[type="search"], [data-search]'),
    };
  })()`);
}

app.whenReady().then(async () => {
  let window;
  try {
    if (app.getVersion() !== packageVersion) throw new Error('Electron version mismatch');
    window = await createWindow();
    const ui = await runSmoke(window);
    if (!ui.retrievalVisible || !ui.metadataView || !/1 项结果/.test(ui.resultCount) || !/banner-blue\.png/.test(ui.resultText)
      || !ui.preview || !ui.indexSearchUntouched) throw new Error(`P3-4 UI smoke assertion failed: ${JSON.stringify(ui)}`);
    if (!fs.readFileSync(path.join(sourceRoot, 'banner-blue.png')).equals(sourceBytesBefore)) throw new Error('source bytes changed');
    if (fs.readdirSync(sourceRoot).some(name => /index|cache|thumbnail|\.teemo/i.test(name))) throw new Error('source sidecar created');
    let screenshot = null;
    const screenshotPath = process.env.TEEMO_INSPIRATION_RETRIEVAL_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      window.showInactive();
      await new Promise(resolve => setTimeout(resolve, 80));
      const image = await window.webContents.capturePage();
      const png = image.toPNG();
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, png);
      screenshot = { path: screenshotPath, ...image.getSize(), sha256: crypto.createHash('sha256').update(png).digest('hex') };
      window.hide();
    }
    console.log(JSON.stringify({
      ok: true, appVersion: app.getVersion(), ui, previewReused: true, p3_3Build: true,
      providerCalls: 0, agentContextChanged: false, sourceBytesUnchanged: true, formalUserDataTouched: false, screenshot,
    }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});
