const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-cognition-intelligence-ui-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const pagePath = path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html');
const cognitionPath = path.join(isolatedData, 'Teemo-cognition.json');

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function item(id, content, scope, daysAgo, extras = {}) {
  const timestamp = isoDaysAgo(daysAgo);
  return {
    id,
    observationId: `obs-${id}`,
    category: 'preference',
    scope,
    content,
    fingerprint: content.replace(/[\s。！？,.!?；;：:'"“”‘’、]/g, '').toLowerCase(),
    confidence: 0.9,
    evidenceCount: 3,
    evidenceDays: [isoDaysAgo(daysAgo + 1).slice(0, 10), timestamp.slice(0, 10)],
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastObservedAt: timestamp,
    ...extras,
  };
}

fs.writeFileSync(cognitionPath, JSON.stringify({
  version: 2,
  enabled: true,
  revision: 1,
  profile: [item('stable', '长期保持清晰信息层级', 'global', 500)],
  recentContext: [
    item('recent', '最近确认高反射金属材质', 'recent', 2),
    item('aging', '逐渐过时的品牌趋势关注', 'recent', 60),
    item('stale', '很久没有确认的像素偏好', 'recent', 100),
    item('pending', '刚开始观察的新偏好', 'recent', 1, { evidenceCount: 1, evidenceDays: [isoDaysAgo(1).slice(0, 10)] }),
    item('positive', '我喜欢蓝色', 'recent', 1),
    item('negative', '我不喜欢蓝色', 'recent', 1),
  ],
  projectContexts: {},
  observations: [],
  updatedAt: new Date().toISOString(),
}, null, 2), 'utf8');

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
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  const loaded = waitForLoad(window);
  await window.loadFile(pagePath);
  await loaded;
  return window;
}

async function openMemory(window) {
  return window.webContents.executeJavaScript(`(async () => {
    document.getElementById('memoryButton').click();
    await new Promise(resolve => setTimeout(resolve, 100));
    if (document.getElementById('memoryView').hidden) throw new Error('Memory Center did not open');
    return document.getElementById('memoryList').textContent;
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  let corruptWindow;
  try {
    first = await createWindow();
    const memoryText = await openMemory(first);
    ['稳定', '近期', '逐渐陈旧', '已陈旧', '待确认', '有冲突'].forEach(label => {
      if (!memoryText.includes(label)) throw new Error(`missing intelligence label: ${label}`);
    });
    if (!memoryText.includes('很久没有确认的像素偏好')) throw new Error('stale cognition was hidden from Memory Center');
    if (!memoryText.includes('有效可信度') || !memoryText.includes('最后确认') || !memoryText.includes('次依据')) {
      throw new Error('derived metadata is missing');
    }

    second = await createWindow();
    await openMemory(second);
    await second.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      document.getElementById('memoryAddButton').click();
      document.getElementById('memoryEditorContent').value = '双窗口新增的独立认知';
      document.getElementById('memoryEditorScope').value = 'global';
      document.getElementById('memoryEditorSaveButton').click();
      await wait(100);
      if (!document.getElementById('memoryList').textContent.includes('双窗口新增的独立认知')) throw new Error('second window write failed');
    })()`);
    await first.webContents.executeJavaScript(`(async () => {
      document.getElementById('memoryRefreshButton').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!document.getElementById('memoryList').textContent.includes('双窗口新增的独立认知')) throw new Error('first window did not reload shared source');
    })()`);

    first.destroy();
    first = null;
    second.destroy();
    second = null;

    const invalid = '{ invalid cognition json';
    fs.writeFileSync(cognitionPath, invalid, 'utf8');
    corruptWindow = await createWindow();
    await openMemory(corruptWindow);
    const status = await corruptWindow.webContents.executeJavaScript(`document.getElementById('memoryStatus').textContent`);
    if (!/读取异常/.test(status)) throw new Error('unreadable state is not visible in Memory Center');
    if (fs.readFileSync(cognitionPath, 'utf8') !== invalid) throw new Error('unreadable Cognition was overwritten');

    console.log(JSON.stringify({ ok: true, isolatedRoot, labels: true, sharedReload: true, unreadable: true }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    [first, second, corruptWindow].forEach(window => {
      if (window && !window.isDestroyed()) window.destroy();
    });
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort test cleanup */ }
});
