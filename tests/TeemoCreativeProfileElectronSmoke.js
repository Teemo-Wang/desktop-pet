const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-creative-ui-smoke-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const pagePath = path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html');

function waitForLoad(window) {
  return new Promise((resolve, reject) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });
  const loaded = waitForLoad(window);
  await window.loadFile(pagePath);
  await loaded;
  return window;
}

async function verifyPage(window, expectedEnabled) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    get('TeemoCreativeButton').click();
    await wait(80);
    const view = get('TeemoCreativeView');
    if (view.hidden) throw new Error('Creative Profile page did not open');
    if (!get('memoryView').hidden || !get('chatView').hidden) throw new Error('Creative page navigation isolation failed');
    if (get('TeemoCreativeEnabled').checked !== ${Boolean(expectedEnabled)}) throw new Error('Creative enabled state mismatch');
    if (!/Profile 1\.0\.0/.test(get('TeemoCreativeVersion').textContent)) throw new Error('profile version missing');
    if (document.querySelectorAll('.teemo-creative-principle').length !== 10) throw new Error('principles missing');
    if (document.querySelectorAll('.teemo-creative-dimension').length !== 9) throw new Error('dimensions missing');
    if (get('TeemoCreativeDomains').querySelectorAll('button').length !== 6) throw new Error('domain lenses missing');
    if (!/Cognition 了解你喜欢什么/.test(view.textContent) || !/Creative Profile 判断设计为什么好/.test(view.textContent)) throw new Error('Cognition distinction missing');
    if (view.querySelector('textarea') || view.querySelector('input:not([type="checkbox"])')) throw new Error('Creative principles must be read-only');
    if (/(Pinterest|Eagle|上传素材|素材扫描|图库学习)/i.test(view.textContent)) throw new Error('inspiration feature leaked into P2-2 UI');
    const brand = get('TeemoCreativeDomains').querySelector('[data-creative-domain="brand"]');
    brand.click();
    await wait(20);
    if (!/品牌判断重点/.test(get('TeemoCreativeDomainDetail').textContent)) throw new Error('brand lens detail missing');
    return {
      title: view.querySelector('h1').textContent,
      profileVersion: get('TeemoCreativeVersion').textContent,
      principles: document.querySelectorAll('.teemo-creative-principle').length,
      dimensions: document.querySelectorAll('.teemo-creative-dimension').length,
      domains: get('TeemoCreativeDomains').querySelectorAll('button').length,
    };
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  let third;
  try {
    first = await createWindow();
    const result = await verifyPage(first, true);
    await first.webContents.executeJavaScript(`(async () => {
      const toggle = document.getElementById('TeemoCreativeEnabled');
      toggle.click();
      await new Promise(resolve => setTimeout(resolve, 60));
      if (toggle.checked) throw new Error('Creative switch did not disable');
    })()`);
    const stateFile = path.join(isolatedData, 'Teemo-creative-profile.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.enabled !== false || Object.prototype.hasOwnProperty.call(state, 'principles')) {
      throw new Error('Creative local state contains invalid data');
    }

    const screenshotPath = process.env.TEEMO_CREATIVE_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await first.webContents.capturePage();
      fs.writeFileSync(screenshotPath, image.toPNG());
      first.hide();
    }
    first.destroy();
    first = null;

    second = await createWindow();
    const restarted = await verifyPage(second, false);
    await second.webContents.executeJavaScript(`(async () => {
      const toggle = document.getElementById('TeemoCreativeEnabled');
      toggle.click();
      await new Promise(resolve => setTimeout(resolve, 60));
      if (!toggle.checked) throw new Error('Creative switch did not re-enable');
    })()`);
    second.destroy();
    second = null;

    const invalidState = '{ invalid creative state json';
    fs.writeFileSync(stateFile, invalidState, 'utf8');
    third = await createWindow();
    const failClosed = await verifyPage(third, false);
    const stateError = await third.webContents.executeJavaScript(`document.getElementById('TeemoCreativeStatus').textContent`);
    if (!/无法读取|安全停用/.test(stateError)) throw new Error('Creative state read error is not visible');
    if (fs.readFileSync(stateFile, 'utf8') !== invalidState) throw new Error('corrupt Creative state was overwritten');
    console.log(JSON.stringify({ ok: true, isolatedRoot, result, restarted, failClosed, stateError }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (first && !first.isDestroyed()) first.destroy();
    if (second && !second.isDestroyed()) second.destroy();
    if (third && !third.isDestroyed()) third.destroy();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort cleanup */ }
});
