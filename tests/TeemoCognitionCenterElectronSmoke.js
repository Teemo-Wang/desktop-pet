const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-cognition-ui-smoke-'));
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

async function runFlow(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    get('memoryButton').click();
    await wait(80);
    if (get('memoryView').hidden) throw new Error('Memory Center did not open');
    if (!/Teemo 还在逐渐了解你/.test(get('memoryList').textContent)) throw new Error('empty state missing');

    get('memoryAddButton').click();
    get('memoryEditorContent').value = '最近比较喜欢金属材质';
    get('memoryEditorScope').value = 'recent';
    get('memoryEditorScope').dispatchEvent(new Event('change', { bubbles: true }));
    get('memoryEditorSaveButton').click();
    await wait(80);
    let card = [...document.querySelectorAll('.teemo-memory-card')].find(item => item.textContent.includes('最近比较喜欢金属材质'));
    if (!card) throw new Error('manual recent cognition missing');

    card.querySelector('[data-memory-action="edit"]').click();
    get('memoryEditorContent').value = '最近偏好高反射金属材质';
    get('memoryEditorSaveButton').click();
    await wait(80);
    card = [...document.querySelectorAll('.teemo-memory-card')].find(item => item.textContent.includes('最近偏好高反射金属材质'));
    if (!card) throw new Error('edited cognition missing');

    card.querySelector('[data-memory-action="move"]').click();
    get('memoryEditorScope').value = 'global';
    get('memoryEditorScope').dispatchEvent(new Event('change', { bubbles: true }));
    get('memoryEditorSaveButton').click();
    await wait(80);
    card = [...document.querySelectorAll('.teemo-memory-card')].find(item => item.textContent.includes('最近偏好高反射金属材质'));
    if (!card || !card.textContent.includes('长期认知')) throw new Error('scope migration missing');

    card.querySelector('[data-memory-action="evidence"]').click();
    await wait(30);
    if (get('memoryEvidenceModal').hidden || document.querySelectorAll('.teemo-evidence-item').length < 2) throw new Error('evidence history missing');
    get('memoryEvidenceCloseButton').click();

    card.querySelector('[data-memory-action="supersede"]').click();
    await wait(30);
    if (get('confirmModal').hidden) throw new Error('supersede confirmation missing');
    get('confirmOkButton').click();
    await wait(80);
    document.querySelector('[data-memory-filter="inactive"]').click();
    await wait(20);
    if (!get('memoryList').textContent.includes('最近偏好高反射金属材质')) throw new Error('inactive cognition missing');

    get('memoryEnabled').click();
    await wait(30);
    if (get('memoryEnabled').checked) throw new Error('cognition switch did not disable');
    return {
      title: document.querySelector('.teemo-memory-head h1').textContent,
      inactiveCount: document.querySelectorAll('.teemo-memory-card.inactive').length,
      dataDir: process.env.TEEMO_ASSISTANT_DATA_DIR,
    };
  })()`);
}

async function verifyRestart(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    document.getElementById('memoryButton').click();
    await wait(80);
    document.querySelector('[data-memory-filter="inactive"]').click();
    await wait(20);
    return {
      persisted: document.getElementById('memoryList').textContent.includes('最近偏好高反射金属材质'),
      disabled: !document.getElementById('memoryEnabled').checked,
    };
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  try {
    first = await createWindow();
    const result = await runFlow(first);
    const screenshotPath = process.env.TEEMO_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      await first.webContents.executeJavaScript(`(async () => {
        document.getElementById('memoryButton').click();
        await new Promise(resolve => setTimeout(resolve, 60));
        document.querySelector('[data-memory-filter="inactive"]').click();
        await new Promise(resolve => setTimeout(resolve, 30));
      })()`);
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await first.webContents.capturePage();
      fs.writeFileSync(screenshotPath, image.toPNG());
      first.hide();
    }
    first.destroy();
    first = null;

    second = await createWindow();
    const restarted = await verifyRestart(second);
    if (!restarted.persisted || !restarted.disabled) throw new Error('restart persistence check failed');
    console.log(JSON.stringify({ ok: true, isolatedRoot, result, restarted }));
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
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort test cleanup */ }
});
