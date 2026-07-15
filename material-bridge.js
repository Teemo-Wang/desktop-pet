/**
 * 素材库桥接模块（主进程）
 *
 * 当前接入源：哈啰 DesignHub「团队素材管理工具」
 *   - 基础地址：https://designhub.hellobike.cn/api/v1
 *   - 登录：POST /auth/login { email, password } → data.token
 *   - 鉴权：后续请求头 X-Session-Token: <token>
 *   - 搜索：GET /assets?keyword=&page=&pageSize= → data.list[] / data.total
 *   - 素材字段：name / thumbnailUrl / cdnUrl / fileType
 *
 * 放在主进程用 Electron net 模块：走系统代理、信任系统根证书、无 CORS 限制
 */
const { net } = require('electron');

const DH_ORIGIN = 'https://designhub.hellobike.cn';
const DH_BASE = DH_ORIGIN + '/api/v1';

/** 把相对路径补成绝对 URL */
function absUrl(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return DH_ORIGIN + (u.startsWith('/') ? u : '/' + u);
}

/**
 * 用 Electron net 发起 JSON 请求
 * @param {object} opts - { method, url, headers, body }
 * @returns {Promise<{statusCode:number, json:object|null, raw:string}>}
 */
function netJSON({ method = 'GET', url, headers = {}, body = null, timeout = 20000 }) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('User-Agent', 'HelloBikeDesktopPet/1.0');
    for (const [k, v] of Object.entries(headers)) { if (v != null) request.setHeader(k, v); }

    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.abort();
      reject(new Error('请求超时'));
    }, timeout);

    request.on('response', (response) => {
      response.on('data', (chunk) => (buf += chunk.toString()));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* 非 JSON */ }
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

/**
 * 登录 DesignHub，换取 session token
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok:boolean, token?:string, error?:string}>}
 */
async function dhLogin(email, password) {
  if (!email || !password) return { ok: false, error: '缺少邮箱或密码' };
  try {
    const { statusCode, json } = await netJSON({
      method: 'POST',
      url: `${DH_BASE}/auth/login`,
      body: { email, password },
    });
    if (statusCode !== 200 || !json) return { ok: false, error: `登录请求失败 (${statusCode})` };
    if (json.code && json.code !== 200 && json.code !== 0) {
      return { ok: false, error: json.message || '登录失败' };
    }
    const data = json.data;
    // DesignHub 登录接口直接把 token 作为 data 字符串返回；兼容对象结构兜底
    const token = (typeof data === 'string' && data)
      || (data && (data.token || data.sessionToken || data.session_token || data.accessToken))
      || json.token || '';
    if (!token) return { ok: false, error: '登录成功但未返回 token' };
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e.message || '登录异常' };
  }
}

/** 把 DesignHub 素材对象归一化为 App 统一结构 */
function normalizeAsset(a) {
  if (!a) return null;
  return {
    id: a.id != null ? String(a.id) : '',
    name: a.name || a.title || a.fileName || '未命名素材',
    thumb: absUrl(a.thumbnailUrl || a.previewUrl || a.cdnUrl || ''),
    url: absUrl(a.cdnUrl || a.fileUrl || a.downloadUrl || a.thumbnailUrl || ''),
    fileType: (a.fileType || a.type || '').toString().toUpperCase(),
    tags: Array.isArray(a.tags) ? a.tags.map(t => (typeof t === 'string' ? t : (t && t.name) || '')).filter(Boolean) : [],
    category: a.categoryName || (a.category && a.category.name) || '',
    source: 'designhub',
    sourceLabel: 'DesignHub',
  };
}

/**
 * 搜索素材
 * @param {object} opts - { token, keyword, page, pageSize }
 * @returns {Promise<{ok:boolean, items?:Array, total?:number, needAuth?:boolean, error?:string}>}
 */
async function dhSearch({ token, keyword = '', page = 1, pageSize = 20 }) {
  try {
    // DesignHub 搜索端点：GET /assets/search?keyword=&pageNum=&pageSize=
    const qs = `keyword=${encodeURIComponent(keyword)}&sortType=CREATED_AT&pageNum=${page}&pageSize=${pageSize}`;
    const { statusCode, json } = await netJSON({
      method: 'GET',
      url: `${DH_BASE}/assets/search?${qs}`,
      headers: { 'X-Session-Token': token || '' },
    });
    if (json && json.code === 401) return { ok: false, needAuth: true, error: '未登录或登录已过期' };
    if (statusCode !== 200 || !json) return { ok: false, error: `搜索失败 (${statusCode})` };
    if (json.code && json.code !== 200 && json.code !== 0) {
      if (String(json.message || '').includes('登录')) return { ok: false, needAuth: true, error: json.message };
      return { ok: false, error: json.message || '搜索失败' };
    }
    const data = json.data || {};
    const rawList = data.list || data.items || data.records || (Array.isArray(data) ? data : []);
    const items = rawList.map(normalizeAsset).filter(Boolean);
    return { ok: true, items, total: data.total || items.length };
  } catch (e) {
    return { ok: false, error: e.message || '搜索异常' };
  }
}

/**
 * 拉取受鉴权保护的图片，返回 base64 data URL（供 <img> 直接显示）
 * @param {string} token
 * @param {string} url - 绝对或相对 URL
 * @returns {Promise<{ok:boolean, dataUrl?:string, error?:string}>}
 */
function dhImage(token, url) {
  const full = absUrl(url);
  if (!full) return Promise.resolve({ ok: false, error: '空 URL' });
  return new Promise((resolve) => {
    const request = net.request({ method: 'GET', url: full });
    request.setHeader('X-Session-Token', token || '');
    request.setHeader('User-Agent', 'HelloBikeDesktopPet/1.0');
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.abort();
      resolve({ ok: false, error: '图片请求超时' });
    }, 20000);
    request.on('response', (response) => {
      const ct = (response.headers['content-type'] || response.headers['Content-Type'] || 'image/png');
      const mime = Array.isArray(ct) ? ct[0] : ct;
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (response.statusCode !== 200) return resolve({ ok: false, error: `图片 HTTP ${response.statusCode}` });
        const b64 = Buffer.concat(chunks).toString('base64');
        resolve({ ok: true, dataUrl: `data:${mime};base64,${b64}` });
      });
    });
    request.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    request.end();
  });
}

/**
 * DesignHub「AI 智能改图」：基于参考图 + 文字描述生成变体（改文案/配色/尺寸等）
 * 对应前端接口：POST /api/v1/ai/generate-variant
 * @param {object} opts
 * @param {string} opts.token - DesignHub session token
 * @param {string} opts.referenceImageUrl - 参考图 URL（DesignHub 相对 cdnUrl 或可公网访问的图片直链）
 * @param {string} opts.prompt - 修改描述
 * @param {string} [opts.size] - 目标尺寸，空字符串表示保持原尺寸
 * @param {number} [opts.count] - 生成数量（1/2/4）
 * @param {string} [opts.assetId] - 关联素材 ID，可空
 * @returns {Promise<{ok:boolean, images?:string[], needAuth?:boolean, error?:string}>}
 */
/** 下载图片字节（DesignHub 相对路径自动补域名并带 token；外链直连），失败返回 null */
function _downloadImageBuffer(url, token) {
  return new Promise((resolve) => {
    const full = /^https?:\/\//i.test(url) ? url : (DH_ORIGIN + (url.startsWith('/') ? url : '/' + url));
    let settled = false;
    const chunks = [];
    const req = net.request({ method: 'GET', url: full });
    if (token && /designhub\.hellobike\.cn/i.test(full)) req.setHeader('X-Session-Token', token);
    const timer = setTimeout(() => { if (!settled) { settled = true; try { req.abort(); } catch (e) {} resolve(null); } }, 15000);
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { if (settled) return; settled = true; clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    });
    req.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
    req.end();
  });
}

/** 从图片字节解析宽高（支持 PNG/JPEG/GIF/WEBP），返回 {w,h} 或 null */
function _parseImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  // JPEG：扫描 SOF 段
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xFF) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      if (off + 3 >= buf.length) break;
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  // WEBP
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3FFF, h: buf.readUInt16LE(28) & 0x3FFF };
    if (fmt === 'VP8L') {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { w: 1 + (((b1 & 0x3F) << 8) | b0), h: 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) };
    }
    if (fmt === 'VP8X') {
      return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    }
  }
  return null;
}

/** 测量参考图尺寸，返回 "宽x高"（失败返回空串） */
async function _measureSize(url, token) {
  try {
    const buf = await _downloadImageBuffer(url, token);
    const dim = _parseImageSize(buf);
    if (dim && dim.w > 0 && dim.h > 0) return `${dim.w}x${dim.h}`;
  } catch (e) { /* ignore */ }
  return '';
}

async function dhGenerateVariant({ token, referenceImageUrl, prompt, size = '', count = 1, assetId = '', preserveTemplateLayout = false }) {
  if (!referenceImageUrl) return { ok: false, error: '缺少参考图' };
  if (!prompt) return { ok: false, error: '缺少修改描述' };
  // DesignHub 自有素材必须用「相对路径」作参考图：生成后端从外部拉取绝对内网地址会超时（400 Timeout while downloading url）
  // 外部图片（钉钉/火山等公网直链）保持原样，后端可正常下载
  const refUrl = String(referenceImageUrl).replace(/^https?:\/\/designhub\.hellobike\.cn/i, '');
  referenceImageUrl = refUrl;
  const lockTemplateLayout = preserveTemplateLayout === true;
  const userSpecifiedSize = !!size && !lockTemplateLayout;
  let originalSize = '';
  if (lockTemplateLayout || !size) {
    originalSize = await _measureSize(referenceImageUrl, token);
    if (originalSize) console.log('[dhGenerateVariant] ' + (lockTemplateLayout ? '使用 DesignHub 原始尺寸锁定模板' : '锁定原图尺寸') + ' size=' + originalSize);
  } else {
    console.log('[dhGenerateVariant] 使用用户指定尺寸 size=' + size);
  }
  // DesignHub UI 的“原始尺寸”不能传入目标 size；否则服务会重排模板。最终资源位缩放在渲染层完成。
  const sizeClause = lockTemplateLayout
    ? `【DesignHub 原始尺寸智能改图】保持参考图的原始尺寸、完整画布比例和所有版式坐标。Logo、主标题、CTA、文字安全区、装饰线和主视觉的位置、大小、对齐与留白必须保持不变；只替换用户要求的文案与画面内容。禁止重新排版、缩放信息组件、文字溢出、遮挡或新增无关框线。`
    : userSpecifiedSize
      ? `【尺寸要求】请输出目标尺寸 ${size}，并按该比例重新合理排布版式（元素位置/大小自适应新画幅）；保持品牌风格、配色、主体视觉与文案信息一致，不要生硬拉伸或变形。`
      : `【硬性要求】严格保持原图的画面比例与尺寸、整体版式布局、字体与字号层级、配色风格，以及所有未被要求修改的元素（背景、人物、图形、logo、按钮等）保持不变；新内容需自适应原有文字区域，避免溢出、遮挡或变形。`;
  try {
    // AI 生成耗时较长（豆包 Seedream，通常 1~3 分钟），超时放宽到 180s，与前端一致
    const { statusCode, json } = await netJSON({
      method: 'POST',
      url: `${DH_BASE}/ai/generate-variant`,
      headers: { 'X-Session-Token': token || '' },
      body: {
        referenceImageUrl,
        prompt: `${prompt}\n\n${sizeClause}`,
        size: lockTemplateLayout ? '' : (size || ''),
        count: count || 1,
        assetId: assetId || '',
      },
      timeout: 180000,
    });
    if (json && json.code === 401) return { ok: false, needAuth: true, error: '未登录或登录已过期' };
    if (statusCode !== 200 || !json) return { ok: false, error: `AI 生成失败 (${statusCode})` };
    const code = json.code;
    if (code !== 0 && code !== 200 && code !== '0' && code !== '200') {
      if (String(json.message || '').includes('登录')) return { ok: false, needAuth: true, error: json.message };
      return { ok: false, error: json.message || 'AI 生成失败' };
    }
    const data = json.data || {};
    const urls = (Array.isArray(data.imageUrls) && data.imageUrls.length)
      ? data.imageUrls
      : (data.imageUrl ? [data.imageUrl] : []);
    if (!urls.length) return { ok: false, error: 'AI 未返回生成结果' };
    return { ok: true, images: urls };
  } catch (e) {
    return { ok: false, error: e.message || 'AI 生成异常' };
  }
}

module.exports = { dhLogin, dhSearch, dhImage, dhGenerateVariant };
