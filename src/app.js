/**
 * 主入口 — 初始化并协调所有模块
 */
(function() {
  const { ipcRenderer, shell } = require('electron');

  // Services
  window.aiService = new window.AIService();
  const dtService = new window.DingTalkService();
  const yqService = new window.YuqueService();
  const store = new window.SettingsStore();
  const takeover = new window.AITakeoverService();
  const dtAI = new window.DingTalkAIService();
  const materialService = new window.MaterialService(store);
  window.materialService = materialService; // 供 material-card 拉取鉴权缩略图
  const skillService = new window.SkillService();
  const ruleCaptureService = new window.RuleCaptureService(skillService, window.aiService);
  const projectService = new window.ProjectService();
  const visualGenService = new window.VisualGenService();
  const todoService = new window.TodoService();
  const chatHistory = new window.ChatHistoryService();
  const statsService = new window.WorkStatsService();
  const visualExecutor = new window.VisualExecutor({ visualGen: visualGenService, skills: skillService });
  const briefService = new window.DailyBriefService({
    todos: todoService,
    dingtalk: dtService,
    yuque: yqService,
    stats: statsService,
  });

  // Components
  const pet = new window.PetComponent();
  const menu = new window.MenuComponent();
  const chat = new window.ChatComponent(document.getElementById('chatPanel'), chatHistory);
  const dt = new window.DingTalkComponent(document.getElementById('dtPanel'), dtService);
  const yq = new window.YuqueComponent(document.getElementById('yqPanel'), yqService);
  const todos = new window.TodosComponent(document.getElementById('todosPanel'), todoService);
  const skills = new window.SkillsComponent(document.getElementById('skillsPanel'), skillService);
  const workspace = new window.WorkspaceComponent(document.getElementById('workspacePanel'), { projects: projectService, todos: todoService });
  const apiPanel = new window.APIConnectComponent(document.getElementById('apiPanel'), { ai: window.aiService, dingtalk: dtService, yuque: yqService, material: materialService }, store);
  const prefPanel = new window.PreferencesComponent(document.getElementById('prefPanel'), store);
  const notif = new window.NotificationComponent();
  const dock = new window.QuickDock(store);
  const resizer = new window.PanelResizer();
  const briefCard = new window.DailyBriefCard({
    onAction: (act) => handleBriefAction(act),
  });

  // 点击通知气泡打开钉钉面板
  notif.onTap = () => {
    closeAll();
    dt.open();
  };

  // 读取隐私设置
  notif.showContent = store.get('work').showMsgContent !== false;

  // 监听隐私设置变更
  document.addEventListener('privacy-changed', (e) => {
    notif.showContent = e.detail.showContent;
  });

  // Init
  async function init() {
    const model = store.get('model');
    window.aiService.configure(model);
    // 注入生图模型配置
    window.aiService.imageConfig = store.get('imageModel') || {};
    chat.init(model.systemPrompt);

    // 语雀：如果之前保存过 Token，启动时自动尝试连接
    const yqCfg = store.get('yuque');
    if (yqCfg && yqCfg.token) {
      try {
        await yqService.connect(yqCfg.token, yqCfg.baseUrl || 'https://www.yuque.com');
      } catch (e) {
        // Token 失效或网络异常，静默失败，UI 会显示未连接状态
        console.warn('[yuque] 自动恢复连接失败:', e.message);
      }
    }

    // 钉钉：配置凭据，真实模式则建立 Stream 连接（实名 AI 助理机器人）
    const dtCfg = store.get('dingtalk') || {};
    dtService.configure({ appKey: dtCfg.appKey, appSecret: dtCfg.appSecret, robotCode: dtCfg.robotCode });
    if (dtService.realMode) {
      try {
        await dtService.connect();
        chat.addMsg && console.log('[dingtalk] 机器人已上线');
      } catch (e) {
        console.warn('[dingtalk] 连接失败:', e.message);
      }
    }
    // 收到同事发给机器人的消息：通知气泡 + 按策略自动/确认回复
    dtService.onIncoming((payload, conv) => {
      notif.pushDingtalk({ sender: payload.sender, content: payload.content, chatName: payload.name });
      pet.react('bounce');
      const cnt = dtService.convs.reduce((s, c) => s + (c.unread || 0), 0);
      menu.setBadge('dingtalk', cnt);
      dock.setBadge('dingtalk', cnt);
      // 自动回复模式：AI 生成并直接发送
      if ((store.get('dingtalk') || {}).replyMode === 'auto' && (store.get('dingtalk') || {}).autoEnabled) {
        autoReplyTo(conv);
      }
    });

    // 未读数
    const unread = await dtService.getUnreadCount();
    menu.setBadge('dingtalk', unread);
    dock.setBadge('dingtalk', unread);

    // 待办未完成数
    const refreshTodoBadge = () => {
      const cnt = todoService.getUnfinishedCount();
      menu.setBadge('todos', cnt);
      dock.setBadge('todos', cnt);
    };
    refreshTodoBadge();
    todoService.onChange(refreshTodoBadge);

    // 监听待办完成 / 取消，写入今日统计
    let lastDoneCount = todoService.getAll().filter(t => t.status === 'done').length;
    let lastCancelledCount = todoService.getAll().filter(t => t.status === 'cancelled').length;
    let lastTotalCount = todoService.getAll().length;
    todoService.onChange(items => {
      const doneCount = items.filter(t => t.status === 'done').length;
      const cancelledCount = items.filter(t => t.status === 'cancelled').length;
      const totalCount = items.length;
      const dDone = doneCount - lastDoneCount;
      const dCancel = cancelledCount - lastCancelledCount;
      const dTotal = totalCount - lastTotalCount;
      if (dDone > 0) statsService.increment('todoCompleted', dDone);
      if (dCancel > 0) statsService.increment('todoCancelled', dCancel);
      if (dTotal > 0) statsService.increment('todoCreated', dTotal);
      lastDoneCount = doneCount;
      lastCancelledCount = cancelledCount;
      lastTotalCount = totalCount;
    });

    // 待办到期提醒：通过通知气泡推送
    todoService.onRemind((item) => {
      const overdue = item.deadline && item.deadline < Date.now();
      const prefix = overdue ? '⚠️ 已逾期' : '⏰ 即将到期';
      notif.pushText(`${prefix}：${item.title}（${window.TodoUtils.formatDeadline(item.deadline)}）`);
      pet.react('bounce');
    });
    todoService.startReminder();

    // 置顶
    ipcRenderer.send('toggle-always-on-top', store.get('general').alwaysOnTop);

    // 应用缩放
    const scale = store.get('general').scale;
    if (scale !== 100) {
      const img = document.querySelector('.pet-image');
      const shadow = document.querySelector('.pet-shadow');
      const s = scale / 100;
      img.style.width = (130 * s) + 'px';
      img.style.height = (150 * s) + 'px';
      if (shadow) shadow.style.width = (44 * s) + 'px';
    }

    // 应用待机动画
    const anim = store.get('appearance').idleAnimation;
    if (anim && anim !== 'float') {
      document.querySelector('.pet-image').style.animationName = 'pet-' + anim;
    }

    // 早安/晚报触发：今日首次唤醒 → 早安；下班时段（>=18:00）首次开 → 晚报
    statsService.recordAwake();
    setTimeout(async () => {
      const hour = new Date().getHours();
      const today = statsService.today();
      if (today.petAwakened === 1 && hour < 18) {
        // 今日首次且是日间 → 早安
        const data = await briefService.buildMorning();
        briefCard.showMorning(data);
        pet.react('bounce');
      } else if (hour >= 18 && !today._eveningShown) {
        // 下班时段首次开 → 晚报（用 _eveningShown 标记防重复）
        const data = await briefService.buildEvening();
        briefCard.showEvening(data);
        today._eveningShown = true;
        statsService._persist();
        pet.react('bounce');
      }
    }, 800);

    // 全局 AI 接管按钮
    const takeoverBtn = document.getElementById('globalTakeover');
    takeoverBtn.addEventListener('click', () => {
      takeover.toggleGlobal();
      takeoverBtn.classList.toggle('active', takeover.globalEnabled);
      if (takeover.globalEnabled) {
        chat.addMsg('bot', '🤖 AI 接管已开启，我会自动读取钉钉消息并生成回复建议。');
      } else {
        chat.addMsg('bot', '🤖 AI 接管已关闭。');
      }
    });

  }

  // 早安/晚报卡片的动作处理
  async function handleBriefAction(act) {
    if (act === 'start-today') {
      // 把今天到期/高优 todo 转 doing
      const data = await briefService.buildMorning();
      const ids = data.startTodayCandidates.map(t => t.id);
      ids.forEach(id => todoService.update(id, { status: 'doing' }));
      // 打开待办面板，让用户看到效果
      dock.open();
      highlightTab('todos');
      lastActiveTab = 'todos';
      openPanelByTab('todos');
      // IP 反馈
      pet.react('bounce');
    } else if (act === 'view-todos') {
      dock.open();
      highlightTab('todos');
      lastActiveTab = 'todos';
      openPanelByTab('todos');
    } else if (act === 'ai-summary') {
      // 触发 AI 生成今日小结
      const data = await briefService.buildEvening();
      const completedList = data.completed.map(t => '- ' + t.title).join('\n') || '（今日无完成任务）';
      const prompt = `请基于以下今日工作数据，用 80 字以内生成一句温暖、专业的工作小结：\n完成 ${data.completed.length} 项任务、处理 ${data.stats.messageHandled} 条消息、还有 ${data.stillPending} 项待续。\n完成清单：\n${completedList}`;
      dock.open();
      highlightTab('chat');
      lastActiveTab = 'chat';
      openPanelByTab('chat');
      chat.sendToAI('🌙 帮我生成今日小结', prompt);
    }
  }

  // 解析 AI 返回的待办 JSON，容错处理 markdown 代码块包裹
  function parseTodoJSON(raw) {
    if (!raw) return [];
    let text = String(raw).trim();
    // 去掉 ```json ... ``` 包裹
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    // 找到第一个 [ 和最后一个 ] 之间的内容
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (!Array.isArray(arr)) return [];
      return arr.filter(x => x && typeof x.title === 'string' && x.title.trim());
    } catch (e) {
      console.warn('[parseTodoJSON] 解析失败:', e, text);
      return [];
    }
  }

  // 关闭所有面板
  function closeAll() {
    if (chat.isOpen) chat.close();
    if (dt.isOpen) dt.close();
    if (yq.isOpen) yq.close();
    if (todos.isOpen) todos.close();
    if (skills.isOpen) skills.close();
    if (workspace.isOpen) workspace.close();
    if (apiPanel.isOpen) apiPanel.close();
    if (prefPanel.isOpen) prefPanel.close();
    if (dock.isOpen) dock.close();
    // 隐藏系统底条
    const sd = document.getElementById('systemDock');
    if (sd) sd.classList.remove('visible');
  }

  // 打开面板（保留 dock）
  function openPanel(fn) {
    // 只关闭面板，不关闭 dock
    if (chat.isOpen) chat.close();
    if (dt.isOpen) dt.close();
    if (yq.isOpen) yq.close();
    if (apiPanel.isOpen) apiPanel.close();
    if (prefPanel.isOpen) prefPanel.close();
    fn();
  }

  // 记录上次打开的标签
  let lastActiveTab = 'chat';

  // Pet 交互
  pet.onClick = () => {
    if (notif.bubble && notif.bubble.classList.contains('visible')) {
      notif.hide(); lastActiveTab = 'dingtalk';
      dock.open(); highlightTab('dingtalk'); openPanelByTab('dingtalk'); return;
    }
    if (chat.isOpen || dt.isOpen || yq.isOpen || apiPanel.isOpen || prefPanel.isOpen) {
      closeAll(); return;
    }
    if (dock.isOpen) { closeAll(); return; }
    // 打开 dock + 上次的面板
    dock.open();
    highlightTab(lastActiveTab);
    openPanelByTab(lastActiveTab);
    pet.hideHoverBubble();
  };

  function highlightTab(tabId) {
    dock.updateIndicator(tabId);
  }

  function openPanelByTab(tabId) {
    if (chat.isOpen) chat.close();
    if (dt.isOpen) dt.close();
    if (yq.isOpen) yq.close();
    if (todos.isOpen) todos.close();
    if (skills.isOpen) skills.close();
    if (workspace.isOpen) workspace.close();
    if (apiPanel.isOpen) apiPanel.close();
    if (prefPanel.isOpen) prefPanel.close();
    switch (tabId) {
      case 'chat': chat.open(); break;
      case 'dingtalk': dt.open(); break;
      case 'yuque': yq.open(); break;
      case 'todos': todos.open(); break;
      case 'workspace': workspace.open(); break;
      case 'skills': skills.open(); break;
    }
  }

  // Dock 选择
  dock.onSelect = (action) => {
    lastActiveTab = action;
    highlightTab(action);
    openPanelByTab(action);
  };

  pet.onRightClick = (x, y) => menu.show(x, y);

  // 菜单
  menu.onAction = (a) => {
    closeAll();
    // 今日简报：根据时段决定早安 / 晚报
    if (a === 'brief') {
      (async () => {
        const hour = new Date().getHours();
        if (hour >= 18) {
          briefCard.showEvening(await briefService.buildEvening());
        } else {
          briefCard.showMorning(await briefService.buildMorning());
        }
      })();
      return;
    }
    // 主功能（带 dock）
    const mainTabs = ['chat', 'dingtalk', 'yuque', 'workspace', 'todos', 'skills'];
    if (mainTabs.includes(a)) {
      dock.open();
      // 同步位置
      pet._syncPanelPosition && pet._syncPanelPosition();
      highlightTab(a);
      lastActiveTab = a;
      openPanelByTab(a);
      return;
    }
    // 系统功能（不带 dock）
    switch(a) {
      case 'api':
        openPanel(() => apiPanel.open());
        showSystemDock('🔌', 'API 接入');
        break;
      case 'settings':
        openPanel(() => prefPanel.open());
        showSystemDock('⚙️', '偏好设置');
        break;
      case 'about': openPanel(() => showAbout()); break;
      case 'quit': ipcRenderer.send('quit-app'); break;
    }
  };

  function showSystemDock(icon, text) {
    const sd = document.getElementById('systemDock');
    if (!sd) return;
    sd.querySelector('.system-dock-icon').textContent = icon;
    sd.querySelector('#systemDockText').textContent = text;
    sd.classList.add('visible');
    // 与当前打开的面板对齐尺寸 / 位置
    const openPanelEl = document.querySelector('.panel.open');
    if (openPanelEl) {
      const cs = window.getComputedStyle(openPanelEl);
      sd.style.width = cs.width;
      sd.style.left = cs.left;
      sd.style.right = 'auto';
    }
  }

  // 判断一个 URL 是否是 DesignHub「可展示的素材文件」（区别于搜索/列表等页面路由）
  // 命中即视为可直接发图的素材链接；页面路由（如搜索页）返回 false，保留为文字链接
  function _looksLikeAssetUrl(u) {
    if (!u) return false;
    // 必须归属 DesignHub（主域名或其 CDN/对象存储子域，均含 designhub 关键字）
    if (!/designhub/i.test(u)) return false;
    // 图片文件后缀（允许携带 query / hash）
    const isImageFile = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(u);
    // 素材存储 / CDN / 下载类路径特征
    const isAssetPath = /\/(storage|files?|media|download|cdn|oss|img|images?|preview|thumb(?:nail)?)\//i.test(u);
    // 页面路由（搜索/列表/登录/首页等）——非文件时视为文字链接，不当图片发
    const isPageRoute = /designhub\.hellobike\.cn\/(assets|search|login|home|dashboard)(\/|\?|#|$)/i.test(u);
    if (isPageRoute && !isImageFile && !isAssetPath) return false;
    return isImageFile || isAssetPath;
  }

  // 从任意文本中抽取 DesignHub 素材图链接，返回 { cleanText, images:[{url,name}] }
  function _extractDesignhubImages(text) {
    if (!text) return { cleanText: '', images: [] };
    const images = [];
    const seen = new Set();
    const push = (url, name) => {
      const u = (url || '').trim();
      if (!u || seen.has(u)) return;
      if (!_looksLikeAssetUrl(u)) return;
      seen.add(u);
      images.push({ url: u, name: (name || '素材').slice(0, 40) });
    };
    // markdown 图片 ![name](url)：素材文件抽取为图片，命中才从正文移除
    let clean = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
      if (_looksLikeAssetUrl(url)) { push(url, alt); return ''; }
      return m;
    });
    // markdown 链接 [name](url)：仅素材文件抽取，搜索页等页面链接保留为文字
    clean = clean.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, t, url) => {
      if (_looksLikeAssetUrl(url)) { push(url, t); return ''; }
      return m;
    });
    // 裸露直链：逐个 URL 判断，命中素材文件则抽走，其余（如搜索页）原样保留
    clean = clean.replace(/https?:\/\/[^\s)]+/gi, (u) => {
      if (_looksLikeAssetUrl(u)) { push(u); return ''; }
      return u;
    });
    // 收尾清理多余空行
    clean = clean.replace(/\n{3,}/g, '\n\n').trim();
    return { cleanText: clean, images };
  }

  // 哈啰车型图库（语雀）：找自行车图片素材时引导到这里按型号查找
  const BIKE_LIBRARY_URL = 'https://hellobike.yuque.com/oo30cw/rhhzxr/sexlg9989qy5bdan';

  // 是否在找「自行车/单车图片素材」或按车型号（A55/A40/A60/A70…）找图
  function _looksLikeBikeImage(text) {
    if (!text) return false;
    const t = String(text);
    const bikeWord = /(自行车|单车|脚踏车|骑行车|车辆|车型|新车)/.test(t);
    // 车辆别名/简称（可继续补充）
    const nickname = /(云朵车|好运车|小蓝车|小白车|云朵|好运|亲子车|校园车|助力车|电踏车|风行车|轻骑车|畅行车)/.test(t);
    const model = /(?:^|[^A-Za-z])[A-Za-z]\d{2,3}(?:\/[A-Za-z]?\d{2,3})?(?![A-Za-z])/.test(t); // A55 / A60/A61 / A70…
    const imgWord = /(图|图片|素材|照片|渲染图|三视图|车图|矢量|png|psd)/i.test(t);
    return (bikeWord && imgWord) || (model && imgWord) || (model && bikeWord) || (nickname && imgWord) || nickname;
  }

  // 从文本中提取语雀文档链接（支持带/不带 http、企业子域）
  function _extractYuqueUrl(text) {
    if (!text) return '';
    const m = String(text).match(/(https?:\/\/)?[a-z0-9-]+\.yuque\.com\/[^\s)）】]+/i);
    return m ? m[0] : '';
  }

  // 改图/生图意图识别
  function _looksLikeImageGen(text) {
    if (!text) return false;
    return /(改图|改一下|修改|改成|换成|换个|调整|p一下|p图|抠图|去掉|加个|加上|做一?张|画一?张|设计一?张|出一?张|来一?张|(生成|做|画|设计|出|来|输出).{0,8}(图|图片|banner|海报|视觉|背景|封面|素材|壁纸|头图|插画|logo))/i.test(text);
  }

  // 「生成一张全新图」意图识别（区别于"改现有图"）：含生成动词+图类名词/量词，且不含改图/指代现有图的词。
  // 命中时应结束当前改图任务、走文生图，而不是复用上一张图继续改。
  function _looksLikeGenerateNew(text) {
    if (!text) return false;
    const gen = /(生成|画|做|设计|输出|来|出)\s*.{0,8}(图|图片|banner|海报|视觉|背景|封面|插画|logo|头图|壁纸|素材)/i.test(text)
      || /(生成|画|做|设计|输出|出|来)\s*.{0,4}(一张|一幅|一个|新的|新)/.test(text);
    // 指向"现有图/继续改"的词 → 属于改图，不算全新生成
    const edit = /(改|换|调整|修改|替换|再.{0,3}(一点|一些)|大一点|小一点|深一点|浅一点|继续|接着|这张|这个|上面|上图|刚才那|原图|基于)/.test(text);
    return gen && !edit;
  }

  // 图片理解/分析意图识别（分析、总结、梳理、提取需求等——非改图）
  function _looksLikeAnalyze(text) {
    if (!text) return false;
    return /(分析|梳理|提取|总结|归纳|解读|识别|理解|拆解|评估|复盘|看看这|看下这|讲讲|说说这|这(张|个)?图.*(什么|哪些|内容)|需求(有哪些|是什么|都有|清单)|有哪些需求|是什么意思)/.test(text);
  }

  /**
   * 素材相关性过滤：按关键词分词 + 2字滑窗，命中名称/标签/分类任一视为相关。
   * @returns {{relevant:Array, loose:boolean}} loose=true 表示严格过滤为空、放宽展示（需标注"可能相关"）
   */
  function _filterRelevantMaterials(items, keyword) {
    const list = Array.isArray(items) ? items : [];
    const raw = String(keyword || '');
    const spaceTokens = raw.split(/\s+/).filter(t => t && t.length >= 2);
    const compact = raw.replace(/\s+/g, '');
    const ngrams = [];
    for (let i = 0; i + 2 <= compact.length; i++) ngrams.push(compact.slice(i, i + 2));
    const tokens = Array.from(new Set([compact, ...spaceTokens, ...ngrams])).filter(t => t.length >= 2);
    if (!tokens.length) return { relevant: list, loose: false };
    const hit = (it) => {
      const hay = ((it.name || '') + ' ' + (Array.isArray(it.tags) ? it.tags.join(' ') : '') + ' ' + (it.category || '')).toLowerCase();
      return tokens.some(t => hay.includes(t.toLowerCase()));
    };
    const relevant = list.filter(hit);
    return relevant.length ? { relevant, loose: false } : { relevant: list, loose: true };
  }

  /**
   * 归一化意图：以模型 decideAction 的结果为准；仅当模型返回 chat（多为失败/超时/未识别）时用关键词兜底恢复。
   * 这是本次意图路由重构的核心——让"模型决策"成为唯一主判据，关键词只做降级兜底。
   * @param {object} aiAct - decideAction 结果
   * @param {string} text
   * @param {number} imgCount - 本条消息附带的图片数
   * @returns {string} 归一化 action
   */
  // 画面/视觉描述型修改指令（即使没有"改/换"字）——如"画面要父与子…傍晚…文案全要白色"
  // 仅在有进行中改图任务时用于把这类描述识别为"改图迭代"，提升对详细修改需求的理解。
  function _looksLikeEditDetail(text) {
    if (!text) return false;
    return /(画面|构图|背景|主体|人物|小孩|孩子|父|母|镜头|视角|颜色|色调|配色|文案|标题|字体|字|按钮|logo|位置|尺寸|时间|傍晚|黄昏|清晨|夜晚|白天|光线|氛围|场景|风格|背向|正面|侧面|远处|近处|要|改|换|调|去掉|加上?|白色|黑色|红色|蓝色|绿色|暖色|冷色)/.test(text);
  }

  function _normalizeIntent(aiAct, text, imgCount, opts = {}) {
    let a = (aiAct && aiAct.action) || 'chat';
    if (a === 'chat') {
      // 模型没给出明确意图 → 关键词兜底（优先级：分析 > 搜索 > 改图）
      if (_looksLikeAnalyze(text) && !_looksLikeImageGen(text)) a = 'analyze';
      else if (materialService.looksLikeSearch(text) || _looksLikeBikeImage(text)) a = 'search';
      else if (_looksLikeImageGen(text)) a = 'edit';
      // 有进行中改图任务时：画面描述型指令默认当作改图迭代（避免详细修改需求被当闲聊敷衍）
      else if (opts.isEditing && _looksLikeEditDetail(text)) a = 'edit';
    }
    // 纠偏：模型判为 edit 但其实是"分析型 + 无改图词" → 纠正为 analyze，避免"分析需求"被当改图
    if (a === 'edit' && _looksLikeAnalyze(text) && !_looksLikeImageGen(text)) a = 'analyze';
    return a;
  }

  // 统一改图入口：按「偏好设置 → 改图方式」路由到 DesignHub 或自带生图模型
  // 把品牌规范直接并入生图提示词（不再单独调对话模型扩写，规避哈啰网关慢导致的超时）
  // 做法：取规范类技能正文 → 去 markdown 记号、压缩空白 → 截断 → 作为「品牌视觉规范」拼进 seedream 提示词
  function _buildGenPromptWithRules(brief) {
    try {
      const svc = window.skillService;
      const rules = (svc && svc.getReferenceRules && svc.getReferenceRules()) || '';
      if (!rules.trim()) return brief;
      const clean = rules.replace(/[#*`>]+/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 800);
      return `${brief}。\n\n请严格遵循以下【品牌视觉规范】生成（色值、logo、版式、字体、文案与安全区均需符合）：\n${clean}`;
    } catch (e) { return brief; }
  }

  // 从品牌规范正文里提取默认尺寸（规范常写明 banner/头图尺寸，如 750×360、1170×879）；无则空串
  function _extractSizeFromRules() {
    try {
      const svc = window.skillService;
      const rules = (svc && svc.getReferenceRules && svc.getReferenceRules()) || '';
      const m = rules.match(/(\d{3,5})\s*[*x×]\s*(\d{3,5})/);
      return m ? `${m[1]}x${m[2]}` : '';
    } catch (e) { return ''; }
  }

  // 从需求里提取主标题文案（引号内优先，其次"主标题是/标题为 X"）
  function _extractTitle(text) {
    if (!text) return '';
    const q = text.match(/[「『""']([^」』""']{2,30})[」』""']/) || text.match(/["']([^"']{2,30})["']/);
    if (q) return q[1].trim();
    const m = text.match(/(?:主标题|标题|文案)\s*(?:是|为|：|:)\s*([^\s，。,.；;]{2,30})/);
    return m ? m[1].trim() : '';
  }

  // 从需求里提取主体/画面内容（"内容是/画面是/场景是 X"）
  function _extractSubject(text) {
    if (!text) return '';
    const m = text.match(/(?:内容是|内容为|画面是|画面为|场景是|主体是|内容|画面)\s*([^，。,.；;]{2,40})/);
    return m ? m[1].trim() : '';
  }

  // 是否「按品牌规范生成一张 banner/头部视觉」意图（走模板改图，而非纯文生图）
  function _looksLikeSpecBanner(text) {
    if (!text) return false;
    const spec = /(规范|品牌|蓝莓骑行|头部视觉|顶部氛围)/.test(text);
    const banner = /(banner|视觉|头图|头部|顶部|首页|海报|氛围图)/i.test(text);
    const gen = /(生成|输出|做一?张|画一?张|设计一?张|出一?张|来一?张)/.test(text);
    return gen && (spec || banner);
  }

  // 是否「按品牌规范生成一张弹窗」意图（走弹窗模板改图，竖版 594×790）
  // 关键词命中「弹窗/弹框/popup」+ 生成动词即触发；纯改图指令（无生成动词）不触发，交由任务上下文迭代。
  function _looksLikeSpecPopup(text) {
    if (!text) return false;
    const popup = /(弹窗|弹框|popup|pop-?up)/i.test(text);
    const gen = /(生成|输出|做一?张|画一?张|设计一?张|出一?张|来一?张|做一?个|做个|制作)/.test(text);
    return popup && gen;
  }

  // 是否「宽幅横向 banner（702×180）」意图（头图延展的宽横幅规范：左文右图）。
  // 命中 702×180 尺寸，或「横幅/宽幅/长条 + 生成/延展」类指令即触发。比常规 banner 更具体，需先判定。
  function _looksLikeWideBanner(text) {
    if (!text) return false;
    const size702 = /702\s*[*x×]\s*180|180\s*[*x×]\s*702/i.test(text);
    const wide = /(横幅|宽幅|长条|宽\s*banner|资源位)/i.test(text);
    const gen = /(生成|输出|做一?张|画一?张|设计一?张|出一?张|来一?张|延展|延伸|拉伸|拉长|改成|适配)/.test(text);
    return size702 || (wide && gen);
  }

  /**
   * 把用户提供的主视觉图，按规范版式合成到目标画布上，作为图生图的「布局脚手架」。
   * 目的：外部图直接图生图时模型对版式理解差（主体常被放中间）。先用 Canvas 把主视觉摆到
   *   规范位置（banner=贴右侧、popup=居中偏下），左/上侧留白给文案，再喂给图生图 + 明确提示词，
   *   模型只需「保留主视觉 + 补文案/logo/按钮 + 统一光影」，版式命中率大幅提升。
   * 背景用主视觉边缘采样色填充，让留白区与主体色调统一，减少拼接感。
   * @param {string} refSrc 用户主视觉图（http/data URL）
   * @param {object} compose { w, h, region:'right'|'centerBottom', coverage, pad }
   * @returns {Promise<string|null>} 合成后的 PNG dataURL；失败返回 null（调用方退回原图）
   */
  async function _composeSpecCanvas(refSrc, compose) {
    if (!refSrc || !compose) return null;
    let usable = refSrc;
    // 远程图先转 dataURL，规避 canvas 跨域污染导致 toDataURL/getImageData 抛错
    if (!/^data:/.test(refSrc) && window.materialService && window.materialService.fetchImageAsDataUrl) {
      try { const d = await window.materialService.fetchImageAsDataUrl(refSrc); if (d) usable = d; } catch (e) { /* 用原图兜底 */ }
    }
    return new Promise((resolve) => {
      try {
        if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 12000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const W = compose.w, H = compose.h;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            // 1) 背景：取主视觉平均色填充留白区，色调统一
            let bg = '#f0efe9';
            try {
              const tc2 = document.createElement('canvas'); tc2.width = 8; tc2.height = 8;
              const tctx = tc2.getContext('2d'); tctx.drawImage(img, 0, 0, 8, 8);
              const d = tctx.getImageData(0, 0, 8, 8).data;
              let r = 0, g = 0, b = 0, n = 0;
              for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
              if (n) bg = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
            } catch (e) { /* 采样失败用默认底色 */ }
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            // 2) 主视觉放置区域
            const pad = compose.pad || 0;
            let rx, ry, rw, rh;
            if (compose.region === 'centerBottom') {
              rw = W * (compose.coverage || 0.88); rh = H * 0.6;
              rx = (W - rw) / 2; ry = H - rh - pad;
            } else { // right
              rw = W * (compose.coverage || 0.56); rh = H - pad * 2;
              rx = W - rw; ry = pad;
            }
            // 源裁剪：只取主视觉所在子区域（如延展已成图 banner 时，取其右侧视觉，丢弃原有文案/按钮）
            let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (compose.srcRegion) {
              const sr = compose.srcRegion;
              sx = Math.round((sr.sxRatio || 0) * sw);
              sw = Math.max(1, Math.round((sr.swRatio || 1) * img.naturalWidth));
              if (sr.syRatio != null) sy = Math.round(sr.syRatio * img.naturalHeight);
              if (sr.shRatio != null) sh = Math.max(1, Math.round(sr.shRatio * img.naturalHeight));
            }
            // cover：按裁剪后源比例填满区域；clip 到区域内，避免主视觉侵入左/上侧文案留白区
            const ir = sw / sh;
            const rr = rw / rh;
            let dw, dh, dx, dy;
            if (ir > rr) { dh = rh; dw = dh * ir; dx = rx + (rw - dw) / 2; dy = ry; }
            else { dw = rw; dh = dw / ir; dx = rx; dy = ry + (rh - dh) / 2; }
            ctx.save();
            ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
            ctx.restore();
            resolve(c.toDataURL('image/png'));
          } catch (e) { resolve(null); }
        };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = usable;
      } catch (e) { resolve(null); }
    });
  }

  /**
   * 按名称关键词查找「板块规范技能」的正文（用户在技能中心上传/编辑的 .md）。
   * 命中则返回其规范正文（去 front matter、限长），供注入生图提示词——实现「改 md 即改生图」。
   * @param {string[]} keywords 板块规范技能名的匹配关键词（任一被技能名包含即命中）
   * @returns {string} 规范正文；无则空串
   */
  function _findSpecRuleText(keywords) {
    try {
      const svc = window.skillService;
      if (!svc || !svc.getAll || !Array.isArray(keywords) || !keywords.length) return '';
      for (const s of svc.getAll()) {
        if (!s || s.id === 'skill1' || !s.systemPrompt) continue;
        const name = String(s.name || '');
        if (keywords.some(k => k && name.includes(k))) {
          // 去掉 front matter、压缩空白、限长，避免提示词过长拖慢生图
          return String(s.systemPrompt).replace(/^---[\s\S]*?---\s*/, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1600);
        }
      }
    } catch (e) { /* 查找失败不影响生图 */ }
    return '';
  }

  /**
   * 把板块规范技能正文追加到生图提示词末尾（作为最高优先级约束）。
   * @param {string} basePrompt 代码内置的构图/骨架提示词
   * @param {string[]} keywords  规范技能匹配关键词
   * @returns {string} 注入规范后的提示词
   */
  function _injectSpecRule(basePrompt, keywords) {
    const ruleText = _findSpecRuleText(keywords);
    if (!ruleText) return basePrompt;
    console.warn('[specVisual] 注入品牌规范技能正文 len=' + ruleText.length);
    return basePrompt + '\n\n【品牌视觉规范（团队自定义，最高优先级，必须严格遵守）】\n' + ruleText;
  }

  /**
   * 通用「精选模板 + 改图」引擎：按 DesignHub 板块模板生成品牌规范视觉（banner / 弹窗 等共用）。
   *
   * 两条路径：
   *   路径 A（用户提供主视觉图 userRef）：先用 _composeSpecCanvas 按规范版式把主视觉合成到目标画布
   *     （banner 贴右、popup 居中偏下），再图生图 + 明确提示词（保留主视觉、补文案/logo/按钮、统一光影）。
   *   路径 B（无用户图）：搜 DesignHub 板块模板 → 选模板 → 图生图（锁构图、换文案主体）。
   * 均以 seedream 图生图为主、DesignHub AI 改图兜底，输出 2 版。
   *
   * 新增板块只需在调用处传一份 cfg，无需改本函数（DRY / OCP）。
   *
   * @param {string} convId 会话 ID
   * @param {string} text   用户原始需求
   * @param {object} cfg    板块配置：
   *   - searchKeywords {string[]} 依次尝试的搜索词（命中即止）
   *   - tplFilter {RegExp}        模板命名过滤（挑出该板块标准模板）
   *   - size {string}            目标尺寸，如 '1170x879' / '594x790'（用户显式指定尺寸可覆盖）
   *   - taskName {string}        任务上下文名称 & 结果图命名前缀
   *   - compose {object}         用户主视觉合成版式：{ region, coverage, pad }
   *   - buildPrompt {(title,subject)=>string}        模板路径提示词
   *   - buildUserRefPrompt {(title,subject)=>string} 用户主视觉路径提示词
   *   - tips {(count:number)=>string}                回复话术
   * @param {string} [userRef] 用户提供的主视觉图（已解析的可访问 URL）；有则走路径 A
   * @param {object} [composeOpts] 合成选项：
   *   - enabled {boolean} 默认 true；是否对 userRef 先做版式合成脚手架
   *   - srcRegion {object} 源裁剪比例 { sxRatio, swRatio, syRatio?, shRatio? }：
   *       延展已成图 banner 时取其右侧主视觉（丢弃原文案），避免压扁与文字重复
   * @returns {Promise<object|null>} 回复对象；无可用素材/全失败返回 null（由调用方回退）
   */
  async function _specVisualFromTemplate(convId, text, cfg, userRef, composeOpts) {
    const tc = window.taskContext;
    const tag = '[specVisual:' + cfg.taskName + ']';
    // 头图等明确标记为固定尺寸时，忽略消息中的尺寸，保证资源位最终输出规格一致。
    const size = cfg.forceSize ? cfg.size : (_extractReqSize(text) || cfg.size);
    const title = _extractTitle(text);
    const subject = _extractSubject(text);
    const modelReady = !!(window.aiService && window.aiService.config && !window.aiService.useMock);

    // 记录结果 + 组织回复（两条路径共用）
    const _done = (images, matName, matUrl) => {
      tc.createTask(convId, { task_type: 'image_edit', status: 'editing', task_name: cfg.taskName, current_material: { name: matName, url: matUrl, cdnUrl: matUrl } });
      tc.addVersion(convId, { file_url: images[0], edit: title || subject || '规范生成' });
      return { markdown: false, text: cfg.tips(images.length), images: images.slice(0, 2).map((u, i) => ({ url: u, name: cfg.taskName + (i + 1) })) };
    };

    // ===== 路径 A：用户提供主视觉 → （按需）合成规范版式脚手架，再图生图 =====
    if (userRef) {
      let seed = userRef;
      let composed = false;
      const doCompose = !composeOpts || composeOpts.enabled !== false;
      if (doCompose && cfg.compose) {
        const parts = String(size).split(/[x×*]/i);
        const tw = parseInt(parts[0], 10) || 1170;
        const th = parseInt(parts[1], 10) || 879;
        const c = await _composeSpecCanvas(userRef, {
          w: tw, h: th,
          region: cfg.compose.region, coverage: cfg.compose.coverage, pad: cfg.compose.pad,
          srcRegion: composeOpts && composeOpts.srcRegion,
        });
        if (c) { seed = c; composed = true; }   // 合成失败则退回原图直接图生图
      }
      const prompt = _injectSpecRule(cfg.buildUserRefPrompt(title, subject), cfg.ruleKeywords);
      console.warn(tag + ' 用户主视觉模式 compose=' + doCompose + ' composed=' + composed + ' srcCrop=' + !!(composeOpts && composeOpts.srcRegion) + ' size=' + size);
      if (modelReady) {
        const outs = [];
        for (let i = 0; i < 2; i++) {
          try {
            const r = await window.aiService.generateImage({ prompt, imageUrl: seed, size });
            const u = r && (r.url || (r.b64 ? `data:image/png;base64,${r.b64}` : ''));
            if (u) outs.push(u);
          } catch (e) { console.warn(tag + ' 用户参考图生图单张失败:', e && e.message); }
        }
        if (outs.length) return _done(outs, '用户主视觉', userRef);
        console.warn(tag + ' 用户参考图生图无结果，回退 DesignHub 改图');
      }
      const gen = await materialService.generateVariant({ referenceImageUrl: seed, prompt, size, count: 2 });
      if (gen && gen.ok && gen.images && gen.images.length) return _done(gen.images, '用户主视觉', userRef);
      if (gen && gen.needAuth) return { markdown: false, text: '素材库登录过期了，麻烦到「API 接入 → 素材库」重登后再试～' };
      return null;
    }

    // ===== 路径 B：无用户图 → 合并多个搜索词的候选模板 → 无偏随机选两张不同参考图 =====
    // 合并所有搜索词结果去重，扩大候选池，避免两版都从同一系列模板里取图。
    const allItems = [];
    const seenIds = new Set();
    for (const kw of cfg.searchKeywords) {
      try {
        const r = await materialService.search(kw, { pageSize: 20 });
        if (r && r.ok && r.items) {
          for (const it of r.items) {
            const key = it.id || it.cdnUrl || it.url || it.thumb || it.name;
            if (key && !seenIds.has(key)) { seenIds.add(key); allItems.push(it); }
          }
        }
      } catch (e) { /* 单个词失败不影响其他 */ }
    }
    const items = allItems;
    if (!items.length) return null;
    // 优先命中该板块标准命名的模板。
    let tpls = items.filter(it => cfg.tplFilter.test(((it.name || '') + ' ' + (it.category || ''))));
    if (!tpls.length) tpls = items;
    // Fisher-Yates 无偏洗牌，避免 sort(() => Math.random() - 0.5) 的分布偏差。
    const shuffled = tpls.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picks = [];
    if (subject) {
      const bySub = shuffled.find(it => (it.name || '').includes(subject.slice(0, 2)));
      if (bySub) picks.push(bySub);
    }
    for (const it of shuffled) {
      if (picks.length >= 2) break;
      if (!picks.includes(it)) picks.push(it);
    }
    if (!picks.length) return null;
    const pick = picks[0];
    const ref = pick.cdnUrl || pick.url || pick.thumb;
    if (!ref) return null;
    console.warn(tag + ' 候选池=' + allItems.length + ' 精准模板=' + tpls.length + ' 选中=' + (pick.name || '') + ' ref=' + String(ref).slice(0, 50));
    let prompt = _injectSpecRule(cfg.buildPrompt(title, subject), cfg.ruleKeywords);
    if (cfg.taskName === '规范banner') {
      // 版式规范（对两版都生效）
      prompt += '\n\n【版式规范，最高优先级】'
        + '画面结构：主视觉（骑行人物+场景+背景）铺满整张画布（全出血），不做左右色块分割；人物/自行车主体偏右侧，为左侧文字区自然留白。'
        + '品牌信息叠加在左侧（继承模板对应位置和层级，只替换内容）：'
        + '① 左上白色小字「|: 蓝莓骑行」logo；'
        + '② logo 下方大字白色主标题，字体必须是手写感/粗笔触（马克笔或毛笔粗体质感），两行、左对齐，不用普通黑体；'
        + '③ 主标题旁一道手绘感弧形曲线（颜色与画面色调协调，绿色调→草绿，暖色→金黄，蓝色→浅蓝）；'
        + '④ 主标题下方白色胶囊镂空边框 CTA「立即查看 >」，无填充色，轻盈感；'
        + '禁止新增色块底板、矩形框、红色描边；禁止复制参考图旧文字；无错别字。';
    }

    // 版 A（参考图图生图）和版 B（无参考图文生图）并行执行，总耗时取较慢的一版
    if (modelReady) {
      try {
        const imgCfg = window.aiService.imageConfig || {};
        const activeModel = imgCfg.modelName || (window.aiService.config && window.aiService.config.modelName) || '';
        // 版 B 专用提示词：去掉"以这张...为母版/骨架"的引导，追加独立场景指令
        const promptB = prompt
          .replace(/以这张[^。\n]*版式母版[^。\n]*。?\n?/, '')
          .replace(/以这张[^。\n]*骨架参考[^。\n]*。?\n?/, '')
          + '\n\n【独立创作，无参考图约束】请完全按上述规范独立创作，主动选择与常见林间/公园场景截然不同的骑行环境（如城市街头、海边公路、乡村田野、清晨街道、建筑广场等任意一种），让两版在场景、光线、氛围上形成明显差异。';
        console.warn(tag + ' 并行生成：版A=参考图图生图 版B=无参考图文生图 model=' + (activeModel || 'unknown'));
        // 并行发出两版请求
        const [resA, resB] = await Promise.allSettled([
          window.aiService.generateImage({ prompt, imageUrl: ref, size }),       // 版 A：CDN URL 直传
          window.aiService.generateImage({ prompt: promptB, size }),              // 版 B：无参考图
        ]);
        const outs = [];
        if (resA.status === 'fulfilled') {
          const uA = resA.value && (resA.value.url || (resA.value.b64 ? `data:image/png;base64,${resA.value.b64}` : ''));
          if (uA) { outs.push(uA); console.warn(tag + ' 版A 成功'); }
        } else { console.warn(tag + ' 版A 失败:', resA.reason && resA.reason.message); }
        if (resB.status === 'fulfilled') {
          const uB = resB.value && (resB.value.url || (resB.value.b64 ? `data:image/png;base64,${resB.value.b64}` : ''));
          if (uB) { outs.push(uB); console.warn(tag + ' 版B 成功'); }
        } else { console.warn(tag + ' 版B 失败:', resB.reason && resB.reason.message); }
        if (outs.length) return _done(outs, pick.name, ref);
        console.warn(tag + ' 两版均无结果，回退 DesignHub 改图');
      } catch (e) { console.warn(tag + ' 生图异常，回退 DesignHub 改图:', e && e.message); }
    }

    // 截图版本兜底：同一参考模板生成两版。
    const gen = await materialService.generateVariant({ referenceImageUrl: ref, prompt, size, count: 2 });
    if (gen && gen.ok && gen.images && gen.images.length) return _done(gen.images, pick.name, ref);
    if (gen && gen.needAuth) return { markdown: false, text: '素材库登录过期了，麻烦到「API 接入 → 素材库」重登后再试～' };
    return null; // 都失败 → 交由调用方回退文生图
  }

  /**
   * 规范 banner（左文右图头部视觉，780×586）：通用引擎的 banner 板块配置。
   * @returns {Promise<object|null>}
   */
  async function _specBannerFromTemplate(convId, text, userRef) {
    return _specVisualFromTemplate(convId, text, {
      searchKeywords: ['蓝莓骑行 顶部氛围', '顶部氛围', '首页顶部氛围', '头部视觉 1170'],
      tplFilter: /1170|顶部氛围|头部|头图|首页顶部|氛围图/i,
      size: '780x586',
      forceSize: true,
      taskName: '规范banner',
      ruleKeywords: ['蓝莓头图', '头图banner', '头图 banner', 'banner规范', '头部视觉规范'],
      compose: { region: 'right', coverage: 0.56, pad: 0 },
      buildPrompt: (title, subject) => [
        '以这张蓝莓骑行头部视觉的排版为版式母版，重新创作一张全新的高质量头部视觉 banner。',
        '版式规则（必须遵守）：主视觉铺满整张画布（全出血），骑行人物+背景覆盖整图；'
        + '人物和自行车主体偏右侧或中右，为左侧文字区自然留白；'
        + '文字信息叠加在画面左下区域，不加色块底板，与画面自然融合。',
        '品牌信息（继承参考模板的位置和层级，只替换内容）：'
        + '左上位置放「|: 蓝莓骑行」白色小字 logo；'
        + 'logo 下方大字白色主标题（手写感/粗笔触字体，有笔触质感，不用普通黑体），两行、左对齐；'
        + '主标题旁有一道手绘感弧形曲线（颜色与画面主色调协调）；'
        + '主标题下方为白色胶囊镂空边框 CTA 按钮「立即查看 >」（无填充色）。',
        title ? `主标题文案："${title}"，字体保持手写粗体质感，仅替换文字内容，不改变层级和位置。` : '',
        subject ? `画面主体：全新创作的「${subject}」骑行场景，写实质感，人物姿态自然、自行车结构准确。` : '',
        '画面内容全新创作，不复制参考图画面；自然柔和光线，色彩有层次，高端干净；'
        + '避免 AI 塑料感、影棚感；禁止复制旧文字和旧按钮；无错别字。',
      ].filter(Boolean).join('\n'),
      buildUserRefPrompt: (title, subject) => [
        '这张图右侧已摆好用户提供的主视觉（自行车产品），左侧为留白区。',
        '请以【主视觉铺满全图（全出血）的方式】延展背景，让产品自然融入场景，然后在左侧叠加蓝莓骑行品牌信息：',
        '左上：「|: 蓝莓骑行」白色小字 logo；',
        title ? `logo 下方：大字白色主标题「${title}」，手写感粗体，两行、左对齐；` : 'logo 下方：大字白色主标题，手写感粗体，两行、左对齐；',
        '主标题旁：一道手绘感弧形曲线（颜色与画面色调协调）；',
        '主标题下方：白色胶囊镂空 CTA「立即查看 >」（无填充色）；',
        '统一光影和色彩氛围，消除拼接感；画面干净高端；无错别字。',
      ].filter(Boolean).join('\n'),
      tips: (count) => count > 1
        ? '按蓝莓骑行规范 AI 重新创作了 2 版✅ 挑一版继续调整，或说「再来一版」换表现～'
        : '已按蓝莓骑行规范 AI 生成✅ 不满意可说「再来一版」，或直接说要调整的地方～',
    }, userRef);
  }
  /**
   * 规范宽幅 banner（702×180，头图延展的宽横幅）：通用引擎的宽幅板块配置。
   * 版式与头图一致：左上 logo → 左侧两行主标题(配品牌弧线) → 左下「立即查看」按钮 → 右侧主视觉。
   * @param {string} [userRef]     主视觉来源（附图或延展的现有图）
   * @param {object} [composeOpts] 合成选项（附干净图=整图合成；延展成品图=裁右侧主视觉）
   * @returns {Promise<object|null>}
   */
  async function _specWideBannerFromTemplate(convId, text, userRef, composeOpts) {
    return _specVisualFromTemplate(convId, text, {
      searchKeywords: ['蓝莓骑行 横幅', '蓝莓骑行 banner 702', '横幅 702', '蓝莓骑行 资源位', '顶部氛围'],
      tplFilter: /702|横幅|宽幅|资源位|banner|顶部氛围|头部/i,
      size: '702x180',
      taskName: '规范宽幅banner',
      // 用户主视觉合成版式：宽横幅，主视觉贴右侧（约占宽 50%），左侧留白给文案
      compose: { region: 'right', coverage: 0.5, pad: 0 },
      buildPrompt: (title, subject) => [
        '以蓝莓骑行「宽幅横向 banner（左文右图）」版式为骨架，重新创作一张 702×180 的高质量活动横幅。',
        '构图骨架（需遵循）：左文右图；左上角蓝莓骑行 logo；左侧两行主标题大字加粗、配一道品牌黄色/白色手绘弧线点缀；主标题下方白色圆角「立即查看 >」按钮；主视觉（人物+自行车）在右侧；比例 702×180 宽横幅；核心信息在安全区内。',
        title ? `主标题文案："${title}"（两行、左对齐、加粗）。字体艺术效果可自由发挥，契合品牌调性。` : '',
        subject ? `画面主体：全新创作的「${subject}」骑行场景，人物姿态自然、自行车结构准确。` : '',
        '画面内容自由发挥，追求真实摄影质感、自然柔和光线、清新自然高端、干净有层次，避免 AI 塑料感。仅参考构图与元素位置。无错别字。',
      ].filter(Boolean).join('\n'),
      // 主视觉已就位（右侧）或延展现有图：保留主视觉、补左侧 logo+两行标题+按钮、横向统一光影
      buildUserRefPrompt: (title, subject) => [
        '这是一张已按「宽幅横向 banner（左文右图）」版式初步合成的 702×180 图：右侧是主视觉（自行车/骑行产品），左侧为空白文案区。',
        '请【严格按此宽幅版式重新排版】，不要保留或复刻任何原有的文字、按钮或旧排版，只保留右侧主视觉产品的外观、结构与颜色：',
        title ? `1) 左侧生成两行主标题「${title}」，左对齐、大字加粗、位于左侧中部，配一道品牌黄色/白色手绘弧线点缀；` : '1) 左侧生成两行主标题（左对齐、大字加粗、配品牌弧线）；',
        '2) 左上角加「蓝莓骑行」logo（品牌蓝），主标题下方加白色圆角「立即查看 >」按钮；',
        '3) 横向自然延展铺满 702×180，右侧主视觉与左侧文案区光影、色彩、背景自然融为一体，干净有层次、清新高端，消除拼接痕迹与 AI 塑料感；',
        '4) 文字清晰不压扁不变形，核心信息在安全区内，无错别字。',
      ].filter(Boolean).join('\n'),
      tips: (count) => count > 1
        ? '按蓝莓骑行宽幅横幅规范（左文右图/702×180）生成了 2 版✅ 挑一版继续调整，或说「再来一版」～'
        : '已按蓝莓骑行宽幅横幅规范（702×180）生成✅ 需要调整继续说～',
    }, userRef, composeOpts);
  }

  /**
   * 规范弹窗（竖版营销弹窗，594×790）：通用引擎的弹窗板块配置。
   * DesignHub 命名如「202606-蓝莓弹窗」「蓝莓西岸开业促销活动-弹窗」。
   * @returns {Promise<object|null>}
   */
  async function _specPopupFromTemplate(convId, text, userRef) {
    return _specVisualFromTemplate(convId, text, {
      searchKeywords: ['蓝莓 弹窗', '蓝莓弹窗', '蓝莓西岸 弹窗', '弹窗'],
      tplFilter: /弹窗|弹框|popup/i,
      size: '594x790',
      taskName: '规范弹窗',
      // 用户主视觉合成版式：主视觉居中偏下，上方留白给标题
      compose: { region: 'centerBottom', coverage: 0.88, pad: 36 },
      buildPrompt: (title, subject) => [
        '以这张蓝莓骑行「竖版营销弹窗」的构图与排版为骨架参考，重新创作一张全新的高质量活动弹窗。',
        '构图骨架（需遵循）：竖版圆角弹窗卡片；主标题大字在上部居中；活动信息/副标题紧随其后；主视觉（人物+自行车/活动主体）居中偏下；底部醒目 CTA 按钮（如「立即参与」「立即查看」）；蓝莓骑行 logo；比例 594×790；核心信息在安全区内，四周留足安全边距。',
        title ? `主标题文案："${title}"。字体、字重、艺术效果可自由发挥设计（保持居中与层级），追求有设计感、易读、契合品牌活力调性。` : '',
        subject ? `画面主体：全新创作的「${subject}」场景，人物姿态自然、自行车结构准确。` : '',
        '画面内容（自由发挥）：背景环境、人物、光影、色彩氛围均可重新创作，不要复制参考图的具体画面；追求真实质感、自然柔和光线、清新高端、干净有层次，符合品牌活力氛围，避免 AI 塑料感。',
        '仅参考其构图与元素位置，其余内容与风格大胆重新演绎。无错别字。',
      ].filter(Boolean).join('\n'),
      // 用户已提供主视觉（合成图中下部为其主体）：保留主视觉、补上部标题/logo/底部按钮、统一光影
      buildUserRefPrompt: (title, subject) => [
        '这是一张已按蓝莓骑行「竖版营销弹窗」版式初步合成的图：中下部是用户提供的主视觉（自行车/活动主体），上方为标题留白区。',
        '请在【保持主视觉的外观、结构、颜色基本不变】的前提下，把它完善成一张精致完整的活动弹窗：',
        title ? `1) 上部居中生成主标题「${title}」，大字、有设计感、契合品牌活力调性，下方可加副标题/活动信息；` : '1) 上部居中预留主标题区；',
        '2) 顶部或角落加「蓝莓 BLUEBERRY」logo，底部加醒目 CTA 按钮（如「立即参与」）；',
        '3) 竖版圆角弹窗卡片，统一整体光影、色彩与背景氛围，背景符合品牌活力氛围、干净有层次，消除拼接痕迹与 AI 塑料感；',
        '4) 比例 594×790，核心信息在安全区内，四周留足安全边距，无错别字。',
      ].filter(Boolean).join('\n'),
      tips: (count) => count > 1
        ? '按蓝莓弹窗规范构图（竖版/594×790）AI 重新创作了 2 版✅ 挑一版继续调整，或说「再来一版」换表现～'
        : '已按蓝莓弹窗规范构图 AI 生成✅ 不满意可说「再来一版」，或直接说要调整的地方～',
    }, userRef);
  }

  // 从文字里提取用户要求的目标尺寸，如「702*180」「702x180」「702×180」→ "702x180"；无则返回空串
  function _extractReqSize(text) {
    if (!text) return '';
    const m = String(text).match(/(\d{2,5})\s*[*x×]\s*(\d{2,5})/i);
    return m ? `${m[1]}x${m[2]}` : '';
  }

  // 返回统一结构 { ok, images?, needAuth?, needLogin?, error? }
  // sizeHint：调用方从用户消息里提取的目标尺寸（如 "702x180"）；缺省则由 prompt 内解析兜底
  async function _designhubEdit(referenceImageUrl, prompt, sizeHint) {
    const size = sizeHint || _extractReqSize(prompt);
    let method = (store.get('work') || {}).editMethod || 'designhub';
    const _modelReady = !!(window.aiService && window.aiService.config && !window.aiService.useMock);
    // 用户明确要求了目标尺寸 → 优先用「自带生图模型」（seedream 直连，像豆包那样能按尺寸出图）
    if (size && _modelReady) {
      method = 'model';
      console.warn('[designhubEdit] 检测到目标尺寸 ' + size + '，改用自带生图模型出图');
    }
    // 参考图不是 DesignHub 素材（如 seedream 生成结果 / data URL）→ DesignHub 改图拉不到，改用生图模型图生图，
    // 保证「规范banner」这类由生图模型产出的图能继续迭代
    const _isDesignHubRef = /designhub\.hellobike\.cn/i.test(String(referenceImageUrl || ''));
    if (!_isDesignHubRef && _modelReady) {
      method = 'model';
    }
    if (method === 'model') {
      // 自带生图模型（图生图）：注意模型需能访问该参考图 URL（钉钉/公网图可用，DesignHub 内网图可能取不到）
      if (!window.aiService.config || window.aiService.useMock) {
        return { ok: false, error: '未配置生图模型（请到 API 接入 → 生图模型 配置）' };
      }
      try {
        const r = await window.aiService.generateImage({ prompt, imageUrl: referenceImageUrl, size });
        if (r && (r.url || r.b64)) return { ok: true, images: [r.url || r.b64] };
        return { ok: false, error: '生图无结果' };
      } catch (e) {
        return { ok: false, error: (e && e.message) || '生图失败' };
      }
    }
    // 默认：DesignHub AI 智能改图（size 非空则按目标尺寸出图，空则锁原图尺寸）
    if (!materialService.connected) return { ok: false, needLogin: true };
    const gen = await materialService.generateVariant({ referenceImageUrl, prompt, size, count: 1 });
    return gen || { ok: false, error: '无响应' };
  }

  // 整组批量改图：对任务 group 里的每张素材逐一调 DesignHub 改图，汇总成功/失败（partial_success）
  async function _runBatchEdit(convId, task, prompt) {
    const tc = window.taskContext;
    const group = (task.group || []).slice(0, 6);   // 上限 6 张，避免耗时过长
    const _method = (store.get('work') || {}).editMethod || 'designhub';
    if (_method === 'designhub' && !materialService.connected) {
      return { markdown: false, text: '素材库还没登录，批量改图用不了，麻烦先登录 DesignHub 😊' };
    }
    const okImages = [];
    const failed = [];
    for (const it of group) {
      const ref = it.cdnUrl || it.url || '';
      if (!ref) { failed.push((it.name || '素材') + '（无原图）'); continue; }
      try {
        const gen = await _designhubEdit(ref, prompt);
        if (gen && gen.ok && gen.images && gen.images.length) {
          okImages.push({ url: gen.images[0], name: it.name || '改图结果' });
        } else {
          failed.push((it.name || '素材') + '（' + ((gen && gen.error) || '生成失败') + '）');
        }
      } catch (e) {
        failed.push((it.name || '素材') + '（异常）');
      }
    }
    tc.updateActive(convId, { task_type: 'batch_edit', status: okImages.length ? 'editing' : 'failed', waiting_for_user: true, last_bot_question: '整组改好了，还要调整吗？', user_request: { latest_instruction: prompt } });
    if (!okImages.length) {
      return { markdown: false, text: '这组素材批量改都没成功😖 失败：' + failed.join('；') + '\n把修改点说具体些我再试～' };
    }
    let tip = `整组已按「${prompt}」改好啦✅ 成功 ${okImages.length} 张`;
    if (failed.length) tip += `，另有 ${failed.length} 张没成功：${failed.join('；')}`;
    tip += '。还需要继续调整，还是可以导出？';
    return { markdown: false, text: tip, images: okImages };
  }

  // 多图批量改：对方一条消息里带了多张图（或最近连发多张）→ 逐张改，一起发回
  async function _runMultiImageEdit(convId, codes, prompt) {
    const _method = (store.get('work') || {}).editMethod || 'designhub';
    if (_method === 'designhub' && !materialService.connected) {
      return { markdown: false, text: '素材库还没登录，改图用不了，麻烦先登录 DesignHub 😊' };
    }
    const okImages = [];
    const failed = [];
    for (const code of codes.slice(0, 6)) {   // 上限 6 张，避免太久
      const ref = await _resolveDingImage(convId, code);
      if (!ref) { failed.push('取图失败'); continue; }
      try {
        const gen = await _designhubEdit(ref, prompt);
        if (gen && gen.ok && gen.images && gen.images.length) {
          okImages.push({ url: gen.images[0], name: '改图结果' + (okImages.length + 1) });
        } else {
          failed.push((gen && gen.error) || '生成失败');
        }
      } catch (e) { failed.push('异常'); }
    }
    if (!okImages.length) {
      return { markdown: false, text: '这批图都没改成功😖（' + failed.join('；') + '）把修改点说具体些我再试～' };
    }
    // 记住最新一版，便于后续单图迭代
    const tc = window.taskContext;
    tc.createTask(convId, { task_type: 'image_edit', status: 'editing', task_name: '多图改图', original_request: prompt, current_material: { name: '用户上传图' } });
    tc.addVersion(convId, { file_url: okImages[okImages.length - 1].url, edit: prompt });
    let tip = `这批共 ${codes.length} 张，按「${prompt}」改好 ${okImages.length} 张✅`;
    if (failed.length) tip += `，另有 ${failed.length} 张没成功`;
    tip += '。还需要继续调整，还是可以导出？';
    return { markdown: false, text: tip, images: okImages };
  }

  // 把钉钉图片下载码换成可下载 URL（失败返回空串）
  async function _resolveDingImage(convId, code) {
    try {
      const dl = await dtService.downloadMessageImage(convId, code);
      return (dl && dl.ok && dl.downloadUrl) ? dl.downloadUrl : '';
    } catch (e) { return ''; }
  }

  /**
   * 把图片 URL 下载并转成 base64 data URL（供多模态理解用）。
   * 钉钉/内网的下载 URL 模型服务器抓不到，必须由本机下载成字节再内联给模型（与 AI 面板一致）。
   * @param {string} url
   * @returns {Promise<string>} data URL；失败返回空串
   */
  async function _imageUrlToDataUrl(url) {
    if (!url) return '';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return '';
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      const b64 = btoa(binary);
      const mime = res.headers.get('content-type') || 'image/png';
      return `data:${mime};base64,${b64}`;
    } catch (e) {
      console.warn('[imageUrlToDataUrl] 下载图片失败:', e && (e.message || e));
      return '';
    }
  }

  /**
   * 收集"用户刚发的那几张图"的下载码：从最近 lookback 条消息里，取对方（非我）连发的图片码。
   * 用于"把这几个图都改成X"——用户的图常是紧邻的多条独立图片消息 + 一条文字指令。
   * 一旦遇到对方的文字消息（非图片、非@纯文本指令）就停止回溯，避免把更早的无关图带进来。
   * @param {Array} msgs 会话消息列表
   * @param {number} lookback 最多回溯多少条
   * @returns {string[]} 去重后的图片下载码（按时间正序）
   */
  function _collectRecentImageCodes(msgs, lookback = 8) {
    const codes = [];
    const seen = new Set();
    const start = Math.max(0, msgs.length - lookback);
    for (let i = msgs.length - 1; i >= start; i--) {
      const m = msgs[i] || {};
      if (m.isMine) continue; // 跳过机器人自己发的（含改图结果）
      const cs = Array.isArray(m.imageDownloadCodes) ? m.imageDownloadCodes : [];
      if (cs.length) {
        for (const c of cs) { if (c && !seen.has(c)) { seen.add(c); codes.unshift(c); } }
        continue;
      }
      // 对方的图片占位消息（[图片]但无码）继续跳过；已收集到图后遇到对方的实质文字则停止
      const isPlaceholder = (m.content === '[图片]');
      if (codes.length && !isPlaceholder) break;
    }
    return codes;
  }

  /**
   * 解析「规范生图」要用的用户主视觉参考图：
   *   ① 当前消息附带的图（curCodes）→ 优先；
   *   ② 否则回溯最近几条里对方发来的图（解决「图文分两条发」导致当前消息无图码的问题）。
   * 不回退到任务上一版结果（那是「延展现有图」语义，由宽幅分支单独处理），避免无图时误复用旧结果。
   * @returns {Promise<string>} 参考图可访问 URL；无则空串（调用方走模板路径）
   */
  async function _resolveSpecUserRef(convId, msgs, curCodes) {
    try {
      if (curCodes && curCodes.length) return await _resolveDingImage(convId, curCodes[0]);
      const codes = _collectRecentImageCodes(msgs, 12);
      if (codes.length) return await _resolveDingImage(convId, codes[0]);
    } catch (e) { console.warn('[resolveSpecUserRef]', e && (e.message || e)); }
    return '';
  }

  /**
   * 统一构建托管回复：找图/改图 + 任务上下文记忆（搜索→确认→改图→迭代）
   * @returns {Promise<{text:string, markdown:boolean}>}
   */
  async function buildTakeoverReply(conv, precomputedAct) {
    const msgs = conv.messages || [];
    const last = msgs[msgs.length - 1] || {};
    const text = last.content || '';
    const robotName = (store.get('dingtalk') || {}).robotName || '';

    const convId = conv.id;
    const curCodes = Array.isArray(last.imageDownloadCodes) ? last.imageDownloadCodes : [];
    const hasText = text && text !== '[图片]' && text.replace(/\s/g, '').length >= 1;
    const tc = window.taskContext;

    // 纯图片消息（有图无文字）：不要走通用兜底"已记录"，而是主动引导说明改哪里。
    // 图片已存进会话历史，用户下一条文字指令会被改图分支（B）回溯到并触发改图，
    // 解决"先发图再发文字"时回复触发在图片那条导致改图不生效的不稳定问题。
    if (curCodes.length && !hasText) {
      return { markdown: false, text: '收到图片啦～需要我改哪里呢？改文案 / 换配色 / 改尺寸都可以直接说 📸' };
    }

    // ===== 规范沉淀：同事在钉钉里提的规范 → 自动/手动沉淀成技能 =====
    let ruleExtracted = false;   // 手动路径已跑过 AI 抽取时置真，避免下面自动路径重复调用
    if (hasText && window.ruleCaptureService) {
      // 手动：明确要求"存/记成技能"→ 抽取并回执确认（拦截本次回复）
      if (window.ruleCaptureService.looksLikeManualSave(text)) {
        ruleExtracted = true;
        try {
          const r = await window.ruleCaptureService.captureFromText(text, { force: true, source: 'group' });
          if (r && r.created) {
            return {
              markdown: false,
              text: r.mode === 'new'
                ? `好的，已把这套规范单独存成技能「${r.skill.name}」，之后处理相关需求我都会遵循 ✅`
                : `好的，已把这套规范记到「${r.skill.name}」技能里，之后处理相关需求我都会遵循 ✅`,
            };
          }
        } catch (e) { console.warn('[takeover.ruleSave]', e && (e.message || e)); }
        // 未识别为可沉淀的规范：不拦截，继续走正常流程
      }
      // 自动：非阻塞检测，命中规范则追加到「同事沉淀规范」(群聊来源)（不改变本次回复）
      if (!ruleExtracted) {
        window.ruleCaptureService.captureFromText(text, { source: 'group' }).catch(e => console.warn('[takeover.ruleAuto]', e && (e.message || e)));
      }
    }

    // ===== 参考规范优先应答（最高优先级，先于素材检索/意图路由等一切流程）=====
    // 规则要压过机器人默认行为：命中用户沉淀的规范就直接按规范回复。
    // 唯一让行场景：正处于改图/确认等进行中任务、且本条是"接续/选择/导出"类指令（避免劫持编辑流程）。
    if (hasText && window.skillService) {
      const _activeTask = tc.getActiveTask(convId);
      const _isFollowup = _activeTask && (
        tc.looksContinue(text) || tc.looksBatch(text) || tc.looksExport(text) || tc.looksSend(text) ||
        tc.isNo(text) || tc.isYes(text) || tc.resolvePick(text) >= 0 || _looksLikeImageGen(text) || curCodes.length > 0
      );
      if (!_isFollowup) {
        // 1) 本地确定性匹配（不依赖模型，快且稳）——最优先
        if (window.skillService.matchReferenceRuleLocally) {
          const local = window.skillService.matchReferenceRuleLocally(text);
          if (local && local.trim()) {
            console.warn('[buildReply] 命中参考规范(本地匹配)，直接回复');
            return { markdown: false, text: local.trim() };
          }
        }
        // 2) 本地未命中再尝试 AI 语义匹配（模型慢/超时则跳过，不阻断后续流程）
        const refRules = window.skillService.getReferenceRules && window.skillService.getReferenceRules();
        if (refRules && refRules.trim()) {
          try {
            const rr = await dtAI.applyReferenceRules(conv, refRules);
            if (rr && rr.matched && rr.reply && rr.reply.trim()) {
              console.warn('[buildReply] 命中参考规范(AI匹配)，按规范直接回复');
              return { markdown: false, text: rr.reply.trim(), polished: true };
            }
          } catch (e) { console.warn('[buildReply] 参考规范AI匹配失败:', e && (e.message || e)); }
        }
      }
    }

    // 重置/清空当前任务
    if (tc.looksReset(text)) {
      tc.clearActive(convId);
      return { markdown: false, text: '好的，已清空当前任务，我们重新开始～需要找素材还是改图？😊' };
    }
    // 「按品牌规范生成弹窗」→ 弹窗模板改图（竖版 594×790）。
    // 放在 banner 之前判定：弹窗更具体，避免「生成蓝莓弹窗视觉」被 banner 分支抢走。
    // 带图时：把用户图作为主视觉，先按规范版式合成脚手架再图生图（提升外部图版式命中率）。
    if (_looksLikeSpecPopup(text) && hasText && materialService.connected) {
      const specRef = await _resolveSpecUserRef(convId, msgs, curCodes);
      console.warn('[buildReply] 规范弹窗 → 模板改图' + (specRef ? '（用户主视觉合成）' : ''));
      tc.clearActive(convId);   // 规范新图，清掉旧任务，避免复用无关旧图
      try {
        const r = await _specPopupFromTemplate(convId, text, specRef);
        if (r) return r;
        console.warn('[buildReply] 未找到合适弹窗模板/改图失败，回退');
      } catch (e) { console.warn('[buildReply] 弹窗模板改图异常，回退:', e && e.message); }
    }

    // 「宽幅横向 banner（702×180）」→ 头图延展的宽横幅规范（左文右图）。比常规 banner 更具体，先判定。
    // 主视觉来源：① 本条附图 → 干净主视觉，合成宽幅脚手架；② 无附图但有当前任务结果图 → 延展现有图，直接 i2i 重排。
    if (_looksLikeWideBanner(text) && hasText && materialService.connected) {
      let wideRef = curCodes.length ? await _resolveDingImage(convId, curCodes[0]) : '';
      // 附图=干净主视觉，整图合成到右侧；无附图=延展当前任务成品图，裁其右侧主视觉（丢弃原文案/按钮）避免压扁
      let wideOpts = { enabled: true };
      if (!wideRef) {
        wideRef = tc.currentReferenceUrl(convId);
        wideOpts = { enabled: true, srcRegion: { sxRatio: 0.42, swRatio: 0.58 } };
      }
      console.warn('[buildReply] 规范宽幅banner(702×180) → ' + (wideRef ? (wideOpts.srcRegion ? '延展现有图(裁右侧主视觉)' : '附图主视觉合成') : '模板改图'));
      tc.clearActive(convId);   // 读完参考图再清任务，避免复用无关旧图
      try {
        const r = await _specWideBannerFromTemplate(convId, text, wideRef, wideOpts);
        if (r) return r;
        console.warn('[buildReply] 宽幅banner 未出图，回退');
      } catch (e) { console.warn('[buildReply] 宽幅banner 异常，回退:', e && e.message); }
    }

    // 「按品牌规范生成 banner」→ 全自动精选模板改图（版式/logo/按钮/安全区由模板保证，规范才能真正落地）。
    // 优先于纯文生图；需已登录素材库。本条附图或明确指向已有图时才复用主视觉；普通"生成/输出"请求必须重新搜索模板，不能被上次任务结果污染。
    if (_looksLikeSpecBanner(text) && hasText && materialService.connected) {
      const explicitReference = curCodes.length > 0 || /(改这张|改图|基于(?:这张|上图|刚才)|引用(?:这张|上图)|(?:这张|上图|刚才那张).{0,12}(?:改|生成|做|调整)|继续调整|延展)/.test(text);
      const specRef = explicitReference ? await _resolveSpecUserRef(convId, msgs, curCodes) : '';
      console.warn('[buildReply] 规范banner → 模板改图' + (specRef ? '（明确指定用户主视觉合成）' : '（重新检索模板）'));
      tc.clearActive(convId);   // 规范新图，清掉旧任务，避免复用无关旧图
      try {
        const r = await _specBannerFromTemplate(convId, text, specRef);
        if (r) return r;
        console.warn('[buildReply] 未找到合适模板/改图失败，回退文生图');
      } catch (e) { console.warn('[buildReply] 模板改图异常，回退文生图:', e && e.message); }
    }

    // 「生成一张全新图」仅在「本条没带图 且 上下文也没有可用参考模板」时才从零文生图。
    // 若已有参考模板（当前任务的选中素材/上一版结果）→ 保持"基于模板改图"（这才是规范/比例都对的效果，
    // 也是之前跑得好的路径），不要强行清任务从零画。
    const _hasRef = !!tc.currentReferenceUrl(convId);
    const _wantNewImage = _looksLikeGenerateNew(text) && !curCodes.length && !_hasRef;
    if (_wantNewImage) {
      tc.clearActive(convId);
      // 直接走「文生图」生成全新图，彻底绕开改图分支（否则会回溯到历史里用户发过的原图去改）
      const imgCfg = store.get('imageModel') || {};
      if (imgCfg.modelName && window.aiService.config && !window.aiService.useMock) {
        try {
          const genPrompt = await _buildGenPromptWithRules(text);
          // 尺寸优先级：用户明确指定 > 规范默认尺寸 > 交给模型（避免默认出方图）
          const genSize = _extractReqSize(text) || _extractSizeFromRules() || undefined;
          const r = await window.aiService.generateImage({ prompt: genPrompt, size: genSize });
          const u = r && (r.url || (r.b64 ? `data:image/png;base64,${r.b64}` : ''));
          if (u) return { markdown: false, text: '按你的要求生成好啦✅ 看看是否满意，需要调整继续说～', images: [{ url: u, name: '生成结果' }] };
          return { markdown: false, text: '这次没生成成功😖，换个说法或稍后再试～' };
        } catch (e) {
          console.warn('[buildReply] 文生图失败:', e && e.message);
          return { markdown: false, text: '这次没生成成功😖（' + ((e && e.message) || '未知原因') + '），到「API 接入 → 生图模型」换个 seedream 模型再试～' };
        }
      }
      return { markdown: false, text: '收到生成需求啦～不过还没配置生图模型，去「API 接入 → 生图模型」配一下（推荐 Doubao-Seedream）就能用咯 😊' };
    }
    if (tc.looksNew(text)) tc.finishActive(convId, 'completed');

    let task = tc.getActiveTask(convId);

    // 语雀文档：消息里带语雀链接 → 读取正文并按用户要求总结/分析（走 IPC 团队 Token，免用户配置）
    const yuqueUrl = _extractYuqueUrl(text);
    if (yuqueUrl && hasText) {
      console.warn('[buildReply] 读取语雀文档 url=' + yuqueUrl);
      try {
        const doc = await yqService.getDocByUrl(yuqueUrl);
        if (doc && (doc.content || '').trim()) {
          // 去掉链接与 @提及，得到用户的真实诉求
          const ask = text.replace(yuqueUrl, '').replace(/@[^\s]+/g, '').trim() || '请总结这篇文档的核心要点，并列出关键结论。';
          const body = String(doc.content).slice(0, 8000);   // 控制长度，避免超长
          const out = await window.aiService.send([
            { role: 'system', content: '你是哈啰设计团队的实名 AI 助理。基于给定的语雀文档内容，简洁、专业地完成用户的要求（总结/提炼/回答）。只依据文档内容，不要编造。' },
            { role: 'user', content: `【文档标题】${doc.title || ''}\n【文档内容】\n${body}\n\n【用户要求】${ask}` },
          ]);
          return { markdown: false, text: `📄 已读取《${doc.title || '语雀文档'}》：\n\n${out}`, polished: true };
        }
        return { markdown: false, text: '我打开了这个语雀链接，但没读到正文内容——可能是文档没有公开访问权限。麻烦确认下文档权限，或把关键内容贴给我，我来帮你分析 🙌' };
      } catch (e) {
        console.warn('[buildReply] 语雀读取失败:', e && (e.message || e));
        return { markdown: false, text: '读取这篇语雀文档失败了（' + ((e && e.message) || '权限或网络问题') + '）。你可以确认下文档访问权限，或直接把关键内容粘贴给我～' };
      }
    }

    // AI 意图路由：优先用外部预先算好的意图（自动回复时用于决定是否发"改图中"回执），否则现场判断
    let aiAct = precomputedAct || { action: 'chat' };
    if (!precomputedAct && hasText) {
      try {
        aiAct = await dtAI.decideAction(conv, {
          hasTask: !!task,
          status: task && task.status,
          hasCandidates: !!(task && (task.candidates || []).length && task.status === 'waiting_confirmation'),
          hasResult: !!(task && task.current_version),
          taskName: task && task.task_name,
        }) || { action: 'chat' };
      } catch (e) { aiAct = { action: 'chat' }; }
    }
    console.warn('[buildReply] AI意图 action=' + aiAct.action + ' keyword=' + (aiAct.keyword || '') + ' idx=' + (aiAct.index || ''));
    const actIs = (a) => aiAct && aiAct.action === a;
    // 编辑指令优先用 AI 抽取的干净指令，避免把"是这个/再一起发我"等噪音带进 prompt
    const editPrompt = (aiAct && aiAct.instruction && aiAct.instruction.trim()) ? aiAct.instruction.trim() : text;

    // ===== 统一意图（模型为主判据，关键词兜底）=====
    // 有进行中改图任务时，画面描述型指令默认按改图迭代处理，提升对详细修改需求的理解
    const _editing = !!(task && (task.status === 'editing' || task.current_version || task.current_material));
    const intent = _normalizeIntent(aiAct, text, curCodes.length, { isEditing: _editing });
    console.warn('[buildReply] 归一意图 intent=' + intent + ' editing=' + _editing);

    // 需求分析 / 图片理解：intent=analyze → 多模态理解，绝不当改图
    if (intent === 'analyze' && hasText) {
      console.warn('[buildReply] 意图=analyze，走多模态理解');
      let ref = curCodes.length ? await _resolveDingImage(convId, curCodes[0]) : '';
      if (!ref) {
        // 本条没带图 → 回溯最近对方发来的一张图
        for (let i = msgs.length - 2; i >= 0 && i >= msgs.length - 12; i--) {
          const m = msgs[i] || {};
          if (m.isMine) continue;
          const codes = Array.isArray(m.imageDownloadCodes) ? m.imageDownloadCodes : [];
          if (codes.length) { ref = await _resolveDingImage(convId, codes[0]); break; }
        }
      }
      try {
        // 钉钉下载 URL 模型抓不到 → 先由本机下载成 base64 再内联给模型（与 AI 面板一致）
        let imgForModel = '';
        if (ref) {
          imgForModel = await _imageUrlToDataUrl(ref) || ref;
        }
        const userContent = imgForModel
          ? [ { type: 'image_url', image_url: { url: imgForModel } }, { type: 'text', text } ]
          : text;
        const out = await window.aiService.send([
          { role: 'system', content: '你是哈啰设计团队的实名 AI 助理。请依据用户提供的图片/内容，简洁、专业、有条理地完成分析/总结/梳理/提取需求。只依据实际内容，不要编造；需求分析请用结构化格式（需求清单 / 关键目标 / 待确认项）。' },
          { role: 'user', content: userContent },
        ]);
        return { markdown: false, text: (out && out.trim()) || '我看了下，但没提取到有效内容，换个角度说说你想分析什么？', polished: true };
      } catch (e) {
        console.warn('[buildReply] analyze 失败:', e && (e.message || e));
        return { markdown: false, text: '分析时出错了（' + ((e && e.message) || '模型无响应') + '）。可以把关键内容也贴一段给我，我再帮你梳理～' };
      }
    }

    // 文件夹上传批量改：钉钉把文件夹压成压缩包作为 file 消息下发。
    // 找最近一条文件上传（可能在上一条），若本条是批量/改图指令，则针对上传的文件夹处理，
    // 绝不复用上一次搜索的素材组（这是"返回素材错误"的根因）。
    let recentFolder = last.fileUpload || null;
    if (!recentFolder) {
      for (let i = msgs.length - 2; i >= 0 && i >= msgs.length - 8; i--) {
        const m = msgs[i] || {};
        if (m.isMine) continue;
        if (m.fileUpload) { recentFolder = m.fileUpload; break; }
      }
    }
    const wantsFolderBatch = recentFolder && hasText &&
      (intent === 'edit' || intent === 'batch_edit');
    if (wantsFolderBatch) {
      console.warn('[buildReply] 文件夹批量请求 file=' + (recentFolder.fileName || '') + ' hasCode=' + !!recentFolder.downloadCode);
      return {
        markdown: false,
        text: `📁 收到你上传的文件夹「${recentFolder.fileName || ''}」和修改需求~\n整组文件夹「自动解压 → 按顺序逐张改 → 打包发回」这条链路我正在接入（需要先对齐钉钉的文件下载格式）。\n\n临时方案：把文件夹里的图片直接（可多张一起）发我，我按顺序逐张改好一起发回；打包 zip 回传我会尽快补上 🙌`,
      };
    }
    // 用户明确提到"文件夹"但没收到文件：如实告知，绝不拿上一次搜索的素材组顶替
    const mentionsFolder = /文件夹|这组文件|整个文件夹|文件夹(里|中)/.test(text);
    if (mentionsFolder && !recentFolder && hasText &&
      (intent === 'edit' || intent === 'batch_edit')) {
      console.warn('[buildReply] 提到文件夹但未捕获到上传文件，拒绝复用旧素材组');
      return {
        markdown: false,
        text: '我这边没收到你上传的文件夹文件呢📁（钉钉有时不会把文件夹消息推给机器人）。\n麻烦把文件夹里的图片直接发我——可以多张一起发，我按顺序逐张改好再一起发回给你 🙌',
      };
    }

    // ===== A. 有激活任务：优先按任务上下文处理（确认候选 / 迭代改图）=====
    if (task && !tc.looksNew(text)) {
      // A0. 导出 / 直接发我：本地已有当前版本结果图，直接发回（不去 DesignHub 兜圈子）
      if (tc.looksExport(text) || tc.looksSend(text) || actIs('send') || actIs('export')) {
        const ref = tc.currentReferenceUrl(convId);
        if (ref) {
          const isExport = tc.looksExport(text) || actIs('export');
          if (isExport) tc.finishActive(convId, 'completed');
          return {
            markdown: false,
            text: isExport ? '这就是最终版啦🎉 直接发你👇 需要其他尺寸或继续调整也可以说～' : '好的，最新版直接发你👇',
            images: [{ url: ref, name: '最终版' }],
          };
        }
        // 没有结果图（还没改过）时不拦截，继续走后续逻辑
      }

      // A1. 等待用户确认搜索候选
      if (task.status === 'waiting_confirmation' && (task.candidates || []).length) {
        if (tc.isNo(text)) {
          const url = materialService.buildSearchUrl(task.task_name || '');
          tc.updateActive(convId, { status: 'searching', waiting_for_user: false });
          return { markdown: false, text: `这两个可能不太匹配😅 可以在 DesignHub 继续看👉 ${url}\n选中后把素材链接、名称或截图发我，我接着帮你调整。` };
        }
        let pick = tc.resolvePick(text);
        if (pick < 0 && actIs('select') && (aiAct.index === 1 || aiAct.index === 2)) pick = aiAct.index - 1;
        if (pick >= 0 && task.candidates[pick]) {
          const m = task.candidates[pick];
          tc.setMaterial(convId, m);
          tc.updateActive(convId, { status: 'editing', waiting_for_user: true, last_bot_question: '需要做哪些调整？' });
          task = tc.getActiveTask(convId);
          // 同一句里若已带修改指令（如「是这个，把标题改成X」/「整组都改」），直接开改，不再反问
          const hasInstrInline = _looksLikeImageGen(text) || tc.looksBatch(text) || tc.looksContinue(text) || actIs('edit') || actIs('batch_edit');
          if (!hasInstrInline) {
            return { markdown: false, text: `好嘞，选「${m.name}」😊 需要对它做哪些调整？（改文案 / 换配色 / 改尺寸都可以）` };
          }
          // 否则落到下面 A2 编辑分支继续执行
        }
        // 未解析出明确选择时：
        // - 若是改图指令 → 默认用第一个继续（落到 A2）
        // - 若 AI 判为「就是想选但没说清序号」→ 追问一次
        // - 其它（新搜索 / 闲聊 / 与选择无关）→ 放行给后续分支，不再死黏在确认态
        if ((_looksLikeImageGen(text) || curCodes.length || actIs('edit') || actIs('batch_edit')) && task.candidates[0]) {
          tc.setMaterial(convId, task.candidates[0]);
          tc.updateActive(convId, { status: 'editing' });
          task = tc.getActiveTask(convId);
        } else if (actIs('select') && !actIs('search')) {
          return { markdown: false, text: '你要用第一个还是第二个呀？回复「第一个」「第二个」，或说「都不对」我再帮你找～' };
        }
        // 否则不拦截，继续往下走（新搜索会在 C 分支重建任务，闲聊走 suggestReply）
      }

      // A2. 编辑迭代：基于「当前版本 / 选中素材 / 本条新图」继续改
      const editable = task.status === 'editing' || task.current_material || task.current_version;
      // 意图为改图，或"接着改"续图，或直接带了新图（此时 intent 已排除 analyze/search）
      const wantsEdit = intent === 'edit' || intent === 'batch_edit' || tc.looksContinue(text) || curCodes.length;
      if (editable && wantsEdit && hasText) {
        // 批量改图：优先改"用户刚发的那几张图"，只有本条完全没带新图时才回退到任务记住的素材组，
        // 避免误把旧搜索结果（如之前搜的"骑行卡"）当成要改的图。
        if (intent === 'batch_edit' || tc.looksBatch(text) || curCodes.length > 1) {
          const batchCodes = curCodes.length > 1 ? curCodes : _collectRecentImageCodes(msgs, 8);
          if (batchCodes.length >= 1) {
            console.warn('[buildReply] A2 多图批量改（用户新发图）count=' + batchCodes.length);
            return await _runMultiImageEdit(convId, batchCodes, editPrompt);
          }
          if ((task.group || []).length > 1) {
            console.warn('[buildReply] A2 整组批量改（任务记住的素材组）count=' + task.group.length);
            return await _runBatchEdit(convId, task, editPrompt);
          }
        }
        // 参考图：本条带图优先，其次任务当前版本/素材
        let ref = '';
        if (curCodes.length) ref = await _resolveDingImage(convId, curCodes[0]);
        if (!ref) ref = tc.currentReferenceUrl(convId);
        if (!ref) return { markdown: false, text: '我这边暂时没拿到要改的图，麻烦把原图发我，或先说要找什么素材～' };
        const gen = await _designhubEdit(ref, editPrompt, _extractReqSize(text));
        console.warn('[buildReply] 任务改图 ok=' + gen.ok + ' err=' + (gen.error || ''));
        if (gen.needLogin) return { markdown: false, text: '素材库还没登录，改图用不了，麻烦先登录 DesignHub 😊' };
        if (gen.ok && gen.images && gen.images.length) {
          tc.addVersion(convId, { file_url: gen.images[0], edit: editPrompt });
          tc.updateActive(convId, { waiting_for_user: true, last_bot_question: '还需要继续调整，还是可以导出？', user_request: { latest_instruction: editPrompt } });
          const images = gen.images.slice(0, 4).map((u, i) => ({ url: u, name: '改图结果' + (i + 1) }));
          return { markdown: false, text: '按你的要求改好了✅ 还需要继续调整，还是可以导出最终文件？', images };
        }
        if (gen.needAuth) return { markdown: false, text: '素材库登录过期了，麻烦到「API 接入 → 素材库」重登后再发一次～' };
        return { markdown: false, text: '这次没生成成功（' + (gen.error || '未知原因') + '），把修改点说得更具体些我再试试 😊' };
      }
    }

    // ===== B0. 多图改图：本条/最近几条带了多张图 + 改图/批量指令 → 逐张改，一起发回 =====
    if (hasText && (intent === 'edit' || intent === 'batch_edit')) {
      // 本条多图优先；否则收集"用户刚连发的多张图"（分开发的独立图片消息）
      const multiCodes = curCodes.length > 1 ? curCodes : _collectRecentImageCodes(msgs, 8);
      if (multiCodes.length > 1) {
        console.warn('[buildReply] 多图批量改 count=' + multiCodes.length);
        return await _runMultiImageEdit(convId, multiCodes, editPrompt);
      }
    }

    // ===== B. 首次带图改图（无编辑态任务）：图片 + 指令 → 取原图 → DesignHub AI 改图 =====
    let refDownloadCode = curCodes[0] || '';
    if (!refDownloadCode && hasText && (intent === 'edit' || intent === 'batch_edit')) {
      // 跟进续图：本条没带图，回溯最近 20 条内对方发来的最近一张图
      for (let i = msgs.length - 2; i >= 0 && i >= msgs.length - 20; i--) {
        const m = msgs[i] || {};
        if (m.isMine) continue;
        const codes = Array.isArray(m.imageDownloadCodes) ? m.imageDownloadCodes : [];
        if (codes.length) { refDownloadCode = codes[0]; break; }
      }
    }
    if (refDownloadCode && hasText && (intent === 'edit' || intent === 'batch_edit')) {
      if (((store.get('work') || {}).editMethod || 'designhub') === 'designhub' && !materialService.connected) {
        return { markdown: false, text: '收到改图需求啦～不过素材库还没登录，先没法调用 AI 改图，麻烦先登录 DesignHub 😊' };
      }
      const ref = await _resolveDingImage(convId, refDownloadCode);
      if (!ref) {
        return { markdown: false, text: '收到你的改图需求啦～但没取到原图，麻烦把图片重新发一次，并说清楚改哪里（文案/配色/尺寸）😊' };
      }
      const gen = await _designhubEdit(ref, editPrompt, _extractReqSize(text));
      console.warn('[buildReply] 首次带图改图 ok=' + gen.ok + ' err=' + (gen.error || ''));
      if (gen.ok && gen.images && gen.images.length) {
        // 建立编辑态任务，记住原图与首个版本，便于后续「再大一点/换个色」迭代
        tc.createTask(convId, { task_type: 'image_edit', status: 'editing', task_name: '图片改图', original_request: text, current_material: { name: '用户上传图', url: ref } });
        tc.addVersion(convId, { file_url: gen.images[0], edit: editPrompt });
        const images = gen.images.slice(0, 4).map((u, i) => ({ url: u, name: '改图结果' + (i + 1) }));
        return { markdown: false, text: '按你的要求用 DesignHub AI 改好了✅ 还需要继续调整，还是可以导出？', images };
      }
      if (gen.needAuth) return { markdown: false, text: '素材库登录过期了，麻烦重登后再发一次～' };
      return { markdown: false, text: '收到改图需求啦～这次没生成成功（' + (gen.error || '未知原因') + '），把修改点说具体些我再试 😊' };
    }

    // ===== C. 找素材：返回前 2 项 + 确认，并建任务记住候选（意图=search 或识别为车型图）=====
    if (intent === 'search' || _looksLikeBikeImage(text)) {
      // 自行车图片 / 车型号 / 别名
      if (_looksLikeBikeImage(text)) {
        // 提取具体车型关键词：车型号（A70…）优先，其次别名
        const mm = text.match(/[A-Za-z]\d{2,3}(?:\/[A-Za-z]?\d{2,3})?/);
        const am = text.match(/(云朵车|好运车|小蓝车|小白车|亲子车|校园车|助力车|电踏车|风行车|轻骑车|畅行车)/);
        const bikeKeyword = (mm && mm[0]) || (am && am[0]) || '';
        // 有具体车型/别名 + 素材库已登录 → 直接搜索并下载原图发回
        if (bikeKeyword && materialService.connected) {
          try {
            const res = await materialService.search(bikeKeyword);
            console.warn('[buildReply] 车型直搜 kw=' + bikeKeyword + ' count=' + ((res.items && res.items.length) || 0));
            if (res.ok && res.items && res.items.length) {
              const kw = bikeKeyword.toLowerCase();
              // 只发"名称确实包含该车型关键词"的图；严禁在没匹配时拿搜索结果前几张顶替（会发出无关 banner）
              const hit = res.items.filter(it => (it.name || '').toLowerCase().includes(kw));
              const top = hit.slice(0, 3);
              if (top.length) {
                const images = top.map(it => ({ url: it.url || it.thumb, name: it.name || bikeKeyword }));
                return {
                  markdown: false,
                  text: `🚲 这是「${bikeKeyword}」的图，直接发你啦👇 更多型号可到车型图库：${BIKE_LIBRARY_URL}`,
                  images,
                };
              }
              // 搜到了结果但没有一张名称匹配该车型 → 不发无关图，引导到图库
              console.warn('[buildReply] 车型直搜无精确匹配，改为引导图库 kw=' + bikeKeyword);
            }
          } catch (e) { console.warn('[buildReply] 车型直搜异常:', e && e.message); }
        }
        // 无具体车型 / 未搜到 / 未登录 → 引导到车型图库（不硬塞无关图）
        console.warn('[buildReply] 自行车图片素材 → 引导车型图库');
        const notFoundTip = bikeKeyword ? `没在素材库找到「${bikeKeyword}」的车辆图。` : '';
        return {
          markdown: false,
          text: `🚲 ${notFoundTip}建议到「哈啰车型图库」按车型号查找哦👉 ${BIKE_LIBRARY_URL}\n里面按 国内单车（25年/24年普通车、校园车…）分好类，含 A55 / A40 / A60·A61 / A70 等型号，图更全更准 😊`,
        };
      }
      // 关键词：优先用 AI 意图里抽好的，其次再用关键词提取；都没有再退回整句
      let keyword = (aiAct && aiAct.keyword && aiAct.keyword.trim()) ? aiAct.keyword.trim() : '';
      if (!keyword) { try { keyword = await materialService.aiExtractKeyword(text); } catch (e) { /* 兜底 */ } }
      if (!keyword) keyword = materialService.extractKeyword(text) || text;
      // 清理关键词里的通用噪音词（素材/图片/相关/一下…），避免"储时卡素材"这类拼接词导致过滤误杀
      keyword = String(keyword)
        .replace(/(素材|图片|图|照片|渲染图|相关的?|一下|一张|一个|帮我|给我|请|看看|找一?下?|搜一?下?|的)/g, ' ')
        .replace(/\s+/g, ' ').trim() || keyword;
      // 是否在问"有几张/有哪些/多少"这类数量问题
      const isCountQ = /(几张|多少|数量|有哪些|几个|多少张|有没有)/.test(text);
      const searchUrl = materialService.buildSearchUrl(keyword);
      if (materialService.connected) {
        try {
          const res = await materialService.search(keyword);
          console.warn('[buildReply] 搜索 keyword=' + keyword + ' ok=' + res.ok + ' count=' + ((res.items && res.items.length) || 0));
          if (res.ok && res.items && res.items.length) {
            // 相关性过滤：按空格分词 + 2 字 n-gram，命中名称/标签/分类任一即视为相关
            const raw = String(keyword);
            const spaceTokens = raw.split(/\s+/).filter(t => t && t.length >= 2);
            const ngrams = [];
            const compact = raw.replace(/\s+/g, '');
            for (let i = 0; i + 2 <= compact.length; i++) ngrams.push(compact.slice(i, i + 2)); // 2字滑窗
            const tokens = Array.from(new Set([raw.replace(/\s+/g, ''), ...spaceTokens, ...ngrams])).filter(t => t.length >= 2);
            const hit = (it) => {
              const hay = ((it.name || '') + ' ' + (Array.isArray(it.tags) ? it.tags.join(' ') : '') + ' ' + (it.category || '')).toLowerCase();
              return tokens.some(t => hay.includes(t.toLowerCase()));
            };
            let relevant = res.items.filter(hit);
            let loose = false;
            if (!relevant.length) {
              // 严格过滤为空但确实搜到了结果 → 放宽：展示后端返回的前几个，并加"可能相关"说明（避免误报未找到）
              console.warn('[buildReply] 严格过滤为空，放宽展示后端结果 keyword=' + keyword);
              relevant = res.items;
              loose = true;
            }
            const top = relevant.slice(0, 2);
            const toCand = (it) => ({ material_id: it.id, name: it.name, url: it.url || it.thumb, thumb: it.thumb || it.url, cdnUrl: it.url });
            const candidates = top.map(toCand);
            const group = relevant.slice(0, 8).map(toCand);   // 整组素材（最多 8 张，供批量改）
            // 建任务：状态=等确认，记住候选（供「第一个/第二个」关联）与整组（供「整组批量改」）
            tc.createTask(convId, { task_type: 'material_search', status: 'waiting_confirmation', task_name: keyword, original_request: text, candidates, group, waiting_for_user: true, last_bot_question: '是你需要的吗？' });
            const images = top.map(it => ({ url: it.thumb || it.url, name: it.name }));
            // 放宽命中：给"可能相关"说明，不走确认流程
            if (loose) {
              return { markdown: false, text: `没找到和「${keyword}」完全匹配的，这两个可能相关，看看合适吗👇 也可以到 DesignHub 换个词再搜👉 ${searchUrl}`, images };
            }
            // 数量类问题：先用文字答"一共几张"，再附最匹配的两张图
            if (isCountQ) {
              const total = res.total || relevant.length;
              return { markdown: false, text: `「${keyword}」相关素材一共有 ${total} 张，我挑了最匹配的两张给你看看👇（想改哪张直接说「第一个」「第二个」）`, images };
            }
            return { markdown: true, images, searchUrl, materialFind: true, text: '' };
          }
        } catch (e) { /* 降级到链接 */ }
      }
      return { markdown: true, text: `🎨 没找到「${keyword}」的匹配素材，可以到 DesignHub 直接搜👉 [DesignHub 搜索](${searchUrl})` };
    }

    // 2) 纯文字生成新图（无参考图）：有生图模型则直接出图，否则给引导
    if (intent === 'edit' || intent === 'batch_edit') {
      const imgCfg = store.get('imageModel') || {};
      if (imgCfg.modelName && window.aiService.config && !window.aiService.useMock) {
        try {
          // 从文字提取目标尺寸（如 702x180）传入；提示词并入品牌规范；结果作为真实图片发送
          // （走 sendImages 媒体上传，而非内联 markdown —— 钉钉不渲染 data URL / 大图内联）
          const r = await window.aiService.generateImage({ prompt: _buildGenPromptWithRules(text), size: _extractReqSize(text) || _extractSizeFromRules() || undefined });
          const u = r && (r.url || (r.b64 ? `data:image/png;base64,${r.b64}` : ''));
          if (u) {
            return { markdown: false, text: '按你的要求生成好啦✅ 看看是否满意，需要调整继续说～', images: [{ url: u, name: '生成结果' }] };
          }
        } catch (e) {
          console.warn('[buildReply] 文生图失败:', e && e.message);
          return { markdown: false, text: '这次没生成成功😖（' + ((e && e.message) || '未知原因') + '），换个说法或到「API 接入 → 生图模型」换个 seedream 模型再试～' };
        }
      }
      return { markdown: false, text: `收到生成需求啦～不过还没配置生图模型，去「API 接入 → 生图模型」配一下（推荐 Doubao-Seedream）就能用咯 😊` };
    }

    // 3) 普通：常规拟回复（AI 失败则兜底，避免机器人"装死"）
    // 读取「允许闲聊」偏好：开启则无关话题走通用 AI 自由对话，关闭则只聚焦工作话题
    const allowChitchat = (store.get('work') || {}).allowChitchat !== false;
    let replyText;
    try {
      replyText = await dtAI.suggestReply(conv, robotName, { allowChitchat });
    } catch (e) {
      console.warn('[buildReply] AI 拟回复失败，使用兜底:', e.message || e);
      return { markdown: false, text: '收到你的消息啦～我已记录，稍后会尽快跟进 🙌' };
    }
    // 回复里若带 DesignHub 素材图链接，抽出来作为真实图片发送
    const ext = _extractDesignhubImages(replyText);
    if (ext.images.length) {
      return { markdown: false, text: ext.cleanText || '为你找到相关素材，看看👇', images: ext.images, polished: true };
    }
    return { markdown: false, text: replyText, polished: true };   // 已是模型生成的自然回复，无需再润色
  }

  // 自动回复：AI 生成回复并以机器人身份发送（自动模式用）
  /**
   * 统一回复发送：所有发送入口（自动回复 / 确认卡）都走这里
   * 关键职责：发送前再兜底扫描一遍文本里的 DesignHub 素材链接，抽成真实图片发送，
   *          避免内网素材图以 markdown/裸链接形式发出后钉钉渲染不出来（只显示链接）。
   * @param {object} conv
   * @param {object} reply - { text, markdown, images, searchUrl, materialFind }
   * @returns {Promise<{ok:boolean, error?:string, sentImages:number}>}
   */
  async function sendReplyToConv(conv, reply = {}) {
    // 1) 发送前兜底：文本里若残留素材链接，抽出来当真实图片，并从正文清理
    const ext = _extractDesignhubImages(reply.text || '');
    const hasExtracted = ext.images.length > 0;
    const cleanText = hasExtracted
      ? (ext.cleanText || '为你找到相关素材，看看👇')
      : (reply.text || '');

    // 2) 合并图片来源（buildReply 已带的 + 文本抽取的），按 url 去重
    const seen = new Set();
    const images = [];
    for (const img of [...(reply.images || []), ...ext.images]) {
      if (img && img.url && !seen.has(img.url)) { seen.add(img.url); images.push(img); }
    }

    // 2.5) 语言润色：模板类回复统一过接入的 AI 模型改写成自然口吻（模型输出的自然回复已标 polished，跳过）
    let outText = cleanText;
    if (outText && !reply.polished) {
      const persona = ((store.get('dingtalk') || {}).robotName) || '哈啰两轮设计团队的实名 AI 助理「小哈」';
      outText = await dtAI.polishReply(outText, { persona });
    }

    // 3) 先发文字（找素材场景 text 为空则跳过，图片自带追问引导）
    let ok = true, error = '';
    if (outText) {
      const res = await dtService.reply(conv.id, outText, reply.markdown ? '助理回复' : undefined);
      ok = res.ok; error = res.error || '';
    }

    // 4) 发真实图片：下载→上传钉钉媒体→发图片消息（图片失败不阻断文本回复）
    let sentImages = 0;
    if (images.length) {
      try {
        const r = await dtService.sendImages(conv.id, images, {
          searchUrl: reply.searchUrl || '',
          askConfirm: !!reply.materialFind,
          dhToken: materialService.token,
        });
        sentImages = (r && r.sent) || 0;
        if (r && !r.ok && !cleanText) { ok = false; error = r.error || '图片发送失败'; }
      } catch (e) {
        console.warn('[sendReply] 发图异常:', e.message || e);
      }
    }

    // 5) 记「机器人刚发出的结果图」为当前任务参考图。
    //    钉钉不会把用户「引用」的原图下发给机器人，故以「最近展示给用户的结果图」作为可靠替身：
    //    用户随后「引用这张图 / 按照这个视觉 改成X」时，改图逻辑就能取到正确原图继续改，
    //    覆盖文生图等原本不写任务上下文、导致引用改图失效的路径。
    //    幂等：与当前参考图相同则跳过（改图/规范banner 分支已提前 addVersion，避免重复记录）。
    //    跳过：找素材候选图（materialFind/searchUrl/等待确认态，另有确认流程）、data:URL（体积大且无法二次改图）。
    try {
      const tc = window.taskContext;
      const primary = images.find(im => im && im.url && !/^data:/i.test(im.url));
      const act = tc && tc.getActiveTask(conv.id);
      const isSearchLike = !!reply.materialFind || !!reply.searchUrl || (act && act.status === 'waiting_confirmation');
      if (tc && sentImages > 0 && primary && !isSearchLike && tc.currentReferenceUrl(conv.id) !== primary.url) {
        if (act) {
          tc.addVersion(conv.id, { file_url: primary.url, edit: '发图结果' });
        } else {
          tc.createTask(conv.id, {
            task_type: 'image_edit', status: 'editing', task_name: '生成结果',
            current_material: { name: primary.name || '生成结果', url: primary.url, cdnUrl: primary.url },
          });
          tc.addVersion(conv.id, { file_url: primary.url, edit: '生成结果' });
        }
      }
    } catch (e) { console.warn('[sendReply] 记录参考图失败:', e && (e.message || e)); }

    return { ok, error, sentImages };
  }

  /** 对 buildTakeoverReply 的结果做语言润色（模板类→自然口吻）；模型已生成的(polished)跳过。 */
  async function polishReplyObj(r) {
    if (r && r.text && !r.polished) {
      const persona = ((store.get('dingtalk') || {}).robotName) || '哈啰两轮设计团队的实名 AI 助理「小哈」';
      r.text = await dtAI.polishReply(r.text, { persona });
      r.polished = true;
    }
    return r;
  }

  /** AI 面板：以机器人身份说一句话，模板文案先过润色（模型不可用时原样） */
  async function botSayPolished(text) {
    let t = text;
    try {
      if (window.aiService && !window.aiService.useMock) {
        t = await dtAI.polishReply(text, { persona: '哈啰两轮设计团队的实名 AI 助理「小哈」' });
      }
    } catch (e) { /* 润色失败用原文 */ }
    chat.addMsg('bot', t);
  }

  // 让 AI 判断当前消息意图（供自动回复决定是否发"改图中"回执）
  async function _computeIntent(conv) {
    const msgs = conv.messages || [];
    const last = msgs[msgs.length - 1] || {};
    const text = last.content || '';
    if (!(text && text !== '[图片]' && text.replace(/\s/g, '').length >= 1)) return { action: 'chat' };
    const tc = window.taskContext;
    const task = tc.getActiveTask(conv.id);
    try {
      return await dtAI.decideAction(conv, {
        hasTask: !!task,
        status: task && task.status,
        hasCandidates: !!(task && (task.candidates || []).length && task.status === 'waiting_confirmation'),
        hasResult: !!(task && task.current_version),
        taskName: task && task.task_name,
      }) || { action: 'chat' };
    } catch (e) { return { action: 'chat' }; }
  }

  async function autoReplyTo(conv) {
    try {
      // 先让 AI 判断意图；仅当确实是「改图/批量改图」这类耗时操作时，才发"改图中"回执
      const aiAct = await _computeIntent(conv);
      if (aiAct.action === 'edit' || aiAct.action === 'batch_edit') {
        const ack = aiAct.action === 'batch_edit'
          ? '收到～整组素材批量改图中，需要一点时间，请稍候 ⏳'
          : '收到～正在按你的要求改图，稍等一下哦 🎨（改图通常要 1~2 分钟）';
        dtService.sendAck(conv.id, ack).catch(() => {});
      }
      // 复用同一份意图，避免重复调用 AI
      const r = await buildTakeoverReply(conv, aiAct);
      console.warn('[autoReply] 诊断 materialConnected=' + materialService.connected + ' imagesLen=' + ((r.images && r.images.length) || 0));
      await sendReplyToConv(conv, r);
      statsService.increment('messageHandled');
      notif.pushText(`已自动回复「${conv.name}」`);
    } catch (e) {
      console.warn('[dingtalk] 自动回复失败:', e.message);
    }
  }

  // 钉钉操作 → AI（不关闭 dock）
  dt.onAction = async (action, conv) => {
    if (action === 'takeover') {
      // 单会话 AI 接管
      takeover.toggleChat(conv.id);
      const enabled = takeover.isChatEnabled(conv.id);
      // 切换到 AI 面板显示状态
      if (dt.isOpen) dt.close();
      chat.open();
      highlightTab('chat');
      lastActiveTab = 'chat';
      if (enabled) {
        chat.addMsg('bot', `🤖 已开启对「${conv.name}」的 AI 接管，正在生成回复...`);
        chat.sending = true;
        try {
          const r = await polishReplyObj(await buildTakeoverReply(conv));
          chat.addReplyCard(conv.id, conv.name, r.text, async (finalText) => {
            // 用户点直接回复 → 统一发送（发送前兜底抽图，素材链接自动转真实图片）
            const res = await sendReplyToConv(conv, { ...r, text: finalText });
            if (res.ok) {
              statsService.increment('messageHandled');
              pet.react('bounce');
              notif.pushText(`已回复「${conv.name}」`);
            } else {
              chat.addMsg('bot', '⚠️ 发送失败：' + (res.error || '未知错误'));
            }
          });
        } catch(e) {
          chat.addMsg('bot', '⚠️ 生成回复失败：' + e.message);
        }
        chat.sending = false;
      } else {
        chat.addMsg('bot', `🤖 已关闭对「${conv.name}」的 AI 接管。`);
      }
      return;
    }

    // 🔍 智能解读：结构化 5 要素
    if (action === 'insight') {
      if (dt.isOpen) dt.close();
      chat.open(); highlightTab('chat'); lastActiveTab = 'chat';
      statsService.increment('messageHandled');
      chat.sending = true;
      const typing = chat.addMsg('bot typing', '正在解读消息...');
      try {
        const a = await dtAI.analyzeMessage(conv);
        typing.remove();
        const text = `🔍 **「${conv.name}」消息解读**\n\n` +
          `**核心诉求**：${a.coreNeed || '—'}\n` +
          `**需完成工作**：${a.work || '—'}\n` +
          `**截止时间**：${a.deadline || '未明确'}\n` +
          `**协作对象**：${a.collaborators || '无'}\n` +
          `**风险点**：${a.risks || '无'}\n\n` +
          `💡 ${a.replyHint || ''}`;
        chat.addMsg('bot', text);
      } catch (e) {
        typing.remove();
        chat.addMsg('bot', '⚠️ 解读失败：' + (e.message || e));
      }
      chat.sending = false;
      return;
    }

    // 💬 拟回复：生成回复建议 + 一键发送
    if (action === 'suggest-reply') {
      if (dt.isOpen) dt.close();
      chat.open(); highlightTab('chat'); lastActiveTab = 'chat';
      chat.sending = true;
      chat.addMsg('bot', `💬 正在为「${conv.name}」拟回复...`);
      try {
        const r = await polishReplyObj(await buildTakeoverReply(conv));
        chat.addReplyCard(conv.id, conv.name, r.text, async (finalText) => {
          // 统一发送（发送前兜底抽图，素材链接自动转真实图片）
          const res = await sendReplyToConv(conv, { ...r, text: finalText });
          if (res.ok) {
            statsService.increment('messageHandled');
            pet.react('bounce');
            notif.pushText(`已回复「${conv.name}」`);
          } else {
            chat.addMsg('bot', '⚠️ 发送失败：' + (res.error || '未知错误'));
          }
        });
      } catch (e) {
        chat.addMsg('bot', '⚠️ 生成回复失败：' + (e.message || e));
      }
      chat.sending = false;
      return;
    }

    // 📋 提取任务：解析为待办并入库
    if (action === 'extract') {
      if (dt.isOpen) dt.close();
      chat.open(); highlightTab('chat'); lastActiveTab = 'chat';
      chat.sending = true;
      const typing = chat.addMsg('bot typing', '正在提取任务...');
      try {
        const list = await dtAI.extractTasks(conv);
        typing.remove();
        if (!list.length) {
          chat.addMsg('bot', '💡 没有从这段对话中提取到明确的任务。');
        } else {
          const created = todoService.createBatch(list.map(it => ({
            title: it.title,
            priority: it.priority || 'medium',
            deadline: it.deadline ? Date.parse(it.deadline) : null,
            fromChat: conv.name,
          })));
          statsService.increment('messageHandled');
          const summary = created.map((t, i) => `${i + 1}. ${t.title}${t.deadline ? `（${window.TodoUtils.formatDeadline(t.deadline)}）` : ''}`).join('\n');
          chat.addMsg('bot', `📋 已从「${conv.name}」提取 ${created.length} 条任务并加入待办：\n${summary}\n\n👉 点击 dock 上的 ✅ 查看`);
        }
      } catch (e) {
        typing.remove();
        chat.addMsg('bot', '⚠️ 提取失败：' + (e.message || e));
      }
      chat.sending = false;
      return;
    }

    // 需求分析（兼容旧入口）
    if (dt.isOpen) dt.close();
    chat.open();
    highlightTab('chat');
    lastActiveTab = 'chat';
    if (action === 'summarize') {
      statsService.increment('messageHandled');
      const prompt = window.ContextUtils.buildSummaryPrompt(conv);
      await chat.sendToAI('📝 总结：' + conv.name, prompt);
    } else if (action === 'analyze') {
      statsService.increment('messageHandled');
      try {
        const prompt = await window.ContextUtils.buildAnalysisPrompt(conv, yqService);
        await chat.sendToAI('🔍 需求分析：' + conv.name, prompt);
      } catch (e) {
        chat.addMsg('bot', '⚠️ ' + e.message);
      }
    }
  };

  // 语雀 → AI（不关闭 dock）
  yq.onSendToAI = (title, content) => {    if (yq.isOpen) yq.close();
    chat.open();
    highlightTab('chat');
    lastActiveTab = 'chat';
    setTimeout(async () => {
      // 转纯文本：去掉图片 url 等噪音，节省 token、提升总结质量
      const plain = yqService.toPlainText(content);
      const prompt = `请总结以下语雀文档核心内容，用简洁的结构化要点输出：\n\n【${title}】\n${plain}`;
      await chat.sendToAI('🤖 总结文档：' + title, prompt);

      // 总结完成后，判断是否包含作图需求
      const lastMsg = chatHistory.getActive()?.messages?.filter(m => m.role === 'assistant').pop();
      if (lastMsg && lastMsg.content) {
        const classification = await visualGenService.classifyDemand(lastMsg.content);
        if (classification.needsVisual) {
          const cardData = window.DemandCard.buildData({
            source: 'yuque',
            sourceLabel: '语雀文档：' + title,
            aiSummary: lastMsg.content,
            classification,
          });
          _renderDemandCard(cardData);
        }
      }
    }, 100);
  };

  // === 需求卡片渲染 + 生图执行区 ===
  function _renderDemandCard(cardData) {
    const cardHTML = window.DemandCard.render(cardData);
    const wrapper = document.createElement('div');
    wrapper.className = 'msg msg-assistant msg-bot msg-in';
    wrapper.innerHTML = `<div class="msg-body">${cardHTML}</div>`;
    const msgsEl = document.querySelector('.chat-messages');
    if (msgsEl) {
      msgsEl.appendChild(wrapper);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    // 监听「生成视觉图」按钮
    const genBtn = wrapper.querySelector('[data-action="start-visual-gen"]');
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        const execEl = visualExecutor.create(cardData);
        const execWrapper = document.createElement('div');
        execWrapper.className = 'msg msg-assistant msg-bot msg-in';
        execWrapper.innerHTML = '';
        const body = document.createElement('div');
        body.className = 'msg-body';
        body.appendChild(execEl);
        execWrapper.appendChild(body);
        msgsEl.appendChild(execWrapper);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      });
    }
  }

  // 纯文本消息拦截：识别「找素材」意图 → 先在对话里预览结果，是否进 DesignHub 由用户手动确认
  chat.onUserText = async (text) => {
    // 参考规范优先（高于素材检索）：命中沉淀规则则直接按规范回复
    if (window.skillService && window.skillService.matchReferenceRuleLocally) {
      const localRule = window.skillService.matchReferenceRuleLocally(text);
      if (localRule && localRule.trim()) {
        chat.addMsg('user', text);
        await botSayPolished(localRule.trim());
        return true;
      }
    }
    if (!materialService.looksLikeSearch(text)) return false;
    // 未登录素材库：提示去配置，但不拦截
    if (!materialService.connected) {
      chat.addMsg('user', text);
      chat.addMsg('bot', '🎨 检测到你想找素材，但还没登录素材库。请到「API 接入 → 素材库 DesignHub」用公司账号登录后再试。');
      return true;
    }
    chat.addMsg('user', text);
    chat.sending = true;
    const typing = chat.showTyping('正在素材库检索...');
    try {
      // A. 车型图：有具体车型/别名 → 只发名称匹配的图；没有匹配则引导车型图库（绝不硬塞无关图）
      if (_looksLikeBikeImage(text)) {
        const mm = text.match(/[A-Za-z]\d{2,3}(?:\/[A-Za-z]?\d{2,3})?/);
        const am = text.match(/(云朵车|好运车|小蓝车|小白车|亲子车|校园车|助力车|电踏车|风行车|轻骑车|畅行车)/);
        const bikeKw = (mm && mm[0]) || (am && am[0]) || '';
        if (bikeKw) {
          const res = await materialService.search(bikeKw);
          typing.remove();
          if (res.needAuth) { materialService.logout(); chat.addMsg('bot', '⚠️ 素材库登录已过期，请到「API 接入 → 素材库」重新登录。'); chat.sending = false; return true; }
          const kw = bikeKw.toLowerCase();
          const hit = (res.items || []).filter(it => (it.name || '').toLowerCase().includes(kw));
          if (hit.length) {
            chat.addMaterialResult({ keyword: bikeKw, items: hit.slice(0, 6), total: hit.length, searchUrl: materialService.buildSearchUrl(bikeKw) });
          } else {
            await botSayPolished(`🚲 没在素材库找到「${bikeKw}」的车辆图。建议到「哈啰车型图库」按车型号查找👉 ${BIKE_LIBRARY_URL}`);
          }
          chat.sending = false; return true;
        }
        // 无具体车型 → 引导图库
        typing.remove();
        await botSayPolished(`🚲 找自行车图片素材，建议到「哈啰车型图库」按车型号查找哦👉 ${BIKE_LIBRARY_URL}`);
        chat.sending = false; return true;
      }

      // B. 通用检索：清噪音关键词 → 搜索 → 相关性过滤（避免把无关结果一股脑丢出来）
      let keyword = materialService.extractKeyword(text) || text;
      keyword = String(keyword)
        .replace(/(素材|图片|图|照片|渲染图|车辆|相关的?|一下|一张|一个|帮我|给我|请|看看|找一?下?|搜一?下?|的)/g, ' ')
        .replace(/\s+/g, ' ').trim() || keyword;
      const res = await materialService.search(keyword);
      typing.remove();
      if (res.needAuth) {
        materialService.logout();
        chat.addMsg('bot', '⚠️ 素材库登录已过期，请到「API 接入 → 素材库」重新登录。');
      } else if (!res.ok) {
        chat.addMsg('bot', '⚠️ 素材检索失败：' + (res.error || '未知错误'));
      } else {
        const { relevant, loose } = _filterRelevantMaterials(res.items || [], keyword);
        const items = relevant.slice(0, 6);
        if (!items.length) {
          await botSayPolished(`🎨 没找到「${keyword}」的匹配素材，可到 DesignHub 换个词搜👉 ${materialService.buildSearchUrl(keyword)}`);
        } else {
          if (loose) await botSayPolished(`没找到和「${keyword}」完全匹配的，下面这些可能相关，看看合适吗👇`);
          chat.addMaterialResult({
            keyword,
            items,
            total: loose ? items.length : (res.total || items.length),
            searchUrl: materialService.buildSearchUrl(keyword),
          });
        }
      }
    } catch (e) {
      typing.remove();
      chat.addMsg('bot', '⚠️ 素材检索异常：' + (e.message || e));
    }
    chat.sending = false;
    return true;
  };

  // 规范捕获：对话中"明确要求遵循某规范"→ 默认追加到「规范合集」技能；明确要求新建时才单独建，反馈到 UI
  ruleCaptureService.onCapture((skill, meta) => {
    pet.react('bounce');
    const isAppend = meta && meta.mode === 'append';
    const ruleName = (meta && meta.ruleName) || skill.name;
    // 顶部通知气泡（不依赖聊天面板是否打开）
    notif.pushText(isAppend
      ? `📚 已把「${ruleName}」规范追加到技能「${skill.name}」，可在技能中心查看/编辑`
      : `📐 已按要求新增规范技能「${skill.name}」，可在技能中心查看/编辑`);
    // 聊天内提示：避免在流式回复进行中写入 history 打乱顺序，等空闲再补一条
    const addNote = () => chat.addMsg(
      'bot',
      isAppend
        ? `📚 我已把你要求遵循的「${ruleName}」规范追加到技能「${skill.icon} ${skill.name}」里，之后可在「技能中心」直接调用～（如需单独成技能，说"新建一个技能"即可）`
        : `📐 我已把你要求遵循的规范整理成技能「${skill.icon} ${skill.name}」并保存，之后可在「技能中心」直接调用～`
    );
    if (chat.sending) {
      const timer = setInterval(() => {
        if (!chat.sending) { clearInterval(timer); addNote(); }
      }, 400);
      setTimeout(() => clearInterval(timer), 15000);   // 兜底：最多等 15s
    } else {
      addNote();
    }
  });

  // 快捷指令
  chat.onQuickCmd = async (id) => {
    // 获取当前对话的历史内容（排除 system），作为上下文
    const active = chatHistory.getActive();
    const chatMsgs = active ? active.messages.filter(m => m.role !== 'system') : [];
    const hasContext = chatMsgs.length > 0;

    // 把对话历史拼成文本，供 prompt 注入
    const chatContextText = chatMsgs.map(m => {
      const who = m.role === 'user' ? '用户' : 'AI';
      return `[${who}] ${m.content}`;
    }).join('\n');

    if (id === 'analyze') {
      if (!hasContext) {
        chat.addMsg('bot', '💡 当前对话是空的。请先粘贴一段需求消息，或从语雀读取文档后再点"需求分析"。');
        return;
      }
      const prompt = `你是哈啰出行两轮事业部的资深设计助手。请基于以下对话记录中的信息，输出结构化需求分析：

## 📋 需求摘要
## 🎯 关键目标
## 📱 涉及页面/活动
## 🎨 设计交付内容
## ❓ 需要确认的问题
## ✅ 下一步待办

---
对话记录：
${chatContextText}`;
      await chat.sendToAI('🔍 需求分析', prompt);

    } else if (id === 'summary') {
      if (!hasContext) {
        chat.addMsg('bot', '💡 当前对话是空的。请先输入或粘贴一些内容，再点"总结消息"。');
        return;
      }
      const prompt = `请基于以下对话记录，总结重点信息，按优先级列出需要处理的事项：\n\n${chatContextText}`;
      await chat.sendToAI('📝 总结对话', prompt);

    } else if (id === 'review') {
      await chat.sendToAI('🎨 生成设计复盘', '请帮我生成一份设计复盘模板，包含：项目背景、设计目标、方案亮点、数据表现、改进方向。用简洁结构化格式。');

    } else if (id === 'copy') {
      await chat.sendToAI('✍️ 营销活动文案', '请生成一组哈啰出行营销活动文案，要求活泼有趣、突出骑行场景、适合年轻用户，包含主标题+副标题+按钮文案。');

    } else if (id === 'todos') {
      if (!hasContext) {
        chat.addMsg('bot', '💡 当前对话是空的。请先粘贴一段消息或和 AI 聊一段需求，再点"转待办"提取行动项。');
        return;
      }

      chat.addMsg('user', '✅ 从当前对话提取待办');
      chat.sending = true;
      const typing = chat.addMsg('bot typing', '正在提取行动项...');

      const prompt = `请从下面的对话记录中提取出所有"需要做的事项"和"行动项"。包括但不限于：明确提到的任务、下一步计划、需要确认的事项、需要交付的内容、需要跟进的进度。按优先级排序。如果对话中包含排期计划、设计交付内容或时间节点，也要提取为待办。

仅输出严格 JSON 数组，不要任何额外说明、markdown 标记或注释，格式：
[{"title":"...","priority":"high|medium|low","deadline":"YYYY-MM-DD HH:mm 或 null"}]

如果确实没有可提取的事项，返回空数组 []。

对话记录：
${chatContextText}`;

      try {
        const reply = await window.aiService.send([
          { role: 'system', content: '你是一个高效的待办提取助手，只输出 JSON。' },
          { role: 'user', content: prompt }
        ]);
        typing.remove();
        const list = parseTodoJSON(reply);
        if (list.length === 0) {
          chat.addMsg('bot', '💡 没有从对话中提取到待办事项。\n\n可能原因：对话内容中没有明确的行动项或时间节点。\n\n建议：尝试先用"需求分析"生成结构化的下一步待办，再点"转待办"提取。');
        } else {
          const created = todoService.createBatch(list.map(it => ({
            title: it.title,
            priority: it.priority || 'medium',
            deadline: it.deadline ? Date.parse(it.deadline) : null,
            fromChat: '对话提取',
          })));
          const summary = created.map((t, i) => `${i + 1}. ${t.title}${t.deadline ? `（${window.TodoUtils.formatDeadline(t.deadline)}）` : ''}`).join('\n');
          chat.addMsg('bot', `✅ 已提取 ${created.length} 条待办并加入清单：\n${summary}\n\n👉 点击 dock 上的 ✅ 查看`);
        }
      } catch (e) {
        typing.remove();
        chat.addMsg('bot', '⚠️ ' + (e.message || '提取失败'));
      }
      chat.sending = false;
    }

    // 「生成视觉图」快捷指令
    else if (id === 'visual') {
      if (!hasContext) {
        chat.addMsg('bot', '💡 请先输入设计需求、总结文档或粘贴改图反馈，再点「生成视觉图」。');
        return;
      }
      // 基于当前对话上下文做需求分类
      chat.addMsg('user', '🖼️ 基于当前对话生成视觉图');
      const classification = await visualGenService.classifyDemand(chatContextText);
      const cardData = window.DemandCard.buildData({
        source: 'user',
        sourceLabel: '当前对话',
        aiSummary: chatContextText.slice(0, 300),
        classification,
      });
      _renderDemandCard(cardData);
    }
  };

  // 关于
  function showAbout() {
    closeAll(); chat.open();
    chat.addMsg('bot', '🐾 哈啰桌面助手 v1.0.0\n\n定位：视觉设计师的桌面工作助手\n团队：哈啰两轮设计中心\n\n功能：AI 问答 · 钉钉消息 · 语雀文档 · 需求分析');
  }

  // 点击空白区域关闭所有面板
  document.addEventListener('mousedown', (e) => {
    // 图片放大预览打开时，点击只关闭预览，不关闭面板
    const lightbox = document.getElementById('imgLightbox');
    if (lightbox && lightbox.classList.contains('open')) return;
    // 点击在 lightbox 元素上时也跳过（防止冒泡误关）
    if (e.target.closest('.img-lightbox')) return;

    const isInside = e.target.closest('.panel') ||
                     e.target.closest('.quick-dock') ||
                     e.target.closest('.ctx-menu') ||
                     e.target.closest('.pet-area') ||
                     e.target.closest('.notify-bubble') ||
                     e.target.closest('.hover-bubble') ||
                     e.target.closest('.daily-brief');
    if (!isInside) {
      closeAll();
      if (menu.visible) menu.hide();
      if (briefCard.visible) briefCard.hide();
    }
  });

  // 监听主进程的窗口失焦事件（兜底关闭）
  ipcRenderer.on('window-blurred', () => {
    // 文件选择器打开期间不关闭面板（AI 或钉钉）
    if (chat._fileDialogOpen || dt._dtFileDialogOpen) return;
    closeAll();
    if (menu.visible) menu.hide();
  });

  // ===== 图片放大预览 + 下载 =====
  (function initImageLightbox() {
    const lightbox = document.getElementById('imgLightbox');
    const lightboxImg = document.getElementById('imgLightboxImg');
    const closeBtn = document.getElementById('imgLightboxClose');
    const downloadBtn = document.getElementById('imgLightboxDownload');
    let currentSrc = '';

    // 点击对话区中的图片 → 放大
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.msg-body .md-img, .msg-body img.msg-inline-img, .dt-msg-img');
      if (img && img.src) {
        currentSrc = img.src;
        lightboxImg.src = img.src;
        lightbox.classList.add('open');
      }
    });

    // 关闭
    const closeLightbox = () => lightbox.classList.remove('open');
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      // 点击遮罩或图片本身都关闭
      if (e.target === lightbox || e.target === lightboxImg) closeLightbox();
    });

    // 下载
    downloadBtn.addEventListener('click', async () => {
      if (!currentSrc) return;
      downloadBtn.textContent = '⏳ 保存中...';
      const name = `hellobike_${Date.now()}.png`;
      const res = await ipcRenderer.invoke('save-image', { imageUrl: currentSrc, suggestedName: name });
      if (res.ok) {
        downloadBtn.textContent = '✅ 已保存';
        setTimeout(() => { downloadBtn.textContent = '⬇ 下载图片'; }, 1500);
      } else {
        downloadBtn.textContent = '⚠️ ' + (res.error || '保存失败');
        setTimeout(() => { downloadBtn.textContent = '⬇ 下载图片'; }, 2000);
      }
    });
  })();

  // 面板关闭按钮统一处理
  document.addEventListener('panel-close-all', () => {
    closeAll();
  });

  // 窗口失去焦点时关闭所有（切换到其他应用）
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (!document.hasFocus() && !chat._fileDialogOpen && !dt._dtFileDialogOpen) {
        if (chat.isOpen) chat.close();
        if (dt.isOpen) dt.close();
        if (yq.isOpen) yq.close();
        if (todos.isOpen) todos.close();
        if (workspace.isOpen) workspace.close();
        if (apiPanel.isOpen) apiPanel.close();
        if (prefPanel.isOpen) prefPanel.close();
        if (dock.isOpen) dock.close();
      }
    }, 600);
  });

  init();
})();
