const { app, BrowserWindow, screen, ipcMain, session, net, dialog, shell, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const TeemoFileService = require('./src/services/TeemoFileService');
const TeemoPermissionService = require('./src/permissions/TeemoPermissionService');
const registerTeemoPermissionIpc = require('./src/permissions/TeemoPermissionIpc');
const registerTeemoFileToolIpc = require('./src/tools/file/TeemoFileToolIpc');
const TeemoGitService = require('./src/services/TeemoGitService');
const registerTeemoGitToolIpc = require('./src/tools/git/TeemoGitToolIpc');
const TeemoExecuteService = require('./src/services/TeemoExecuteService');
const registerTeemoExecuteToolIpc = require('./src/tools/execute/TeemoExecuteToolIpc');
const TeemoInspirationSourceService = require('./src/inspiration/TeemoInspirationSourceService');
const TeemoLocalFolderService = require('./src/inspiration/TeemoLocalFolderService');
const registerTeemoLocalFolderIpc = require('./src/inspiration/TeemoLocalFolderIpc');
const dingtalkBridge = require('./dingtalk-bridge');
const materialBridge = require('./material-bridge');

const isWindows = process.platform === 'win32';
const appIcon = path.join(__dirname, 'icon', isWindows ? 'Teemo-app.png' : 'app.icns');
const TEEMO_ARCHIVE_DIR = 'D:\\Teemo助手';
const TEEMO_COMFY_OUTPUT_DIR = 'I:\\ComfyUI\\ComfyUI\\output';
const LOCAL_ACCESS_FILE = 'local-file-access.json';
const fileService = new TeemoFileService();
const teemoGitService = new TeemoGitService({ fileService });
const teemoExecuteService = new TeemoExecuteService({ fileService });
const teemoPermissionService = new TeemoPermissionService();
registerTeemoPermissionIpc(ipcMain, teemoPermissionService);

function localAccessFilePath() {
  return path.join(app.getPath('userData'), LOCAL_ACCESS_FILE);
}

function loadLocalAccessRoots() {
  return fileService.loadAuthorizedRoots(localAccessFilePath());
}

registerTeemoFileToolIpc(ipcMain, fileService, {
  rootsProvider: loadLocalAccessRoots,
  permissionService: teemoPermissionService,
});
registerTeemoGitToolIpc(ipcMain, teemoGitService, {
  rootsProvider: loadLocalAccessRoots,
  permissionService: teemoPermissionService,
});
registerTeemoExecuteToolIpc(ipcMain, teemoExecuteService, {
  rootsProvider: loadLocalAccessRoots,
  permissionService: teemoPermissionService,
});

function saveLocalAccessRoots(roots) {
  fileService.saveAuthorizedRoots(localAccessFilePath(), roots);
}

const teemoInspirationSourceService = new TeemoInspirationSourceService({
  fileService,
  rootsProvider: loadLocalAccessRoots,
});
const teemoLocalFolderService = new TeemoLocalFolderService({
  fileService,
  sourceService: teemoInspirationSourceService,
  rootsProvider: loadLocalAccessRoots,
});
registerTeemoLocalFolderIpc(ipcMain, {
  sourceService: teemoInspirationSourceService,
  localFolderService: teemoLocalFolderService,
  permissionService: teemoPermissionService,
  fileService,
  rootsProvider: loadLocalAccessRoots,
  saveRoots: saveLocalAccessRoots,
  selectFolder: async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || chatWindow || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '选择本地灵感文件夹',
      properties: ['openDirectory'],
    });
    return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
  },
});

function canonicalLocalPath(filePath) {
  return fileService.canonicalPath(filePath);
}

function isPathWithinRoot(rootPath, targetPath) {
  return fileService.isPathWithinRoot(rootPath, targetPath);
}

function resolveAuthorizedLocalPath(filePath) {
  return fileService.resolveAuthorizedPath(filePath, loadLocalAccessRoots());
}

async function localDocumentContent(filePath) {
  return fileService.readDocument(filePath);
}

function readImageBuffer(imageUrl) {
  if (String(imageUrl || '').startsWith('data:')) {
    const base64 = String(imageUrl).split(',')[1] || '';
    return Buffer.from(base64, 'base64');
  }
  return new Promise((resolve, reject) => {
    const request = net.request(String(imageUrl));
    const chunks = [];
    request.on('response', response => {
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
    request.end();
  });
}

function sanitizeFilePart(value, fallback) {
  return String(value || fallback).slice(0, 40).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_') || fallback;
}

ipcMain.handle('teemo:open-folder', async (_event, { folderPath } = {}) => {
  try {
    const target = String(folderPath || TEEMO_COMFY_OUTPUT_DIR);
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
    const result = await shell.openPath(target);
    if (result) return { ok: false, error: result };
    return { ok: true, path: target };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

function toFileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  return normalized.startsWith('file://') ? normalized : `file:///${normalized.replace(/^\/+/, '')}`;
}

function writeThumbnail(buffer, thumbPath, maxWidth = 320) {
  try {
    const image = nativeImage.createFromBuffer(buffer);
    if (!image || image.isEmpty()) return false;
    const size = image.getSize();
    const width = Math.min(maxWidth, size.width || maxWidth);
    const resized = size.width > width ? image.resize({ width }) : image;
    fs.writeFileSync(thumbPath, resized.toJPEG(82));
    return true;
  } catch (_) {
    return false;
  }
}

ipcMain.handle('teemo:archive-chat-image', async (_event, options = {}) => {
  try {
    const baseDir = String(options.archiveDir || TEEMO_ARCHIVE_DIR);
    const imagesDir = path.join(baseDir, 'images');
    const thumbsDir = path.join(baseDir, 'thumbs');
    const indexFile = path.join(baseDir, '生图记录.txt');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

    const buffer = await readImageBuffer(options.imageUrl);
    const stamp = new Date();
    const fileStamp = [
      stamp.getFullYear(),
      String(stamp.getMonth() + 1).padStart(2, '0'),
      String(stamp.getDate()).padStart(2, '0'),
      '_',
      String(stamp.getHours()).padStart(2, '0'),
      String(stamp.getMinutes()).padStart(2, '0'),
      String(stamp.getSeconds()).padStart(2, '0'),
    ].join('');
    const baseName = `${fileStamp}_${sanitizeFilePart(options.userPrompt, '生图')}`;
    const fileName = `${baseName}.png`;
    const thumbName = `${baseName}_thumb.jpg`;
    const filePath = path.join(imagesDir, fileName);
    const thumbPath = path.join(thumbsDir, thumbName);
    fs.writeFileSync(filePath, buffer);
    const hasThumb = writeThumbnail(buffer, thumbPath);

    const timeText = stamp.toLocaleString('zh-CN', { hour12: false });
    const lines = [
      `[${timeText}] ${String(options.userPrompt || '生图').trim()}`,
      `  图片文件: ${filePath}`,
    ];
    if (hasThumb) lines.push(`  缩略图: ${thumbPath}`);
    if (options.directUrl) lines.push(`  原始链接: ${options.directUrl}`);
    if (options.source) lines.push(`  来源: ${options.source}`);
    lines.push('');
    fs.appendFileSync(indexFile, lines.join('\n') + '\n', 'utf-8');

    return {
      ok: true,
      path: filePath,
      thumbPath: hasThumb ? thumbPath : filePath,
      thumbUrl: toFileUrl(hasThumb ? thumbPath : filePath),
      indexFile,
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});


// Windows 通知、任务栏分组和安装包快捷方式使用同一个稳定 ID。
if (isWindows) {
  app.setAppUserModelId('cn.teemo.assistant');
}

// ===== 全局错误兜底 =====
// 退出 / 断网时，主进程里在途的网络请求（钉钉 Stream、语雀等）可能抛
// net::ERR_FAILED / ERR_ABORTED / ERR_INTERNET_DISCONNECTED 等。
// 这类错误无害，但默认会触发 Electron 的「A JavaScript error occurred」致命弹窗打断用户。
// 这里统一拦截：网络类或退出期的异常只记日志、不弹窗；其余异常也记日志，避免直接崩。
let _isQuitting = false;
const _BENIGN_NET_ERR = /ERR_FAILED|ERR_ABORTED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION|net::/i;
function _isBenignNetError(err) {
  const msg = (err && (err.message || String(err))) || '';
  return _BENIGN_NET_ERR.test(msg);
}
process.on('uncaughtException', (err) => {
  if (_isQuitting || _isBenignNetError(err)) {
    console.warn('[main] 已忽略网络/退出期异常:', err && err.message);
    return;
  }
  console.error('[main] 未捕获异常:', err && (err.stack || err.message || err));
});
process.on('unhandledRejection', (reason) => {
  if (_isQuitting || _isBenignNetError(reason)) {
    console.warn('[main] 已忽略网络/退出期 Promise 拒绝:', reason && (reason.message || reason));
    return;
  }
  console.warn('[main] 未处理的 Promise 拒绝:', reason && (reason.stack || reason.message || reason));
});

// 自动更新（仅打包后生效；开发态 require 失败则忽略）
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* 开发态未安装依赖 */ }

/**
 * 检查并应用更新：从 GitHub Releases 拉取新版本，
 * 静默下载，下载完成后自动安装并重启（保证跟随发布者更新）。
 */
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    console.log('[update] 发现新版本:', info && info.version);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[update] 新版本已下载:', info && info.version);
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      console.warn('[update] 自动安装失败:', e && e.message);
    }
  });
  autoUpdater.on('error', (err) => console.warn('[update] 检查更新失败:', err && err.message));
  // 启动后延迟检查，避免拖慢冷启动
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.warn('[update]', e && e.message));
  }, 6000);
}

// 钉钉 Stream 客户端实例（单例，按凭据连接）
let dtStreamClient = null;

// 性能优化
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;
let chatWindow = null;
let tray = null;
let mouseProbeProcess = null;
let mouseProbeOutput = '';
const mouseProbeCallbacks = [];
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function startMouseProbe() {
  if (!isWindows || (mouseProbeProcess && !mouseProbeProcess.killed)) return;
  const probePath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'Teemo-mouse-press.ps1')
    : path.join(__dirname, 'Teemo-mouse-press.ps1');
  mouseProbeProcess = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', probePath,
  ], { windowsHide: true });
  mouseProbeProcess.stdout.on('data', chunk => {
    mouseProbeOutput += String(chunk);
    const lines = mouseProbeOutput.split(/\r?\n/);
    mouseProbeOutput = lines.pop() || '';
    for (const line of lines) {
      const callback = mouseProbeCallbacks.shift();
      if (callback) callback(line.trim() === 'long' ? 'long' : 'short');
    }
  });
  mouseProbeProcess.on('exit', () => {
    mouseProbeProcess = null;
    while (mouseProbeCallbacks.length) mouseProbeCallbacks.shift()('short');
  });
  mouseProbeProcess.on('error', () => {
    while (mouseProbeCallbacks.length) mouseProbeCallbacks.shift()('short');
  });
}

function probeExternalMousePress() {
  if (!isWindows) return Promise.resolve('short');
  startMouseProbe();
  return new Promise(resolve => {
    mouseProbeCallbacks.push(resolve);
    try { mouseProbeProcess.stdin.write('probe\n'); }
    catch (e) { mouseProbeCallbacks.pop(); resolve('short'); }
  });
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function getConfig() {
  const configPath = path.join(__dirname, 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * 配置网络代理
 * 优先级：config.json > 环境变量 HTTPS_PROXY/HTTP_PROXY > 系统代理
 * 解决：渲染进程 fetch 默认不跟随系统代理，导致 OpenAI 等海外 API 超时
 */
async function setupProxy() {
  let proxyRules = '';
  let mode = 'system'; // 默认跟随 macOS / Windows 系统代理

  // 1. config.json 显式指定代理
  try {
    const cfg = getConfig();
    if (cfg.proxy && typeof cfg.proxy === 'string' && cfg.proxy.trim()) {
      proxyRules = cfg.proxy.trim();
      mode = 'fixed_servers';
    }
  } catch (e) { /* 忽略，走默认 */ }

  // 2. 环境变量回退
  if (!proxyRules) {
    const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (envProxy) {
      proxyRules = envProxy;
      mode = 'fixed_servers';
    }
  }

  try {
    if (mode === 'fixed_servers') {
      // 例：http://127.0.0.1:7890
      await session.defaultSession.setProxy({ proxyRules, proxyBypassRules: '<local>' });
      console.log('[proxy] 使用固定代理:', proxyRules);
    } else {
      await session.defaultSession.setProxy({ mode: 'system' });
      console.log('[proxy] 跟随系统代理');
    }
  } catch (e) {
    console.warn('[proxy] 代理配置失败:', e.message);
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = display.workArea;
  console.log('[window] 主屏工作区尺寸:', screenWidth, 'x', screenHeight, ' 显示器数量:', screen.getAllDisplays().length);

  mainWindow = new BrowserWindow({
    // 覆盖整个屏幕工作区
    x: screenX,
    y: screenY,
    width: screenWidth,
    height: screenHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: appIcon,
    hasShadow: false,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile('index.html');

  // 把渲染进程的 console 和报错转发到主进程终端，便于排查
  mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
    const tag = ['LOG','INFO','WARN','ERROR'][level] || 'LOG';
    if (level >= 2) console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
  });

  // 关键：让透明区域鼠标穿透，forward 模式会把事件转发给渲染进程判断
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // 开发者工具（调试时取消注释）
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, isWindows ? 'normal' : 'floating');
    if (!isWindows) mainWindow.setVisibleOnAllWorkspaces(true);
    setupBlurHandler();
  });
}

// 处理拖拽 — 不再移动窗口，由渲染进程内部移动 DOM
ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  // 空操作，拖拽逻辑改为移动 DOM 元素
});

// 鼠标进入内容区域时取消穿透，离开时恢复穿透
ipcMain.on('mouse-enter-content', () => {
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('mouse-leave-content', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

// 面板/菜单打开时强制取消穿透
ipcMain.on('disable-passthrough', () => {
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('enable-passthrough', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

// 置顶切换
ipcMain.on('toggle-always-on-top', (event, value) => {
  mainWindow.setAlwaysOnTop(value, isWindows ? 'normal' : 'floating');
});

// 透明度设置
ipcMain.on('set-opacity', (event, value) => {
  mainWindow.setOpacity(value);
});

// 主进程监听窗口失焦
function setupBlurHandler() {
  mainWindow.on('blur', async () => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    if (!isWindows) {
      mainWindow.webContents.send('window-blurred');
      return;
    }

    // Windows 透明窗口会在用户从资源管理器拖文件时失焦。
    // 等待本次鼠标操作结束，再区分短按与长按：短按关闭，长按保留面板供拖放。
    const result = await probeExternalMousePress();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(result === 'long' ? 'external-long-press' : 'window-blurred');
  });
}

function openStandaloneChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    if (chatWindow.isMinimized()) chatWindow.restore();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  // 桌宠主窗口是透明全屏且始终置顶。独立聊天激活时将它隐藏，
  // 避免鼠标移动触发穿透切换，与聊天窗口争抢层级造成闪烁。
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();

  chatWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    frame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: isWindows ? { color: '#171717', symbolColor: '#d8d8d8', height: 44 } : undefined,
    backgroundColor: '#171717',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
    },
  });
  chatWindow.setMenuBarVisibility(false);
  chatWindow.loadFile(path.join(__dirname, 'Teemo-chat-window', 'Teemo-chat-window.html'));
  chatWindow.once('ready-to-show', () => {
    if (!chatWindow || chatWindow.isDestroyed()) return;
    chatWindow.maximize();
    chatWindow.show();
    chatWindow.focus();
  });
  chatWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });
  chatWindow.on('minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.showInactive();
  });
  chatWindow.on('restore', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });
  chatWindow.on('closed', () => {
    chatWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive();
      mainWindow.setAlwaysOnTop(true, isWindows ? 'normal' : 'floating');
    }
  });
}

function createSystemTray() {
  if (tray) return;
  let trayIcon = nativeImage.createFromPath(appIcon);
  if (!trayIcon.isEmpty() && isWindows) trayIcon = trayIcon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Teemo 私人助理');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Teemo 聊天', click: openStandaloneChatWindow },
    {
      label: '显示桌宠',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (chatWindow && !chatWindow.isDestroyed()) chatWindow.hide();
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, isWindows ? 'normal' : 'floating');
      },
    },
    {
      label: '隐藏桌宠',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      },
    },
    { type: 'separator' },
    { label: '退出 Teemo', click: () => app.quit() },
  ]));
  tray.on('click', openStandaloneChatWindow);
  tray.on('double-click', openStandaloneChatWindow);
}

ipcMain.on('open-standalone-chat', () => openStandaloneChatWindow());
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || !app.isPackaged) {
    return { ok: false, currentVersion: app.getVersion(), error: '开发模式不检查安装包更新' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result && result.updateInfo && result.updateInfo.version;
    return {
      ok: true,
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || app.getVersion(),
      updateAvailable: !!latestVersion && latestVersion !== app.getVersion(),
    };
  } catch (error) {
    return { ok: false, currentVersion: app.getVersion(), error: error && error.message ? error.message : '检查更新失败' };
  }
});

ipcMain.handle('teemo:local-access-list', () => {
  const roots = loadLocalAccessRoots().filter(root => fs.existsSync(root));
  return { ok: true, roots };
});

ipcMain.handle('teemo:local-access-add', async event => {
  try {
    const owner = BrowserWindow.fromWebContents(event.sender) || chatWindow || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '选择允许 Teemo 读取的文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const selected = canonicalLocalPath(result.filePaths[0]);
    const roots = loadLocalAccessRoots();
    if (!roots.some(root => String(root).toLowerCase() === selected.toLowerCase())) roots.push(selected);
    saveLocalAccessRoots(roots);
    return { ok: true, roots, selected };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('teemo:local-access-remove', (_event, { rootPath } = {}) => {
  try {
    const selected = String(rootPath || '');
    const roots = loadLocalAccessRoots().filter(root => root.toLowerCase() !== selected.toLowerCase());
    saveLocalAccessRoots(roots);
    return { ok: true, roots };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('teemo:local-list-directory', (_event, { rootPath, relativePath = '' } = {}) => {
  try {
    const base = resolveAuthorizedLocalPath(rootPath).target;
    const requested = canonicalLocalPath(path.resolve(base, String(relativePath || '')));
    if (!isPathWithinRoot(base, requested)) throw new Error('目录路径超出授权范围');
    const entries = fs.readdirSync(requested, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.'))
      .slice(0, 300)
      .map(entry => ({
        name: entry.name,
        path: path.join(requested, entry.name),
        relativePath: path.relative(base, path.join(requested, entry.name)),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, 'zh-CN'));
    return { ok: true, root: base, path: requested, entries };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('teemo:local-pick-document', async event => {
  try {
    const roots = loadLocalAccessRoots().filter(root => fs.existsSync(root));
    if (!roots.length) return { ok: false, needsAuthorization: true, error: '请先在设置中授权一个文件夹' };
    const owner = BrowserWindow.fromWebContents(event.sender) || chatWindow || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: '选择要让 Teemo 读取的本地文档',
      defaultPath: roots[0],
      properties: ['openFile'],
      filters: [
        { name: '文档', extensions: ['txt', 'md', 'json', 'csv', 'log', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'xml', 'sql', 'sh', 'ps1', 'pdf', 'docx'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const { target, root } = resolveAuthorizedLocalPath(result.filePaths[0]);
    const parsed = await localDocumentContent(target);
    return { ok: true, path: target, root, name: path.basename(target), ...parsed };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('teemo:local-read-document', async (_event, { filePath } = {}) => {
  try {
    const { target, root } = resolveAuthorizedLocalPath(filePath);
    const parsed = await localDocumentContent(target);
    return { ok: true, path: target, root, name: path.basename(target), ...parsed };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

// 面板拉伸 — 不再调整窗口，面板限制在窗口范围内
ipcMain.on('resize-panels', (event, { width, height }) => {
  // 不做任何事，窗口保持固定大小
});

// 获取配置
ipcMain.handle('get-config', () => {
  return getConfig();
});

/**
 * 保存图片到本地
 * @param {string} imageUrl - 图片 URL 或 base64 data URL
 * @param {string} suggestedName - 建议文件名
 */
ipcMain.handle('save-image', async (event, { imageUrl, suggestedName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存图片',
      defaultPath: path.join(app.getPath('downloads'), suggestedName || `hellobike_${Date.now()}.png`),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (canceled || !filePath) return { ok: false, error: '已取消' };

    let buffer;
    if (imageUrl.startsWith('data:')) {
      // base64 data URL
      const base64 = imageUrl.split(',')[1];
      buffer = Buffer.from(base64, 'base64');
    } else {
      // 远程 URL，用 net 模块下载（走系统代理）
      buffer = await new Promise((resolve, reject) => {
        const request = net.request(imageUrl);
        const chunks = [];
        request.on('response', (response) => {
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
        });
        request.on('error', reject);
        request.end();
      });
    }

    fs.writeFileSync(filePath, buffer);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 保存文本文件（技能导出等场景）
ipcMain.handle('save-text-file', async (event, { text, suggestedName, filters }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出文件',
      defaultPath: path.join(app.getPath('downloads'), suggestedName || `export_${Date.now()}.md`),
      filters: filters || [{ name: 'Markdown', extensions: ['md'] }, { name: '所有文件', extensions: ['*'] }],
    });
    if (canceled || !filePath) return { ok: false, error: '已取消' };
    fs.writeFileSync(filePath, String(text || ''), 'utf-8');
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 退出应用
ipcMain.on('quit-app', () => {
  app.quit();
});

// ===== 语雀文档读取 =====
// 复用 dragon-mcp 的接入机制：公网语雀 API + 团队内置 Token
// 调用放在主进程：用 Electron net 模块走 Chromium 网络栈，
// 自动信任系统根证书与系统代理（与浏览器一致），且无 CORS 限制

// 团队 Token 表（teamId -> { token, repo, name }）
// 真实 token 存放在 yuque-teams.local.json（已 gitignore，不提交）
// 复制 yuque-teams.example.json 为 yuque-teams.local.json 并填入真实 token
let YUQUE_TEAMS = {};
try {
  const teamsPath = path.join(__dirname, 'yuque-teams.local.json');
  if (fs.existsSync(teamsPath)) {
    const raw = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));
    // 过滤掉注释字段
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('_') || !v || typeof v !== 'object' || !v.token) continue;
      YUQUE_TEAMS[k] = v;
    }
    console.log('[yuque] 已加载团队 Token 配置，共', Object.keys(YUQUE_TEAMS).length, '个团队');
  } else {
    console.warn('[yuque] 未找到 yuque-teams.local.json，语雀读取功能不可用。请参考 yuque-teams.example.json 配置');
  }
} catch (e) {
  console.warn('[yuque] 加载团队 Token 配置失败:', e.message);
}

// 解析语雀 URL -> { teamId, repoId, docId }
function parseYuqueUrl(url) {
  const m = String(url).match(/hellobike\.yuque\.com\/([^\/?#]+)\/([^\/?#]+)\/([^\/?#]+)/);
  if (!m) return null;
  return { teamId: m[1], repoId: m[2], docId: m[3] };
}

// 调用公网语雀 API 读取单篇文档（Electron net 模块）
function fetchYuqueDoc({ teamId, repoId, docId }) {
  return new Promise((resolve, reject) => {
    const team = YUQUE_TEAMS[teamId];
    if (!team) return reject(new Error(`未配置团队「${teamId}」的访问令牌`));

    const request = net.request({
      method: 'GET',
      url: `https://www.yuque.com/api/v2/repos/${teamId}/${repoId}/docs/${docId}`,
    });
    request.setHeader('X-Auth-Token', team.token);
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('User-Agent', 'HelloBikeDesktopPet/1.0');

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.abort();
      reject(new Error('请求超时'));
    }, 30000);

    request.on('response', (response) => {
      response.on('data', (chunk) => (buf += chunk.toString()));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (response.statusCode !== 200) {
          return reject(new Error(`语雀返回 ${response.statusCode}：${buf.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(buf);
          resolve(json.data || null);
        } catch (e) {
          reject(new Error('语雀响应解析失败'));
        }
      });
    });
    request.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

// 渲染进程调用入口
ipcMain.handle('yuque-fetch-doc', async (event, url) => {
  const parsed = parseYuqueUrl(url);
  if (!parsed) {
    return { ok: false, error: '无法识别的语雀链接，格式应为 hellobike.yuque.com/团队/库/文档' };
  }
  try {
    const doc = await fetchYuqueDoc(parsed);
    if (!doc) return { ok: false, error: 'API 未返回文档数据' };
    return {
      ok: true,
      doc: {
        id: parsed.docId,
        title: doc.title || '未命名文档',
        content: doc.body || '',
        format: doc.format || 'lake',
        wordCount: doc.word_count || (doc.body || '').length,
        updated: doc.updated_at || '',
        team: YUQUE_TEAMS[parsed.teamId].name,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || '读取失败' };
  }
});

// ===== 语雀全文检索（按标题/正文搜索文档，走官方 /api/v2/search）=====

/** 清洗搜索结果里的高亮 HTML（<em>关键词</em>）与 HTML 实体 */
function _stripYuqueHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

/** 归一化单条搜索结果：抽标题/摘要，尽量拼出可读取的 hellobike 文档链接 */
function _normalizeYuqueSearchItem(it, teamId, team) {
  const title = _stripYuqueHtml(it.title);
  const summary = _stripYuqueHtml(it.summary || it.info || '');
  // 构造文档 web 链接：优先用返回的 url/web_url，其次用 target 里的 namespace+slug 拼
  let webUrl = '';
  const raw = it.url || it.web_url || '';
  if (/^https?:\/\//.test(raw)) webUrl = raw;
  else if (raw && raw.startsWith('/')) webUrl = 'https://hellobike.yuque.com' + raw;
  const tgt = it.target || {};
  const ns = (tgt.book && tgt.book.namespace) || it.namespace || '';
  const slug = tgt.slug || it.slug || '';
  if (!webUrl && ns && slug) webUrl = `https://hellobike.yuque.com/${ns}/${slug}`;
  return { title, summary, url: webUrl, teamId, teamName: team.name, slug, id: it.id };
}

/** 在单个团队 scope 下调用语雀搜索 API，失败返回空数组（不阻断其它团队） */
function searchYuqueDocsInTeam(teamId, query) {
  return new Promise((resolve) => {
    const team = YUQUE_TEAMS[teamId];
    if (!team) return resolve([]);
    const url = `https://www.yuque.com/api/v2/search?type=doc&q=${encodeURIComponent(query)}&scope=${encodeURIComponent(teamId)}`;
    const request = net.request({ method: 'GET', url });
    request.setHeader('X-Auth-Token', team.token);
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('User-Agent', 'HelloBikeDesktopPet/1.0');

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => { if (settled) return; settled = true; request.abort(); resolve([]); }, 20000);
    request.on('response', (response) => {
      response.on('data', (chunk) => (buf += chunk.toString()));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (response.statusCode !== 200) {
          console.warn('[yuque-search] team=%s status=%s %s', teamId, response.statusCode, buf.slice(0, 150));
          return resolve([]);
        }
        try {
          const json = JSON.parse(buf);
          const arr = Array.isArray(json.data) ? json.data : [];
          // 首条原始结构打印一次，便于确认字段（不同版本 url/target 结构可能有差异）
          if (arr.length) console.log('[yuque-search] team=%s hit=%s sample=%s', teamId, arr.length, JSON.stringify(arr[0]).slice(0, 300));
          resolve(arr.map((it) => _normalizeYuqueSearchItem(it, teamId, team)));
        } catch (e) {
          resolve([]);
        }
      });
    });
    request.on('error', () => { if (settled) return; settled = true; clearTimeout(timer); resolve([]); });
    request.end();
  });
}

// 渲染进程调用入口：跨已配置团队全文检索，合并去重
ipcMain.handle('yuque-search', async (event, { query, teamId } = {}) => {
  const q = String(query || '').trim();
  if (!q) return { ok: true, results: [] };
  const teams = (teamId && YUQUE_TEAMS[teamId]) ? [teamId] : Object.keys(YUQUE_TEAMS);
  if (!teams.length) return { ok: false, error: '未配置任何团队 Token' };
  try {
    const all = await Promise.all(teams.map((t) => searchYuqueDocsInTeam(t, q)));
    const merged = [];
    const seen = new Set();
    for (const list of all) {
      for (const it of list) {
        const key = it.url || it.title;
        if (key && !seen.has(key)) { seen.add(key); merged.push(it); }
      }
    }
    console.log('[yuque-search] q=%s 团队数=%s 命中=%s', q, teams.length, merged.length);
    return { ok: true, results: merged.slice(0, 20) };
  } catch (e) {
    return { ok: false, error: e.message || '搜索失败' };
  }
});

// ===== 钉钉机器人 Stream 接入 =====
// 实名 AI 助理机器人：接收「用户单聊机器人 / 群内@机器人」的消息，AI 协助处理与回复
// 仅能收到主动发给本机器人的消息，不读取用户其它私聊历史；回复以机器人身份发出，不冒充真人

// 连接钉钉：用 AppKey/AppSecret 建立 Stream 长连接
ipcMain.handle('dingtalk:connect', async (event, { appKey, appSecret }) => {
  if (!appKey || !appSecret) return { ok: false, error: '缺少 AppKey / AppSecret' };
  try {
    // 已有连接先关闭
    if (dtStreamClient) { dtStreamClient.close(); dtStreamClient = null; }
    dtStreamClient = new dingtalkBridge.StreamClient(
      { appKey, appSecret },
      {
        onMessage: (payload) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('dingtalk:message', payload);
          }
        },
        onStatus: (status, detail) => {
          console.log('[dingtalk:status]', status, detail || '');   // 主进程可见的连接状态
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('dingtalk:status', { status, detail: detail || '' });
          }
        },
      }
    );
    await dtStreamClient.connect();
    console.log('[dingtalk:connect] 已发起连接 appKey=', String(appKey).slice(0, 8) + '***');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '连接失败' };
  }
});

// 断开钉钉连接
ipcMain.handle('dingtalk:disconnect', async () => {
  if (dtStreamClient) { dtStreamClient.close(); dtStreamClient = null; }
  return { ok: true };
});

// 回复会话（POST sessionWebhook）
ipcMain.handle('dingtalk:reply', async (event, { sessionWebhook, text, title }) => {
  // 诊断日志：确认是否拿到 webhook、内容长度
  console.log('[dingtalk:reply] webhook=%s textLen=%s',
    sessionWebhook ? sessionWebhook.slice(0, 60) + '...' : '(空)',
    (text || '').length);
  const res = await dingtalkBridge.replyToSession(sessionWebhook, { text, title });
  console.log('[dingtalk:reply] 结果:', JSON.stringify(res));
  return res;
});

// 给对方发送素材缩略图（下载→上传钉钉媒体→机器人发图片消息）
ipcMain.handle('dingtalk:send-images', async (event, opts) => {
  return await dingtalkBridge.sendMaterialImages(opts || {});
});

// 把钉钉消息里的图片下载码换成可下载 URL（改图取原图用）
ipcMain.handle('dingtalk:download-file', async (event, opts) => {
  return await dingtalkBridge.downloadMessageFileUrl(opts || {});
});

// 获取 access_token（主动发消息等场景预留）
ipcMain.handle('dingtalk:get-token', async (event, { appKey, appSecret }) => {
  try {
    const token = await dingtalkBridge.getAccessToken(appKey, appSecret);
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== 素材库（DesignHub）接入 =====
// 登录换 token，用 token 搜索素材；token 由渲染层持久化，逐次传入
ipcMain.handle('material:login', async (event, { email, password }) => {
  return await materialBridge.dhLogin(email, password);
});
ipcMain.handle('material:search', async (event, opts) => {
  return await materialBridge.dhSearch(opts || {});
});
// DesignHub AI 智能改图：参考图 + 描述 → 生成变体图
ipcMain.handle('material:generate-variant', async (event, opts) => {
  return await materialBridge.dhGenerateVariant(opts || {});
});
ipcMain.handle('material:image', async (event, { token, url }) => {
  return await materialBridge.dhImage(token, url);
});

if (gotSingleInstanceLock) app.whenReady().then(async () => {
  // macOS Dock 图标（必须在窗口创建前设置）
  if (app.dock) {
    app.dock.setIcon(path.join(__dirname, 'icon', 'dock-icon.png'));
  }
  await setupProxy();
  startMouseProbe();
  createWindow();
  createSystemTray();
  setupAutoUpdate();
});
// 退出前：标记退出中 + 关闭钉钉长连接，避免在途请求被中断后抛 net::ERR_FAILED 弹窗
app.on('before-quit', () => {
  _isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  try { if (mouseProbeProcess) mouseProbeProcess.kill(); } catch (e) { /* ignore */ }
  try { if (dtStreamClient) { dtStreamClient.close(); dtStreamClient = null; } } catch (e) { /* ignore */ }
});
app.on('window-all-closed', () => app.quit());
