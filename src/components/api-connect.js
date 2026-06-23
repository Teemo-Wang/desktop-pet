/**
 * API 接入面板组件
 * 定位：外部服务能力配置中心（AI模型 / 钉钉 / 语雀）
 */
(function() {
  const { ipcRenderer } = require('electron');

  // 各供应商的默认配置（一键切换时回填 baseUrl + 模型）
  const PROVIDER_PRESETS = {
    deepseek: {
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelName: 'deepseek-chat',
      hint: '国内直连，支付宝充值，性价比高',
      keyDocUrl: 'https://platform.deepseek.com/api_keys',
    },
    qwen: {
      label: '通义千问',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelName: 'qwen-plus',
      hint: '阿里官方，稳定可靠',
      keyDocUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    },
    volcengine: {
      label: '火山方舟',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      modelName: 'doubao-seed-2-0-code-preview-260215',
      hint: '字节豆包，模型名填已开通的模型ID或推理接入点(ep-)',
      keyDocUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    },
    zhipu: {
      label: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      modelName: 'glm-4-flash',
      hint: '有免费额度，新手友好',
      keyDocUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    },
    moonshot: {
      label: 'Moonshot Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'moonshot-v1-8k',
      hint: '长文本理解强',
      keyDocUrl: 'https://platform.moonshot.cn/console/api-keys',
    },
    openai: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o-mini',
      hint: '需要境外信用卡 + 代理；ChatGPT Plus 不通用',
      keyDocUrl: 'https://platform.openai.com/api-keys',
    },
    claude: {
      label: 'Claude',
      baseUrl: 'https://api.anthropic.com/v1',
      modelName: 'claude-3-5-haiku-20241022',
      hint: '需要境外信用卡 + 代理；协议非 OpenAI 兼容',
      keyDocUrl: 'https://console.anthropic.com/settings/keys',
    },
    custom: {
      label: '自定义',
      baseUrl: '',
      modelName: '',
      hint: '兼容 OpenAI 协议的任意服务',
      keyDocUrl: '',
    },
  };

  class APIConnectComponent {
    constructor(panelEl, services, store) {
      this.panel = panelEl;
      this.ai = services.ai;
      this.dt = services.dingtalk;
      this.yq = services.yuque;
      this.store = store;
      this.isOpen = false;
    }

    open() {
      this.isOpen = true;
      this._render();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    _render() {
      const model = this.store.get('model');
      const imageModel = this.store.get('imageModel') || { modelName: '', size: '2048x2048' };
      const dtConnected = this.dt.connected;
      const yqConnected = this.yq.connected;
      const preset = PROVIDER_PRESETS[model.provider] || PROVIDER_PRESETS.custom;

      this.panel.innerHTML = `
        <div class="panel-head">
          <span class="panel-head-title">🔌 API 接入</span>
          <button class="btn-icon" id="apiClose">✕</button>
        </div>
        <div class="panel-body" style="padding:10px 14px;">

          <!-- AI 模型 -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">🤖</span>
              <span class="api-section-title">AI 模型</span>
              <span class="api-status ${model.apiKey ? 'ok' : ''}">${model.apiKey ? '已配置' : '未配置'}</span>
            </div>

            <!-- 供应商快速切换 -->
            <div class="api-providers">
              ${Object.entries(PROVIDER_PRESETS).map(([id, p]) => `
                <button class="api-provider-chip ${id === model.provider ? 'active' : ''}" data-provider="${id}" title="${p.hint}">
                  ${p.label}
                </button>
              `).join('')}
            </div>
            <div class="api-provider-hint">💡 ${preset.hint}${preset.keyDocUrl ? ` · <a href="${preset.keyDocUrl}" target="_blank" class="api-link">获取 Key</a>` : ''}</div>

            <div class="api-fields">
              <div class="api-field">
                <label>API Key</label>
                <input type="password" id="apiKey" class="api-input" value="${model.apiKey}" placeholder="输入 API Key">
              </div>
              <div class="api-field">
                <label>模型</label>
                <input type="text" id="apiModel" class="api-input" value="${model.modelName}" placeholder="${preset.modelName || '模型名'}">
              </div>
              <div class="api-field">
                <label>地址</label>
                <input type="text" id="apiUrl" class="api-input" value="${model.baseUrl}" placeholder="${preset.baseUrl || 'https://...'}">
              </div>
              <div class="api-field-row">
                <button class="api-btn" id="aiTest">测试连接</button>
                <span class="api-test-result" id="aiTestResult"></span>
              </div>
            </div>
          </div>

          <!-- 生图模型 -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">🎨</span>
              <span class="api-section-title">生图模型</span>
              <span class="api-status ${imageModel.modelName ? 'ok' : ''}">${imageModel.modelName ? '已配置' : '未配置'}</span>
            </div>
            <div class="api-provider-hint">💡 检测到作图/改图需求时自动切换到此模型（复用上方 API Key 和地址）。火山方舟填 seedream 模型ID 或接入点(ep-)</div>
            <div class="api-fields">
              <div class="api-field">
                <label>生图模型</label>
                <input type="text" id="imgModel" class="api-input" value="${imageModel.modelName || ''}" placeholder="doubao-seedream-4-5-251128">
              </div>
              <div class="api-field">
                <label>默认尺寸</label>
                <input type="text" id="imgSize" class="api-input" value="${imageModel.size || '2048x2048'}" placeholder="2048x2048">
              </div>
            </div>
          </div>

          <!-- 钉钉 -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">💬</span>
              <span class="api-section-title">钉钉</span>
              <span class="api-status ${dtConnected ? 'ok' : ''}">${dtConnected ? '已连接' : '未连接'}</span>
            </div>
            <div class="api-fields">
              <div class="api-field-row">
                ${dtConnected
                  ? '<button class="api-btn danger" id="dtDisconnect">断开连接</button><span class="api-hint">已绑定账号</span>'
                  : '<button class="api-btn" id="dtConnect">连接钉钉</button><span class="api-hint">授权后可读取消息</span>'
                }
              </div>
            </div>
          </div>

          <!-- 语雀 -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">📄</span>
              <span class="api-section-title">语雀</span>
              <span class="api-status ${yqConnected ? 'ok' : ''}">${yqConnected ? '已连接' : '未连接'}</span>
            </div>
            <div class="api-fields">
              <div class="api-field">
                <label>地址</label>
                <input type="text" id="yqBaseUrl" class="api-input" value="${this.store.get('yuque').baseUrl || 'https://www.yuque.com'}" placeholder="https://www.yuque.com">
              </div>
              <div class="api-field">
                <label>Token</label>
                <input type="password" id="yqToken" class="api-input" value="${this.store.get('yuque').token || ''}" placeholder="语雀 Personal Token">
              </div>
              <div class="api-provider-hint">💡 在 <a href="https://www.yuque.com/settings/tokens" target="_blank" class="api-link">语雀 Token 设置</a> 创建；企业空间需把地址改为 https://你的域名.yuque.com</div>
              <div class="api-field-row">
                ${yqConnected
                  ? `<button class="api-btn danger" id="yqDisconnect">断开授权</button><span class="api-test-result ok">✓ ${this.yq.userInfo?.name || '已授权'}</span>`
                  : '<button class="api-btn" id="yqConnect">授权连接</button><span class="api-test-result" id="yqTestResult"></span>'
                }
              </div>
            </div>
          </div>

        </div>
      `;

      this._bind();
    }

    _bind() {
      this.panel.querySelector('#apiClose').addEventListener('click', () => {
        document.dispatchEvent(new Event('panel-close-all'));
      });

      // 供应商一键切换：保存当前供应商配置 → 加载目标供应商配置
      this.panel.querySelectorAll('.api-provider-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const id = chip.dataset.provider;
          const preset = PROVIDER_PRESETS[id];
          if (!preset) return;

          const model = this.store.get('model');
          const configs = this.store.get('providerConfigs') || {};

          // 1. 先把当前供应商的配置存入 providerConfigs
          const curProvider = model.provider;
          configs[curProvider] = {
            apiKey: model.apiKey,
            modelName: model.modelName,
            baseUrl: model.baseUrl,
          };

          // 2. 加载目标供应商的配置（没有则用预设默认）
          const target = configs[id] || {
            apiKey: '',
            modelName: preset.modelName,
            baseUrl: preset.baseUrl,
          };

          // 3. 写回当前激活配置
          this.store.set('model', 'provider', id);
          this.store.set('model', 'apiKey', target.apiKey || '');
          this.store.set('model', 'modelName', target.modelName || preset.modelName);
          this.store.set('model', 'baseUrl', target.baseUrl || preset.baseUrl);
          this.store.set('providerConfigs', curProvider, configs[curProvider]);

          window.aiService.configure(this.store.get('model'));
          this._render();
        });
      });

      // 表单字段实时保存（同时同步到当前供应商的 providerConfigs 槽位）
      const saveAI = () => {
        const apiKey = document.getElementById('apiKey').value;
        const modelName = document.getElementById('apiModel').value;
        const baseUrl = document.getElementById('apiUrl').value;
        this.store.set('model', 'apiKey', apiKey);
        this.store.set('model', 'modelName', modelName);
        this.store.set('model', 'baseUrl', baseUrl);
        // 同步到当前供应商槽位，切换回来时能恢复
        const provider = this.store.get('model').provider;
        this.store.set('providerConfigs', provider, { apiKey, modelName, baseUrl });
        window.aiService.configure(this.store.get('model'));
      };
      ['apiKey','apiModel','apiUrl'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveAI);
      });

      // 生图模型字段保存
      const saveImageModel = () => {
        const im = document.getElementById('imgModel');
        const sz = document.getElementById('imgSize');
        if (im) this.store.set('imageModel', 'modelName', im.value.trim());
        if (sz) this.store.set('imageModel', 'size', sz.value.trim() || '2048x2048');
      };
      ['imgModel','imgSize'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveImageModel);
      });

      // AI 测试
      const aiTestBtn = document.getElementById('aiTest');
      if (aiTestBtn) {
        aiTestBtn.addEventListener('click', async () => {
          const r = document.getElementById('aiTestResult');
          saveAI();
          r.textContent = '测试中...'; r.className = 'api-test-result';
          const result = await window.aiService.test();
          r.textContent = result.ok ? '✓ ' + result.msg : '✗ ' + result.msg;
          r.className = 'api-test-result ' + (result.ok ? 'ok' : 'err');
        });
      }

      // 钉钉
      const dtConn = document.getElementById('dtConnect');
      if (dtConn) dtConn.addEventListener('click', async () => {
        dtConn.textContent = '连接中...'; dtConn.disabled = true;
        await this.dt.connect();
        this._render();
      });
      const dtDisc = document.getElementById('dtDisconnect');
      if (dtDisc) dtDisc.addEventListener('click', () => { this.dt.connected = false; this._render(); });

      // 语雀
      const yqConn = document.getElementById('yqConnect');
      if (yqConn) yqConn.addEventListener('click', async () => {
        const token = document.getElementById('yqToken').value.trim();
        const baseUrl = document.getElementById('yqBaseUrl').value.trim() || 'https://www.yuque.com';
        const r = document.getElementById('yqTestResult');
        if (!token) { r.textContent = '请输入 Token'; r.className = 'api-test-result err'; return; }
        yqConn.textContent = '连接中...'; yqConn.disabled = true;
        try {
          const user = await this.yq.connect(token, baseUrl);
          // 持久化（含用户信息，下次启动可自动恢复）
          this.store.set('yuque', 'token', token);
          this.store.set('yuque', 'baseUrl', baseUrl);
          this.store.set('yuque', 'userLogin', user.login || '');
          this.store.set('yuque', 'userName', user.name || '');
          this._render();
        } catch(e) {
          r.textContent = '✗ ' + e.message;
          r.className = 'api-test-result err';
          yqConn.textContent = '授权连接';
          yqConn.disabled = false;
        }
      });
      const yqDisc = document.getElementById('yqDisconnect');
      if (yqDisc) yqDisc.addEventListener('click', () => {
        this.yq.disconnect();
        this.store.set('yuque', 'token', '');
        this.store.set('yuque', 'userLogin', '');
        this.store.set('yuque', 'userName', '');
        this._render();
      });
    }
  }

  window.APIConnectComponent = APIConnectComponent;
})();
