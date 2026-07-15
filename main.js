const { app, BrowserWindow, screen, ipcMain, session, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dingtalkBridge = require('./dingtalk-bridge');
const materialBridge = require('./material-bridge');

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
 * 静默下载，下载完成后提示用户重启以应用（保证跟随发布者更新）。
 */
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    console.log('[update] 发现新版本:', info && info.version);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[update] 新版本已下载:', info && info.version);
    try {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['立即重启更新', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '发现新版本',
        message: `哈啰设计助手 ${info && info.version} 已下载完成`,
        detail: '重启后即可使用最新版本（含最新的机器人规则与能力）。',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    } catch (e) { /* 忽略 */ }
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

app.whenReady().then(async () => {
  // macOS Dock 图标（必须在窗口创建前设置）
  if (app.dock) {
    app.dock.setIcon(path.join(__dirname, 'icon', 'dock-icon.png'));
  }
  await setupProxy();
  createWindow();
  setupAutoUpdate();
});
// 退出前：标记退出中 + 关闭钉钉长连接，避免在途请求被中断后抛 net::ERR_FAILED 弹窗
app.on('before-quit', () => {
  _isQuitting = true;
  try { if (dtStreamClient) { dtStreamClient.close(); dtStreamClient = null; } } catch (e) { /* ignore */ }
});
app.on('window-all-closed', () => app.quit());
