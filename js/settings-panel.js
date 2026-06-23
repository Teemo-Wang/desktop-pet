/**
 * 设置面板 UI
 */

(function() {
  const { ipcRenderer } = require('electron');

  class SettingsPanel {
    constructor() {
      this.store = new window.SettingsStore();
      this.el = document.createElement('div');
      this.el.id = 'settingsPanel';
      this.el.className = 'settings-panel';
      document.querySelector('.app').appendChild(this.el);
      this.isOpen = false;
      this.activeTab = 'general';
    }

    open() { this.isOpen = true; this._render(); this.el.classList.add('open'); }
    close() { this.isOpen = false; this.el.classList.remove('open'); }
    getSettings() { return this.store.get(); }

    _render() {
      const s = this.store.get();
      this.el.innerHTML = `
        <div class="settings-header">
          <span class="settings-title">设置</span>
          <button class="settings-close" id="settingsClose">✕</button>
        </div>
        <div class="settings-tabs">
          <button class="tab-btn ${this.activeTab==='general'?'active':''}" data-tab="general">基础</button>
          <button class="tab-btn ${this.activeTab==='appearance'?'active':''}" data-tab="appearance">形象</button>
          <button class="tab-btn ${this.activeTab==='work'?'active':''}" data-tab="work">工作</button>
          <button class="tab-btn ${this.activeTab==='model'?'active':''}" data-tab="model">模型</button>
        </div>
        <div class="settings-body">${this._renderTab(s)}</div>
      `;
      this._bindEvents();
    }

    _renderTab(s) {
      switch(this.activeTab) {
        case 'general': return this._general(s.general);
        case 'appearance': return this._appearance(s.appearance);
        case 'work': return this._work(s.work);
        case 'model': return this._model(s.model);
      }
    }

    _general(s) { return `<div class="setting-group">
      ${this._tog('general','autoStart','开机自启动',s.autoStart)}
      ${this._tog('general','alwaysOnTop','始终置顶',s.alwaysOnTop)}
      ${this._sld('general','opacity','透明度',s.opacity,30,100,'%')}
      ${this._sld('general','scale','缩放比例',s.scale,50,200,'%')}
      ${this._tog('general','snapToEdge','吸附屏幕边缘',s.snapToEdge)}
      ${this._tog('general','minimizeToTray','最小化到托盘',s.minimizeToTray)}
    </div>`; }

    _appearance(s) { return `<div class="setting-group">
      ${this._sel('appearance','petSize','桌宠大小',s.petSize,[['small','小'],['medium','中'],['large','大']])}
      ${this._sel('appearance','idleAnimation','待机动画',s.idleAnimation,[['float','悬浮'],['breathe','呼吸'],['bounce','弹跳']])}
      ${this._sel('appearance','messageReaction','消息反馈',s.messageReaction,[['bounce','弹跳'],['shake','摇晃'],['glow','发光']])}
      ${this._sel('appearance','expressionMode','表情模式',s.expressionMode,[['auto','自动'],['always-happy','开心'],['minimal','极简']])}
    </div>`; }

    _work(s) { return `<div class="setting-group">
      ${this._tog('work','dingtalkNotify','钉钉消息提醒',s.dingtalkNotify)}
      ${this._tog('work','aiAssistant','AI 助手',s.aiAssistant)}
      ${this._tog('work','yuqueAccess','语雀文档读取',s.yuqueAccess)}
      <div class="setting-divider"></div>
      ${this._tog('work','dndEnabled','免打扰模式',s.dndEnabled)}
      <div class="setting-row ${s.dndEnabled?'':'disabled'}">
        <span class="setting-label">免打扰时段</span>
        <div class="time-range">
          <input type="time" class="time-input" data-group="work" data-key="dndStart" value="${s.dndStart}">
          <span class="time-sep">至</span>
          <input type="time" class="time-input" data-group="work" data-key="dndEnd" value="${s.dndEnd}">
        </div>
      </div>
    </div>`; }

    _model(s) { return `<div class="setting-group">
      ${this._sel('model','provider','模型供应商',s.provider,[['openai','OpenAI'],['deepseek','DeepSeek'],['qwen','通义千问'],['custom','自定义']])}
      <div class="setting-row"><span class="setting-label">API Key</span>
        <input type="password" class="setting-input" data-group="model" data-key="apiKey" value="${s.apiKey}" placeholder="输入 API Key..."></div>
      <div class="setting-row"><span class="setting-label">模型名称</span>
        <input type="text" class="setting-input" data-group="model" data-key="modelName" value="${s.modelName}" placeholder="gpt-4o-mini"></div>
      <div class="setting-row"><span class="setting-label">API 地址</span>
        <input type="text" class="setting-input" data-group="model" data-key="baseUrl" value="${s.baseUrl}" placeholder="https://api.openai.com/v1"></div>
      <div class="setting-row"><button class="test-btn" id="testConn">🔗 测试连接</button><span class="test-result" id="testResult"></span></div>
    </div>`; }

    // UI 组件
    _tog(g,k,label,v) { return `<div class="setting-row"><span class="setting-label">${label}</span><label class="toggle"><input type="checkbox" data-group="${g}" data-key="${k}" ${v?'checked':''}><span class="toggle-slider"></span></label></div>`; }
    _sld(g,k,label,v,min,max,u) { return `<div class="setting-row"><span class="setting-label">${label}</span><div class="slider-wrap"><input type="range" class="slider" data-group="${g}" data-key="${k}" min="${min}" max="${max}" value="${v}"><span class="slider-value">${v}${u}</span></div></div>`; }
    _sel(g,k,label,v,opts) { return `<div class="setting-row"><span class="setting-label">${label}</span><select class="setting-select" data-group="${g}" data-key="${k}">${opts.map(o=>`<option value="${o[0]}" ${o[0]===v?'selected':''}>${o[1]}</option>`).join('')}</select></div>`; }

    _bindEvents() {
      this.el.querySelector('#settingsClose').addEventListener('click', () => this.close());

      this.el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => { this.activeTab = btn.dataset.tab; this._render(); });
      });

      this.el.querySelectorAll('input[type="checkbox"]').forEach(inp => {
        inp.addEventListener('change', () => {
          this.store.setValue(inp.dataset.group, inp.dataset.key, inp.checked);
          if (inp.dataset.key === 'alwaysOnTop') ipcRenderer.send('toggle-always-on-top', inp.checked);
          if (inp.dataset.key === 'dndEnabled') this._render();
        });
      });

      this.el.querySelectorAll('.slider').forEach(inp => {
        inp.addEventListener('input', () => {
          const v = parseInt(inp.value);
          this.store.setValue(inp.dataset.group, inp.dataset.key, v);
          inp.nextElementSibling.textContent = v + '%';
          if (inp.dataset.key === 'opacity') ipcRenderer.send('set-opacity', v / 100);
        });
      });

      this.el.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', () => { this.store.setValue(sel.dataset.group, sel.dataset.key, sel.value); });
      });

      this.el.querySelectorAll('.setting-input').forEach(inp => {
        inp.addEventListener('change', () => { this.store.setValue(inp.dataset.group, inp.dataset.key, inp.value); });
      });

      this.el.querySelectorAll('.time-input').forEach(inp => {
        inp.addEventListener('change', () => { this.store.setValue(inp.dataset.group, inp.dataset.key, inp.value); });
      });

      const testBtn = this.el.querySelector('#testConn');
      if (testBtn) testBtn.addEventListener('click', () => this._testConn());
    }

    async _testConn() {
      const r = this.el.querySelector('#testResult');
      r.textContent = '测试中...'; r.className = 'test-result testing';
      const m = this.store.get('model');
      try {
        const res = await fetch(m.baseUrl + '/models', { headers: { 'Authorization': 'Bearer ' + m.apiKey }, signal: AbortSignal.timeout(5000) });
        if (res.ok) { r.textContent = '✓ 连接成功'; r.className = 'test-result success'; }
        else { r.textContent = '✗ ' + res.status; r.className = 'test-result error'; }
      } catch(e) { r.textContent = '✗ ' + e.message; r.className = 'test-result error'; }
    }
  }

  window.SettingsPanel = SettingsPanel;
})();
