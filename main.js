const { app, BrowserWindow, screen, ipcMain, session, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 性能优化
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow;

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
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  console.log('[window] 主屏工作区尺寸:', screenWidth, 'x', screenHeight, ' 显示器数量:', screen.getAllDisplays().length);

  mainWindow = new BrowserWindow({
    // 覆盖整个屏幕工作区
    x: 0,
    y: 0,
    width: screenWidth,
    height: screenHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon', 'app.icns'),
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

  // 关键：让透明区域鼠标穿透，forward 模式会把事件转发给渲染进程判断
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // 开发者工具（调试时取消注释）
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(true);
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
  mainWindow.setAlwaysOnTop(value, 'floating');
});

// 透明度设置
ipcMain.on('set-opacity', (event, value) => {
  mainWindow.setOpacity(value);
});

// 主进程监听窗口失焦
function setupBlurHandler() {
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-blurred');
  });
}

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

app.whenReady().then(async () => {
  // macOS Dock 图标（必须在窗口创建前设置）
  if (app.dock) {
    app.dock.setIcon(path.join(__dirname, 'icon', 'dock-icon.png'));
  }
  await setupProxy();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
