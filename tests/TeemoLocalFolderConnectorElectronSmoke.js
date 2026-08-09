const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TeemoFileService = require('../src/services/TeemoFileService');
const TeemoPermissionService = require('../src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('../src/permissions/TeemoPermissionIpc');
const TeemoInspirationSourceService = require('../src/inspiration/TeemoInspirationSourceService');
const TeemoLocalFolderService = require('../src/inspiration/TeemoLocalFolderService');
const registerTeemoLocalFolderIpc = require('../src/inspiration/TeemoLocalFolderIpc');
const packageVersion = require('../package.json').version;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-p3-2-electron-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
const sourceRoot = path.join(isolatedRoot, 'Teemo Synthetic Source');
const outsideRoot = path.join(isolatedRoot, 'outside');
const authorizedRootsFile = path.join(isolatedProfile, 'local-file-access.json');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
fs.mkdirSync(path.join(sourceRoot, 'Teemo Subfolder'), { recursive: true });
fs.mkdirSync(outsideRoot, { recursive: true });
fs.writeFileSync(path.join(sourceRoot, 'Teemo Cover.png'), PNG);
fs.writeFileSync(path.join(sourceRoot, 'Teemo Note.txt'), 'synthetic local folder smoke');
fs.writeFileSync(path.join(sourceRoot, 'Teemo Subfolder', 'Teemo Inner.png'), PNG);
fs.writeFileSync(path.join(outsideRoot, 'Teemo Outside.png'), PNG);
const sourceBytesBefore = fs.readFileSync(path.join(sourceRoot, 'Teemo Cover.png'));

let linkSupported = true;
let linkReason = null;
try {
  fs.symlinkSync(outsideRoot, path.join(sourceRoot, 'Teemo Outside Link'), process.platform === 'win32' ? 'junction' : 'dir');
} catch (error) {
  linkSupported = false;
  linkReason = error.code || error.message;
}

process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
if (typeof app.setVersion === 'function') app.setVersion(packageVersion);
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const fileService = new TeemoFileService();
let authorizedRoots = [];
function saveRoots(next) {
  authorizedRoots = fileService.saveAuthorizedRoots(authorizedRootsFile, next);
}
const permissionResources = [];
const permissionService = new TeemoPermissionService({
  decisionProvider: async request => {
    permissionResources.push(request.resource);
    return { decision: 'allow', scope: 'once' };
  },
});
registerTeemoPermissionIpc(ipcMain, permissionService);
const sourceService = new TeemoInspirationSourceService({
  dataDir: isolatedData,
  fileService,
  rootsProvider: () => authorizedRoots,
});
const localFolderService = new TeemoLocalFolderService({
  fileService,
  sourceService,
  rootsProvider: () => authorizedRoots,
});
registerTeemoLocalFolderIpc(ipcMain, {
  sourceService,
  localFolderService,
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
    width: 1400,
    height: 900,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  await window.loadFile(pagePath);
  return window;
}

async function openInspiration(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 3000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationButton').click();
    await waitFor(() => !get('TeemoInspirationView').hidden, 'open Inspiration');
    await waitFor(() => Boolean(window.teemoInspirationService && window.teemoLocalFolderClient), 'services ready');
    await new Promise(resolve => setTimeout(resolve, 120));
    return {
      enabled: get('TeemoInspirationEnabled').checked,
      count: get('TeemoInspirationSourceCount').textContent,
      chatInput: Boolean(get('messageInput')),
      localConnector: window.teemoInspirationRegistry.listDefinitions().some(item => item.connectorId === 'local-folder'),
    };
  })()`);
}

async function verifyP2Navigation(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    get('TeemoInspirationBackButton').click();
    await wait(20);
    if (get('chatView').hidden || !get('messageInput')) throw new Error('chat did not recover');
    get('memoryButton').click();
    await wait(30);
    if (get('memoryView').hidden) throw new Error('Cognition UI failed');
    get('memoryBackButton').click();
    get('TeemoCreativeButton').click();
    await wait(30);
    if (get('TeemoCreativeView').hidden || !get('TeemoDirectorChallenge')) throw new Error('Creative/Challenge UI failed');
    get('TeemoCreativeBackButton').click();
    get('settingsButton').click();
    await wait(40);
    if (get('settingsView').hidden || !get('skillList')) throw new Error('Skill Center failed');
    get('settingsBackButton').click();
    return { chat: true, cognition: true, creative: true, challenge: true, skills: true };
  })()`);
}

async function enableAndAdd(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 4000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    const toggle = get('TeemoInspirationEnabled');
    if (toggle.checked) throw new Error('expected P3 global state to start disabled');
    if (!get('TeemoInspirationAddFolderButton').disabled) throw new Error('add must be disabled while P3 is disabled');
    toggle.click();
    await waitFor(() => toggle.checked && !get('TeemoInspirationAddFolderButton').disabled, 'enable P3');
    if (get('TeemoInspirationSourceCount').textContent !== '0') throw new Error('source count must start at zero');
    if (!/还没有本地灵感来源/.test(get('TeemoInspirationSourceList').textContent)) throw new Error('local source empty state missing');
    get('TeemoInspirationAddFolderButton').click();
    await waitFor(() => get('TeemoInspirationSourceCount').textContent === '1', 'add source');
    const snapshot = await window.teemoLocalFolderClient.listSources();
    const source = snapshot.sources[0];
    if (!source || source.displayName !== 'Teemo Synthetic Source') throw new Error('synthetic source card missing');
    if (!/Teemo Synthetic Source/.test(get('TeemoInspirationSourceList').textContent)) throw new Error('source name missing');
    return { sourceId: source.sourceId, revision: snapshot.revision, status: source.status };
  })()`);
}

async function browseAndPreview(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (check, label, timeout = 5000) => {
      const started = Date.now();
      while (!check()) {
        if (Date.now() - started > timeout) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    const get = id => document.getElementById(id);
    get('TeemoInspirationSourceList').querySelector('[data-source-browse]').click();
    await waitFor(() => !get('TeemoInspirationBrowser').hidden && /Teemo Cover/.test(get('TeemoInspirationEntryList').textContent), 'browse root');
    const note = Array.from(get('TeemoInspirationEntryList').querySelectorAll('[data-entry-path]')).find(item => item.dataset.entryPath === 'Teemo Note.txt');
    if (!note || !note.disabled) throw new Error('unsupported text preview must be disabled');
    const link = Array.from(get('TeemoInspirationEntryList').querySelectorAll('[data-entry-path]')).find(item => item.dataset.entryPath === 'Teemo Outside Link');
    if (link && !link.disabled) throw new Error('link entry must not be enterable');
    const child = Array.from(get('TeemoInspirationEntryList').querySelectorAll('[data-entry-path]')).find(item => item.dataset.entryPath === 'Teemo Subfolder');
    child.click();
    await waitFor(() => /Teemo Inner/.test(get('TeemoInspirationEntryList').textContent), 'browse child');
    if (get('TeemoInspirationBrowserBack').disabled) throw new Error('back should be enabled in child');
    get('TeemoInspirationBrowserBack').click();
    await waitFor(() => /Teemo Cover/.test(get('TeemoInspirationEntryList').textContent), 'return root');
    const cover = Array.from(get('TeemoInspirationEntryList').querySelectorAll('[data-entry-path]')).find(item => item.dataset.entryPath === 'Teemo Cover.png');
    cover.click();
    await waitFor(() => Boolean(get('TeemoInspirationPreview').querySelector('img')), 'preview image');
    if (!get('TeemoInspirationBrowserBack').disabled) throw new Error('back must be disabled at root');
    return {
      entries: get('TeemoInspirationEntryList').querySelectorAll('[data-entry-path]').length,
      preview: Boolean(get('TeemoInspirationPreview').querySelector('img')),
      unsupportedDisabled: note.disabled,
      linkDisabled: link ? link.disabled : null,
    };
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  let restarted;
  let corrupt;
  try {
    if (app.getVersion() !== packageVersion) throw new Error(`Electron version mismatch: ${app.getVersion()} != ${packageVersion}`);
    first = await createWindow();
    const initial = await openInspiration(first);
    if (initial.enabled || initial.count !== '0' || !initial.chatInput || !initial.localConnector) throw new Error('initial Local Folder state invalid');
    const p2 = await verifyP2Navigation(first);
    await openInspiration(first);
    const added = await enableAndAdd(first);
    if (added.status !== 'CONFIGURED' || authorizedRoots.length !== 1) throw new Error('P1 authorization was not established');
    const browse = await browseAndPreview(first);
    if (!fs.readFileSync(path.join(sourceRoot, 'Teemo Cover.png')).equals(sourceBytesBefore)) throw new Error('source bytes changed');
    if (permissionResources.length < 3 || permissionResources.some(resource => resource !== `inspiration://local-folder/${added.sourceId}`)) {
      throw new Error('source-specific permission identity invalid');
    }
    if (permissionResources.some(resource => resource.includes(sourceRoot) || /Users/i.test(resource))) throw new Error('permission resource leaked path');

    let screenshot = null;
    const screenshotPath = process.env.TEEMO_LOCAL_FOLDER_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 160));
      const image = await first.webContents.capturePage();
      const png = image.toPNG();
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, png);
      screenshot = { path: screenshotPath, ...image.getSize(), sha256: crypto.createHash('sha256').update(png).digest('hex') };
      first.hide();
    }

    saveRoots([]);
    const revoked = await first.webContents.executeJavaScript(`(async () => {
      const waitFor = async (check, label) => {
        const started = Date.now();
        while (!check()) {
          if (Date.now() - started > 4000) throw new Error('Timed out: ' + label);
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      };
      document.getElementById('TeemoInspirationRefreshButton').click();
      await waitFor(() => /需要重新授权/.test(document.getElementById('TeemoInspirationSourceList').textContent), 'revoked status');
      const denied = await window.teemoInspirationService.readLocalFolder('${added.sourceId}', 'list_items', {}, { sessionId: 'smoke-revoked' });
      if (denied.ok || denied.error.code !== 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED') throw new Error('revoked source did not fail closed');
      document.querySelector('[data-source-reauthorize]').click();
      await waitFor(() => /已配置/.test(document.getElementById('TeemoInspirationSourceList').textContent), 'reauthorize');
      return { deniedCode: denied.error.code, reauthorized: true };
    })()`);
    if (authorizedRoots.length !== 1) throw new Error('explicit reauthorization did not restore P1 root');

    second = await createWindow();
    await openInspiration(second);
    const secondRevision = await second.webContents.executeJavaScript(`window.teemoLocalFolderClient.listSources().then(result => result.revision)`);
    const removed = await first.webContents.executeJavaScript(`(async () => {
      window.confirm = () => true;
      document.querySelector('[data-source-remove]').click();
      const started = Date.now();
      while (document.getElementById('TeemoInspirationSourceCount').textContent !== '0') {
        if (Date.now() - started > 4000) throw new Error('Timed out: remove source');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return true;
    })()`);
    if (!removed || !fs.existsSync(path.join(sourceRoot, 'Teemo Cover.png'))) throw new Error('source removal deleted source content');
    if (authorizedRoots.length !== 1) throw new Error('source removal revoked P1 authorized root');
    const stale = await second.webContents.executeJavaScript(`window.teemoLocalFolderClient.removeSource('${added.sourceId}', { expectedRevision: ${secondRevision} }).then(() => ({ ok: true })).catch(error => ({ ok: false, code: error.code }))`);
    if (stale.ok || stale.code !== 'INSPIRATION_SOURCES_CHANGED') throw new Error('second window stale revision was not rejected');
    const readded = await first.webContents.executeJavaScript(`(async () => {
      document.getElementById('TeemoInspirationAddFolderButton').click();
      const started = Date.now();
      while (document.getElementById('TeemoInspirationSourceCount').textContent !== '1') {
        if (Date.now() - started > 4000) throw new Error('Timed out: re-add source');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return (await window.teemoLocalFolderClient.listSources()).sources[0].sourceId;
    })()`);
    if (readded === added.sourceId) throw new Error('re-added source reused old sourceId');

    first.destroy();
    first = null;
    second.destroy();
    second = null;
    restarted = await createWindow();
    const restartResult = await openInspiration(restarted);
    if (!restartResult.enabled || restartResult.count !== '1') throw new Error('source config did not reload after restart');
    restarted.destroy();
    restarted = null;

    const sourceConfigPath = path.join(isolatedData, TeemoInspirationSourceService.SOURCE_FILE);
    const corruptBytes = Buffer.from('{broken-teemo-source-config', 'utf8');
    fs.writeFileSync(sourceConfigPath, corruptBytes);
    corrupt = await createWindow();
    const corruptInitial = await openInspiration(corrupt);
    const corruptState = await corrupt.webContents.executeJavaScript(`({
      status: document.getElementById('TeemoInspirationStatus').textContent,
      addDisabled: document.getElementById('TeemoInspirationAddFolderButton').disabled,
      chatInput: Boolean(document.getElementById('messageInput')),
      noContextBuilder: typeof window.TeemoInspirationContextBuilder === 'undefined',
    })`);
    if (!/无法读取|安全停用/.test(corruptState.status) || !corruptState.addDisabled || !corruptState.chatInput || !corruptState.noContextBuilder) {
      throw new Error('corrupt source config did not fail closed without affecting chat');
    }
    if (!fs.readFileSync(sourceConfigPath).equals(corruptBytes)) throw new Error('corrupt source config bytes were overwritten');

    console.log(JSON.stringify({
      ok: true,
      appVersion: app.getVersion(),
      initial,
      added,
      browse,
      revoked,
      staleRevisionRejected: true,
      removedSourceOnly: true,
      sourceReloaded: true,
      corruptInitial,
      corruptState,
      p2,
      permissionResources: permissionResources.map(() => 'inspiration://local-folder/<synthetic-sourceId>'),
      sourceBytesUnchanged: true,
      p1AuthorizedRootPreservedAfterRemove: true,
      providerCalls: 0,
      inspirationAgentContext: false,
      linkSupported,
      linkReason,
      screenshot,
      formalUserDataTouched: false,
      realPersonalInspirationContentUsed: false,
    }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (first && !first.isDestroyed()) first.destroy();
    if (second && !second.isDestroyed()) second.destroy();
    if (restarted && !restarted.isDestroyed()) restarted.destroy();
    if (corrupt && !corrupt.isDestroyed()) corrupt.destroy();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort cleanup */ }
});
