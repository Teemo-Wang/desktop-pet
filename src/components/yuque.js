/**
 * 语雀文档面板组件
 */
(function() {
  class YuqueComponent {
    constructor(panelEl, service) {
      this.panel = panelEl;
      this.service = service;
      this.searcher = new window.YuqueSearchService(service);
      this.isOpen = false;
      this.currentDoc = null;
      this.onSendToAI = null; // (title, content) => void
      this.searchState = null; // { mode, results, query } | null
      this.searching = false;
      this.activeCategory = 'recent'; // recommend | recent | favorite | trash
    }

    async open() {
      this.isOpen = true;
      this._renderMain();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    _renderMain() {
      const recent = this.service.getRecent();
      // 预置示例链接（真实语雀文档，复用 dragon-mcp 团队 Token 直接读取）
      const examples = [
        { id: 'okr', url: 'hellobike.yuque.com/atgq9b/wc5com/vb7gn22fv51p1eka', title: '王家明26OKR', desc: '产品组 · 2026 年度 OKR' },
      ];
      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title"><img class="panel-head-icon" src="icon/语雀.png" alt="">语雀文档</span>
          <button class="btn-icon" id="yqClose">✕</button>
        </div>
        <div class="yq-search-row">
          <input id="yqUrl" class="yq-search-input" placeholder="粘贴链接 或 输入关键词（如：新车 banner）...">
          <button id="yqSubmit" class="yq-search-btn">
            <span class="yq-search-btn-text">搜索</span>
          </button>
        </div>
        <div class="yq-content-row">
          ${this._renderCategoryBar()}
          <div class="panel-body" id="yqBody">
            ${this._renderBodyContent(recent, examples)}
          </div>
        </div>`;

      this.panel.querySelector('#yqClose').addEventListener('click', () => document.dispatchEvent(new CustomEvent('panel-close-all')));

      const input = this.panel.querySelector('#yqUrl');
      const submitBtn = this.panel.querySelector('#yqSubmit');
      const btnText = submitBtn.querySelector('.yq-search-btn-text');

      // 输入识别：URL → "读取" / 关键词 → "搜索"
      const updateBtnLabel = () => {
        const v = input.value.trim();
        if (!v) {
          btnText.textContent = '搜索';
          submitBtn.classList.remove('mode-fetch', 'mode-search');
        } else if (window.YuqueSearchUtils.looksLikeURL(v)) {
          btnText.textContent = '读取';
          submitBtn.classList.add('mode-fetch');
          submitBtn.classList.remove('mode-search');
        } else {
          btnText.textContent = '🔍 搜索';
          submitBtn.classList.add('mode-search');
          submitBtn.classList.remove('mode-fetch');
        }
      };
      input.addEventListener('input', updateBtnLabel);
      updateBtnLabel();

      submitBtn.addEventListener('click', () => this._submit());
      input.addEventListener('keydown', e => { if (e.key === 'Enter') this._submit(); });

      // 最近读取项 / 收藏项（点击打开）
      this.panel.querySelectorAll('.list-item[data-id]').forEach(el => {
        el.addEventListener('click', async (e) => {
          // 点到操作按钮时不触发打开
          if (e.target.closest('.list-item-actions')) return;
          const id = el.dataset.id;
          const content = await this.service.getContent(id);
          // 先从最近找，再从收藏找
          let doc = this.service.getRecent().find(d => d.id === id);
          if (!doc && this.service.getFavorites) doc = this.service.getFavorites().find(d => d.id === id);
          if (doc && content) this._renderDoc({ ...doc, content });
        });
      });

      // 收藏 / 取消收藏 / 删除按钮
      this._bindItemActions();
      // 右键改备注
      this._bindDocContextMenu();
      // 推荐示例 / 搜索结果项
      this.panel.querySelectorAll('.list-item[data-example-url]').forEach(el => {
        el.addEventListener('click', async () => {
          this.panel.querySelector('#yqUrl').value = el.dataset.exampleUrl;
          updateBtnLabel();
          await this._fetch();
        });
      });

      // 右侧分类栏切换
      this._bindCategoryBar();
    }

    /** 渲染右侧分类栏 */
    _renderCategoryBar() {
      const cats = [
        { key: 'recommend', label: '推荐' },
        { key: 'recent', label: '最近' },
        { key: 'favorite', label: '收藏' },
        { key: 'trash', label: '删除' },
      ];
      return `
        <div class="yq-cat-bar">
          ${cats.map(c => `
            <button class="yq-cat ${this.activeCategory === c.key ? 'active' : ''}" data-cat="${c.key}">${c.label}</button>
          `).join('')}
        </div>`;
    }

    /** 绑定分类栏点击 */
    _bindCategoryBar() {
      this.panel.querySelectorAll('.yq-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.dataset.cat;
          if (cat === this.activeCategory && !this.searchState) return;
          this.activeCategory = cat;
          this.searchState = null; // 切换分类时清除搜索状态
          this._refreshMain();
        });
      });
    }

    /** 自定义文本输入弹层（Electron 不支持 window.prompt，需自建） */
    _askText(message, defaultVal) {
      return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'width:280px;max-width:80vw;background:#fff;border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;';
        box.innerHTML = `
          <div style="font-weight:600;margin-bottom:10px;color:#111;line-height:1.5;">${message}</div>
          <input type="text" class="yq-ask-input" value="${String(defaultVal || '').replace(/"/g, '&quot;')}" maxlength="40" placeholder="留空可清除备注"
            style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d3dae0;border-radius:8px;font-size:13px;outline:none;">
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
            <button class="yq-ask-cancel" style="padding:6px 14px;border:1px solid #d3dae0;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;">取消</button>
            <button class="yq-ask-ok" style="padding:6px 14px;border:none;background:#0076FF;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;">确定</button>
          </div>`;
        mask.appendChild(box);
        document.body.appendChild(mask);
        const input = box.querySelector('.yq-ask-input');
        setTimeout(() => { input.focus(); input.select(); }, 30);
        const close = (val) => { mask.remove(); resolve(val); };
        box.querySelector('.yq-ask-cancel').onclick = () => close(null);
        box.querySelector('.yq-ask-ok').onclick = () => close(input.value);
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') close(input.value);
          else if (e.key === 'Escape') close(null);
        });
        mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
      });
    }

    /** 绑定列表项右键：设置/清除自定义备注（自定义主标题，方便记录查找） */
    _bindDocContextMenu() {
      this.panel.querySelectorAll('.list-item[data-id]').forEach(el => {
        el.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = el.dataset.id;
          if (!id) return;
          const origTitle = el.dataset.title || '';
          const cur = this.service.getAlias ? this.service.getAlias(id) : '';
          const input = await this._askText(`给「${origTitle}」加个备注<br>（自定义主标题，方便查找；留空可清除）`, cur);
          if (input === null) return;   // 用户取消
          this.service.setAlias(id, input);
          const alias = this.service.getAlias(id);
          const titleEl = el.querySelector('.list-item-title');
          if (titleEl) titleEl.textContent = alias ? '📝 ' + alias : origTitle;
        });
      });
    }

    /** 绑定列表项上的收藏/删除按钮 */
    _bindItemActions() {
      // 最近读取：收藏切换
      this.panel.querySelectorAll('.yq-fav-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const content = await this.service.getContent(id);
          const doc = this.service.getRecent().find(d => d.id === id);
          if (doc) {
            this.service.toggleFavorite({ ...doc, content: content || doc.content });
            this._refreshMain();
          }
        });
      });
      // 收藏区：取消收藏
      this.panel.querySelectorAll('.yq-unfav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.removeFavorite(btn.dataset.id);
          this._refreshMain();
        });
      });
      // 删除最近读取
      this.panel.querySelectorAll('.yq-del-recent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.removeRecent(btn.dataset.id);
          this._refreshMain();
        });
      });
      // 删除收藏（移入回收站）
      this.panel.querySelectorAll('.yq-del-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.deleteFavorite(btn.dataset.id);
          this._refreshMain();
        });
      });
      // 回收站：恢复
      this.panel.querySelectorAll('.yq-restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.restoreTrash(btn.dataset.id);
          this._refreshMain();
        });
      });
      // 回收站：彻底删除
      this.panel.querySelectorAll('.yq-del-trash-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.removeTrash(btn.dataset.id);
          this._refreshMain();
        });
      });
      // 回收站：清空
      const clearTrash = this.panel.querySelector('#yqClearTrash');
      if (clearTrash) {
        clearTrash.addEventListener('click', (e) => {
          e.stopPropagation();
          this.service.clearTrash();
          this._refreshMain();
        });
      }
    }

    /** 只刷新 body 内容（保留搜索框状态） */
    _refreshMain() {
      const body = this.panel.querySelector('#yqBody');
      if (!body) { this._renderMain(); return; }
      const recent = this.service.getRecent();
      const examples = [
        { url: 'hellobike.yuque.com/atgq9b/wc5com/vb7gn22fv51p1eka', title: '王家明26OKR', desc: '产品组 · 2026 年度 OKR' },
      ];
      body.innerHTML = this._renderBodyContent(recent, examples);
      // 更新分类栏激活态
      this.panel.querySelectorAll('.yq-cat').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === this.activeCategory);
      });
      // 重新绑定点击打开 + 操作按钮
      this.panel.querySelectorAll('.list-item[data-id]').forEach(el => {
        el.addEventListener('click', async (e) => {
          if (e.target.closest('.list-item-actions')) return;
          const id = el.dataset.id;
          const content = await this.service.getContent(id);
          let doc = this.service.getRecent().find(d => d.id === id);
          if (!doc) doc = this.service.getFavorites().find(d => d.id === id);
          if (doc && content) this._renderDoc({ ...doc, content });
        });
      });
      this.panel.querySelectorAll('.list-item[data-example-url]').forEach(el => {
        el.addEventListener('click', async () => {
          this.panel.querySelector('#yqUrl').value = el.dataset.exampleUrl;
          await this._fetch();
        });
      });
      this._bindItemActions();
      this._bindDocContextMenu();
    }

    /**
     * 渲染面板主体内容
     * 搜索时优先展示搜索结果，否则按当前分类渲染
     */
    _renderBodyContent(recent, examples) {
      // 1. 有搜索结果 → 优先展示
      if (this.searchState && this.searchState.results.length > 0) {
        return this._renderSearchResults();
      }
      // 2. 搜索过但无结果
      if (this.searchState && this.searchState.results.length === 0) {
        return this._renderSearchEmpty();
      }
      // 3. 按当前分类渲染
      switch (this.activeCategory) {
        case 'recommend': return this._renderRecommend(examples);
        case 'favorite': return this._renderFavoriteList();
        case 'trash': return this._renderTrashList();
        case 'recent':
        default: return this._renderRecentList(recent);
      }
    }

    /** 空态 */
    _renderCatEmpty(icon, text) {
      return `
        <div class="state-empty">
          <div class="state-empty-icon">${icon}</div>
          <div class="state-empty-text">${text}</div>
        </div>`;
    }

    /** 分类：收藏 */
    _renderFavoriteList() {
      const favorites = this.service.getFavorites ? this.service.getFavorites() : [];
      if (favorites.length === 0) return this._renderCatEmpty('⭐', '还没有收藏的文档');
      return `
        <div class="list-section-title">收藏</div>
        ${favorites.map(d => {
          const alias = this.service.getAlias ? this.service.getAlias(d.id) : '';
          return `
          <div class="list-item" data-id="${d.id}" data-fav="1" data-title="${(d.title || '').replace(/"/g, '&quot;')}" title="右键可改备注">
            <div class="list-item-avatar" style="background:linear-gradient(135deg,#FF9500,#FFCC00);">⭐</div>
            <div class="list-item-body">
              <div class="list-item-title">${alias ? '📝 ' + alias : (d.title || '')}</div>
              <div class="list-item-meta">${alias ? (d.title || '') + ' · ' : ''}${d.author || ''}</div>
            </div>
            <div class="list-item-actions">
              <button class="yq-item-btn yq-unfav-btn" data-id="${d.id}" title="取消收藏"><img src="icon/pin-2.png" alt="已收藏"></button>
              <button class="yq-item-btn yq-del-fav-btn" data-id="${d.id}" title="删除"><img src="icon/del.png" alt="删除"></button>
            </div>
          </div>
        `;
        }).join('')}`;
    }

    /** 分类：最近读取 */
    _renderRecentList(recent) {
      if (!recent || recent.length === 0) return this._renderCatEmpty('📄', '最近还没有读取过文档');
      return `
        <div class="list-section-title">最近读取</div>
        ${recent.map(d => {
          const alias = this.service.getAlias ? this.service.getAlias(d.id) : '';
          return `
          <div class="list-item" data-id="${d.id}" data-title="${(d.title || '').replace(/"/g, '&quot;')}" title="右键可改备注">
            <div class="list-item-avatar" style="background:linear-gradient(135deg,#0076FF,#5AC8FA);">📄</div>
            <div class="list-item-body">
              <div class="list-item-title">${alias ? '📝 ' + alias : (d.title || '')}</div>
              <div class="list-item-meta">${alias ? (d.title || '') + ' · ' : ''}${d.time}</div>
            </div>
            <div class="list-item-actions">
              <button class="yq-item-btn yq-fav-btn ${this.service.isFavorited && this.service.isFavorited(d.id) ? 'active' : ''}" data-id="${d.id}" title="收藏"><img src="${this.service.isFavorited && this.service.isFavorited(d.id) ? 'icon/pin-2.png' : 'icon/pin-1.png'}" alt="收藏"></button>
              <button class="yq-item-btn yq-del-recent-btn" data-id="${d.id}" title="删除"><img src="icon/del.png" alt="删除"></button>
            </div>
          </div>
        `;
        }).join('')}`;
    }

    /** 分类：推荐 */
    _renderRecommend(examples) {
      if (!examples || examples.length === 0) return this._renderCatEmpty('📘', '暂无推荐文档');
      return `
        <div class="list-section-title">推荐文档</div>
        ${examples.map(e => `
          <div class="list-item" data-example-url="${e.url}">
            <div class="list-item-avatar" style="background:rgba(0,118,255,0.12);color:var(--brand);">📘</div>
            <div class="list-item-body">
              <div class="list-item-title">${e.title}</div>
              <div class="list-item-desc">${e.desc}</div>
            </div>
          </div>
        `).join('')}`;
    }

    /** 分类：最近删除（回收站） */
    _renderTrashList() {
      const trash = this.service.getTrash ? this.service.getTrash() : [];
      if (trash.length === 0) return this._renderCatEmpty('🗑', '回收站是空的');
      return `
        <div class="list-section-title">
          最近删除
          <button class="yq-trash-clear" id="yqClearTrash">清空</button>
        </div>
        ${trash.map(d => `
          <div class="list-item list-item-trash" data-trash-id="${d.id}">
            <div class="list-item-avatar" style="background:rgba(120,120,128,0.16);color:var(--text-tertiary);">🗑</div>
            <div class="list-item-body">
              <div class="list-item-title">${d.title}</div>
              <div class="list-item-meta">来自${d.from === 'favorite' ? '收藏' : '最近读取'}</div>
            </div>
            <div class="list-item-actions">
              <button class="yq-item-btn yq-restore-btn" data-id="${d.id}" title="恢复">恢复</button>
              <button class="yq-item-btn yq-del-trash-btn" data-id="${d.id}" title="彻底删除"><img src="icon/del.png" alt="彻底删除"></button>
            </div>
          </div>
        `).join('')}`;
    }

    /** 搜索结果列表 */
    _renderSearchResults() {
      const { mode, results, query } = this.searchState;
      const modeLabel = mode === 'fulltext' ? '🔎 全文检索'
        : mode === 'ai' ? '🤖 AI 语义匹配'
        : '🎯 关键词匹配';
      return `
        <div class="yq-search-meta">
          <span class="yq-search-meta-mode">${modeLabel}</span>
          <span class="yq-search-meta-query">「${query}」共 ${results.length} 条</span>
          <button class="yq-search-meta-clear" id="yqClearSearch">清除</button>
        </div>
        ${results.map(r => {
          // 优先用检索返回的真实文档链接；本地/AI 结果无 url 时兜底按 slug 拼（旧行为）
          const link = r.url || `hellobike.yuque.com/zo0rpl/am5rev/${r.slug}`;
          const meta = [r.author, r.updated].filter(Boolean).join(' · ');
          return `
          <div class="list-item" data-example-url="${link}">
            <div class="list-item-avatar" style="background:rgba(0,118,255,0.12);color:var(--brand);">📘</div>
            <div class="list-item-body">
              <div class="list-item-title">${r.title}</div>
              <div class="list-item-desc">${r.reason || r.excerpt || ''}</div>
              ${meta ? `<div class="list-item-meta">${meta}</div>` : ''}
            </div>
            ${r.score ? `<div class="list-item-right"><div class="yq-score">${r.score}</div></div>` : ''}
          </div>`;
        }).join('')}
      `;
    }

    /** 搜索无结果空态 */
    _renderSearchEmpty() {
      return `
        <div class="state-empty">
          <div class="state-empty-icon">🔍</div>
          <div class="state-empty-text">没找到相关文档</div>
          <div class="state-empty-hint">试试换个关键词，或粘贴文档链接直接读取</div>
          <button class="yq-search-meta-clear" id="yqClearSearch" style="margin-top:12px;">返回</button>
        </div>
      `;
    }

    /** 输入框提交：URL → 读取 / 关键词 → 搜索 */
    async _submit() {
      const input = this.panel.querySelector('#yqUrl');
      const value = input.value.trim();
      if (!value || this.searching) return;

      if (window.YuqueSearchUtils.looksLikeURL(value)) {
        await this._fetch();
      } else {
        await this._search(value);
      }
    }

    /** 关键词搜索 */
    async _search(query) {
      const body = this.panel.querySelector('#yqBody');
      const submitBtn = this.panel.querySelector('#yqSubmit');
      this.searching = true;
      submitBtn.disabled = true;
      body.innerHTML = '<div class="state-loading">智能搜索中</div>';

      try {
        const { mode, results } = await this.searcher.search(query);
        this.searchState = { mode, results, query };
        body.innerHTML = this._renderBodyContent(this.service.getRecent(), []);
        this._bindBodyEvents();
      } catch (e) {
        body.innerHTML = `<div class="state-error">⚠️ 搜索失败：${e.message}</div>`;
      } finally {
        this.searching = false;
        submitBtn.disabled = false;
      }
    }

    /** 给 body 内动态生成的元素绑事件（搜索结果 / 清除按钮） */
    _bindBodyEvents() {
      // 清除搜索按钮
      const clearBtn = this.panel.querySelector('#yqClearSearch');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.searchState = null;
          this.panel.querySelector('#yqUrl').value = '';
          this._renderMain();
        });
      }
      // 搜索结果点击 → 读取
      this.panel.querySelectorAll('.list-item[data-example-url]').forEach(el => {
        el.addEventListener('click', async () => {
          this.panel.querySelector('#yqUrl').value = el.dataset.exampleUrl;
          await this._fetch();
        });
      });
    }

    async _fetch() {
      const input = this.panel.querySelector('#yqUrl');
      const url = input.value.trim();
      if (!url) return;
      const body = this.panel.querySelector('#yqBody');
      body.innerHTML = '<div class="state-loading">读取中</div>';
      try {
        const doc = await this.service.getDocByUrl(url);
        this._renderDoc(doc);
      } catch(e) {
        body.innerHTML = `<div class="state-error">⚠️ ${e.message}</div>`;
      }
    }

    _renderDoc(doc) {
      this.currentDoc = doc;
      // 计算"打开原文"链接：优先 doc.url，其次用 namespace+slug 兜底拼接
      const openUrl = doc.url
        || (doc.namespace && doc.slug ? `https://hellobike.yuque.com/${doc.namespace}/${doc.slug}` : '');
      doc._openUrl = openUrl;
      // 用统一 Markdown 渲染器：支持图片、链接、标题、列表、代码块等
      const html = window.Markdown
        ? window.Markdown.render(doc.content)
        : doc.content.split('\n').map(l => `<div>${l}</div>`).join('');
      this.panel.innerHTML = `
        <div class="panel-head">
          <button class="btn-icon btn-back" id="yqBack">‹</button>
          <span class="panel-head-title">${doc.title}</span>
          <button class="btn-icon" id="yqClose2">✕</button>
        </div>
        <div class="panel-body yq-doc-body">
          ${html}
        </div>
        <div class="panel-foot">
          <button class="btn-action" data-a="fav">${this.service.isFavorited && this.service.isFavorited(doc.id) ? '★ 已收藏' : '☆ 收藏'}</button>
          <button class="btn-action" data-a="copy">📋 复制</button>
          ${openUrl ? `<button class="btn-action" data-a="open">🔗 打开原文</button>` : ''}
          <button class="btn-action primary" data-a="ai">🤖 AI 总结</button>
        </div>`;

      this.panel.querySelector('#yqBack').addEventListener('click', () => this._renderMain());
      this.panel.querySelector('#yqClose2').addEventListener('click', () => document.dispatchEvent(new CustomEvent('panel-close-all')));
      this.panel.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.a === 'copy') { navigator.clipboard.writeText(doc.content); btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = '📋 复制', 1200); }
          if (btn.dataset.a === 'fav' && this.service.toggleFavorite) {
            const nowFav = this.service.toggleFavorite(doc);
            btn.textContent = nowFav ? '★ 已收藏' : '☆ 收藏';
          }
          if (btn.dataset.a === 'ai' && this.onSendToAI) this.onSendToAI(doc.title, doc.content);
          if (btn.dataset.a === 'open' && openUrl) {
            try { require('electron').shell.openExternal(openUrl); }
            catch (e) { window.open(openUrl, '_blank'); }
          }
        });
      });
    }
  }
  window.YuqueComponent = YuqueComponent;
})();
