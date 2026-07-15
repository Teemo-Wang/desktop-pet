/**
 * 小哈钉钉机器人 · 独立常驻服务（无界面）
 *
 * 职责：脱离桌宠 Electron，独立跑一个 24 小时在线的机器人：
 *   收钉钉消息（Stream 长连接） → 调 AI 生成回复 → 通过 sessionWebhook 回复
 *
 * 与桌宠的区别：
 *   - 桌宠用 electron 的 net 模块，这里用 Node 原生 fetch（Node 18+）
 *   - 无界面、无渲染进程，纯后台常驻，用 pm2 / systemd 守护
 *
 * 运行：node server.js  （配置见 config.json）
 * 依赖：ws（WebSocket 客户端）
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ===== 配置加载 =====
const CONFIG_FILE = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_FILE)) {
  console.error('[配置] 未找到 config.json，请复制 config.example.json 为 config.json 并填写');
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

// 校验必填项
for (const k of ['appKey', 'appSecret', 'aiBaseUrl', 'aiApiKey', 'aiModel']) {
  if (!CFG[k]) { console.error(`[配置] 缺少必填项：${k}`); process.exit(1); }
}

const GATEWAY_OPEN_URL = 'https://api.dingtalk.com/v1.0/gateway/connections/open';
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';
const TOPIC_BOT_MESSAGE = '/v1.0/im/bot/messages/get';

// 系统提示词：定义机器人身份（可在 config.json 覆盖）
const SYSTEM_PROMPT = CFG.systemPrompt || '你是哈啰两轮设计中心的实名 AI 助理，替设计师回复同事的钉钉消息。回复简洁专业友好；能直接答的就答；需本人确认的礼貌说明"已记录，会尽快跟进"，不擅自承诺时间点。';

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ===== 钉钉 access_token（带缓存）=====
let _token = { value: '', expireAt: 0 };
async function getAccessToken() {
  const now = Date.now();
  if (_token.value && _token.expireAt > now + 60000) return _token.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: CFG.appKey, appSecret: CFG.appSecret }),
  });
  const json = await res.json();
  if (!res.ok || !json.accessToken) throw new Error('获取 token 失败：' + JSON.stringify(json));
  _token = { value: json.accessToken, expireAt: now + (json.expireIn || 7200) * 1000 - 300000 };
  return _token.value;
}

// ===== 网关握手：换取 ws 地址 + ticket =====
async function openConnection() {
  const res = await fetch(GATEWAY_OPEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: CFG.appKey,
      clientSecret: CFG.appSecret,
      ua: 'hellobike-bot-server/1.0',
      subscriptions: [{ type: 'CALLBACK', topic: TOPIC_BOT_MESSAGE }],
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.endpoint || !json.ticket) throw new Error('网关握手失败：' + JSON.stringify(json));
  return { endpoint: json.endpoint, ticket: json.ticket };
}

// ===== AI 回复：调用 OpenAI 兼容网关（幻视大模型）=====
async function aiReply(conv) {
  const msgs = (conv.messages || []).slice(-10); // 最近 10 条作上下文
  const history = msgs.map(m => `${m.sender || '对方'}: ${m.content}`).join('\n');
  const last = msgs[msgs.length - 1] || {};
  const prompt = `${SYSTEM_PROMPT}\n\n【会话】${conv.name}\n【最近消息】\n${history}\n\n【最新消息】${last.sender || '对方'}: ${last.content || ''}\n\n请直接输出回复正文，不要加引号或前缀：`;

  const res = await fetch(CFG.aiBaseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CFG.aiApiKey,
    },
    body: JSON.stringify({
      model: CFG.aiModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 HTTP ${res.status}：${raw.slice(0, 200)}`);
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  return (msg.content || msg.reasoning_content || '').trim() || '收到你的消息啦～我已记录，稍后跟进 🙌';
}

// ===== 回复会话（POST sessionWebhook，2 小时有效）=====
async function replyToSession(sessionWebhook, text) {
  if (!sessionWebhook) return { ok: false, error: '无 sessionWebhook' };
  const res = await fetch(sessionWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: String(text || '') } }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok && (json.errcode === 0 || json.errcode === undefined)) return { ok: true };
  return { ok: false, error: json.errmsg || ('HTTP ' + res.status) };
}

// ===== 归一化钉钉消息 =====
function normalizeBotMessage(d) {
  if (!d || !d.conversationId) return null;
  const isGroup = String(d.conversationType) === '2';
  let content = '';
  if (d.msgtype === 'text' && d.text) content = (d.text.content || '').trim();
  else if (d.msgtype === 'picture') content = '[图片]';
  else content = `[${d.msgtype || '未知'}消息]`;
  return {
    convId: d.conversationId,
    type: isGroup ? 'group' : 'single',
    name: isGroup ? (d.conversationTitle || '群聊') : (d.senderNick || '同事'),
    sender: d.senderNick || '同事',
    content,
    msgtype: d.msgtype || 'text',
    sessionWebhook: d.sessionWebhook || '',
  };
}

// ===== 简易会话上下文（内存，按 convId 存最近消息）=====
const CONVS = {}; // convId -> { name, messages: [] }
function ingest(payload) {
  let c = CONVS[payload.convId];
  if (!c) { c = { name: payload.name, messages: [] }; CONVS[payload.convId] = c; }
  c.messages.push({ sender: payload.sender, content: payload.content });
  if (c.messages.length > 30) c.messages = c.messages.slice(-30);
  return c;
}
