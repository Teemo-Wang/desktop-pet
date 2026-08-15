const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
  };
}

function createElement({ width = 0, height = 0 } = {}) {
  const listeners = new Map();
  const element = {
    style: {},
    classList: createClassList(),
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) listener({ button: 0, preventDefault() {}, clientX: 0, clientY: 0, ...event });
    },
    getBoundingClientRect() {
      const left = Number.parseFloat(element.style.left) || 0;
      const top = Number.parseFloat(element.style.top) || 0;
      return { left, top, width, height, right: left + width, bottom: top + height };
    },
  };
  return element;
}

function loadPetComponent() {
  const sent = [];
  const documentListeners = new Map();
  const image = createElement({ width: 130, height: 150 });
  const pet = createElement({ width: 130, height: 156 });
  pet.querySelector = selector => selector === '.pet-image' ? image : null;
  const hover = createElement();
  const body = createElement();
  const elements = { petArea: pet, hoverBubble: hover };
  const document = {
    body,
    readyState: 'complete',
    documentElement: { clientWidth: 1200, clientHeight: 700 },
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '.panel') return [];
      return selector.includes('#petArea') ? [pet] : [];
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    dispatch(type, event) {
      const listener = documentListeners.get(type);
      if (listener) listener(event);
    },
  };
  const windowListeners = new Map();
  const window = {
    innerWidth: 1200,
    innerHeight: 700,
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  const ipcRenderer = { send: (channel, value) => sent.push({ channel, value }) };
  const context = {
    console,
    document,
    window,
    MutationObserver: class { observe() {} },
    requestAnimationFrame: callback => callback(),
    setTimeout,
    clearTimeout,
    require: name => {
      assert.equal(name, 'electron');
      return { ipcRenderer };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'components', 'pet.js'), 'utf8'), context);
  return { PetComponent: window.PetComponent, document, pet, sent };
}

function testLatestPetAsset() {
  const bytes = fs.readFileSync(path.join(root, 'pet.png'));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, 'dcfdd095ad0b4e2117bdfe456f59f75ab9e5a506b53aa45fdf833458a47150fd');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /class="pet-image" src="pet\.png"/);
}

function testMainProcessHitRegions() {
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.match(source, /teemoWindowsDesktopHitTest\.getCursorClientPoint\(mainWindow\)/);
  assert.match(source, /teemoWindowsDesktopHitTest\.setMousePassthrough\(mainWindow, ignore\)/);
  assert.match(source, /setInterval\(refreshDesktopMousePassthrough, 40\)/);
  assert.match(source, /if \(desktopDragActive \|\| desktopInteractionForced\) return true/);
  assert.match(source, /event\.sender !== mainWindow\.webContents/);
  assert.match(source, /screen\.on\('display-metrics-changed', syncDesktopWindowToPrimaryDisplay\)/);
  assert.doesNotMatch(source, /mainWindow\.setShape\(/);
}

function testWindowsMixedDpiHitCoordinates() {
  const TeemoWindowsDesktopHitTest = require(path.join(root, 'src', 'runtime', 'TeemoWindowsDesktopHitTest'));
  const handle = Buffer.alloc(8);
  handle.writeBigUInt64LE(66756n);
  const hitTest = new TeemoWindowsDesktopHitTest({
    platform: 'win32',
    nativeApi: {
      getCursorPos(point) { Object.assign(point, { x: 548, y: 580 }); return true; },
      clientToScreen(_hwnd, point) { Object.assign(point, { x: -1440, y: -152 }); return true; },
      getClientRect(_hwnd, rect) {
        Object.assign(rect, { left: 0, top: 0, right: 2560, bottom: 1380 });
        return true;
      },
    },
  });
  const point = hitTest.getCursorClientPoint({
    getNativeWindowHandle: () => handle,
    getContentBounds: () => ({ x: -1152, y: -122, width: 2048, height: 1104 }),
  });
  assert.equal(Math.round(point.x), 1590);
  assert.equal(Math.round(point.y), 586);
}

function testWindowsNativePassthroughState() {
  const TeemoWindowsDesktopHitTest = require(path.join(root, 'src', 'runtime', 'TeemoWindowsDesktopHitTest'));
  const handle = Buffer.alloc(8);
  handle.writeBigUInt64LE(66756n);
  let style = 0x80028;
  const updates = [];
  const hitTest = new TeemoWindowsDesktopHitTest({
    platform: 'win32',
    nativeApi: {
      getWindowLongPtr: () => style,
      setWindowLongPtr(_hwnd, index, value) { updates.push({ index, value }); style = value; return 0x80028; },
      setWindowPos(_hwnd, after, x, y, width, height, flags) {
        updates.push({ after, x, y, width, height, flags });
        return true;
      },
    },
  });
  const window = { getNativeWindowHandle: () => handle };
  assert.equal(hitTest.setMousePassthrough(window, false), true);
  assert.equal(style & 0x20, 0);
  assert.equal(updates.at(-1).flags, 0x37);
  assert.equal(hitTest.setMousePassthrough(window, true), true);
  assert.equal(style & 0x20, 0x20);
}

function testPetDragLifecycle() {
  const { PetComponent, document, pet, sent } = loadPetComponent();
  new PetComponent();
  const initialLeft = Number.parseFloat(pet.style.left);
  const initialTop = Number.parseFloat(pet.style.top);

  pet.dispatch('mousedown', { button: 0, clientX: 1100, clientY: 560 });
  document.dispatch('mousemove', { clientX: 1060, clientY: 530 });
  document.dispatch('mouseup', {});

  assert.equal(Number.parseFloat(pet.style.left), initialLeft - 40);
  assert.equal(Number.parseFloat(pet.style.top), initialTop - 30);
  const dragStates = sent.filter(item => item.channel === 'desktop-drag-state').map(item => item.value);
  assert.deepEqual(dragStates, [true, false]);
  assert(sent.some(item => item.channel === 'desktop-interactive-regions'));
}

testLatestPetAsset();
testMainProcessHitRegions();
testWindowsMixedDpiHitCoordinates();
testWindowsNativePassthroughState();
testPetDragLifecycle();
console.log('Teemo desktop pet interaction: PASS');
