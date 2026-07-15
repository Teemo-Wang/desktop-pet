/**
 * 偏好设置面板
 * 负责：桌宠行为偏好（不含 API/账号配置）
 */
(function() {
  const { ipcRenderer } = require('electron');

  class PreferencesComponent {
    constructor(panelEl, store) {
      this.panel = panelEl;
      this.store = store;
      this.isOpen = false;
    }

    open() { this.isOpen = true; this._render(); this.panel.classList.add('open'); }
    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    _render() {
      const g = this.store.get('general');
      const a = this.store.get('appearance');
      const w = this.store.get('work');

      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title">⚙️ 偏好设置</span>
          <button class="btn-icon" id="prefClose">✕</button>
        </div>
        <div class="panel-body" style="padding:10px 14px;">

          <div class="pref-group">
            <div class="pref-group-title">提醒</div>
            ${this._toggle('work','dingtalkNotify','钉钉消息提醒',w.dingtalkNotify)}
            ${this._toggle('work','showMsgContent','显示消息内容',w.showMsgContent)}
            ${this._toggle('work','dndEnabled','免打扰模式',w.dndEnabled)}
            <div class="pref-row ${w.dndEnabled?'':'disabled'}" id="dndTimeRow">
              <span class="pref-label">免打扰时段</span>
              <div class="pref-time-range">
                <input type="time" class="pref-time" data-g="work" data-k="dndStart" value="${w.dndStart}">
                <span class="pref-time-sep">—</span>
                <input type="time" class="pref-time" data-g="work" data-k="dndEnd" value="${w.dndEnd}">
              </div>
            </div>
          </div>

          <div class="pref-group">
            <div class="pref-group-title">机器人对话</div>
            ${this._toggle('work','allowChitchat','允许闲聊',w.allowChitchat)}
            <div class="pref-hint">开启后，与哈啰/设计无关的话题（闲聊、通用知识等）会用通用 AI 自由回答；关闭则只聚焦工作话题，其它礼貌婉拒。</div>
            ${this._select('work','editMethod','改图方式',w.editMethod||'designhub',[['designhub','DesignHub 智能改图'],['model','自带生图模型']])}
            <div class="pref-hint">改图用哪个引擎：DesignHub 擅长改文案/换配色、保真度高；自带生图模型更灵活、支持纯文生图。主要作用于钉钉机器人改图（含整组/多图）；本地聊天上传图改图仍走自带生图模型。</div>
          </div>



          <div class="pref-group">
            <div class="pref-group-title">窗口</div>
            ${this._toggle('general','alwaysOnTop','始终置顶',g.alwaysOnTop)}
            ${this._slider('general','opacity','透明度',g.opacity,30,100,'%')}
            ${this._slider('general','scale','缩放比例',g.scale,50,200,'%')}
          </div>

          <div class="pref-group">
            <div class="pref-group-title">桌宠</div>
            ${this._select('appearance','idleAnimation','待机动画',a.idleAnimation,[['float','悬浮'],['breathe','呼吸'],['bounce','弹跳']])}
            ${this._select('appearance','messageReaction','消息反馈',a.messageReaction,[['bounce','弹跳'],['shake','摇晃'],['glow','发光']])}
          </div>
          </div>

        </div>
      `;

      this._bind();
    }

    _toggle(g, k, label, val) {
      return `<div class="pref-row">
        <span class="pref-label">${label}</span>
        <label class="pref-toggle"><input type="checkbox" data-g="${g}" data-k="${k}" ${val?'checked':''}><span class="pref-toggle-track"></span></label>
      </div>`;
    }

    _slider(g, k, label, val, min, max, unit) {
      return `<div class="pref-row">
        <span class="pref-label">${label}</span>
        <div class="pref-slider-wrap">
          <input type="range" class="pref-slider" data-g="${g}" data-k="${k}" min="${min}" max="${max}" value="${val}">
          <span class="pref-slider-val">${val}${unit}</span>
        </div>
      </div>`;
    }

    _select(g, k, label, val, opts) {
      return `<div class="pref-row">
        <span class="pref-label">${label}</span>
        <select class="pref-select" data-g="${g}" data-k="${k}">
          ${opts.map(o => `<option value="${o[0]}" ${o[0]===val?'selected':''}>${o[1]}</option>`).join('')}
        </select>
      </div>`;
    }

    _renderDockItems() {
      const dock = this.store.get('dock');
      const items = dock?.items || [];
      const allActions = [
        { id:'chat', icon:'🤖', label:'AI' },
        { id:'dingtalk', icon:'💬', label:'钉钉' },
        { id:'yuque', icon:'📄', label:'语雀' },
        { id:'skills', icon:'⚡', label:'技能' },
        { id:'todos', icon:'✅', label:'待办' },
        { id:'notifications', icon:'🔔', label:'提醒' },
        { id:'settings', icon:'⚙️', label:'设置' },
      ];

      return items.map((item, i) => `
        <div class="pref-dock-item" data-index="${i}">
          <span class="pref-dock-icon">${item.icon}</span>
          <input class="pref-dock-label-input" data-index="${i}" value="${item.label}" maxlength="4">
          <select class="pref-dock-action" data-index="${i}">
            ${allActions.map(a => `<option value="${a.id}" ${a.id===item.id?'selected':''}>${a.icon} ${a.label}</option>`).join('')}
          </select>
        </div>
      `).join('');
    }

    _bind() {
      this.panel.querySelector('#prefClose').addEventListener('click', () => {
        document.dispatchEvent(new Event('panel-close-all'));
      });

      // Toggle
      this.panel.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.addEventListener('change', () => {
          this.store.set(el.dataset.g, el.dataset.k, el.checked);
          this._applyToggle(el.dataset.g, el.dataset.k, el.checked);
        });
      });

      // Slider
      this.panel.querySelectorAll('.pref-slider').forEach(el => {
        el.addEventListener('input', () => {
          const v = parseInt(el.value);
          this.store.set(el.dataset.g, el.dataset.k, v);
          el.nextElementSibling.textContent = v + '%';
          this._applySlider(el.dataset.k, v);
        });
      });

      // Select
      this.panel.querySelectorAll('.pref-select').forEach(el => {
        el.addEventListener('change', () => {
          this.store.set(el.dataset.g, el.dataset.k, el.value);
          this._applySelect(el.dataset.k, el.value);
        });
      });

      // Time
      this.panel.querySelectorAll('.pref-time').forEach(el => {
        el.addEventListener('change', () => { this.store.set(el.dataset.g, el.dataset.k, el.value); });
      });

      // Dock 标签编辑
      this.panel.querySelectorAll('.pref-dock-label-input').forEach(el => {
        el.addEventListener('change', () => {
          const dock = this.store.get('dock');
          const idx = parseInt(el.dataset.index);
          if (dock.items[idx]) { dock.items[idx].label = el.value; this.store.set('dock', 'items', dock.items); }
        });
      });

      this.panel.querySelectorAll('.pref-dock-action').forEach(el => {
        el.addEventListener('change', () => {
          const dock = this.store.get('dock');
          const idx = parseInt(el.dataset.index);
          const opt = el.options[el.selectedIndex];
          if (dock.items[idx]) {
            dock.items[idx].id = el.value;
            dock.items[idx].icon = opt.textContent.split(' ')[0];
            this.store.set('dock', 'items', dock.items);
          }
        });
      });
    }

    _applyToggle(group, key, value) {
      if (key === 'alwaysOnTop') {
        ipcRenderer.send('toggle-always-on-top', value);
      }
      if (key === 'dndEnabled') {
        document.getElementById('dndTimeRow').classList.toggle('disabled', !value);
      }
      if (key === 'dingtalkNotify') {
        const img = document.querySelector('.pet-image');
        img.classList.add('react-bounce');
        setTimeout(() => img.classList.remove('react-bounce'), 600);
      }
      if (key === 'showMsgContent') {
        // 实时更新通知组件的隐私设置
        document.dispatchEvent(new CustomEvent('privacy-changed', { detail: { showContent: value } }));
      }
    }

    _applySlider(key, value) {
      if (key === 'opacity') {
        ipcRenderer.send('set-opacity', value / 100);
      }
      if (key === 'scale') {
        const img = document.querySelector('.pet-image');
        const shadow = document.querySelector('.pet-shadow');
        const s = value / 100;
        img.style.width = (130 * s) + 'px';
        img.style.height = (150 * s) + 'px';
        if (shadow) shadow.style.width = (44 * s) + 'px';
      }
    }

    _applySelect(key, value) {
      const img = document.querySelector('.pet-image');
      if (key === 'idleAnimation') {
        // 切换待机动画
        img.style.animationName = 'pet-' + value;
      }
      if (key === 'messageReaction') {
        // 预览反馈动画
        img.classList.add('react-' + value);
        setTimeout(() => img.classList.remove('react-' + value), 600);
      }
    }
  }

  window.PreferencesComponent = PreferencesComponent;
})();
