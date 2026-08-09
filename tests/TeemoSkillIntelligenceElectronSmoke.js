const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-skill-intelligence-ui-'));
const isolatedProfile = path.join(isolatedRoot, 'profile');
const isolatedData = path.join(isolatedRoot, 'data');
fs.mkdirSync(isolatedProfile, { recursive: true });
fs.mkdirSync(isolatedData, { recursive: true });
process.env.TEEMO_ASSISTANT_DATA_DIR = isolatedData;
app.setPath('userData', isolatedProfile);
app.commandLine.appendSwitch('disable-gpu');
ipcMain.handle('teemo:local-access-list', () => []);
ipcMain.handle('get-app-version', () => app.getVersion());

const skillsPath = path.join(isolatedData, 'skills.json');
const registryPath = path.join(isolatedData, 'Teemo-skill-registry.json');
const rawSkills = [
  {
    id: 'poster', name: 'Teemo 海报生成', icon: 'P', desc: '生成活动海报', category: 'custom',
    inputs: [], promptTpl: '', systemPrompt: '# Teemo 海报生成\n\n## 触发条件\n- 生成海报\n\n保持标题层级清晰。',
    triggers: '生成海报', allowComposition: true, custom: true, createdAt: 1,
  },
  {
    id: 'brand', name: 'Teemo 哈啰品牌', icon: 'B', desc: '遵循哈啰品牌视觉', category: 'custom',
    inputs: [], promptTpl: '', systemPrompt: '# Teemo 哈啰品牌\n\n使用品牌蓝。',
    triggers: '遵循哈啰品牌', allowComposition: true, custom: true, createdAt: 2,
  },
];
fs.writeFileSync(skillsPath, JSON.stringify(rawSkills, null, 2), 'utf8');
const rawSkillBytes = fs.readFileSync(skillsPath);
const pagePath = path.join(__dirname, '..', 'Teemo-chat-window', 'Teemo-chat-window.html');

async function createWindow() {
  const window = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
  });
  await window.loadFile(pagePath);
  return window;
}

app.whenReady().then(async () => {
  let first;
  let restarted;
  let corrupt;
  try {
    first = await createWindow();
    const firstResult = await first.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      await wait(80);
      window.comfyUIService.store.setGroup('comfyui', { ...window.comfyUIService.getConfig(), enabled: false });
      window.comfyUIService.configure({ enabled: false });
      const input = document.getElementById('messageInput');
      input.value = '生成海报并遵循哈啰品牌';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('sendButton').click();
      let chip = null;
      for (let index = 0; index < 120; index += 1) {
        await wait(50);
        chip = document.querySelector('.teemo-skill-route-chip');
        if (chip) break;
      }
      if (!chip || !/Skills/.test(chip.textContent)) throw new Error('actual chat Skill chip missing: ' + JSON.stringify({
        status: document.getElementById('chatStatus').textContent,
        messages: document.getElementById('messageList').textContent.slice(-300),
        route: window.skillRouter.route({ text: '生成海报并遵循哈啰品牌', sessionId: 'debug' }),
      }));
      if (!/命中原因/.test(chip.title) || !/intent_match/.test(chip.title)) throw new Error('actual chat why-matched tooltip missing');
      document.getElementById('settingsButton').click();
      await wait(40);
      const row = document.querySelector('[data-skill-id="poster"]');
      if (!row || !/Auto Routing/.test(row.textContent)) throw new Error('routing status missing in Skill UI');
      row.querySelector('[data-skill-edit="poster"]').click();
      await wait(30);
      const editor = document.querySelector('[data-routing-skill="poster"]');
      if (!editor || !editor.querySelector('[data-route-field="role"]')) throw new Error('Routing Metadata editor missing');
      editor.querySelector('[data-route-field="aliases"]').value = '活动 KV';
      editor.querySelector('[data-route-save]').click();
      await wait(50);
      const manifest = window.skillManifestService.getSkillManifest('poster');
      if (!manifest.routing.aliases.includes('活动 KV')) throw new Error('Routing override was not saved');
      const firstRoute = window.skillRouter.route({ text: '生成海报并遵循哈啰品牌', sessionId: 'a' });
      if (firstRoute.type !== 'multi_skill' || firstRoute.selectedSkillIds.length !== 2) throw new Error('multi-Skill route missing');
      if (!firstRoute.reasons.some(item => item.code === 'intent_match')) throw new Error('why matched reason missing');
      const follow = window.skillRouter.route({ text: '标题再大一点', sessionId: 'a' });
      if (!follow.continuityUsed) throw new Error('same-session continuity missing');
      if (window.skillRouter.route({ text: '标题再大一点', sessionId: 'b' }).type !== 'no_skill') throw new Error('session isolation failed');
      if (window.skillRouter.route({ text: 'JavaScript 怎么深拷贝？', sessionId: 'a' }).type !== 'no_skill') throw new Error('NO_SKILL route failed');
      return { revision: window.skillManifestService.getRegistrySnapshot().revision, reasons: firstRoute.reasons.map(item => item.code), chip: chip.textContent };
    })()`);
    if (!fs.readFileSync(skillsPath).equals(rawSkillBytes)) throw new Error('Routing UI changed Raw Skill bytes');
    const screenshotPath = process.env.TEEMO_SKILL_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      first.showInactive();
      await new Promise(resolve => setTimeout(resolve, 100));
      const image = await first.webContents.capturePage();
      fs.writeFileSync(screenshotPath, image.toPNG());
      first.hide();
    }
    const persistedRegistry = fs.readFileSync(registryPath);
    first.destroy();
    first = null;

    restarted = await createWindow();
    const restartResult = await restarted.webContents.executeJavaScript(`({
      ok: window.skillManifestService.getRegistrySnapshot().ok,
      aliases: window.skillManifestService.getSkillManifest('poster').routing.aliases,
      active: window.skillSessionState.get('a')
    })`);
    if (!restartResult.ok || !restartResult.aliases.includes('活动 KV')) throw new Error('Registry did not persist across restart');
    if (restartResult.active !== null) throw new Error('runtime session state persisted across restart');
    if (!fs.readFileSync(registryPath).equals(persistedRegistry)) throw new Error('restart rewrote unchanged Registry bytes');
    restarted.destroy();
    restarted = null;

    const corruptBytes = Buffer.from('{broken-registry', 'utf8');
    fs.writeFileSync(registryPath, corruptBytes);
    corrupt = await createWindow();
    const corruptResult = await corrupt.webContents.executeJavaScript(`(async () => {
      document.getElementById('settingsButton').click();
      await new Promise(resolve => setTimeout(resolve, 40));
      return {
        warning: document.getElementById('skillList').textContent,
        route: window.skillRouter.route({ text: '生成海报', sessionId: 'corrupt' }),
      };
    })()`);
    if (!/路由数据无法读取/.test(corruptResult.warning)) throw new Error('unreadable Registry UI warning missing');
    if (corruptResult.route.type !== 'no_skill' || !corruptResult.route.error) throw new Error('unreadable Registry did not fail closed');
    if (!fs.readFileSync(registryPath).equals(corruptBytes)) throw new Error('unreadable Registry was overwritten');

    console.log(JSON.stringify({ ok: true, isolatedRoot, firstResult, restartResult, corrupt: true }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    [first, restarted, corrupt].forEach(window => { if (window && !window.isDestroyed()) window.destroy(); });
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* best effort test cleanup */ }
});
