const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const root = path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-desktop-pet-full-smoke-'));
process.env.TEEMO_ASSISTANT_DATA_DIR = profile;
app.setPath('userData', path.join(profile, 'electron'));

let window;
const rendererErrors = [];
const dragStates = [];
let regionCount = 0;

ipcMain.on('desktop-interactive-regions', (event, regions) => {
  if (window && !window.isDestroyed() && event.sender === window.webContents) {
    regionCount = Array.isArray(regions) ? regions.length : 0;
  }
});
ipcMain.on('desktop-drag-state', (event, active) => {
  if (window && !window.isDestroyed() && event.sender === window.webContents) dragStates.push(Boolean(active));
});
['toggle-always-on-top', 'set-opacity', 'mouse-enter-content', 'mouse-leave-content', 'disable-passthrough', 'enable-passthrough']
  .forEach(channel => ipcMain.on(channel, () => {}));
ipcMain.handle('get-config', () => JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8')));
ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({
      show: false,
      width: 1200,
      height: 700,
      frame: false,
      transparent: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    });
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) rendererErrors.push(String(message));
    });
    await window.loadFile(path.join(root, 'index.html'));
    const state = await window.webContents.executeJavaScript(`(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      const pet = document.getElementById('petArea');
      const image = pet.querySelector('.pet-image');
      const before = pet.getBoundingClientRect();
      const startX = before.left + before.width / 2;
      const startY = before.top + before.height / 2;
      pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: startX, clientY: startY }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX - 60, clientY: startY - 35 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: startX - 60, clientY: startY - 35 }));
      await new Promise(resolve => setTimeout(resolve, 50));
      const after = pet.getBoundingClientRect();

      const clickX = after.left + after.width / 2;
      const clickY = after.top + after.height / 2;
      pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: clickX, clientY: clickY }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: clickX, clientY: clickY }));
      await new Promise(resolve => setTimeout(resolve, 350));
      return {
        agentCoreReady: Boolean(window.agentCore && window.TeemoAgentCore),
        planningContractReady: Boolean(window.TeemoPlanningContract),
        quickDockReady: Boolean(document.getElementById('quickDock')),
        dockVisible: document.getElementById('quickDock')?.classList.contains('visible') || false,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        movedX: Math.round(after.left - before.left),
        movedY: Math.round(after.top - before.top),
      };
    })()`);

    assert.deepEqual(rendererErrors.filter(message => /Uncaught|Cannot find module|not a constructor/.test(message)), []);
    assert.equal(state.agentCoreReady, true);
    assert.equal(state.planningContractReady, true);
    assert.equal(state.quickDockReady, true);
    assert.equal(state.dockVisible, true);
    assert.equal(state.naturalWidth, 812);
    assert.equal(state.naturalHeight, 812);
    assert.equal(state.movedX, -60);
    assert.equal(state.movedY, -35);
    assert.deepEqual(dragStates.slice(-4), [true, false, true, false]);
    assert(regionCount > 0);
    console.log(JSON.stringify({ state, dragStates, regionCount, rendererErrors, profileIsolated: true }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});

app.on('window-all-closed', event => event.preventDefault());
