/**
 * API 接入面板组件
 * 定位：外部服务能力配置中心（AI模型 / 钉钉 / 语雀）
 */
(function() {
  const { ipcRenderer } = require('electron');

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
      // 生图模型默认值（火山方舟用 seedream 系列），随供应商联动
      imageModelName: 'doubao-seedream-4-5-251128',
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
      // OpenAI 生图模型默认 DALL·E 3
      imageModelName: 'dall-e-3',
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

  // ===== 钉钉凭据「配置码」编解码 =====
  // 用于团队分发：管理员把机器人凭据编码成一段可复制的字符串，成员粘贴即可一键导入
  const CRED_PREFIX = 'HBOT1:';

  /** 把钉钉凭据对象编码为配置码（UTF-8 安全的 base64，兼容中文机器人名） */
  function encodeCred(cfg) {
    const payload = {
      v: 1,
      robotName: cfg.robotName || '',
      appKey: cfg.appKey || '',
      appSecret: cfg.appSecret || '',
      replyMode: cfg.replyMode || 'confirm',
    };
    const json = JSON.stringify(payload);
    // encodeURIComponent + unescape 组合确保中文等多字节字符正确编码
    return CRED_PREFIX + btoa(unescape(encodeURIComponent(json)));
  }

  /** 解析配置码为凭据对象；失败返回 null */
  function decodeCred(code) {
    if (!code) return null;
    let raw = String(code).trim();
    if (raw.startsWith(CRED_PREFIX)) raw = raw.slice(CRED_PREFIX.length);
    try {
      const json = decodeURIComponent(escape(atob(raw)));
      const obj = JSON.parse(json);
      if (!obj || !obj.appKey || !obj.appSecret) return null;
      return {
        robotName: obj.robotName || '',
        appKey: String(obj.appKey).trim(),
        appSecret: String(obj.appSecret).trim(),
        replyMode: obj.replyMode === 'auto' ? 'auto' : 'confirm',
      };
    } catch (e) {
      return null;
    }
  }

  class APIConnectComponent {
    constructor(panelEl, services, store) {
      this.panel = panelEl;
      this.ai = services.ai;
      this.dt = services.dingtalk;
      this.yq = services.yuque;
      this.mat = services.material;
      this.store = store;
      this.isOpen = false;
    }

    open() {
      this.isOpen = true;
      this._render();
      this.panel.classList.add('open');
    }

    close() { this.isOpen = false; this.panel.classList.remove('open'); }

    /** 用户自建供应商 map */
    _customProviders() { return this.store.get('customProviders') || {}; }

    /** 取某供应商配置：内置预设 → 用户自建 → 兜底自定义 */
    _getPreset(id) {
      return PROVIDER_PRESETS[id] || this._customProviders()[id] || PROVIDER_PRESETS.custom;
    }

    /** 切换当前供应商：保存当前配置槽 → 载入目标配置 */
    _switchProvider(id) {
      const preset = this._getPreset(id);
      if (!preset) return;
      const model = this.store.get('model');
      const img = this.store.get('imageModel') || {};
      const configs = this.store.get('providerConfigs') || {};
      const curProvider = model.provider;
      // 保存当前供应商的「对话模型 + 生图模型」到其配置槽（生图随供应商联动的关键）
      configs[curProvider] = {
        apiKey: model.apiKey,
        modelName: model.modelName,
        baseUrl: model.baseUrl,
        imageModelName: img.modelName || '',
        imageSize: img.size || '2048x2048',
      };
      const target = configs[id] || {
        apiKey: '',
        modelName: preset.modelName,
        baseUrl: preset.baseUrl,
        imageModelName: preset.imageModelName || '',
        imageSize: '2048x2048',
      };
      this.store.set('model', 'provider', id);
      this.store.set('model', 'apiKey', target.apiKey || '');
      this.store.set('model', 'modelName', target.modelName || preset.modelName || '');
      this.store.set('model', 'baseUrl', target.baseUrl || preset.baseUrl || '');
      // 生图模型跟随供应商切换：仅在「生图复用对话配置」（未配独立 Key/地址）时联动；
      // 若生图配了独立接口（公司单独的生图服务），保持其配置不被对话供应商切换覆盖
      const imgIndependent = !!(img.apiKey || img.baseUrl);
      if (!imgIndependent) {
        const nextImgModel = (target.imageModelName !== undefined && target.imageModelName !== null)
          ? target.imageModelName
          : (preset.imageModelName || '');
        this.store.set('imageModel', 'modelName', nextImgModel);
        this.store.set('imageModel', 'size', target.imageSize || '2048x2048');
      }
      this.store.set('providerConfigs', curProvider, configs[curProvider]);
      window.aiService.configure(this.store.get('model'));
      // 同步刷新生图配置，切换后立即生效
      window.aiService.imageConfig = this.store.get('imageModel');
      this._render();
    }

    _render() {
      const model = this.store.get('model');
      const imageModel = this.store.get('imageModel') || { modelName: '', size: '2048x2048' };
      // 生图模型入口开关：显示生图模型配置区
      const SHOW_IMAGE_MODEL = true;
      const dtConnected = this.dt.realMode && this.dt.connected;
      const yqConnected = this.yq.connected;
      const matConnected = !!(this.mat && this.mat.connected);
      const customProviders = this._customProviders();
      const preset = this._getPreset(model.provider);
      // 生图模型可切换列表：优先用已保存的 options，其次预设默认，最后回退到当前模型名
      let imgOptions = (Array.isArray(imageModel.options) && imageModel.options.length)
        ? imageModel.options.slice()
        : (preset.imageModelOptions ? preset.imageModelOptions.slice() : []);
      if (imageModel.modelName && !imgOptions.includes(imageModel.modelName)) imgOptions.unshift(imageModel.modelName);

      // 当前激活的是否为用户自建供应商（可重命名/删除）
      const activeIsCustom = !!customProviders[model.provider];

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

            <!-- 供应商快速切换（内置预设 + 用户自建 + 新建） -->
            <div class="api-providers">
              ${Object.entries(PROVIDER_PRESETS).map(([id, p]) => `
                <button class="api-provider-chip ${id === model.provider ? 'active' : ''}" data-provider="${id}" title="${p.hint}">
                  ${p.label}
                </button>
              `).join('')}
              ${Object.entries(customProviders).map(([id, p]) => `
                <button class="api-provider-chip ${id === model.provider ? 'active' : ''}" data-provider="${id}" title="自定义 API：${_esc(p.label)}">
                  ${_esc(p.label)}
                </button>
              `).join('')}
              <button class="api-provider-chip api-provider-add" id="providerAdd" title="新建一个自定义 API">＋ 新建</button>
            </div>
            <div class="api-provider-hint">💡 ${preset.hint}${preset.keyDocUrl ? ` · <a href="${preset.keyDocUrl}" target="_blank" class="api-link">获取 Key</a>` : ''}</div>
            ${activeIsCustom ? `
            <div class="api-field api-field-row" style="align-items:center;gap:8px;">
              <label style="flex:0 0 auto;">名称</label>
              <input type="text" id="providerName" class="api-input" style="flex:1;" value="${_esc((customProviders[model.provider]||{}).label || '')}" placeholder="给这个 API 命名">
              <button class="api-btn danger" id="providerDelete" style="flex:0 0 auto;">删除</button>
            </div>
            ` : ''}

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

          <!-- 生图模型（暂时隐藏，由 SHOW_IMAGE_MODEL 控制，保留代码待后续启用） -->
          ${SHOW_IMAGE_MODEL ? `
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">🎨</span>
              <span class="api-section-title">生图模型</span>
              <span class="api-status ${imageModel.modelName ? 'ok' : ''}">${imageModel.modelName ? '已配置' : '未配置'}</span>
            </div>
            <div class="api-provider-hint">💡 多个生图模型点标签即可切换；下方新增一个模型后回车加入。生图 Key / 地址留空则复用对话配置，填了则用生图专用接口（如公司另一个生图服务）。</div>
            <!-- 可切换的生图模型标签：点击即设为当前生效模型 -->
            <div class="api-providers" style="margin-top:0;">
              ${imgOptions.map(m => `
                <span class="api-provider-chip img-model-chip ${m === imageModel.modelName ? 'active' : ''}" data-imgmodel="${_esc(m)}" title="${_esc(m)}">
                  <span class="img-model-name">${_esc(m)}</span>
                  <span class="img-model-del" data-imgdel="${_esc(m)}" title="删除此模型">×</span>
                </span>
              `).join('')}
            </div>
            <div class="api-fields">
              <div class="api-field">
                <label>新增/改</label>
                <input type="text" id="imgModel" class="api-input" value="${_esc(imageModel.modelName || '')}" placeholder="输入生图模型名后回车加入（如 Doubao-Seedream-4.5）">
              </div>
              <div class="api-field">
                <label>生图Key</label>
                <input type="password" id="imgApiKey" class="api-input" value="${_esc(imageModel.apiKey || '')}" placeholder="留空=复用对话 Key；生图专用则填其 sk-">
              </div>
              <div class="api-field">
                <label>生图地址</label>
                <input type="text" id="imgBaseUrl" class="api-input" value="${_esc(imageModel.baseUrl || '')}" placeholder="留空=复用对话地址；如 https://xxx/v1">
              </div>
              <div class="api-field">
                <label>默认尺寸</label>
                <input type="text" id="imgSize" class="api-input" value="${_esc(imageModel.size || '2048x2048')}" placeholder="2048x2048（填 0 为自定义/自适应）">
              </div>
            </div>
          </div>
          ` : ''}

          <!-- 钉钉 -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">💬</span>
              <span class="api-section-title">钉钉机器人</span>
              <span class="api-status ${dtConnected ? 'ok' : ''}">${dtConnected ? '已连接' : '未连接'}</span>
            </div>
            <div class="api-provider-hint">💡 实名 AI 助理：同事单聊机器人/群内@机器人 → 你实时收到，AI 协助解读、拟回复、转待办。需在<a href="https://open-dev.dingtalk.com" target="_blank" class="api-link">钉钉开放平台</a>创建企业内部机器人（Stream 模式），填入 AppKey/AppSecret。</div>
            <div class="api-fields">
              <div class="api-field">
                <label>机器人名称</label>
                <input type="text" id="dtRobotName" class="api-input" value="${this.store.get('dingtalk').robotName || ''}" placeholder="如：小哈·XX的设计助手">
              </div>
              <div class="api-field">
                <label>AppKey</label>
                <input type="text" id="dtAppKey" class="api-input" value="${this.store.get('dingtalk').appKey || ''}" placeholder="机器人 AppKey / ClientID">
              </div>
              <div class="api-field">
                <label>AppSecret</label>
                <input type="password" id="dtAppSecret" class="api-input" value="${this.store.get('dingtalk').appSecret || ''}" placeholder="机器人 AppSecret / ClientSecret">
              </div>
              <div class="api-field">
                <label>RobotCode</label>
                <input type="text" id="dtRobotCode" class="api-input" value="${this.store.get('dingtalk').robotCode || ''}" placeholder="机器人 RobotCode（发图片消息用，开放平台机器人页可查）">
              </div>
              <div class="api-field">
                <label>回复策略</label>
                <select id="dtReplyMode" class="api-input">
                  <option value="confirm" ${(this.store.get('dingtalk').replyMode||'confirm')==='confirm'?'selected':''}>人工确认后再发（推荐）</option>
                  <option value="auto" ${(this.store.get('dingtalk').replyMode)==='auto'?'selected':''}>自动回复（可随时接管）</option>
                </select>
              </div>
              <div class="api-field-row">
                ${dtConnected
                  ? '<button class="api-btn danger" id="dtDisconnect">断开机器人</button><span class="api-test-result ok">✓ 机器人在线</span>'
                  : '<button class="api-btn" id="dtConnect">连接机器人</button><span class="api-test-result" id="dtTestResult"></span>'
                }
              </div>

              <!-- 配置码：团队分发用（管理员生成 → 成员粘贴一键导入） -->
              <div class="api-cred-share">
                <div class="api-cred-share-label">🔗 配置码 · 团队分发</div>
                <div class="api-provider-hint" style="margin:2px 0 6px;">💡 管理员填好上方凭据后「生成配置码」发给成员；成员粘贴到下方「导入」即可自动填好，无需手动抄 AppKey。</div>
                <div class="api-field-row api-cred-import-row">
                  <input type="text" id="dtCredCode" class="api-input" placeholder="粘贴配置码（HBOT1:...）">
                  <button class="api-btn" id="dtCredImport">导入</button>
                </div>
                <div class="api-field-row">
                  <button class="api-btn" id="dtCredExport">生成配置码</button>
                  <span class="api-test-result" id="dtCredResult"></span>
                </div>
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

          <!-- 素材库 DesignHub -->
          <div class="api-section">
            <div class="api-section-head">
              <span class="api-section-icon">🎨</span>
              <span class="api-section-title">素材库 DesignHub</span>
              <span class="api-status ${matConnected ? 'ok' : ''}">${matConnected ? '已登录' : '未登录'}</span>
            </div>
            <div class="api-provider-hint">💡 接入哈啰 <a href="https://designhub.hellobike.cn/assets" target="_blank" class="api-link">DesignHub 团队素材库</a>，登录后可在 AI 聊天里直接说「找个 520 banner 素材」检索调取。用公司账号邮箱+密码登录，仅存于本机。</div>
            <div class="api-fields">
              <div class="api-field">
                <label>邮箱</label>
                <input type="text" id="matEmail" class="api-input" value="${this.store.get('material').dhEmail || ''}" placeholder="公司账号邮箱">
              </div>
              <div class="api-field">
                <label>密码</label>
                <input type="password" id="matPassword" class="api-input" value="" placeholder="登录密码（仅用于换取 Token，不保存）">
              </div>
              <div class="api-field-row">
                ${matConnected
                  ? '<button class="api-btn danger" id="matLogout">退出登录</button><span class="api-test-result ok">✓ 已登录</span>'
                  : '<button class="api-btn" id="matLogin">登录素材库</button><span class="api-test-result" id="matTestResult"></span>'
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

      // 供应商一键切换（内置预设 + 用户自建都走同一逻辑）
      this.panel.querySelectorAll('.api-provider-chip[data-provider]').forEach(chip => {
        chip.addEventListener('click', () => {
          const id = chip.dataset.provider;
          this._switchProvider(id);
        });
      });

      // 新建自定义 API：用默认名建槽 → 切换过去（Electron 不支持 window.prompt，改用下方「名称」框内联改名）
      const providerAdd = this.panel.querySelector('#providerAdd');
      if (providerAdd) providerAdd.addEventListener('click', () => {
        const id = 'user_' + Date.now().toString(36);
        const cps = this.store.get('customProviders') || {};
        // 生成不重复的默认名：新 API / 新 API 2 / 新 API 3 ...
        const existNames = new Set(Object.values(cps).map(p => p && p.label));
        let label = '新 API';
        for (let i = 2; existNames.has(label); i++) label = '新 API ' + i;
        cps[id] = { label, baseUrl: '', modelName: '', hint: '自定义 API（兼容 OpenAI 协议），填入下方 Key / 模型 / 地址', keyDocUrl: '' };
        this.store.setGroup('customProviders', cps);
        this._switchProvider(id);   // 内含 _render；随后可在「名称」框改名
        // 自动聚焦名称框，方便立即改名
        setTimeout(() => { const el = this.panel.querySelector('#providerName'); if (el) { el.focus(); el.select(); } }, 50);
      });

      // 重命名当前自定义 API
      const providerName = this.panel.querySelector('#providerName');
      if (providerName) providerName.addEventListener('change', () => {
        const id = this.store.get('model').provider;
        const cps = this.store.get('customProviders') || {};
        if (!cps[id]) return;
        const v = providerName.value.trim();
        if (!v) { providerName.value = cps[id].label; return; }
        cps[id].label = v;
        this.store.setGroup('customProviders', cps);
        this._render();
      });

      // 删除当前自定义 API
      const providerDelete = this.panel.querySelector('#providerDelete');
      if (providerDelete) providerDelete.addEventListener('click', () => {
        const id = this.store.get('model').provider;
        const cps = this.store.get('customProviders') || {};
        if (!cps[id]) return;
        if (!window.confirm(`删除自定义 API「${cps[id].label}」？其配置也会一并清除。`)) return;
        delete cps[id];
        this.store.setGroup('customProviders', cps);
        // 顺带清掉该供应商的独立配置槽
        const configs = this.store.get('providerConfigs') || {};
        if (configs[id]) { delete configs[id]; this.store.setGroup('providerConfigs', configs); }
        this._switchProvider('deepseek');   // 切回默认，内含 _render
      });

      // 表单字段实时保存（同时同步到当前供应商的 providerConfigs 槽位）
      const saveAI = () => {
        const apiKey = document.getElementById('apiKey').value;
        const modelName = document.getElementById('apiModel').value;
        const baseUrl = document.getElementById('apiUrl').value;
        this.store.set('model', 'apiKey', apiKey);
        this.store.set('model', 'modelName', modelName);
        this.store.set('model', 'baseUrl', baseUrl);
        // 同步到当前供应商槽位，切换回来时能恢复（合并保留已存的生图字段）
        const provider = this.store.get('model').provider;
        const configs = this.store.get('providerConfigs') || {};
        const slot = configs[provider] || {};
        this.store.set('providerConfigs', provider, { ...slot, apiKey, modelName, baseUrl });
        window.aiService.configure(this.store.get('model'));
      };
      ['apiKey','apiModel','apiUrl'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveAI);
      });

      // 生图配置保存：模型名 / 尺寸 / 生图专用 Key / 生图专用地址 / 可切换模型列表
      const persistImageModel = ({ modelName, size, apiKey, baseUrl, options }) => {
        if (modelName !== undefined) this.store.set('imageModel', 'modelName', modelName);
        if (size !== undefined) this.store.set('imageModel', 'size', size);
        if (apiKey !== undefined) this.store.set('imageModel', 'apiKey', apiKey);
        if (baseUrl !== undefined) this.store.set('imageModel', 'baseUrl', baseUrl);
        if (options !== undefined) this.store.set('imageModel', 'options', options);
        // 记入当前供应商槽位（复用模式下切走再切回能恢复生图模型名）
        const provider = this.store.get('model').provider;
        const configs = this.store.get('providerConfigs') || {};
        const slot = configs[provider] || {};
        const cur = this.store.get('imageModel');
        this.store.set('providerConfigs', provider, { ...slot, imageModelName: cur.modelName, imageSize: cur.size });
        // 即时生效
        window.aiService.imageConfig = this.store.get('imageModel');
      };

      // 点击模型标签 → 设为当前生效模型
      this.panel.querySelectorAll('.api-provider-chip[data-imgmodel]').forEach(chip => {
        chip.addEventListener('click', () => {
          persistImageModel({ modelName: chip.dataset.imgmodel });
          this._render();
        });
      });

      // 点击标签上的 × → 从列表删除该模型（阻止冒泡，避免同时触发选中）
      this.panel.querySelectorAll('.img-model-del[data-imgdel]').forEach(del => {
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = del.dataset.imgdel;
          // 以当前展示的标签为准，剔除被删项，落库为 options（把预设/临时项也固化下来）
          const remaining = Array.from(this.panel.querySelectorAll('.api-provider-chip[data-imgmodel]'))
            .map(c => c.dataset.imgmodel)
            .filter(x => x && x !== name);
          const cur = this.store.get('imageModel');
          // 若删的是当前生效模型，则切到剩余第一个（没有则清空）
          const modelName = (cur.modelName === name) ? (remaining[0] || '') : cur.modelName;
          persistImageModel({ options: remaining, modelName });
          this._render();
        });
      });

      // 新增/修改生图模型：输入后回车或失焦，加入列表并设为当前
      const imgModelInput = document.getElementById('imgModel');
      const addImgModel = () => {
        const name = (imgModelInput.value || '').trim();
        if (!name) return;
        const cur = this.store.get('imageModel');
        const opts = Array.isArray(cur.options) ? cur.options.slice() : [];
        if (!opts.includes(name)) opts.push(name);
        persistImageModel({ modelName: name, options: opts });
        this._render();
      };
      if (imgModelInput) {
        imgModelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addImgModel(); } });
        imgModelInput.addEventListener('change', addImgModel);
      }

      // 生图专用 Key / 地址 / 尺寸
      const imgKeyEl = document.getElementById('imgApiKey');
      if (imgKeyEl) imgKeyEl.addEventListener('change', () => persistImageModel({ apiKey: imgKeyEl.value.trim() }));
      const imgUrlEl = document.getElementById('imgBaseUrl');
      if (imgUrlEl) imgUrlEl.addEventListener('change', () => persistImageModel({ baseUrl: imgUrlEl.value.trim() }));
      const imgSizeEl = document.getElementById('imgSize');
      if (imgSizeEl) imgSizeEl.addEventListener('change', () => persistImageModel({ size: imgSizeEl.value.trim() || '2048x2048' }));

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

      // 钉钉机器人凭据保存
      const saveDt = () => {
        const appKey = (document.getElementById('dtAppKey') || {}).value || '';
        const appSecret = (document.getElementById('dtAppSecret') || {}).value || '';
        const robotCode = (document.getElementById('dtRobotCode') || {}).value || '';
        const robotName = (document.getElementById('dtRobotName') || {}).value || '';
        const replyMode = (document.getElementById('dtReplyMode') || {}).value || 'confirm';
        this.store.set('dingtalk', 'appKey', appKey.trim());
        this.store.set('dingtalk', 'appSecret', appSecret.trim());
        this.store.set('dingtalk', 'robotCode', robotCode.trim());
        this.store.set('dingtalk', 'robotName', robotName.trim());
        this.store.set('dingtalk', 'replyMode', replyMode);
        this.store.set('dingtalk', 'autoEnabled', replyMode === 'auto');
      };
      ['dtAppKey','dtAppSecret','dtRobotCode','dtRobotName','dtReplyMode'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveDt);
      });

      // 钉钉：连接机器人（Stream）
      const dtConn = document.getElementById('dtConnect');
      if (dtConn) dtConn.addEventListener('click', async () => {
        saveDt();
        const r = document.getElementById('dtTestResult');
        const appKey = this.store.get('dingtalk').appKey;
        const appSecret = this.store.get('dingtalk').appSecret;
        if (!appKey || !appSecret) {
          if (r) { r.textContent = '请填写 AppKey 和 AppSecret'; r.className = 'api-test-result err'; }
          return;
        }
        dtConn.textContent = '连接中...'; dtConn.disabled = true;
        this.dt.configure({ appKey, appSecret });
        try {
          await this.dt.connect();
          this._render();
        } catch (e) {
          if (r) { r.textContent = '✗ ' + e.message; r.className = 'api-test-result err'; }
          dtConn.textContent = '连接机器人'; dtConn.disabled = false;
        }
      });
      const dtDisc = document.getElementById('dtDisconnect');
      if (dtDisc) dtDisc.addEventListener('click', async () => { await this.dt.disconnect(); this._render(); });

      // 钉钉配置码：生成（管理员）
      const dtCredExport = document.getElementById('dtCredExport');
      if (dtCredExport) dtCredExport.addEventListener('click', async () => {
        saveDt(); // 先把当前输入落库，确保导出的是最新值
        const cfg = this.store.get('dingtalk');
        const r = document.getElementById('dtCredResult');
        if (!cfg.appKey || !cfg.appSecret) {
          if (r) { r.textContent = '请先填写 AppKey 和 AppSecret'; r.className = 'api-test-result err'; }
          return;
        }
        const code = encodeCred(cfg);
        try {
          await navigator.clipboard.writeText(code);
          if (r) { r.textContent = '✓ 配置码已复制，发给成员即可'; r.className = 'api-test-result ok'; }
        } catch (e) {
          // 剪贴板失败时把配置码回填到输入框，方便手动复制
          const input = document.getElementById('dtCredCode');
          if (input) input.value = code;
          if (r) { r.textContent = '已生成（见上方输入框，请手动复制）'; r.className = 'api-test-result'; }
        }
      });

      // 钉钉配置码：导入（成员）
      const dtCredImport = document.getElementById('dtCredImport');
      if (dtCredImport) dtCredImport.addEventListener('click', () => {
        const input = document.getElementById('dtCredCode');
        const r = document.getElementById('dtCredResult');
        const cred = decodeCred(input ? input.value : '');
        if (!cred) {
          if (r) { r.textContent = '✗ 配置码无效，请检查是否复制完整'; r.className = 'api-test-result err'; }
          return;
        }
        // 写入 store
        this.store.set('dingtalk', 'appKey', cred.appKey);
        this.store.set('dingtalk', 'appSecret', cred.appSecret);
        this.store.set('dingtalk', 'robotName', cred.robotName);
        this.store.set('dingtalk', 'replyMode', cred.replyMode);
        this.store.set('dingtalk', 'autoEnabled', cred.replyMode === 'auto');
        // 重渲染表单以回填字段，并提示
        this._render();
        const r2 = document.getElementById('dtCredResult');
        if (r2) { r2.textContent = '✓ 已导入，点「连接机器人」即可'; r2.className = 'api-test-result ok'; }
      });

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

      // 素材库 DesignHub 登录
      const matLogin = document.getElementById('matLogin');
      if (matLogin && this.mat) matLogin.addEventListener('click', async () => {
        const email = (document.getElementById('matEmail') || {}).value || '';
        const password = (document.getElementById('matPassword') || {}).value || '';
        const r = document.getElementById('matTestResult');
        if (!email.trim() || !password) {
          if (r) { r.textContent = '请输入邮箱和密码'; r.className = 'api-test-result err'; }
          return;
        }
        matLogin.textContent = '登录中...'; matLogin.disabled = true;
        const res = await this.mat.login(email.trim(), password);
        if (res.ok) {
          this._render();
        } else {
          if (r) { r.textContent = '✗ ' + (res.error || '登录失败'); r.className = 'api-test-result err'; }
          matLogin.textContent = '登录素材库'; matLogin.disabled = false;
        }
      });
      const matLogout = document.getElementById('matLogout');
      if (matLogout && this.mat) matLogout.addEventListener('click', () => { this.mat.logout(); this._render(); });
    }
  }

  window.APIConnectComponent = APIConnectComponent;
})();
