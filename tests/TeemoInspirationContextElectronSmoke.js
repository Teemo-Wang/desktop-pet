const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoInspirationService = require('../src/inspiration/TeemoInspirationService');
const TeemoInspirationIndexStorage = require('../src/inspiration/TeemoInspirationIndexStorage');
const TeemoLocalFolderIndexScanner = require('../src/inspiration/TeemoLocalFolderIndexScanner');
const TeemoInspirationIndexService = require('../src/inspiration/TeemoInspirationIndexService');
const TeemoInspirationRetrievalService = require('../src/inspiration/TeemoInspirationRetrievalService');
const registerTeemoInspirationRetrievalIpc = require('../src/inspiration/TeemoInspirationRetrievalIpc');
const packageVersion = require('../package.json').version;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-6-electron-'));
const profile = path.join(root, 'profile');
const dataDir = path.join(root, 'data');
const sourceRoot = path.join(root, 'Teemo P3-6 Source');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(sourceRoot, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = dataDir;
if (typeof app.setVersion === 'function') app.setVersion(packageVersion);
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
let roots = [sourceRoot];
const sourceService = new TeemoInspirationSourceService({ dataDir, fileService, rootsProvider: () => roots });
sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo P3-6 Source' });
const source = sourceService.getSnapshot().sources[0];
const stateService = new TeemoInspirationService({ dataDir });
stateService.setEnabled(true);
const storage = new TeemoInspirationIndexStorage({ dataDir });
const scanner = new TeemoLocalFolderIndexScanner({ fileService, sourceService, rootsProvider: () => roots });
const indexService = new TeemoInspirationIndexService({ storage, scanner });
const pathKey = TeemoInspirationIndexStorage.pathKeyFor('card/hero-inspiration.png');
const item = {
  schemaVersion: TeemoInspirationIndexStorage.SCHEMA_VERSION,
  itemId: TeemoInspirationIndexStorage.itemIdFor('local_folder', source.sourceId, pathKey),
  sourceKind: 'local_folder', sourceId: source.sourceId, relativePath: 'card/hero-inspiration.png', pathKey,
  name: 'hero-inspiration.png', extension: '.png', mime: 'image/png', sizeBytes: 68, mtimeNs: '100', ctimeNs: '100', width: 1200, height: 800,
  metadataFingerprint: '', observedAt: '2026-08-10T00:00:00.000Z',
};
item.metadataFingerprint = TeemoInspirationIndexStorage.metadataFingerprintFor(item);
storage.commitSourceSnapshot({ sourceId: source.sourceId, sourceRegistryRevision: 1, mode: 'full', items: [item], summary: { directories: 1, entriesInspected: 1, indexed: 1, reused: 0, updated: 0, added: 1, removed: 0, skippedUnsupported: 0, skippedInvalid: 0, skippedTooLarge: 0, skippedLink: 0 } }, { expectedManifestRevision: 0, expectedIndexRevision: 0 });
const retrievalService = new TeemoInspirationRetrievalService({ indexService, sourceService, inspirationStateService: stateService });
registerTeemoInspirationRetrievalIpc(ipcMain, { retrievalService });
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [] }));
ipcMain.handle('get-app-version', () => app.getVersion());

async function createWindow() {
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } });
  await window.loadFile(path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html'));
  return window;
}

async function run(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const Builder = window.TeemoInspirationContextBuilder;
    const Client = window.TeemoInspirationRetrievalClient;
    const Core = window.TeemoAgentCore;
    const builder = new Builder({ retrievalClient: new Client({ ipcRenderer: require('electron').ipcRenderer }) });
    const seen = [];
    const registry = { listDefinitions: () => [] };
    const agent = new Core({ aiService: { sendWithTools: async messages => { seen.push(messages); return { type: 'final_response', content: 'ok' }; } }, toolRegistry: registry, inspirationContextBuilder: builder });
    const explicit = await agent.runNativeTools({ messages: [{ role: 'user', content: '请找 hero inspiration 灵感参考' }], userMessage: '请找 hero inspiration 灵感参考' });
    const generic = await agent.runNativeTools({ messages: [{ role: 'user', content: '请分析这个页面排版' }], userMessage: '请分析这个页面排版' });
    const context = explicit.run.inspirationContext && explicit.run.inspirationContext.systemMessage && explicit.run.inspirationContext.systemMessage.content || '';
    return {
      explicitStatus: explicit.run.inspirationContext && explicit.run.inspirationContext.status,
      explicitItems: explicit.run.inspirationContext && explicit.run.inspirationContext.items.length,
      genericStatus: generic.run.inspirationContext && generic.run.inspirationContext.status,
      providerContext: context,
      noAbsolutePath: !/[A-Za-z]:\\\\|\\\\\\\\/.test(context),
      providerMessages: seen.map(messages => messages.map(message => message.content || '').join('\\n')),
      chatTools: window.teemoToolRegistry.list().sort(),
    };
  })()`);
}

app.whenReady().then(async () => {
  let window;
  try {
    window = await createWindow();
    const initial = await run(window);
    if (initial.explicitStatus !== 'READY' || initial.explicitItems !== 1 || initial.genericStatus !== 'BYPASS' || !initial.noAbsolutePath
      || !/Teemo Inspiration/.test(initial.providerContext) || initial.providerMessages.some(message => message.includes(sourceRoot))
      || initial.chatTools.includes('git_status') || initial.chatTools.some(name => /^execute_/.test(name))) throw new Error(`P3-6 initial smoke failed: ${JSON.stringify(initial)}`);
    stateService.setEnabled(false);
    const disabled = await window.webContents.executeJavaScript(`(async () => {
      const builder = new window.TeemoInspirationContextBuilder({ retrievalClient: new window.TeemoInspirationRetrievalClient({ ipcRenderer: require('electron').ipcRenderer }) });
      return builder.build({ userMessage: '请找 hero 灵感参考' });
    })()`);
    roots = [];
    stateService.setEnabled(true);
    const revoked = await window.webContents.executeJavaScript(`(async () => {
      const builder = new window.TeemoInspirationContextBuilder({ retrievalClient: new window.TeemoInspirationRetrievalClient({ ipcRenderer: require('electron').ipcRenderer }) });
      return builder.build({ userMessage: '请找 hero 灵感参考' });
    })()`);
    if (disabled.status !== 'DISABLED' || disabled.systemMessage || revoked.status !== 'AUTHORIZATION_REQUIRED' || revoked.systemMessage) {
      throw new Error(`P3-6 fail-closed smoke failed: ${JSON.stringify({ disabled, revoked })}`);
    }
    console.log(JSON.stringify({ ok: true, appVersion: app.getVersion(), explicit: initial, disabledFailClosed: true, revokedFailClosed: true, providerCalls: 0, sourceBytesToProvider: false, formalUserDataTouched: false }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});
app.on('window-all-closed', () => {});
app.on('will-quit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} });
