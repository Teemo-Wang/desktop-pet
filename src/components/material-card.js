/**
 * 素材结果卡片
 * 在 AI 聊天里展示素材库检索结果：缩略图网格 + 来源标签 + 打开/复制链接
 *
 * 用法：
 *   const el = window.MaterialCard.render({ keyword, items });
 *   chatMessagesEl.appendChild(包裹了 el 的消息节点);
 */
(function() {
  const { shell, clipboard } = require('electron');

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const MaterialCard = {
    /**
     * @param {object} data - { keyword, items:[{name,thumb,url,fileType,tags,sourceLabel}], total }
     * @returns {HTMLElement}
     */
    render(data) {
      const items = data.items || [];
      const wrap = document.createElement('div');
      wrap.className = 'material-card';

      const head = `
        <div class="mc-head">
          <span class="mc-title">🎨 素材库结果</span>
          <span class="mc-meta">「${_esc(data.keyword)}」· ${data.total || items.length} 个</span>
        </div>`;

      if (items.length === 0) {
        const footer0 = data.searchUrl
          ? `<button class="mc-open-hub" data-url="${_esc(data.searchUrl)}">在 DesignHub 打开搜索 ↗</button>`
          : '';
        wrap.innerHTML = head + `<div class="mc-empty">app 内没匹配到，去 DesignHub 用完整搜索试试～</div>` + footer0;
        this._bind(wrap, []);
        return wrap;
      }

      const grid = items.slice(0, 12).map((it, i) => `
        <div class="mc-item" data-idx="${i}">
          <div class="mc-thumb">
            ${it.thumb ? `<img data-src="${_esc(it.thumb)}" alt="${_esc(it.name)}"><span class="mc-loading">加载中…</span>` : `<div class="mc-noimg">${_esc(it.fileType || '文件')}</div>`}
            <span class="mc-type">${_esc(it.fileType || '')}</span>
          </div>
          <div class="mc-name" title="${_esc(it.name)}">${_esc(it.name)}</div>
          <div class="mc-ops">
            <button class="mc-btn" data-act="open" data-idx="${i}">打开</button>
          </div>
        </div>`).join('');

      const footer = data.searchUrl
        ? `<button class="mc-open-hub" data-url="${_esc(data.searchUrl)}">在 DesignHub 打开完整结果 ↗</button>`
        : '';

      wrap.innerHTML = head + `<div class="mc-grid">${grid}</div>` +
        (items.length > 12 ? `<div class="mc-more">仅显示前 12 个，共 ${data.total || items.length} 个</div>` : '') +
        footer;

      this._bind(wrap, items);
      this._loadThumbs(wrap, items);
      return wrap;
    },

    /** 异步加载受鉴权保护的缩略图：主进程带 token 拉取 → base64 塞回 img（并行） */
    _loadThumbs(wrap, items) {
      const svc = window.materialService;
      if (!svc || typeof svc.fetchThumb !== 'function') return;
      const imgs = Array.from(wrap.querySelectorAll('.mc-thumb img[data-src]'));
      const loadOne = async (img) => {
        const src = img.getAttribute('data-src');
        if (!src) return;
        try {
          const dataUrl = await svc.fetchThumb(src);
          const loading = img.parentElement && img.parentElement.querySelector('.mc-loading');
          if (dataUrl) {
            img.src = dataUrl;
            img.removeAttribute('data-src');
            if (loading) loading.remove();
          } else if (loading) {
            loading.textContent = '无预览';
          }
        } catch (e) {
          const loading = img.parentElement && img.parentElement.querySelector('.mc-loading');
          if (loading) loading.textContent = '加载失败';
        }
      };
      // 并行加载所有缩略图（每张请求主进程各自超时保护，互不阻塞）
      imgs.forEach(loadOne);
    },

    _bind(wrap, items) {
      const openHub = wrap.querySelector('.mc-open-hub');
      if (openHub) openHub.addEventListener('click', () => {
        const url = openHub.getAttribute('data-url');
        if (url) shell.openExternal(url);
      });
      wrap.querySelectorAll('.mc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const it = items[parseInt(btn.dataset.idx, 10)];
          if (!it) return;
          const link = it.url || it.thumb;
          if (btn.dataset.act === 'open') {
            if (link) shell.openExternal(link);
          } else if (btn.dataset.act === 'copy') {
            if (link) {
              clipboard.writeText(link);
              const old = btn.textContent;
              btn.textContent = '已复制✓';
              setTimeout(() => { btn.textContent = old; }, 1200);
            }
          }
        });
      });
    },
  };

  /** 「在 DesignHub 打开搜索」入口卡 */
  MaterialCard.renderLaunch = function(data) {
    const wrap = document.createElement('div');
    wrap.className = 'material-card material-launch';
    wrap.innerHTML = `
      <div class="ml-row">
        <span class="ml-icon">🎨</span>
        <div class="ml-text">
          <div class="ml-title">已在 DesignHub 搜索「${_esc(data.keyword)}」</div>
          <div class="ml-sub">用素材库自带搜索，结果更精准</div>
        </div>
      </div>
      <button class="ml-btn">在浏览器中打开 ↗</button>`;
    const btn = wrap.querySelector('.ml-btn');
    if (btn) btn.addEventListener('click', () => { if (data.url) shell.openExternal(data.url); });
    return wrap;
  };

  window.MaterialCard = MaterialCard;
})();
