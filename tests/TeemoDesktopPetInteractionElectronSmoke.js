const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const TeemoWindowsDesktopHitTest = require('../src/runtime/TeemoWindowsDesktopHitTest');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'teemo-desktop-pet-smoke-'));
process.env.TEEMO_ASSISTANT_DATA_DIR = profile;
app.setPath('userData', path.join(profile, 'electron'));

let window;
const dragStates = [];
let latestRegions = [];

ipcMain.on('desktop-interactive-regions', (event, regions) => {
  if (!window || window.isDestroyed() || event.sender !== window.webContents) return;
  latestRegions = Array.isArray(regions) ? regions : [];
  const shape = latestRegions.map(region => ({
    x: Math.max(0, Math.floor(region.x)),
    y: Math.max(0, Math.floor(region.y)),
    width: Math.max(1, Math.ceil(region.width)),
    height: Math.max(1, Math.ceil(region.height)),
  }));
  assert(shape.length > 0);
});

ipcMain.on('desktop-drag-state', (event, active) => {
  if (!window || window.isDestroyed() || event.sender !== window.webContents) return;
  dragStates.push(Boolean(active));
});

ipcMain.on('toggle-always-on-top', () => {});
ipcMain.on('mouse-enter-content', () => {});
ipcMain.on('mouse-leave-content', () => {});
ipcMain.on('disable-passthrough', () => {});
ipcMain.on('enable-passthrough', () => {});

app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({
      show: false,
      width: 1200,
      height: 700,
      frame: false,
      transparent: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity: false },
    });
    const root = path.join(__dirname, '..');
    const imageUrl = `file:///${path.join(root, 'pet.png').replace(/\\/g, '/')}`;
    const petCss = fs.readFileSync(path.join(root, 'src', 'styles', 'pet.css'), 'utf8');
    const petSource = fs.readFileSync(path.join(root, 'src', 'components', 'pet.js'), 'utf8');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}
      .app{position:relative;width:100%;height:100%}.visible{display:block}
      #quickDock{display:none;position:absolute;width:300px;height:60px}#quickDock.visible{display:block}
      ${petCss}
    </style></head><body><div class="app">
      <div id="hoverBubble"></div><div id="quickDock"></div>
      <div class="pet-area" id="petArea"><img class="pet-image" src="${imageUrl}" draggable="false"><div class="pet-shadow"></div></div>
    </div><script>${petSource}</script><script>
      window.TeemoPetSmoke = new window.PetComponent();
      window.TeemoPetSmoke.onClick = () => document.getElementById('quickDock').classList.toggle('visible');
    </script></body></html>`;
    await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    const nativeHitPoint = new TeemoWindowsDesktopHitTest().getCursorClientPoint(window);
    if (process.platform === 'win32') {
      assert(nativeHitPoint && Number.isFinite(nativeHitPoint.x) && Number.isFinite(nativeHitPoint.y));
    }
    const result = await window.webContents.executeJavaScript(`(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      const pet = document.getElementById('petArea');
      const image = pet.querySelector('.pet-image');
      if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      });
      const before = pet.getBoundingClientRect();
      const startX = before.left + before.width / 2;
      const startY = before.top + before.height / 2;
      pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: startX, clientY: startY }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX - 70, clientY: startY - 45 }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: startX - 70, clientY: startY - 45 }));
      await new Promise(resolve => setTimeout(resolve, 50));
      const after = pet.getBoundingClientRect();

      const clickX = after.left + after.width / 2;
      const clickY = after.top + after.height / 2;
      pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: clickX, clientY: clickY }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: clickX, clientY: clickY }));
      await new Promise(resolve => setTimeout(resolve, 350));

      return {
        imagePath: new URL(image.src).pathname,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        before: { left: before.left, top: before.top },
        after: { left: after.left, top: after.top },
        dockVisible: document.getElementById('quickDock').classList.contains('visible'),
      };
    })()`);

    assert.match(result.imagePath, /\/pet\.png$/);
    assert.equal(result.naturalWidth, 812);
    assert.equal(result.naturalHeight, 812);
    assert.equal(Math.round(result.after.left - result.before.left), -70);
    assert.equal(Math.round(result.after.top - result.before.top), -45);
    assert.deepEqual(dragStates.slice(-4), [true, false, true, false]);
    assert.equal(result.dockVisible, true);
    assert(latestRegions.length > 0);

    const petRegion = latestRegions[0];
    const capture = await window.capturePage({
      x: Math.max(0, Math.floor(petRegion.x)),
      y: Math.max(0, Math.floor(petRegion.y)),
      width: Math.max(1, Math.ceil(petRegion.width)),
      height: Math.max(1, Math.ceil(petRegion.height)),
    });
    assert(capture.toPNG().length > 1000);
    console.log(JSON.stringify({ ...result, dragStates, regionCount: latestRegions.length, nativeHitPoint, profileIsolated: true }));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});

app.on('window-all-closed', event => event.preventDefault());
