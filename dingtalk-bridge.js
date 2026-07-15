/**
 * 钉钉 Stream 桥接模块（主进程）
 *
 * 职责：
 *   1. 用 AppKey/AppSecret 建立 Stream 模式 WebSocket 长连接，实时接收「用户单聊机器人 / 群内@机器人」的消息
 *   2. 把收到的消息通过 IPC 推送给渲染进程（webContents.send('dingtalk:message', payload)）
 *   3. 提供「向当前会话回复」能力（POST sessionWebhook，2 小时有效）
 *   4. 提供 access_token 获取（主动发消息等场景预留）
 *
 * 合规说明：
 *   - 仅能收到「用户主动发给本机器人」的消息，无法读取用户的其它私聊历史
 *   - 机器人以「实名 AI 助理」身份回复，不冒充真人账号
 *
 * 依赖：ws（WebSocket 客户端，Node 20 无稳定全局 WebSocket）
 * 网络：access_token / 网关握手用 Electron net 模块（走系统代理、信任系统根证书）
 */
const { net } = require('electron');
const WebSocket = require('ws');

// 钉钉开放平台网关
const GATEWAY_OPEN_URL = 'https://api.dingtalk.com/v1.0/gateway/connections/open';
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';
// 机器人消息订阅主题
const TOPIC_BOT_MESSAGE = '/v1.0/im/bot/messages/get';

/**
 * 用 Electron net 模块发起 JSON 请求（Promise 封装）
 * @param {object} opts - { method, url, headers, body }
 * @returns {Promise<{statusCode:number, json:object|null, raw:string}>}
 */
function netRequestJSON({ method = 'GET', url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });
    request.setHeader('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(headers)) request.setHeader(k, v);

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.abort();
      reject(new Error('请求超时'));
    }, 20000);

    request.on('response', (response) => {
      response.on('data', (chunk) => (buf += chunk.toString()));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* 非 JSON 响应 */ }
        resolve({ statusCode: response.statusCode, json, raw: buf });
      });
    });
    request.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    if (body) request.write(typeof body === 'string' ? body : JSON.stringify(body));
    request.end();
  });
}

// access_token 缓存（避免频繁请求；钉钉 token 有效期约 7200s）
let _tokenCache = { value: '', expireAt: 0, appKey: '' };

/**
 * 获取 access_token（带缓存）
 * @param {string} appKey
 * @param {string} appSecret
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(appKey, appSecret) {
  const now = Date.now();
  if (_tokenCache.value && _tokenCache.appKey === appKey && _tokenCache.expireAt > now + 60000) {
    return _tokenCache.value;
  }
  const { statusCode, json } = await netRequestJSON({
    method: 'POST',
    url: TOKEN_URL,
    body: { appKey, appSecret },
  });
  if (statusCode !== 200 || !json || !json.accessToken) {
    throw new Error(`获取 access_token 失败 (${statusCode})：${json ? (json.message || JSON.stringify(json)) : '无响应'}`);
  }
  _tokenCache = {
    value: json.accessToken,
    appKey,
    // expireIn 单位秒，提前 5 分钟过期
    expireAt: now + (json.expireIn || 7200) * 1000 - 300000,
  };
  return json.accessToken;
}

/**
 * 调用网关 open 接口，换取 WebSocket 连接地址 + ticket
 * @param {string} appKey
 * @param {string} appSecret
 * @returns {Promise<{endpoint:string, ticket:string}>}
 */
async function openConnection(appKey, appSecret) {
  const { statusCode, json } = await netRequestJSON({
    method: 'POST',
    url: GATEWAY_OPEN_URL,
    body: {
      clientId: appKey,
      clientSecret: appSecret,
      ua: 'hellobike-desktop-pet/1.0',
      subscriptions: [
        { type: 'CALLBACK', topic: TOPIC_BOT_MESSAGE },
      ],
    },
  });
  if (statusCode !== 200 || !json || !json.endpoint || !json.ticket) {
    throw new Error(`网关握手失败 (${statusCode})：${json ? (json.message || JSON.stringify(json)) : '无响应'}`);
  }
  return { endpoint: json.endpoint, ticket: json.ticket };
}

/**
 * 向会话回复消息（POST 钉钉回调里带的 sessionWebhook，有效期约 2 小时）
 * @param {string} sessionWebhook
 * @param {object} options - { text, title }  text=纯文本；提供 title 时按 markdown 发送
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function replyToSession(sessionWebhook, { text, title } = {}) {
  if (!sessionWebhook) return { ok: false, error: '缺少 sessionWebhook（会话回复地址已失效或为空）' };
  let body;
  if (title) {
    body = { msgtype: 'markdown', markdown: { title: title || '助理回复', text: String(text || '') } };
  } else {
    body = { msgtype: 'text', text: { content: String(text || '') } };
  }
  try {
    const { statusCode, json, raw } = await netRequestJSON({ method: 'POST', url: sessionWebhook, body });
    // 诊断日志：打印钉钉网关的原始返回
    console.log('[replyToSession] statusCode=%s raw=%s', statusCode, (raw || '').slice(0, 300));
    // 钉钉成功返回 errcode:0
    if (statusCode === 200 && json && (json.errcode === 0 || json.errcode === undefined)) {
      return { ok: true };
    }
    return { ok: false, error: json ? (json.errmsg || JSON.stringify(json)) : `HTTP ${statusCode}` };
  } catch (e) {
    console.warn('[replyToSession] 异常:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Stream 长连接客户端
 * 生命周期：connect() → 握手拿 endpoint/ticket → 建立 ws → 收消息/心跳 → 断线自动重连
 */
class StreamClient {
  /**
   * @param {object} cfg - { appKey, appSecret }
   * @param {object} handlers - { onMessage(payload), onStatus(status, detail) }
   */
  constructor(cfg, handlers = {}) {
    this.appKey = cfg.appKey;
    this.appSecret = cfg.appSecret;
    this.onMessage = handlers.onMessage || (() => {});
    this.onStatus = handlers.onStatus || (() => {});
    this.ws = null;
    this.manualClosed = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 2000; // 初始重连延迟，指数退避
    this.lastActiveAt = Date.now();   // 最后一次收到任何帧（含 ping）的时间
    this.watchdogTimer = null;        // 心跳看门狗
    this.WATCHDOG_INTERVAL = 10 * 60 * 1000; // 每 10 分钟检测一次
  }

  async connect() {
    this.manualClosed = false;
    try {
      this.onStatus('connecting');
      const { endpoint, ticket } = await openConnection(this.appKey, this.appSecret);
      const url = `${endpoint}?ticket=${encodeURIComponent(ticket)}`;
      this.ws = new WebSocket(url);
      this._bindWs();
      this._startWatchdog();
    } catch (e) {
      this.onStatus('error', e.message);
      this._scheduleReconnect();
    }
  }

  /** 心跳看门狗：每 10 分钟检测，若超过 10 分钟没收到任何帧（含钉钉 ping），判定连接假死 → 强制重连 */
  _startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (this.manualClosed) return;
      const idle = Date.now() - this.lastActiveAt;
      if (idle > this.WATCHDOG_INTERVAL) {
        this.onStatus('error', `连接假死（${Math.round(idle / 60000)} 分钟无心跳），强制重连`);
        // 关掉旧连接（可能是半死状态，close 事件不一定触发），主动重连
        try { if (this.ws) this.ws.terminate ? this.ws.terminate() : this.ws.close(); } catch (e) {}
        this.ws = null;
        this.lastActiveAt = Date.now();
        this._scheduleReconnect();
      }
    }, this.WATCHDOG_INTERVAL);
  }

  _bindWs() {
    this.ws.on('open', () => {
      this.reconnectDelay = 2000; // 重置退避
      this.lastActiveAt = Date.now();
      this.onStatus('connected');
    });
    this.ws.on('message', (raw) => { this.lastActiveAt = Date.now(); this._handleFrame(raw); });
    this.ws.on('close', () => {
      this.onStatus('disconnected');
      if (!this.manualClosed) this._scheduleReconnect();
    });
    this.ws.on('error', (err) => {
      this.onStatus('error', err.message);
      // error 后通常会触发 close，由 close 负责重连
    });
  }

  _scheduleReconnect() {
    if (this.manualClosed) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(this.reconnectDelay, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, delay);
  }

  close() {
    this.manualClosed = true;
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }
    this.onStatus('closed');
  }
}

/**
 * 处理一帧 Stream 数据
 * 钉钉帧结构：{ specVersion, type, headers:{messageId, topic, ...}, data:"json字符串" }
 *   type: SYSTEM（含心跳 ping）/ CALLBACK（业务回调，如机器人消息）/ EVENT（事件）
 * 收到后必须按 messageId 回 ACK，否则会重发。
 */
StreamClient.prototype._handleFrame = function (raw) {
  let frame;
  try { frame = JSON.parse(raw.toString()); } catch (e) { return; }
  const headers = frame.headers || {};
  const type = frame.type || headers.type;

  // 系统心跳：回 ping/pong，保持连接
  if (type === 'SYSTEM') {
    const topic = headers.topic;
    if (topic === 'ping') {
      this._send({ code: 200, headers: { contentType: 'application/json', messageId: headers.messageId }, data: frame.data });
    }
    return;
  }

  // 业务回调：机器人消息
  if (type === 'CALLBACK') {
    let data = {};
    try { data = JSON.parse(frame.data || '{}'); } catch (e) { /* ignore */ }
    // 先 ACK，避免重发
    this._ack(headers.messageId);
    // 诊断日志：确认收到的消息是否带 sessionWebhook（回复的关键）
    console.log('[bot message] conv=%s sender=%s msgtype=%s hasWebhook=%s',
      data.conversationId, data.senderNick, data.msgtype,
      !!data.sessionWebhook);
    // 非文本消息：打印完整原始帧，用于确认文件/文件夹消息的真实结构
    if (data.msgtype && data.msgtype !== 'text') {
      console.log('[bot message RAW] msgtype=' + data.msgtype + ' data=' + JSON.stringify(data).slice(0, 1500));
    }
    // 归一化后向上抛
    const payload = normalizeBotMessage(data);
    if (payload) this.onMessage(payload);
    return;
  }
};

/** 回 ACK（业务处理成功） */
StreamClient.prototype._ack = function (messageId) {
  this._send({
    code: 200,
    headers: { contentType: 'application/json', messageId },
    data: JSON.stringify({ status: 'SUCCESS', message: 'OK' }),
  });
};

/** 发送一帧（容错：连接未就绪时静默丢弃） */
StreamClient.prototype._send = function (obj) {
  try {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  } catch (e) { /* ignore */ }
};

/**
 * 把钉钉机器人原始消息归一化为 App 内部结构
 * 钉钉字段参考：senderNick / senderStaffId / conversationType("1"单聊,"2"群) /
 *   conversationTitle / conversationId / sessionWebhook / msgtype / text.content / createAt
 * @param {object} d - 原始回调 data
 * @returns {object|null}
 */
function normalizeBotMessage(d) {
  if (!d || !d.conversationId) return null;
  const isGroup = String(d.conversationType) === '2';
  // 文本内容 + 图片下载码（供后续下载原图做改图）
  let content = '';
  const imageDownloadCodes = [];   // 钉钉图片下载码，需再调下载接口换 downloadUrl
  if (d.msgtype === 'text' && d.text) {
    content = (d.text.content || '').trim();
  } else if (d.msgtype === 'picture') {
    // 纯图片消息：content 里可能带 downloadCode
    const dc = (d.content && (d.content.downloadCode || d.content.pictureDownloadCode)) || '';
    if (dc) imageDownloadCodes.push(dc);
    content = '[图片]';
  } else if (d.msgtype === 'richText') {
    // 富文本（图文混排）：从 content.richText 数组里抽出文字 + 图片下载码
    const parsed = _parseRichText(d.content && d.content.richText);
    content = parsed.text || (parsed.hasImage ? '[图片]' : '[富文本消息]');
    imageDownloadCodes.push(...parsed.downloadCodes);
  } else if (d.msgtype === 'audio') {
    content = '[语音]';
  } else if (d.msgtype === 'file') {
    // 文件/文件夹消息（钉钉把上传的文件夹压成压缩包下发）
    // 字段名各版本可能不同，这里打印原始结构以便确认；并尽量抽取下载码与文件名
    console.log('[dingtalk] 收到 file 消息原始结构:', JSON.stringify(d.content || d));
    content = '[文件]';
  } else {
    console.log('[dingtalk] 收到未知类型消息 msgtype=' + d.msgtype + ' 原始:', JSON.stringify(d.content || d).slice(0, 500));
    content = `[${d.msgtype || '未知'}消息]`;
  }

  // 文件上传（含文件夹压缩包）：容错抽取下载码 + 文件名
  let fileUpload = null;
  const fc = d.content || {};
  const fdc = fc.downloadCode || fc.fileDownloadCode || fc.spaceCode || '';
  const fname = fc.fileName || fc.name || '';
  if (d.msgtype === 'file' && fdc) {
    fileUpload = { downloadCode: fdc, fileName: fname };
  }

  // 引用回复：钉钉「引用某条消息 + 追加指令」时，被引用原消息里的图片/文本可能随回调下发（字段各版本不一，
  // 且不保证一定下发）。这里做容错解析——把被引用消息的图片下载码并入 imageDownloadCodes，
  // 让后续改图逻辑能直接把「你引用的那张图」当作要处理的原图；被引用文本单独透出，供上下文参考。
  let quotedText = '';
  try {
    const quote = _extractQuote(d);
    if (quote.found) {
      console.log('[dingtalk] 检测到引用内容 codes=%s textLen=%s', quote.downloadCodes.length, (quote.text || '').length);
      for (const c of quote.downloadCodes) {
        if (c && !imageDownloadCodes.includes(c)) imageDownloadCodes.push(c);
      }
      quotedText = quote.text || '';
    }
  } catch (e) { /* 引用解析失败不影响主流程 */ }
  // 诊断：文本消息若含疑似「引用」字段但没解析出内容，打印原始结构以便定位钉钉真实字段名
  if (d.msgtype === 'text' && !quotedText) {
    try {
      const rawStr = JSON.stringify(d);
      if (/(reply|quote|origin|refer|cite)/i.test(rawStr)) {
        console.log('[dingtalk] text 含疑似引用字段，原始:', rawStr.slice(0, 1500));
      }
    } catch (e) { /* ignore */ }
  }

  const ts = d.createAt ? Number(d.createAt) : Date.now();
  const hhmm = (() => {
    const dt = new Date(ts);
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  })();

  return {
    convId: d.conversationId,
    type: isGroup ? 'group' : 'single',
    name: isGroup ? (d.conversationTitle || '群聊') : (d.senderNick || '同事'),
    sender: d.senderNick || '同事',
    senderId: d.senderStaffId || '',
    content,
    msgtype: d.msgtype || 'text',
    imageDownloadCodes,   // 富文本/图片消息中的图片下载码（可能为空数组）
    fileUpload,           // 文件/文件夹上传（含压缩包下载码），无则 null
    time: hhmm,
    timestamp: ts,
    quotedText,            // 被引用消息的文本（引用回复场景，可能为空）
    sessionWebhook: d.sessionWebhook || '',
    sessionWebhookExpiredTime: d.sessionWebhookExpiredTime || 0,
    robotCode: d.robotCode || d.chatbotUserId || '',
  };
}

/**
 * 广谱容错解析钉钉「引用回复」中被引用的原消息（图片下载码 + 文本）。
 *
 * 背景：钉钉对不同客户端/版本，引用信息挂载的字段名不固定（可能是 replyMessage / quoteMessage /
 *   originalMessage 等），且机器人回调不保证下发被引用消息。为兼容各版本，这里递归扫描回调 data，
 *   凡处于「引用容器」（键名含 reply/quote/origin/refer/cite）内的下载码与文本一并抽取。
 *
 * @param {object} d 原始回调 data
 * @returns {{ downloadCodes:string[], text:string, found:boolean }}
 */
function _extractQuote(d) {
  const out = { downloadCodes: [], text: '', found: false };
  if (!d || typeof d !== 'object') return out;
  const QUOTE_KEY = /(reply|quote|origin|refer|cite|quoted|referenced)/i;
  const CODE_KEY = /downloadcode/i;
  const TEXT_KEY = /(text|content|title)/i;
  const seenCode = new Set();
  const texts = [];
  const visit = (node, inQuote, depth) => {
    if (!node || typeof node !== 'object' || depth > 5) return;
    if (Array.isArray(node)) { for (const it of node) visit(it, inQuote, depth + 1); return; }
    for (const [k, v] of Object.entries(node)) {
      const here = inQuote || QUOTE_KEY.test(k);
      if (here && typeof v === 'string' && v.trim()) {
        if (CODE_KEY.test(k)) {
          if (!seenCode.has(v)) { seenCode.add(v); out.downloadCodes.push(v); }
          out.found = true;
        } else if (TEXT_KEY.test(k)) {
          texts.push(v.trim());
          out.found = true;
        }
      }
      if (v && typeof v === 'object') visit(v, here, depth + 1);
    }
  };
  visit(d, false, 0);
  out.text = texts.join(' ').trim();
  return out;
}

/**
 * 解析钉钉富文本 richText 数组，抽出纯文字与图片下载码
 * 钉钉 richText 每个元素形如 { text:"..." } 或 { type:"picture", downloadCode:"..." }，
 * 不同版本字段名有出入（downloadCode / pictureDownloadCode），这里做容错聚合。
 * @param {Array} richText
 * @returns {{ text:string, downloadCodes:string[], hasImage:boolean }}
 */
function _parseRichText(richText) {
  const out = { text: '', downloadCodes: [], hasImage: false };
  if (!Array.isArray(richText)) return out;
  const texts = [];
  for (const item of richText) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.text === 'string' && item.text.trim()) texts.push(item.text.trim());
    const dc = item.downloadCode || item.pictureDownloadCode || '';
    if (dc || item.type === 'picture') {
      out.hasImage = true;
      if (dc) out.downloadCodes.push(dc);
    }
  }
  out.text = texts.join('').trim();
  return out;
}

// ===== 发送真实图片：下载 → 上传钉钉媒体 → 机器人发图片消息 =====

/** 下载图片字节（素材图为公开可访问，可选带 designhub token；支持 data:URL 直接解码） */
function downloadBuffer(url, token) {
  // data URL（如精确尺寸缩放后产出的 base64 图）：直接解码，无需网络请求
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(String(url || ''));
  if (m) {
    try {
      const mime = m[1] || 'image/png';
      const isB64 = !!m[2];
      const buffer = isB64 ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf-8');
      return Promise.resolve({ buffer, mime });
    } catch (e) {
      return Promise.reject(new Error('data URL 解析失败'));
    }
  }
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url });
    if (token) req.setHeader('X-Session-Token', token);
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; req.abort(); reject(new Error('下载超时')); } }, 20000);
    req.on('response', (res) => {
      const ct = res.headers['content-type'] || res.headers['Content-Type'] || 'image/png';
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (res.statusCode !== 200) return reject(new Error('下载失败 HTTP ' + res.statusCode));
        resolve({ buffer: Buffer.concat(chunks), mime: Array.isArray(ct) ? ct[0] : ct });
      });
    });
    req.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    req.end();
  });
}

/**
 * 上传媒体到钉钉，返回 media_id
 * POST https://oapi.dingtalk.com/media/upload?access_token=&type=image （multipart）
 */
function uploadMedia(accessToken, buffer, filename, mime) {
  return new Promise((resolve, reject) => {
    const boundary = '----hbpet' + Date.now();
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
      `Content-Type: ${mime || 'image/png'}\r\n\r\n`, 'utf-8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([head, buffer, tail]);

    const req = net.request({
      method: 'POST',
      url: `https://oapi.dingtalk.com/media/upload?access_token=${encodeURIComponent(accessToken)}&type=image`,
    });
    req.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`);
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; req.abort(); reject(new Error('上传超时')); } }, 30000);
    req.on('response', (res) => {
      res.on('data', (c) => (buf += c.toString()));
      res.on('end', () => {
        if (settled) return; settled = true; clearTimeout(timer);
        let json = null; try { json = JSON.parse(buf); } catch (e) {}
        if (json && json.errcode === 0 && json.media_id) return resolve(json.media_id);
        reject(new Error('媒体上传失败：' + (json ? (json.errmsg || buf) : buf).slice(0, 150)));
      });
    });
    req.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    req.write(body);
    req.end();
  });
}

/**
 * 机器人给单人发图片消息（sampleImageMsg，photoURL 传 media_id）
 * POST https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend
 */
async function sendImageMessage({ accessToken, robotCode, userId, mediaId }) {
  const { statusCode, json, raw } = await netRequestJSON({
    method: 'POST',
    url: 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    body: {
      robotCode,
      userIds: [userId],
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId }),
    },
  });
  if (statusCode === 200 && json && !json.code) return { ok: true };
  return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
}

/** 机器人给单人发 markdown 消息（图文同框，图片走 URL） */
async function sendMarkdownMessage({ accessToken, robotCode, userId, title, text }) {
  const { statusCode, json, raw } = await netRequestJSON({
    method: 'POST',
    url: 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    body: {
      robotCode,
      userIds: [userId],
      msgKey: 'sampleMarkdown',
      msgParam: JSON.stringify({ title: title || '素材', text: String(text || '') }),
    },
  });
  if (statusCode === 200 && json && !json.code) return { ok: true };
  return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
}

/** 机器人给单人发文本消息（作为图片的标题说明） */
async function sendTextMessage({ accessToken, robotCode, userId, content }) {
  const { statusCode, json, raw } = await netRequestJSON({
    method: 'POST',
    url: 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    body: {
      robotCode,
      userIds: [userId],
      msgKey: 'sampleText',
      msgParam: JSON.stringify({ content: String(content || '') }),
    },
  });
  if (statusCode === 200 && json && !json.code) return { ok: true };
  return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
}

// ===== 群消息发送（走 groupMessages/send，用 openConversationId 定位群） =====
// 说明：oToMessages/batchSend 是「单聊」接口，只会私聊发给某个 userId；
//      群里发图/发文必须用 groupMessages/send + openConversationId，否则会被私聊送达。

/**
 * 机器人向群发图片消息（sampleImageMsg，photoURL 传 media_id）
 * POST https://api.dingtalk.com/v1.0/robot/groupMessages/send
 */
async function sendGroupImageMessage({ accessToken, robotCode, openConversationId, mediaId }) {
  const { statusCode, json, raw } = await netRequestJSON({
    method: 'POST',
    url: 'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    body: {
      robotCode,
      openConversationId,
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId }),
    },
  });
  if (statusCode === 200 && json && !json.code) return { ok: true };
  return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
}

/** 机器人向群发文本消息 */
async function sendGroupTextMessage({ accessToken, robotCode, openConversationId, content }) {
  const { statusCode, json, raw } = await netRequestJSON({
    method: 'POST',
    url: 'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    body: {
      robotCode,
      openConversationId,
      msgKey: 'sampleText',
      msgParam: JSON.stringify({ content: String(content || '') }),
    },
  });
  if (statusCode === 200 && json && !json.code) return { ok: true };
  return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
}

/**
 * 高层：给对方发一张素材缩略图 + 确认询问 + 引导去素材库
 * 流程：下载→上传媒体→发图片消息 →「是这个素材吗？」→「如果不是，去素材库里找找呢 + 链接」
 *
 * 会话类型分流（关键修复）：
 *   - group  ：走 groupMessages/send + openConversationId，图片发到群里
 *   - single ：走 oToMessages/batchSend + userId，图片私聊发给对方
 * 否则群里 @机器人 找素材时，图片会被单聊接口误发成私聊。
 *
 * @param {object} opts - { appKey, appSecret, robotCode, conversationType, openConversationId, userId,
 *                          images:[{url,name}], searchUrl?, askConfirm?, dhToken? }
 * @returns {Promise<{ok:boolean, sent:number, error?:string}>}
 */
async function sendMaterialImages({ appKey, appSecret, robotCode, conversationType, openConversationId, userId, images = [], searchUrl, askConfirm, dhToken }) {
  const isGroup = conversationType === 'group';
  console.log('[sendMaterialImages] type=%s robotCode=%s userId=%s openConv=%s images=%s askConfirm=%s',
    conversationType || 'single', robotCode, userId, openConversationId || '(无)', images.length, !!askConfirm);
  if (!robotCode) return { ok: false, sent: 0, error: '缺少 robotCode' };
  // 群发图需要 openConversationId，单聊发图需要 userId
  if (isGroup && !openConversationId) return { ok: false, sent: 0, error: '缺少群会话 openConversationId' };
  if (!isGroup && !userId) return { ok: false, sent: 0, error: '缺少对方 userId' };
  if (!images.length) return { ok: false, sent: 0, error: '无可发送素材' };
  try {
    const accessToken = await getAccessToken(appKey, appSecret);
    let sent = 0;
    // 内网图钉钉云端抓不到，必须下载后上传媒体换 media_id 再发图片消息（上限 9 张）
    for (const img of images.slice(0, 9)) {
      try {
        const { buffer, mime } = await downloadBuffer(img.url, dhToken);
        const mediaId = await uploadMedia(accessToken, buffer, (img.name || 'material') + '.png', mime);
        const r = isGroup
          ? await sendGroupImageMessage({ accessToken, robotCode, openConversationId, mediaId })
          : await sendImageMessage({ accessToken, robotCode, userId, mediaId });
        if (r.ok) sent++;
        else console.warn('[sendMaterialImages] 单张发图失败:', r.error);
      } catch (e) { console.warn('[sendMaterialImages] 单张异常:', e.message); }
    }
    if (sent === 0) return { ok: false, sent: 0, error: '全部发送失败' };
    // 找图场景：图后追问，引导用户选择（第一个/第二个/都不对），选择由任务上下文接管
    if (askConfirm) {
      const q = sent > 1
        ? '找到这两个比较匹配的素材，是你需要的吗？可以回复「第一个」「第二个」，或说「都不对」我再帮你找～'
        : '这个是你需要的吗？可以回复「是」，或说「不是」我再帮你找～';
      if (isGroup) {
        await sendGroupTextMessage({ accessToken, robotCode, openConversationId, content: q });
      } else {
        await sendTextMessage({ accessToken, robotCode, userId, content: q });
      }
    }
    console.log('[sendMaterialImages] 完成，成功发送', sent, '张');
    return { ok: true, sent };
  } catch (e) {
    return { ok: false, sent: 0, error: e.message };
  }
}

/**
 * 把钉钉消息里的图片下载码换成可下载的临时 URL
 * POST https://api.dingtalk.com/v1.0/robot/messageFiles/download  body:{ downloadCode, robotCode }
 * @param {object} opts - { appKey, appSecret, robotCode, downloadCode }
 * @returns {Promise<{ok:boolean, downloadUrl?:string, error?:string}>}
 */
async function downloadMessageFileUrl({ appKey, appSecret, robotCode, downloadCode }) {
  if (!downloadCode) return { ok: false, error: '缺少 downloadCode' };
  if (!robotCode) return { ok: false, error: '缺少 robotCode' };
  try {
    const accessToken = await getAccessToken(appKey, appSecret);
    const { statusCode, json, raw } = await netRequestJSON({
      method: 'POST',
      url: 'https://api.dingtalk.com/v1.0/robot/messageFiles/download',
      headers: { 'x-acs-dingtalk-access-token': accessToken },
      body: { downloadCode, robotCode },
    });
    if (statusCode === 200 && json && json.downloadUrl) return { ok: true, downloadUrl: json.downloadUrl };
    return { ok: false, error: json ? (json.message || raw) : ('HTTP ' + statusCode) };
  } catch (e) {
    return { ok: false, error: e.message || '下载码换取失败' };
  }
}

module.exports = {
  StreamClient,
  getAccessToken,
  replyToSession,
  openConnection,
  sendMaterialImages,
  downloadMessageFileUrl,
};
