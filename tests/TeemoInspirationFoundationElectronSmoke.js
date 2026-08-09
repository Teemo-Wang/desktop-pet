const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-inspiration-ui-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('teemo:local-access-list', () => []);
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

async function openInspiration(window, expectedEnabled) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    get('TeemoInspirationButton').click();
    await wait(60);
    const view = get('TeemoInspirationView');
    if (view.hidden) throw new Error('Inspiration page did not open');
    if (!get('chatView').hidden || !get('memoryView').hidden || !get('TeemoCreativeView').hidden) throw new Error('Inspiration navigation isolation failed');
    if (get('TeemoInspirationEnabled').checked !== ${Boolean(expectedEnabled)}) throw new Error('Inspiration enabled state mismatch');
    if (get('TeemoInspirationSourceCount').textContent !== '0') throw new Error('production registry must be empty');
    if (!/当前没有已连接的素材来源/.test(get('TeemoInspirationSourceList').textContent)) throw new Error('empty source state missing');
    if (!/保留在本机/.test(view.textContent) || !/明确授权/.test(view.textContent)) throw new Error('privacy boundary missing');
    if (/(Pinterest Connect|Figma Connect|Eagle Import|NAS Connect|语义搜索)/i.test(view.textContent)) throw new Error('future fake action leaked into P3-1 UI');
    return { revision: window.teemoInspirationService.getManagementSnapshot().state.revision, text: view.textContent.slice(0, 220) };
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

app.whenReady().then(async () => {
  let first;
  let second;
  let restarted;
  let corrupt;
  try {
    first = await createWindow();
    second = await createWindow();
    const firstInitial = await openInspiration(first, false);
    const secondInitial = await openInspiration(second, false);
    const p2 = await verifyP2Navigation(first);
    await openInspiration(first, false);

    await first.webContents.executeJavaScript(`(async () => {
      const toggle = document.getElementById('TeemoInspirationEnabled');
      toggle.click();
      await new Promise(resolve => setTimeout(resolve, 60));
      if (!toggle.checked) throw new Error('Inspiration toggle did not enable');
    })()`);
    const statePath = path.join(isolatedData, 'Teemo-inspiration-state.json');
    const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!persisted.enabled || persisted.revision !== 1) throw new Error('Inspiration state did not persist');

    const stale = await second.webContents.executeJavaScript(`window.teemoInspirationService.setEnabled(false, { expectedRevision: ${secondInitial.revision} })`);
    if (stale.ok || !stale.error || stale.error.code !== 'INSPIRATION_STATE_CHANGED') throw new Error('stale window overwrote Inspiration state');

    const screenshotPath = process.env.TEEMO_INSPIRATION_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await first.webContents.capturePage();
      fs.writeFileSync(screenshotPath, image.toPNG());
      first.hide();
    }
    first.destroy();
    first = null;
    second.destroy();
    second = null;

    restarted = await createWindow();
    const restartResult = await openInspiration(restarted, true);
    restarted.destroy();
    restarted = null;

    const corruptBytes = Buffer.from('{broken-inspiration-state', 'utf8');
    fs.writeFileSync(statePath, corruptBytes);
    corrupt = await createWindow();
    const corruptResult = await openInspiration(corrupt, false);
    const safeState = await corrupt.webContents.executeJavaScript(`({
      disabled: document.getElementById('TeemoInspirationEnabled').disabled,
      status: document.getElementById('TeemoInspirationStatus').textContent,
      chatInput: Boolean(document.getElementById('messageInput')),
    })`);
    if (!safeState.disabled || !/无法读取|安全停用/.test(safeState.status) || !safeState.chatInput) throw new Error('corrupt state did not fail closed safely');
    if (!fs.readFileSync(statePath).equals(corruptBytes)) throw new Error('corrupt Inspiration bytes were overwritten');

    console.log(JSON.stringify({
      ok: true,
      isolatedRoot,
      firstInitial,
      restartResult,
      corruptResult,
      p2,
      formalUserDataTouched: false,
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
