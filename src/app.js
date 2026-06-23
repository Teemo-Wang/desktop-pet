/**
 * 主入口 — 初始化并协调所有模块
 */
(function() {
  const { ipcRenderer } = require('electron');

  // Services
  window.aiService = new window.AIService();
  const dtService = new window.DingTalkService();
  const yqService = new window.YuqueService();
  const store = new window.SettingsStore();
  const takeover = new window.AITakeoverService();
  const skillService = new window.SkillService();
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
  const apiPanel = new window.APIConnectComponent(document.getElementById('apiPanel'), { ai: window.aiService, dingtalk: dtService, yuque: yqService }, store);
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

    // 模拟新消息提醒（3秒后钉钉，8秒后语雀）
    setTimeout(() => {
      notif.pushDingtalk({ sender: '张三（产品）', content: '新车上线需求文档已更新，麻烦看下', chatName: '张三' });
      pet.react('bounce');
    }, 3000);

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

    setTimeout(() => {
      notif.pushYuque({ title: '2026 Q2 设计规范更新', author: '设计组' });
    }, 10000);
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
          const reply = await takeover.generateReply(conv);
          chat.addReplyCard(conv.id, conv.name, reply, (finalText) => {
            // 用户点直接回复 → 写入钉钉会话 + 反馈
            dt.sendReply(conv.id, finalText);
            statsService.increment('messageHandled');
            pet.react('bounce');
            notif.pushText(`已回复「${conv.name}」`);
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

    // 需求分析
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
  yq.onSendToAI = (title, content) => {
    if (yq.isOpen) yq.close();
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
