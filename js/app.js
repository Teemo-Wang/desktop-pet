/**
 * 主入口 - 初始化各模块
 */

(function() {
  const { ipcRenderer } = require('electron');

  // 初始化各模块
  window.aiService = new window.AIService();

  const pet = new window.Pet();
  const chat = new window.ChatPanel();
  const menu = new window.ContextMenu();
  const settings = new window.SettingsPanel();
  const dingtalk = new window.DingTalkPanel();
  const yuque = new window.YuquePanel();
  const notifier = new window.NotificationManager();
  const analyzer = new window.RequirementAnalyzer();

  // 注入语雀服务给分析器
  analyzer.setYuqueService(yuque.service);

  // 初始化
  async function init() {
    // AI Service 配置
    const modelCfg = settings.getSettings().model;
    window.aiService.configure(modelCfg);
    chat.init(modelCfg.systemPrompt);

    // 通知管理器配置
    const workCfg = settings.getSettings().work;
    notifier.configure(workCfg);

    // 通知回调
    notifier.onBadgeUpdate = (count) => {
      menu.updateBadge('dingtalk', count);
    };

    notifier.onPetReaction = (type) => {
      triggerPetReaction();
    };

    // 启动轮询（使用钉钉服务获取未读数）
    notifier.startPolling(async () => {
      return dingtalk.getUnreadCount();
    });

    // 初始未读数
    const unreadCount = await dingtalk.getUnreadCount();
    menu.updateBadge('dingtalk', unreadCount);

    // 通知未读数
    const notifs = await window.MockAPI.getNotifications();
    menu.updateBadge('notifications', notifs.length);

    // 应用初始设置
    const general = settings.getSettings().general;
    ipcRenderer.send('toggle-always-on-top', general.alwaysOnTop);

    // 模拟：3秒后触发一次新消息提醒（演示效果）
    setTimeout(() => {
      notifier._onNewMessages(3);
    }, 3000);
  }

  // 桌宠动作反馈
  function triggerPetReaction() {
    const petImg = document.querySelector('.pet-image');
    if (!petImg) return;

    const reaction = settings.getSettings().appearance.messageReaction || 'bounce';
    const cls = 'reaction-' + reaction;

    petImg.classList.add(cls);
    setTimeout(() => petImg.classList.remove(cls), 800);
  }

  // 关闭所有面板
  function closeAllPanels() {
    if (chat.isOpen) chat.close();
    if (settings.isOpen) settings.close();
    if (dingtalk.isOpen) dingtalk.close();
    if (yuque.isOpen) yuque.close();
    const infoPanel = document.getElementById('infoPanel');
    if (infoPanel) infoPanel.classList.remove('open');
  }

  // Pet 事件
  pet.onClick = () => {
    // 如果有通知气泡，点击后打开钉钉
    const notifyBubble = document.getElementById('notifyBubble');
    if (notifyBubble && notifyBubble.classList.contains('visible')) {
      notifyBubble.classList.remove('visible');
      closeAllPanels();
      dingtalk.open();
      return;
    }

    if (settings.isOpen) { settings.close(); return; }
    if (dingtalk.isOpen) { dingtalk.close(); return; }
    if (yuque.isOpen) { yuque.close(); return; }
    chat.toggle();
    if (chat.isOpen) pet.setBubbleVisible(false);
  };

  pet.onRightClick = (x, y) => {
    menu.show(x, y);
  };

  // 菜单动作
  menu.onAction = (action) => {
    closeAllPanels();

    switch (action) {
      case 'ai-chat': chat.open(); break;
      case 'dingtalk': dingtalk.open(); break;
      case 'yuque': yuque.open(); break;
      case 'notifications': showPanel('notifications'); break;
      case 'settings': settings.open(); break;
      case 'about': showAbout(); break;
      case 'quit': ipcRenderer.send('quit-app'); break;
    }
  };

  // 通用信息面板
  async function showPanel(type) {
    let html = '';
    if (type === 'yuque') {
      const docs = await window.MockAPI.getYuqueDocuments();
      html = `<div class="panel-header">📄 语雀文档</div>` + docs.map(d =>
        `<div class="panel-item"><div class="panel-item-title">${d.title}</div><div class="panel-item-meta">${d.author} · ${d.updatedAt}</div></div>`
      ).join('');
    } else if (type === 'notifications') {
      const ns = await window.MockAPI.getNotifications();
      html = `<div class="panel-header">🔔 消息提醒</div>` + ns.map(n =>
        `<div class="panel-item"><div class="panel-item-title">${n.title}</div><div class="panel-item-desc">${n.content}</div><div class="panel-item-time">${n.time}</div></div>`
      ).join('');
    }
    renderInfoPanel(html);
  }

  function showAbout() {
    const a = window.MockData.about;
    renderInfoPanel(`<div class="panel-header">ℹ️ 关于</div><div class="about-content"><div class="about-name">${a.name}</div><div class="about-version">v${a.version}</div><div class="about-desc">${a.description}</div><div class="about-author">${a.author}</div></div>`);
  }

  function renderInfoPanel(content) {
    let panel = document.getElementById('infoPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'infoPanel';
      panel.className = 'info-panel';
      document.querySelector('.app').appendChild(panel);
    }
    panel.innerHTML = `<div class="info-panel-close" id="infoPanelClose">✕</div><div class="info-panel-content">${content}</div>`;
    panel.classList.add('open');
    document.getElementById('infoPanelClose').addEventListener('click', () => panel.classList.remove('open'));
  }

  // 语雀文档发送给 AI 总结
  document.addEventListener('yuque-to-ai', (e) => {
    const { title, content } = e.detail;
    closeAllPanels();
    chat.open();
    const prompt = `请帮我总结以下语雀文档的核心内容，提炼重点：\n\n【文档标题】${title}\n\n【文档内容】\n${content}`;
    chat.history.push({ role: 'user', content: prompt });
    chat._append('user', '🤖 请总结文档：' + title);
    chat.isSending = true;
    const typing = chat._append('assistant typing', '正在阅读文档...');
    window.aiService.sendMessage(chat.history).then(reply => {
      typing.remove();
      chat._append('assistant', reply);
      chat.history.push({ role: 'assistant', content: reply });
      chat.isSending = false;
    }).catch(err => {
      typing.remove();
      chat._append('assistant', err.message);
      chat.isSending = false;
    });
  });

  // 钉钉消息操作（总结/需求分析）
  document.addEventListener('dingtalk-action', async (e) => {
    const { action, conversation } = e.detail;
    closeAllPanels();
    chat.open();

    if (action === 'summarize') {
      // 简单总结
      const msgText = conversation.messages.map(m => `${m.sender}: ${m.content}`).join('\n');
      const prompt = `请帮我总结以下钉钉消息的重点：\n\n【来自：${conversation.chatName}】\n${msgText}`;
      chat.history.push({ role: 'user', content: prompt });
      chat._append('user', '📝 总结消息：' + conversation.chatName);
    } else if (action === 'analyze') {
      // 需求分析（打通语雀）
      chat._append('user', '🔍 需求分析：' + conversation.chatName);
      const typing = chat._append('assistant typing', '正在分析需求，检测关联文档...');
      chat.isSending = true;

      try {
        const result = await analyzer.analyzeFromConversation(conversation);

        if (result.yuqueLinks.length > 0) {
          typing.textContent = '已读取 ' + result.yuqueLinks.length + ' 篇关联文档，正在分析...';
        } else {
          typing.textContent = '正在分析需求...';
        }

        chat.history.push({ role: 'user', content: result.prompt });
        const reply = await window.aiService.sendMessage(chat.history);
        typing.remove();
        chat._append('assistant', reply);
        chat.history.push({ role: 'assistant', content: reply });
      } catch (err) {
        typing.remove();
        chat._append('assistant', '⚠️ 分析失败：' + err.message);
      }

      chat.isSending = false;
      return;
    }

    // 总结流程
    chat.isSending = true;
    const typing = chat._append('assistant typing', '思考中...');
    try {
      const reply = await window.aiService.sendMessage(chat.history);
      typing.remove();
      chat._append('assistant', reply);
      chat.history.push({ role: 'assistant', content: reply });
    } catch (err) {
      typing.remove();
      chat._append('assistant', err.message);
    }
    chat.isSending = false;
  });

  init();
})();
