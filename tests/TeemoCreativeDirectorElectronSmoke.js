const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-director-ui-smoke-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');

const pagePath = path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html');

async function createWindow() {
  const window = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  await window.loadFile(pagePath);
  return window;
}

async function verifyDefault(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = id => document.getElementById(id);
    await wait(60);
    if (get('TeemoChallengeQuickLabel').textContent !== '常规') throw new Error('new window must start balanced');
    get('TeemoCreativeButton').click();
    await wait(40);
    if (!get('TeemoDirectorBalanced').classList.contains('active')) throw new Error('balanced segment missing');
    if (get('TeemoDirectorChallenge').classList.contains('active')) throw new Error('challenge must not be active by default');
    if (!get('TeemoDirectorIntensity').querySelector('[data-director-intensity="standard"]')) throw new Error('intensity controls missing');
    return { title: get('TeemoDirectorTitle').textContent, quick: get('TeemoChallengeQuickLabel').textContent };
  })()`);
}

app.whenReady().then(async () => {
  let first;
  let second;
  let restarted;
  try {
    first = await createWindow();
    const initial = await verifyDefault(first);
    const challenge = await first.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const get = id => document.getElementById(id);
      get('TeemoDirectorChallenge').click();
      get('TeemoDirectorIntensity').querySelector('[data-director-intensity="strong"]').click();
      await wait(30);
      if (!/挑战模式 · 强/.test(get('TeemoDirectorStatus').textContent)) throw new Error('strong Challenge status missing');
      const sessionA = document.querySelector('[data-session].active').dataset.session;
      get('newChatButton').click();
      await wait(30);
      const sessionB = document.querySelector('[data-session].active').dataset.session;
      if (sessionA === sessionB) throw new Error('new conversation did not create a distinct session');
      if (get('TeemoChallengeQuickLabel').textContent !== '常规') throw new Error('same renderer Session B inherited Challenge');
      if (window.teemoCreativeDirectorState.getState(sessionB).mode !== 'balanced') throw new Error('Session B state must be balanced');
      if (window.teemoCreativeDirectorState.getState(sessionA).mode !== 'challenge') throw new Error('Session A Challenge state was lost');
      document.querySelector('[data-session="' + sessionA + '"]').click();
      await wait(30);
      if (!/挑战 · 强/.test(get('TeemoChallengeQuickLabel').textContent)) throw new Error('Session A strong state did not restore');
      get('TeemoCreativeBackButton').click();
      if (!/挑战 · 强/.test(get('TeemoChallengeQuickLabel').textContent)) throw new Error('quick Challenge status missing');
      get('TeemoCreativeButton').click();
      return { label: get('TeemoChallengeQuickLabel').textContent, sessionA, sessionB };
    })()`);

    const screenshotPath = process.env.TEEMO_DIRECTOR_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await first.webContents.capturePage();
      fs.writeFileSync(screenshotPath, image.toPNG());
      first.hide();
    }

    second = await createWindow();
    const isolatedWindow = await verifyDefault(second);
    second.destroy();
    second = null;

    const dependency = await first.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const get = id => document.getElementById(id);
      get('TeemoCreativeEnabled').click();
      await wait(40);
      if (!get('TeemoDirectorChallenge').disabled || !get('TeemoChallengeQuickButton').disabled) throw new Error('Creative OFF must disable Challenge');
      if (!/需要先启用/.test(get('TeemoDirectorStatus').textContent)) throw new Error('Creative dependency message missing');
      get('TeemoCreativeEnabled').click();
      await wait(40);
      if (get('TeemoDirectorChallenge').disabled) throw new Error('Challenge did not recover after Creative ON');
      return get('TeemoDirectorStatus').textContent;
    })()`);

    const commands = await first.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const get = id => document.getElementById(id);
      const sessionId = document.querySelector('[data-session].active').dataset.session;
      window.teemoChallengeContextBuilder.build({ sessionId, userMessage: '接下来用挑战模式', creativeContext: { relevant: false } });
      get('TeemoCreativeBackButton').click();
      get('TeemoCreativeButton').click();
      await wait(20);
      if (!get('TeemoDirectorChallenge').classList.contains('active')) throw new Error('session command did not update state');
      get('TeemoDirectorBalanced').click();
      const oneShot = window.teemoChallengeContextBuilder.build({ sessionId, userMessage: '挑战一下这个方案', creativeContext: { relevant: true } });
      if (!oneShot.oneShot || oneShot.mode !== 'challenge') throw new Error('one-shot Challenge missing');
      if (window.teemoCreativeDirectorState.getState(sessionId).mode !== 'balanced') throw new Error('one-shot changed session state');
      return { command: 'session_activate', oneShot: oneShot.oneShot, sessionMode: window.teemoCreativeDirectorState.getState(sessionId).mode };
    })()`);

    const creativeState = JSON.parse(fs.readFileSync(path.join(isolatedData, 'Teemo-creative-profile.json'), 'utf8'));
    if ('mode' in creativeState || 'intensity' in creativeState) throw new Error('Challenge leaked into Creative state file');
    const files = fs.readdirSync(isolatedData);
    if (files.some(name => /challenge|director/i.test(name))) throw new Error('Challenge created a persistent state file');

    first.destroy();
    first = null;
    restarted = await createWindow();
    const restartResult = await verifyDefault(restarted);
    console.log(JSON.stringify({ ok: true, isolatedRoot, initial, challenge, isolatedWindow, dependency, commands, restartResult }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (first && !first.isDestroyed()) first.destroy();
    if (second && !second.isDestroyed()) second.destroy();
    if (restarted && !restarted.isDestroyed()) restarted.destroy();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});
