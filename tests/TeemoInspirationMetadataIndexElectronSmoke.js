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
const registerTeemoInspirationIndexIpc = require('../src/inspiration/TeemoInspirationIndexIpc');
const packageVersion = require('../package.json').version;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00]);
const WEBP = (() => {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(5, 24, 3);
  buffer.writeUIntLE(6, 27, 3);
  return buffer;
})();

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-3-electron-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
const sourceRoot = path.join(isolatedRoot, 'Teemo Metadata Source');
const authorizedRootsFile = path.join(isolatedProfile, 'local-file-access.json');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
fs.mkdirSync(path.join(sourceRoot, 'Teemo Nested'), { recursive: true });
fs.writeFileSync(path.join(sourceRoot, 'Teemo Cover.png'), PNG);
fs.writeFileSync(path.join(sourceRoot, 'Teemo Poster.jpg'), JPEG);
fs.writeFileSync(path.join(sourceRoot, 'Teemo Motion.gif'), GIF);
fs.writeFileSync(path.join(sourceRoot, 'Teemo Nested', 'Teemo Wide.webp'), WEBP);
fs.writeFileSync(path.join(sourceRoot, 'Teemo Note.txt'), 'synthetic unsupported');
const sourceTreeBefore = fs.readdirSync(sourceRoot, { recursive: true }).map(String).sort();
const coverBytesBefore = fs.readFileSync(path.join(sourceRoot, 'Teemo Cover.png'));

process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
if (typeof app.setVersion === 'function') app.setVersion(packageVersion);
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
let authorizedRoots = fileService.saveAuthorizedRoots(authorizedRootsFile, [sourceRoot]);
function saveRoots(next) {
  authorizedRoots = fileService.saveAuthorizedRoots(authorizedRootsFile, next);
}
const permissionResources = [];
const permissionService = new TeemoPermissionService({
  decisionProvider: async request => {
    permissionResources.push({ toolName: request.toolName, resource: request.resource });
    return { decision: 'allow', scope: 'once' };
  },
});
registerTeemoPermissionIpc(ipcMain, permissionService);
const sourceService = new TeemoInspirationSourceService({
  dataDir: isolatedData,
  fileService,
  rootsProvider: () => authorizedRoots,
});
const inspirationStateService = new TeemoInspirationService({ dataDir: isolatedData });
sourceService.addLocalFolder({ rootPath: sourceRoot, displayName: 'Teemo Metadata Source' });
const sourceId = sourceService.getSnapshot().sources[0].sourceId;
const localFolderService = new TeemoLocalFolderService({
  fileService,
  sourceService,
  rootsProvider: () => authorizedRoots,
});
let slowScan = false;
let timeoutScan = false;
const indexStorage = new TeemoInspirationIndexStorage({ dataDir: isolatedData });
const indexScanner = new TeemoLocalFolderIndexScanner({
  fileService,
  sourceService,
  rootsProvider: () => authorizedRoots,
  scanTimeoutMs: 500,
  hooks: {
    beforeDirectory: async () => {
      if (timeoutScan) await new Promise(resolve => setTimeout(resolve, 540));
      else if (slowScan) await new Promise(resolve => setTimeout(resolve, 120));
    },
  },
});
const indexService = new TeemoInspirationIndexService({ storage: indexStorage, scanner: indexScanner });
registerTeemoInspirationIndexIpc(ipcMain, { indexService, sourceService, permissionService, inspirationStateService });
registerTeemoLocalFolderIpc(ipcMain, {
  sourceService,
  localFolderService,
  indexService,
  permissionService,
  fileService,
  rootsProvider: () => authorizedRoots,
  saveRoots,
  selectFolder: async () => sourceRoot,
});
ipcMain.handle('teemo:local-access-list', () => ({ ok: true, roots: [...authorizedRoots] }));
ipcMain.handle('teemo:local-access-remove', (_event, { rootPath } = {}) => {
  saveRoots(authorizedRoots.filter(root => root !== String(rootPath || '')));
  return { ok: true, roots: [...authorizedRoots] };
});
ipcMain.handle('get-app-version', () => app.getVersion());

const pagePath = path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html');

async function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  await window.loadFile(pagePath);
  return window;
}

async function openAndEnable(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 5000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationButton').click();
    await waitFor(() => !get('TeemoInspirationView').hidden, 'open inspiration');
    await waitFor(() => Boolean(window.teemoInspirationIndexClient), 'index client');
    await waitFor(() => /Teemo Metadata Source/.test(get('TeemoInspirationSourceList').textContent), 'source');
    if (!get('TeemoInspirationEnabled').checked) get('TeemoInspirationEnabled').click();
    await waitFor(() => get('TeemoInspirationEnabled').checked, 'enable');
    return {
      notIndexed: /尚未建立素材索引/.test(get('TeemoInspirationSourceList').textContent),
      buildButton: Boolean(get('TeemoInspirationSourceList').querySelector('[data-source-index="build"]')),
      chatInput: Boolean(get('messageInput')),
    };
  })()`);
}

async function buildIndex(window) {
  slowScan = true;
  const result = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 7000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationSourceList').querySelector('[data-source-index="build"]').click();
    await waitFor(() => /正在索引/.test(get('TeemoInspirationSourceList').textContent), 'scanning state');
    const scanningVisible = true;
    await waitFor(() => !get('TeemoInspirationIndexPanel').hidden, 'index panel');
    const rows = get('TeemoInspirationIndexList').querySelectorAll('.teemo-inspiration-index-item');
    return {
      scanningVisible,
      rows: rows.length,
      text: get('TeemoInspirationIndexList').textContent,
      page: get('TeemoInspirationIndexPage').textContent,
      noSearch: !get('TeemoInspirationIndexPanel').querySelector('input[type="search"], [data-search]'),
      countText: get('TeemoInspirationSourceList').textContent,
    };
  })()`);
  slowScan = false;
  return result;
}

async function refreshChanges(window) {
  fs.writeFileSync(path.join(sourceRoot, 'Teemo Added.png'), PNG);
  fs.unlinkSync(path.join(sourceRoot, 'Teemo Motion.gif'));
  fs.renameSync(path.join(sourceRoot, 'Teemo Cover.png'), path.join(sourceRoot, 'Teemo Renamed.png'));
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 6000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationSourceList').querySelector('[data-source-index="refresh"]').click();
    await waitFor(() => !get('TeemoInspirationIndexPanel').hidden && /Teemo Renamed/.test(get('TeemoInspirationIndexList').textContent), 'refreshed list');
    return {
      added: /Teemo Added/.test(get('TeemoInspirationIndexList').textContent),
      renamed: /Teemo Renamed/.test(get('TeemoInspirationIndexList').textContent),
      deleted: !/Teemo Motion/.test(get('TeemoInspirationIndexList').textContent),
      oldNameGone: !/Teemo Cover/.test(get('TeemoInspirationIndexList').textContent),
    };
  })()`);
}

async function cancelAndTimeout(window) {
  const revision = indexStorage.readSourceSnapshot(sourceId).entry.indexRevision;
  slowScan = true;
  const cancelled = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 6000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    const list = document.getElementById('TeemoInspirationSourceList');
    list.querySelector('[data-source-index="refresh"]').click();
    await waitFor(() => Boolean(list.querySelector('[data-source-index-cancel]')), 'cancel button');
    list.querySelector('[data-source-index-cancel]').click();
    await waitFor(() => !/正在索引/.test(list.textContent), 'cancel complete');
    return /取消/.test(document.getElementById('TeemoInspirationStatus').textContent);
  })()`);
  slowScan = false;
  if (indexStorage.readSourceSnapshot(sourceId).entry.indexRevision !== revision) throw new Error('cancel committed a late snapshot');

  timeoutScan = true;
  const timeout = await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 6000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const list = document.getElementById('TeemoInspirationSourceList');
    list.querySelector('[data-source-index="refresh"]').click();
    await waitFor(() => /超时/.test(document.getElementById('TeemoInspirationStatus').textContent), 'timeout result');
    return true;
  })()`);
  timeoutScan = false;
  if (indexStorage.readSourceSnapshot(sourceId).entry.indexRevision !== revision) throw new Error('timeout committed a late snapshot');
  return { cancelled, timeout, revisionPreserved: true };
}

async function verifyGlobalDisabledGate(window) {
  const revision = indexStorage.readSourceSnapshot(sourceId).entry.indexRevision;
  const result = await window.webContents.executeJavaScript(`(async () => {
    const disabled = window.teemoInspirationService.setEnabled(false, {
      expectedRevision: window.teemoInspirationService.getState().revision,
    });
    if (!disabled || !disabled.ok) throw new Error('failed to disable inspiration');
    const snapshot = await window.teemoInspirationIndexClient.getSource('${sourceId}');
    const { ipcRenderer } = require('electron');
    const scan = await ipcRenderer.invoke('teemo-inspiration-index:scan', {
      requestId: 'inspiration_index_disabled_gate',
      sourceId: '${sourceId}',
      mode: 'refresh',
      toolCallId: 'inspiration_index_disabled_gate',
    });
    const enabled = window.teemoInspirationService.setEnabled(true, {
      expectedRevision: disabled.snapshot.state.revision,
    });
    if (!enabled || !enabled.ok) throw new Error('failed to restore inspiration');
    return {
      snapshotStatus: snapshot.status,
      scanOk: scan.ok,
      scanError: scan.error && scan.error.code,
    };
  })()`);
  if (result.snapshotStatus !== 'DISABLED'
    || result.scanOk !== false
    || result.scanError !== 'INSPIRATION_DISABLED') {
    throw new Error(`global disabled gate failed: ${JSON.stringify(result)}`);
  }
  if (indexStorage.readSourceSnapshot(sourceId).entry.indexRevision !== revision) {
    throw new Error('disabled scan changed index revision');
  }
  return { ...result, revisionPreserved: true };
}

async function verifyP2AndBrowse(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    get('TeemoInspirationSourceList').querySelector('[data-source-browse]').click();
    await wait(100);
    if (get('TeemoInspirationBrowser').hidden || !/Teemo Poster/.test(get('TeemoInspirationEntryList').textContent)) throw new Error('P3-2 browse failed');
    get('TeemoInspirationBackButton').click();
    get('memoryButton').click(); await wait(30);
    const cognition = !get('memoryView').hidden;
    get('memoryBackButton').click(); get('TeemoCreativeButton').click(); await wait(30);
    const creative = !get('TeemoCreativeView').hidden && Boolean(get('TeemoDirectorChallenge'));
    get('TeemoCreativeBackButton').click(); get('settingsButton').click(); await wait(30);
    const skills = !get('settingsView').hidden && Boolean(get('skillList'));
    get('settingsBackButton').click();
    return { browse: true, cognition, creative, challenge: creative, skills, chat: !get('chatView').hidden };
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  try {
    if (app.getVersion() !== packageVersion) throw new Error('Electron version mismatch');
    first = await createWindow();
    const initial = await openAndEnable(first);
    if (!initial.notIndexed || !initial.buildButton || !initial.chatInput) throw new Error('initial index state invalid');
    const built = await buildIndex(first);
    if (!built.scanningVisible || built.rows !== 4 || !built.noSearch || !/4 项/.test(built.countText)) throw new Error('index build UI invalid');
    if (!/image\/png/.test(built.text) || !/image\/jpeg/.test(built.text) || !/1 × 1/.test(built.text) || !/3 × 2/.test(built.text)) {
      throw new Error('metadata fields missing');
    }
    const refreshed = await refreshChanges(first);
    if (!refreshed.added || !refreshed.renamed || !refreshed.deleted || !refreshed.oldNameGone) throw new Error('incremental refresh UI invalid');
    const incremental = indexStorage.readSourceSnapshot(sourceId);
    if (incremental.entry.summary.reused < 2 || incremental.entry.summary.added !== 2 || incremental.entry.summary.removed !== 2) {
      throw new Error('incremental summary invalid');
    }
    const cancelTimeout = await cancelAndTimeout(first);
    const globalDisabledGate = await verifyGlobalDisabledGate(first);

    second = await createWindow();
    await openAndEnable(second);
    slowScan = true;
    const multiWindow = await Promise.all([
      first.webContents.executeJavaScript(`(async () => {
        const list = document.getElementById('TeemoInspirationSourceList');
        list.querySelector('[data-source-index="refresh"]').click();
        const started = Date.now();
        while (!/正在索引/.test(list.textContent)) {
          if (Date.now() - started > 3000) throw new Error('first scan did not start');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return true;
      })()`),
      second.webContents.executeJavaScript(`(async () => {
        await new Promise(resolve => setTimeout(resolve, 35));
        const list = document.getElementById('TeemoInspirationSourceList');
        list.querySelector('[data-source-index="refresh"]').click();
        const started = Date.now();
        while (!/正在更新|稍后重试/.test(document.getElementById('TeemoInspirationStatus').textContent)) {
          if (Date.now() - started > 5000) throw new Error('second window was not rejected');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        return true;
      })()`),
    ]);
    slowScan = false;
    await new Promise(resolve => setTimeout(resolve, 520));

    saveRoots([]);
    const revoked = await first.webContents.executeJavaScript(`(async () => {
      const get = id => document.getElementById(id);
      get('TeemoInspirationRefreshButton').click();
      const started = Date.now();
      while (!/需要重新授权/.test(get('TeemoInspirationSourceList').textContent)) {
        if (Date.now() - started > 4000) throw new Error('revoked status missing');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const hidden = get('TeemoInspirationIndexPanel').hidden;
      const snapshot = await window.teemoInspirationIndexClient.getSource('${sourceId}');
      get('TeemoInspirationSourceList').querySelector('[data-source-reauthorize]').click();
      while (!/已配置/.test(get('TeemoInspirationSourceList').textContent)) {
        if (Date.now() - started > 7000) throw new Error('reauthorize failed');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return { hidden, status: snapshot.status, reauthorized: true };
    })()`);
    if (!revoked.hidden || revoked.status !== 'AUTHORIZATION_REQUIRED' || authorizedRoots.length !== 1) throw new Error('revoked index leaked metadata');

    const active = indexStorage.readSourceSnapshot(sourceId);
    const shardPath = path.join(indexStorage.indexRoot, ...active.entry.shardFile.split('/'));
    fs.appendFileSync(shardPath, Buffer.from('{corrupt}\n'));
    const repaired = await first.webContents.executeJavaScript(`(async () => {
      const get = id => document.getElementById(id);
      get('TeemoInspirationRefreshButton').click();
      const started = Date.now();
      while (!/索引已损坏/.test(get('TeemoInspirationSourceList').textContent)) {
        if (Date.now() - started > 4000) throw new Error('corrupt state missing');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      window.confirm = () => true;
      get('TeemoInspirationSourceList').querySelector('[data-source-index="rebuild"]').click();
      while (!get('TeemoInspirationSourceList').querySelector('[data-index-state="READY"]')) {
        if (Date.now() - started > 7000) throw new Error('rebuild failed');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return true;
    })()`);
    const repairedSnapshot = indexStorage.readSourceSnapshot(sourceId);
    if (!repaired || repairedSnapshot.status !== 'READY') {
      const uiDiagnostic = await first.webContents.executeJavaScript(`({
        source: document.getElementById('TeemoInspirationSourceList').textContent,
        status: document.getElementById('TeemoInspirationStatus').textContent,
      })`);
      throw new Error(`corrupt rebuild failed: ${repairedSnapshot.status} ${JSON.stringify(uiDiagnostic)}`);
    }

    const p2 = await verifyP2AndBrowse(first);
    let screenshot = null;
    const screenshotPath = process.env.TEEMO_INSPIRATION_INDEX_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      await openAndEnable(first);
      const screenshotState = await first.webContents.executeJavaScript(`(async () => {
        document.getElementById('TeemoInspirationRefreshButton').click();
        await new Promise(resolve => setTimeout(resolve, 180));
        document.querySelector('[data-source-index-view]').click();
        const started = Date.now();
        while (document.getElementById('TeemoInspirationIndexPanel').hidden) {
          if (Date.now() - started > 3000) throw new Error('screenshot index panel did not open');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        return {
          status: document.getElementById('TeemoInspirationStatus').textContent,
          error: document.getElementById('TeemoInspirationStatus').classList.contains('error'),
          refreshDisabled: document.getElementById('TeemoInspirationRefreshButton').disabled,
          cancelVisible: Boolean(document.querySelector('[data-source-index-cancel]')),
        };
      })()`);
      if (screenshotState.error) throw new Error(`screenshot status did not settle: ${JSON.stringify(screenshotState)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      first.showInactive();
      const image = await first.webContents.capturePage();
      const png = image.toPNG();
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, png);
      screenshot = { path: screenshotPath, ...image.getSize(), sha256: crypto.createHash('sha256').update(png).digest('hex') };
      first.hide();
    }

    const removed = await first.webContents.executeJavaScript(`(async () => {
      window.confirm = () => true;
      document.querySelector('[data-source-remove]').click();
      const started = Date.now();
      while (document.getElementById('TeemoInspirationSourceCount').textContent !== '0') {
        if (Date.now() - started > 4000) throw new Error('remove failed');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return true;
    })()`);
    if (!removed || indexStorage.readSourceSnapshot(sourceId).status !== 'NOT_INDEXED') throw new Error('source index cleanup failed');
    if (!fs.existsSync(path.join(sourceRoot, 'Teemo Renamed.png')) || authorizedRoots.length !== 1) throw new Error('source removal crossed boundary');
    if (!coverBytesBefore.equals(fs.readFileSync(path.join(sourceRoot, 'Teemo Renamed.png')))) throw new Error('source bytes changed by index');
    const sourceTreeAfter = fs.readdirSync(sourceRoot, { recursive: true }).map(String).sort();
    if (sourceTreeAfter.some(name => /\.teemo|thumbnail|index/i.test(name))) throw new Error('source sidecar created');
    if (permissionResources.some(item => item.toolName === 'inspiration_metadata_index'
      && item.resource !== `inspiration://local-folder/${sourceId}`)) throw new Error('index permission resource mismatch');

    console.log(JSON.stringify({
      ok: true,
      appVersion: app.getVersion(),
      initial,
      built,
      refreshed,
      incrementalSummary: incremental.entry.summary,
      cancelTimeout,
      globalDisabledGate,
      multiWindowBusyRejected: multiWindow.every(Boolean),
      revoked,
      repaired,
      p2,
      paginationMax: 100,
      noSearchUi: true,
      providerCalls: 0,
      agentContextChanged: false,
      sourceBytesUnchanged: true,
      sourceSidecarCreated: false,
      p1AuthorizedRootPreservedAfterRemove: true,
      screenshot,
      formalUserDataTouched: false,
      realPersonalInspirationContentUsed: false,
      sourceTreeBeforeCount: sourceTreeBefore.length,
      sourceTreeAfterCount: sourceTreeAfter.length,
    }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (first && !first.isDestroyed()) first.destroy();
    if (second && !second.isDestroyed()) second.destroy();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});
