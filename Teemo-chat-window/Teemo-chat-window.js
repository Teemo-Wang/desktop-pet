(function() {
  const { shell, ipcRenderer } = require('electron');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const UPLOAD_DIR = path.join(
    path.resolve(process.env.TEEMO_ASSISTANT_DATA_DIR || path.join(os.homedir(), '.hellobike-pet')),
    'uploads',
  );

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
  const MAX_FILE_TEXT = 60000;
  const MAX_TOTAL_TEXT = 120000;
  const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.log', '.html', '.css', '.js', '.ts', '.jsx', '.tsx',
    '.py', '.java', '.c', '.cpp', '.h', '.yaml', '.yml', '.xml', '.sql', '.sh', '.ps1',
  ]);

  const store = new window.SettingsStore();
  const skills = new window.SkillService();
  const history = new window.ChatHistoryService();
  const ai = new window.AIService();
  const cognitionService = window.TeemoCognitionService ? new window.TeemoCognitionService() : null;
  const cognitionCollector = window.TeemoCognitionCollector && cognitionService
    ? new window.TeemoCognitionCollector({ cognitionService })
    : null;
  const contextBuilder = window.TeemoContextBuilder && cognitionService
    ? new window.TeemoContextBuilder({ cognitionService })
    : null;
  const creativeProfileService = window.TeemoCreativeProfileService
    ? new window.TeemoCreativeProfileService()
    : null;
  const creativeContextBuilder = window.TeemoCreativeContextBuilder && creativeProfileService
    ? new window.TeemoCreativeContextBuilder({ profileService: creativeProfileService })
    : null;
  const creativeDirectorState = window.TeemoCreativeDirectorSessionState
    ? new window.TeemoCreativeDirectorSessionState()
    : null;
  const challengeContextBuilder = window.TeemoChallengeContextBuilder && creativeDirectorState && creativeProfileService
    ? new window.TeemoChallengeContextBuilder({ profileService: creativeProfileService, sessionState: creativeDirectorState })
    : null;
  window.teemoCreativeDirectorState = creativeDirectorState;
  window.teemoChallengeContextBuilder = challengeContextBuilder;
  const permissionClient = window.TeemoPermissionClient ? new window.TeemoPermissionClient({ ipcRenderer }) : null;
  const fileClient = window.TeemoFileClient ? new window.TeemoFileClient({ ipcRenderer }) : null;
  const gitClient = window.TeemoGitClient ? new window.TeemoGitClient({ ipcRenderer }) : null;
  const executeClient = window.TeemoExecuteClient ? new window.TeemoExecuteClient({ ipcRenderer }) : null;
  const toolRegistry = window.TeemoBuiltinTools ? window.TeemoBuiltinTools.createRegistry({
    permissionService: permissionClient,
  }) : null;
  if (toolRegistry && window.TeemoFileTools && fileClient) {
    window.TeemoFileTools.register(toolRegistry, { fileClient });
  }
  if (toolRegistry && window.TeemoGitTools && gitClient) {
    window.TeemoGitTools.register(toolRegistry, { gitClient });
  }
  if (toolRegistry && window.TeemoExecuteTools && executeClient) {
    window.TeemoExecuteTools.register(toolRegistry, { executeClient });
  }
  window.teemoPermissionClient = permissionClient;
  window.teemoFileClient = fileClient;
  window.teemoGitClient = gitClient;
  window.teemoExecuteClient = executeClient;
  window.teemoToolRegistry = toolRegistry;
  const skillManifestService = window.TeemoSkillManifestService ? new window.TeemoSkillManifestService({ skillService: skills }) : null;
  const skillSessionState = window.TeemoSkillSessionState ? new window.TeemoSkillSessionState() : null;
  const skillRouter = window.TeemoSkillRouter && skillManifestService ? new window.TeemoSkillRouter({
    manifestService: skillManifestService,
    sessionState: skillSessionState,
    toolRegistry,
  }) : null;
  const skillComposer = window.TeemoSkillComposer && skillManifestService
    ? new window.TeemoSkillComposer({ manifestService: skillManifestService })
    : null;
  window.skillManifestService = skillManifestService;
  window.skillSessionState = skillSessionState;
  window.skillRouter = skillRouter;
  window.skillComposer = skillComposer;
  const agentCore = window.TeemoAgentCore ? new window.TeemoAgentCore({
    aiService: ai,
    contextBuilder,
    creativeContextBuilder,
    challengeContextBuilder,
    cognitionCollector,
    toolRegistry,
    skillRouter,
    skillComposer,
  }) : null;
  const ruleCapture = window.RuleCaptureService ? new window.RuleCaptureService(skills, ai) : null;
  const comfyui = new window.TeemoComfyUIService(store);
  window.comfyUIService = comfyui;
  const audioAnalysis = new window.TeemoAudioAnalysisService(store);
  const fileService = new window.TeemoFileService();
  const projectService = window.ProjectService ? new window.ProjectService() : null;

  const els = {
    history: document.getElementById('historyList'),
    messages: document.getElementById('messageList'),
    scrollBottom: document.getElementById('scrollBottomButton'),
    title: document.getElementById('chatTitle'),
    status: document.getElementById('chatStatus'),
    model: document.getElementById('modelLabel'),
    quickModel: document.getElementById('quickModelSelect'),
    quickModelButton: document.getElementById('quickModelButton'),
    quickModelLabel: document.getElementById('quickModelLabel'),
    quickModelMenu: document.getElementById('quickModelMenu'),
    contextMeter: document.getElementById('contextMeter'),
    input: document.getElementById('messageInput'),
    send: document.getElementById('sendButton'),
    upload: document.getElementById('uploadButton'),
    localDocument: document.getElementById('localDocumentButton'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    attachments: document.getElementById('attachmentList'),
    newChat: document.getElementById('newChatButton'),
    newFolder: document.getElementById('newFolderButton'),
    clearChat: document.getElementById('clearChatButton'),
    renameChat: document.getElementById('renameChatButton'),
    renameModal: document.getElementById('renameModal'),
    renameInput: document.getElementById('renameInput'),
    renameSave: document.getElementById('renameSaveButton'),
    renameCancel: document.getElementById('renameCancelButton'),
    folderModal: document.getElementById('folderModal'),
    folderModalTitle: document.getElementById('folderModalTitle'),
    folderModalTip: document.getElementById('folderModalTip'),
    folderInput: document.getElementById('folderInput'),
    folderSave: document.getElementById('folderSaveButton'),
    folderCancel: document.getElementById('folderCancelButton'),
    confirmModal: document.getElementById('confirmModal'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalTip: document.getElementById('confirmModalTip'),
    confirmOk: document.getElementById('confirmOkButton'),
    confirmCancel: document.getElementById('confirmCancelButton'),
    settingsButton: document.getElementById('settingsButton'),
    settingsBack: document.getElementById('settingsBackButton'),
    memoryButton: document.getElementById('memoryButton'),
    memoryBack: document.getElementById('memoryBackButton'),
    creativeButton: document.getElementById('TeemoCreativeButton'),
    chatView: document.getElementById('chatView'),
    settingsView: document.getElementById('settingsView'),
    memoryView: document.getElementById('memoryView'),
    creativeView: document.getElementById('TeemoCreativeView'),
    challengeQuick: document.getElementById('TeemoChallengeQuickButton'),
    challengeQuickLabel: document.getElementById('TeemoChallengeQuickLabel'),
    directorBalanced: document.getElementById('TeemoDirectorBalanced'),
    directorChallenge: document.getElementById('TeemoDirectorChallenge'),
    directorIntensity: document.getElementById('TeemoDirectorIntensity'),
    directorStatus: document.getElementById('TeemoDirectorStatus'),
    chatFontSize: document.getElementById('chatFontSize'),
    chatFontSizeValue: document.getElementById('chatFontSizeValue'),
    chatFontPreview: document.getElementById('chatFontPreview'),
    chatFontStatus: document.getElementById('chatFontStatus'),
    resetChatFont: document.getElementById('resetChatFontButton'),
    appVersionLabel: document.getElementById('appVersionLabel'),
    checkUpdate: document.getElementById('checkUpdateButton'),
    updateCheckStatus: document.getElementById('updateCheckStatus'),
    localAccessStatus: document.getElementById('localAccessStatus'),
    localAccessList: document.getElementById('localAccessList'),
    addLocalAccess: document.getElementById('addLocalAccessButton'),
    apiProvider: document.getElementById('apiProvider'),
    apiRemarkName: document.getElementById('apiRemarkName'),
    apiModelName: document.getElementById('apiModelName'),
    apiBaseUrl: document.getElementById('apiBaseUrl'),
    apiKey: document.getElementById('apiKey'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    saveApi: document.getElementById('saveApiButton'),
    testApi: document.getElementById('testApiButton'),
    newApi: document.getElementById('newApiButton'),
    pauseApi: document.getElementById('pauseApiButton'),
    deleteApi: document.getElementById('deleteApiButton'),
    imageIntentAi: document.getElementById('imageIntentAi'),
    imageIntentKeyword: document.getElementById('imageIntentKeyword'),
    webBrowseEnabled: document.getElementById('webBrowseEnabled'),
    apiSaveStatus: document.getElementById('apiSaveStatus'),
    apiConnections: document.getElementById('apiConnectionList'),
    apiFormCollapse: document.getElementById('apiFormCollapse'),
    imageApiFormCollapse: document.getElementById('imageApiFormCollapse'),
    imageApiLabel: document.getElementById('imageApiLabel'),
    imageApiModelName: document.getElementById('imageApiModelName'),
    imageApiSize: document.getElementById('imageApiSize'),
    imageApiBaseUrl: document.getElementById('imageApiBaseUrl'),
    imageApiKey: document.getElementById('imageApiKey'),
    toggleImageApiKey: document.getElementById('toggleImageApiKey'),
    testImageApi: document.getElementById('testImageApiButton'),
    saveImageApi: document.getElementById('saveImageApiButton'),
    imageApiSaveStatus: document.getElementById('imageApiSaveStatus'),
    audioAnalysisEnabled: document.getElementById('audioAnalysisEnabled'),
    audioAnalysisModel: document.getElementById('audioAnalysisModel'),
    audioTranscriptionModel: document.getElementById('audioTranscriptionModel'),
    audioApiBaseUrl: document.getElementById('audioApiBaseUrl'),
    audioApiKey: document.getElementById('audioApiKey'),
    toggleAudioApiKey: document.getElementById('toggleAudioApiKey'),
    saveAudioApi: document.getElementById('saveAudioApiButton'),
    audioApiSaveStatus: document.getElementById('audioApiSaveStatus'),
    comfyEnabled: document.getElementById('comfyEnabled'),
    comfyBaseUrl: document.getElementById('comfyBaseUrl'),
    comfyCheckpoint: document.getElementById('comfyCheckpoint'),
    comfyWidth: document.getElementById('comfyWidth'),
    comfyHeight: document.getElementById('comfyHeight'),
    comfySteps: document.getElementById('comfySteps'),
    comfyCfg: document.getElementById('comfyCfg'),
    comfyNegativePrompt: document.getElementById('comfyNegativePrompt'),
    comfySaveStatus: document.getElementById('comfySaveStatus'),
    comfyConnectionStatus: document.getElementById('comfyConnectionStatus'),
    testComfy: document.getElementById('testComfyButton'),
    saveComfy: document.getElementById('saveComfyButton'),
    comfyWorkflowSelect: document.getElementById('comfyWorkflowSelect'),
    comfyWorkflowSummary: document.getElementById('comfyWorkflowSummary'),
    importComfyWorkflow: document.getElementById('importComfyWorkflowButton'),
    deleteComfyWorkflow: document.getElementById('deleteComfyWorkflowButton'),
    comfyWorkflowFileInput: document.getElementById('comfyWorkflowFileInput'),
    archiveEnabled: document.getElementById('archiveEnabled'),
    archiveDir: document.getElementById('archiveDir'),
    comfyOutputDir: document.getElementById('comfyOutputDir'),
    openComfyOutput: document.getElementById('openComfyOutputButton'),
    openArchiveDir: document.getElementById('openArchiveDirButton'),
    newSkillGroup: document.getElementById('newSkillGroupButton'),
    newSkill: document.getElementById('newSkillButton'),
    importSkill: document.getElementById('importSkillButton'),
    skillFileInput: document.getElementById('skillFileInput'),
    skillList: document.getElementById('skillList'),
    skillSaveStatus: document.getElementById('skillSaveStatus'),
  };

  let pendingFiles = [];
  let sending = false;
  let abortController = null;
  let dragDepth = 0;
  let selectedSkillId = null;
  let creatingSkill = false;
  let skillDraft = { name: '', icon: '⭐', desc: '', content: '' };
  const SKILL_GROUP_OPEN_STATE_KEY = 'teemo.skillGroupOpenState.v1';
  const skillGroupOpenState = new Map();
  let ungroupedSkillGroupOpen = true;

  function loadSkillGroupOpenState() {
    try {
      const saved = JSON.parse(localStorage.getItem(SKILL_GROUP_OPEN_STATE_KEY) || '{}');
      if (Array.isArray(saved.groups)) {
        saved.groups.forEach(entry => {
          if (Array.isArray(entry) && entry.length === 2 && typeof entry[1] === 'boolean') {
            skillGroupOpenState.set(String(entry[0]), entry[1]);
          }
        });
      }
      if (typeof saved.ungrouped === 'boolean') ungroupedSkillGroupOpen = saved.ungrouped;
    } catch (error) {
      console.warn('[SkillGroups] load open state failed:', error);
    }
  }

  function persistSkillGroupOpenState() {
    try {
      localStorage.setItem(SKILL_GROUP_OPEN_STATE_KEY, JSON.stringify({
        groups: [...skillGroupOpenState.entries()],
        ungrouped: ungroupedSkillGroupOpen,
      }));
    } catch (error) {
      console.warn('[SkillGroups] save open state failed:', error);
    }
  }

  loadSkillGroupOpenState();
  let modelConfig = store.get('model') || {};
  let systemPrompt = skills.getRules() || modelConfig.systemPrompt || '';
  ai.configure({ ...modelConfig, systemPrompt });
  ai.imageConfig = store.get('imageModel') || {};
  els.model.textContent = modelConfig.modelName || '私人助理';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function fileExtension(file) {
    return path.extname(file.name || '').toLowerCase();
  }

  function isImage(file) {
    return /^image\//i.test(file.type || '') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|tiff?)$/i.test(file.name || '');
  }

  function isVideo(file) {
    return /^video\/(mp4|quicktime)$/i.test(file.type || '') || /\.(mp4|mov)$/i.test(file.name || '');
  }

  function isSupported(file) {
    const ext = fileExtension(file);
    return isImage(file) || isVideo(file) || TEXT_EXTENSIONS.has(ext) || ext === '.pdf' || ext === '.docx';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        let dataUrl = String(reader.result || '');
        if (isVideo(file) && !/^data:video\//i.test(dataUrl)) {
          const mime = /\.mov$/i.test(file.name || '') ? 'video/quicktime' : 'video/mp4';
          dataUrl = dataUrl.replace(/^data:[^;,]*/i, `data:${mime}`);
        }
        resolve(dataUrl);
      };
      reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  async function readFile(file) {
    const maxSize = isVideo(file) ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > maxSize) throw new Error(isVideo(file) ? '视频超过 100 MB' : '文件超过 15 MB');
    const ext = fileExtension(file);
    if (isImage(file)) {
      return { kind: 'image', dataUrl: await fileToDataUrl(file), content: '' };
    }
    if (isVideo(file)) {
      return { kind: 'video', dataUrl: await fileToDataUrl(file), content: '' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedByService = await fileService.readBuffer(buffer, file.name, file.size);
    return { kind: 'document', content: parsedByService.content, dataUrl: '' };
  }

  async function addFiles(files) {
    const list = Array.from(files || []);
    for (const file of list) {
      if (!isSupported(file)) {
        setStatus(`不支持 ${file.name}，请选择图片、MP4/MOV、文本、PDF 或 DOCX`, true);
        continue;
      }
      const maxSize = isVideo(file) ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
      if (file.size > maxSize) {
        setStatus(`${file.name} 超过 ${isVideo(file) ? '100' : '15'} MB`, true);
        continue;
      }
      const attachment = {
        id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        file,
        name: file.name,
        size: file.size,
        kind: isImage(file) ? 'image' : isVideo(file) ? 'video' : 'document',
        state: 'reading',
        dataUrl: '',
        content: '',
        error: '',
      };
      pendingFiles.push(attachment);
      renderAttachments();
      try {
        Object.assign(attachment, await readFile(file), { state: 'ready' });
      } catch (error) {
        attachment.state = 'error';
        attachment.error = error.message || '读取失败';
      }
      renderAttachments();
    }
    if (pendingFiles.some(file => file.state === 'ready')) setStatus('文件读取完成，可以发送');
    els.input.focus();
  }

  function addParsedLocalDocument(result) {
    const attachment = {
      id: 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      file: { name: result.name },
      name: result.name,
      path: result.path,
      size: result.size || 0,
      kind: 'document',
      state: 'ready',
      dataUrl: '',
      content: result.content || '',
      error: '',
    };
    pendingFiles.push(attachment);
    renderAttachments();
    setStatus(`已读取本地文档：${result.name}`);
    els.input.focus();
  }

  async function authorizeLocalFolder() {
    const result = await ipcRenderer.invoke('teemo:local-access-add');
    if (result && result.ok) {
      if (els.localAccessStatus) els.localAccessStatus.textContent = `已授权：${result.selected}`;
      await renderLocalAccess();
      return true;
    }
    if (result && !result.canceled) {
      const message = result.error || '授权失败';
      if (els.localAccessStatus) els.localAccessStatus.textContent = message;
      setStatus(message, true);
    }
    return false;
  }

  async function renderLocalAccess() {
    if (!els.localAccessList) return;
    const result = await ipcRenderer.invoke('teemo:local-access-list');
    const roots = result && result.ok && Array.isArray(result.roots) ? result.roots : [];
    if (!roots.length) {
      els.localAccessList.innerHTML = '<div class="teemo-local-access-empty">尚未授权文件夹</div>';
      return;
    }
    els.localAccessList.innerHTML = roots.map((root, index) => `
      <div class="teemo-local-access-item">
        <span title="${escapeHtml(root)}">${escapeHtml(root)}</span>
        <button class="teemo-secondary-button teemo-danger-button" type="button" data-local-access-remove="${index}">取消授权</button>
      </div>`).join('');
    els.localAccessList.querySelectorAll('[data-local-access-remove]').forEach(button => {
      button.addEventListener('click', async () => {
        const rootPath = roots[Number(button.dataset.localAccessRemove)];
        const confirmed = await askConfirm('取消本地文件权限', `Teemo 将不能再读取：${rootPath}`);
        if (!confirmed) return;
        const removed = await ipcRenderer.invoke('teemo:local-access-remove', { rootPath });
        if (els.localAccessStatus) els.localAccessStatus.textContent = removed && removed.ok ? '已取消授权' : (removed.error || '取消失败');
        await renderLocalAccess();
      });
    });
  }

  async function pickLocalDocument() {
    let result = await ipcRenderer.invoke('teemo:local-pick-document');
    if (result && result.needsAuthorization) {
      const authorized = await authorizeLocalFolder();
      if (!authorized) return;
      result = await ipcRenderer.invoke('teemo:local-pick-document');
    }
    if (result && result.ok) {
      addParsedLocalDocument(result);
      return;
    }
    if (result && !result.canceled) setStatus(result.error || '本地文档读取失败', true);
  }

  function extractLocalDocumentPath(text) {
    const extensions = '(?:txt|md|json|csv|log|html|css|js|ts|jsx|tsx|py|java|c|cpp|h|yaml|yml|xml|sql|sh|ps1|pdf|docx)';
    const quoted = String(text || '').match(new RegExp('["“\']([A-Za-z]:\\\\[^"”\'\\r\\n]+?\\.' + extensions + ')["”\']', 'i'));
    if (quoted) return quoted[1];
    const trailing = String(text || '').match(new RegExp('([A-Za-z]:\\\\[^\\r\\n]+?\\.' + extensions + ')\\s*$', 'i'));
    return trailing ? trailing[1].trim() : '';
  }

  async function attachLocalDocumentFromText(text) {
    const filePath = extractLocalDocumentPath(text);
    if (!filePath) return true;
    const result = await ipcRenderer.invoke('teemo:local-read-document', { filePath });
    if (!result || !result.ok) {
      setStatus((result && result.error) || '无法读取本地文档', true);
      return false;
    }
    addParsedLocalDocument(result);
    return true;
  }

  /** 从剪贴板提取图片（截图 / 复制图片后 Ctrl+V） */
  function collectClipboardImages(clipboardData) {
    if (!clipboardData) return [];
    const images = [];
    const seen = new Set();
    const pushFile = (file, index = 0) => {
      if (!file || !isImage(file)) return;
      // 用类型+大小去重，避免 items/files 两条通道各来一份
      const key = `${file.type || ''}:${file.size || 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ext = (file.type && file.type.split('/')[1]) || 'png';
      const name = file.name && file.name !== 'image.png' && file.name !== 'blob'
        ? file.name
        : `粘贴图片_${Date.now()}_${index + 1}.${ext === 'jpeg' ? 'jpg' : ext}`;
      images.push(new File([file], name, { type: file.type || 'image/png', lastModified: Date.now() }));
    };

    // 优先 files；没有再用 items（两者常是同一张图，不要两边都扫）
    const files = clipboardData.files ? Array.from(clipboardData.files).filter(isImage) : [];
    if (files.length) {
      files.forEach((file, index) => pushFile(file, index));
      return images;
    }

    const items = clipboardData.items ? Array.from(clipboardData.items) : [];
    items.forEach((item, index) => {
      if (item.kind === 'file' && /^image\//i.test(item.type || '')) {
        pushFile(item.getAsFile(), index);
      }
    });
    return images;
  }

  async function handlePasteImages(event) {
    const images = collectClipboardImages(event.clipboardData);
    if (!images.length) return false;
    event.preventDefault();
    event.stopPropagation();
    setStatus(`正在添加粘贴图片（${images.length} 张）…`);
    await addFiles(images);
    if (images.length) setStatus(`已粘贴 ${images.length} 张图片，可以发送`);
    return true;
  }

  function renderAttachments() {
    els.attachments.classList.toggle('visible', pendingFiles.length > 0);
    els.attachments.innerHTML = pendingFiles.map(item => {
      const thumb = item.kind === 'image' && item.dataUrl
        ? `<img src="${item.dataUrl}" alt="">`
        : item.kind === 'video' && item.dataUrl
          ? `<video src="${item.dataUrl}" muted preload="metadata"></video>`
        : escapeHtml(fileExtension(item.file).replace('.', '').toUpperCase() || 'FILE');
      const state = item.state === 'reading' ? '读取中…' : item.state === 'error' ? item.error : formatBytes(item.size);
      return `<div class="teemo-attachment" data-id="${item.id}">
        <div class="teemo-attachment-thumb">${thumb}</div>
        <div class="teemo-attachment-copy"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span>${escapeHtml(state)}</span></div>
        <button class="teemo-attachment-remove" data-remove="${item.id}" title="移除">×</button>
      </div>`;
    }).join('');
    els.attachments.querySelectorAll('[data-remove]').forEach(button => {
      button.addEventListener('click', () => {
        pendingFiles = pendingFiles.filter(item => item.id !== button.dataset.remove);
        renderAttachments();
      });
    });
    updateContextMeter();
  }

  function setStatus(text, isError = false) {
    els.status.textContent = text;
    els.status.style.color = isError ? '#e58b8b' : '';
  }

  function ensureSession() {
    let active = history.getActive();
    if (!active) active = history.create(systemPrompt);
    else history.setSystemPrompt(systemPrompt);
    return active;
  }

  let folderDialogMode = null; // create | rename | create-and-move
  let folderDialogTargetId = null;
  let folderDialogSessionId = null;
  let confirmDialogResolver = null;

  function closeHistoryMoveMenus() {
    if (!els.history) return;
    els.history.querySelectorAll('.teemo-history-move-menu').forEach(menu => menu.remove());
  }

  function openFolderDialog(options) {
    if (!els.folderModal) return;
    folderDialogMode = options.mode || 'create';
    folderDialogTargetId = options.folderId || null;
    folderDialogSessionId = options.sessionId || null;
    els.folderModalTitle.textContent = options.title || '新建分组';
    els.folderModalTip.textContent = options.tip || '给分组起个名字，方便整理对话';
    els.folderInput.value = options.value || '';
    els.folderModal.hidden = false;
    requestAnimationFrame(() => {
      els.folderInput.focus();
      els.folderInput.select();
    });
  }

  function closeFolderDialog() {
    if (!els.folderModal) return;
    els.folderModal.hidden = true;
    folderDialogMode = null;
    folderDialogTargetId = null;
    folderDialogSessionId = null;
  }

  function saveFolderDialog() {
    const name = (els.folderInput?.value || '').trim();
    if (!name) {
      setStatus('分组名字不能为空');
      return;
    }
    if (folderDialogMode === 'skill-create') {
      try {
        const group = skills.createGroup(name);
        closeFolderDialog();
        renderSkills();
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = `已新建 Skill 分组「${group.name}」`;
      } catch (error) {
        setStatus(error.message || '新建 Skill 分组失败');
      }
      return;
    }
    if (folderDialogMode === 'skill-rename' && folderDialogTargetId) {
      try {
        if (!skills.renameGroup(folderDialogTargetId, name)) throw new Error('分组不存在');
        closeFolderDialog();
        renderSkills();
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = 'Skill 分组已重命名';
      } catch (error) {
        setStatus(error.message || 'Skill 分组重命名失败');
      }
      return;
    }
    if (folderDialogMode === 'rename' && folderDialogTargetId) {
      if (!history.renameFolder(folderDialogTargetId, name)) {
        setStatus('分组重命名失败');
        return;
      }
      closeFolderDialog();
      renderHistory();
      setStatus('分组已重命名');
      return;
    }

    const folder = history.createFolder(name);
    if (!folder) {
      setStatus('新建分组失败');
      return;
    }
    if ((folderDialogMode === 'create-and-move' || folderDialogMode === 'create') && folderDialogSessionId) {
      history.setSessionFolder(folderDialogSessionId, folder.id);
      closeFolderDialog();
      renderHistory();
      setStatus(`已放入分组「${folder.name}」`);
      return;
    }
    closeFolderDialog();
    renderHistory();
    setStatus('已新建分组：' + folder.name);
  }

  function askConfirm(title, tip) {
    return new Promise(resolve => {
      if (!els.confirmModal) {
        resolve(false);
        return;
      }
      confirmDialogResolver = resolve;
      els.confirmModalTitle.textContent = title || '确认';
      els.confirmModalTip.textContent = tip || '';
      els.confirmModal.hidden = false;
    });
  }

  function closeConfirmDialog(result) {
    if (!els.confirmModal) return;
    els.confirmModal.hidden = true;
    const resolver = confirmDialogResolver;
    confirmDialogResolver = null;
    if (resolver) resolver(!!result);
  }

  function renderSessionRow(session, activeId) {
    return `<div class="teemo-history-item ${session.id === activeId ? 'active' : ''}" data-session="${session.id}">
      <span class="teemo-history-item-title">${escapeHtml(session.title || '新对话')}</span>
      <div class="teemo-history-actions">
        <button class="teemo-history-move" data-move="${session.id}" title="移到分组">📁</button>
        <button class="teemo-history-pin ${session.pinned ? 'pinned' : ''}" data-pin="${session.id}" title="${session.pinned ? '取消置顶' : '置顶'}">📌</button>
        <button class="teemo-history-delete" data-delete="${session.id}" title="删除">×</button>
      </div>
    </div>`;
  }

  function openMoveMenu(button, sessionId) {
    closeHistoryMoveMenus();
    const folders = history.getFolders();
    const session = history.getAll().find(item => item.id === sessionId);
    if (!folders.length) {
      openFolderDialog({
        mode: 'create-and-move',
        sessionId,
        title: '新建分组并放入',
        tip: '还没有分组。先起个名字，这个对话会直接放进去。',
        value: '我的分组',
      });
      return;
    }
    const menu = document.createElement('div');
    menu.className = 'teemo-history-move-menu';
    const options = folders.map(folder => ({ id: folder.id, name: '📁 ' + folder.name }))
      .concat([{ id: '', name: '移出分组（回到时间列表）' }]);
    menu.innerHTML = options.map(option => {
      const active = (session?.folderId || '') === (option.id || '');
      return `<button type="button" class="${active ? 'active' : ''}" data-folder-target="${option.id}">${escapeHtml(option.name)}</button>`;
    }).join('') + '<button type="button" class="teemo-move-create" data-create-and-move="1">＋ 新建分组并放入</button>';
    button.parentElement.appendChild(menu);
    menu.querySelectorAll('[data-folder-target]').forEach(optionBtn => {
      optionBtn.addEventListener('click', clickEvent => {
        clickEvent.stopPropagation();
        const raw = optionBtn.getAttribute('data-folder-target');
        const folderId = raw ? raw : null;
        history.setSessionFolder(sessionId, folderId);
        closeHistoryMoveMenus();
        renderHistory();
        if (folderId) {
          const folder = history.getFolders().find(item => item.id === folderId);
          setStatus(folder ? `已放入分组「${folder.name}」` : '已移到分组');
        } else {
          setStatus('已移出分组，回到时间列表');
        }
      });
    });
    const createBtn = menu.querySelector('[data-create-and-move]');
    if (createBtn) {
      createBtn.addEventListener('click', clickEvent => {
        clickEvent.stopPropagation();
        closeHistoryMoveMenus();
        openFolderDialog({
          mode: 'create-and-move',
          sessionId,
          title: '新建分组并放入',
          tip: '新建后，这个对话会马上放进分组里。',
          value: '我的分组',
        });
      });
    }
  }

  function renderHistory() {
    const groups = history.getGrouped();
    const folders = history.getFolders();
    const activeId = history.getActive()?.id;
    const hasSessions = groups.some(group => group.items.length);
    if (!hasSessions && !folders.length) {
      els.history.innerHTML = '<div class="teemo-history-empty">还没有对话</div>';
      return;
    }
    els.history.innerHTML = groups.map(group => {
      if (group.type === 'folder') {
        const caret = group.collapsed ? '▸' : '▾';
        const body = group.collapsed
          ? ''
          : (group.items.length
            ? group.items.map(session => renderSessionRow(session, activeId)).join('')
            : '<div class="teemo-history-empty" style="padding:6px 10px 10px">这个分组还没有对话</div>');
        return `<div class="teemo-history-group" data-folder-group="${group.id}">
          <div class="teemo-history-group-label folder" data-folder-toggle="${group.id}">
            <span class="teemo-folder-caret">${caret}</span>
            <span class="teemo-folder-name">📁 ${escapeHtml(group.label)}</span>
            <span class="teemo-history-folder-actions">
              <button type="button" class="teemo-history-folder-btn" data-folder-rename="${group.id}" title="重命名分组">✎</button>
              <button type="button" class="teemo-history-folder-btn" data-folder-delete="${group.id}" title="删除分组">×</button>
            </span>
          </div>
          ${body}
        </div>`;
      }
      if (!group.items.length) return '';
      return `<div class="teemo-history-group">
        <div class="teemo-history-group-label">${escapeHtml(group.label)}</div>
        ${group.items.map(session => renderSessionRow(session, activeId)).join('')}
      </div>`;
    }).join('');

    els.history.querySelectorAll('[data-session]').forEach(item => {
      item.addEventListener('click', event => {
        if (event.target.closest('[data-delete], [data-pin], [data-move], .teemo-history-move-menu')) return;
        closeHistoryMoveMenus();
        history.setActive(item.dataset.session);
        renderAll();
      });
      item.addEventListener('dblclick', event => {
        if (event.target.closest('[data-delete], [data-pin], [data-move], .teemo-history-move-menu')) return;
        event.preventDefault();
        history.setActive(item.dataset.session);
        openRenameDialog();
      });
    });
    els.history.querySelectorAll('[data-pin]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        closeHistoryMoveMenus();
        const pinned = history.togglePin(button.dataset.pin);
        renderHistory();
        setStatus(pinned ? '对话已置顶' : '已取消置顶');
      });
    });
    els.history.querySelectorAll('[data-delete]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        closeHistoryMoveMenus();
        history.remove(button.dataset.delete);
        if (!history.getActive()) history.create(systemPrompt);
        renderAll();
      });
    });
    els.history.querySelectorAll('[data-move]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const sessionId = button.dataset.move;
        const existing = button.parentElement.querySelector('.teemo-history-move-menu');
        if (existing) {
          closeHistoryMoveMenus();
          return;
        }
        openMoveMenu(button, sessionId);
      });
    });
    els.history.querySelectorAll('[data-folder-toggle]').forEach(label => {
      label.addEventListener('click', event => {
        if (event.target.closest('[data-folder-rename], [data-folder-delete]')) return;
        history.toggleFolderCollapsed(label.dataset.folderToggle);
        renderHistory();
      });
    });
    els.history.querySelectorAll('[data-folder-rename]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const folder = folders.find(item => item.id === button.dataset.folderRename);
        openFolderDialog({
          mode: 'rename',
          folderId: button.dataset.folderRename,
          title: '重命名分组',
          tip: '改个更好记的名字',
          value: folder?.name || '',
        });
      });
    });
    els.history.querySelectorAll('[data-folder-delete]').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        const folder = folders.find(item => item.id === button.dataset.folderDelete);
        const ok = await askConfirm(
          '删除分组？',
          `确定删除分组「${folder?.name || ''}」吗？\n里面的对话会回到时间列表，不会删掉对话。`
        );
        if (!ok) return;
        history.removeFolder(button.dataset.folderDelete);
        renderHistory();
        setStatus('分组已删除');
      });
    });
  }

  function estimateTextTokens(text) {
    const value = String(text || '');
    if (!value) return 0;
    let tokens = 0;
    for (const ch of value) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch)) tokens += 1;
      else if (/\s/.test(ch)) tokens += 0.25;
      else tokens += 0.35;
    }
    return Math.ceil(tokens);
  }

  function estimateContentTokens(content) {
    if (content == null) return 0;
    if (typeof content === 'string') {
      const cleaned = window.TeemoMessageSanitize
        ? window.TeemoMessageSanitize.stripForApi(content)
        : String(content)
          .replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片]')
          .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/gi, '[图片]');
      const imageCount = (cleaned.match(/\[图片\]/g) || []).length;
      return estimateTextTokens(cleaned) + imageCount * 800;
    }
    if (Array.isArray(content)) {
      return content.reduce((sum, part) => {
        if (!part) return sum;
        if (part.type === 'image_url') return sum + 1200;
        if (part.type === 'video_url') return sum + 4000;
        if (part.type === 'text') return sum + estimateTextTokens(part.text);
        return sum + estimateTextTokens(typeof part === 'string' ? part : JSON.stringify(part));
      }, 0);
    }
    return estimateTextTokens(String(content));
  }

  function getModelContextLimit(modelName) {
    const name = String(modelName || '').toLowerCase();
    if (/kimi-k3/.test(name)) return 1048576;
    if (/kimi-k2\.7|kimi-k2\.6|kimi-k2\.5|kimi-k2/.test(name)) return 262144;
    if (/moonshot-v1-128k|128k/.test(name)) return 131072;
    if (/moonshot-v1-32k|32k/.test(name)) return 32768;
    if (/moonshot-v1-8k|8k/.test(name)) return 8192;
    if (/claude/.test(name)) return 200000;
    if (/gemini/.test(name)) return 1048576;
    if (/deepseek/.test(name)) return 65536;
    if (/gpt-4o|o1|o3|o4/.test(name)) return 128000;
    return 128000;
  }

  function formatTokenCount(n) {
    const value = Math.max(0, Math.round(Number(n) || 0));
    if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    return String(value);
  }

  function collectContextUsage() {
    const active = history.getActive();
    const modelName = (store.get('model') || modelConfig || {}).modelName || '';
    const limit = getModelContextLimit(modelName);
    const rawMessages = (active && Array.isArray(active.messages) ? active.messages : [])
      .filter(message => message && (message.role === 'system' || message.role === 'user' || message.role === 'assistant'));
    const apiMessages = window.TeemoMessageSanitize
      ? window.TeemoMessageSanitize.buildApiMessages(rawMessages, { maxMessages: 24 })
      : rawMessages.slice(-24);
    let used = apiMessages.reduce((sum, message) => sum + estimateContentTokens(message.content), 0);

    const draft = els.input ? els.input.value : '';
    if (draft) used += estimateTextTokens(draft);
    pendingFiles.forEach(file => {
      if (!file) return;
      if (file.kind === 'image') used += 1200;
      else if (file.kind === 'video') used += 4000;
      else if (file.text) used += estimateTextTokens(file.text);
      else if (file.name) used += 40;
    });

    const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    return { used, limit, percent, modelName, messageCount: apiMessages.length };
  }

  function updateContextMeter() {
    if (!els.contextMeter) return;
    const usage = collectContextUsage();
    const circle = els.contextMeter.querySelector('.teemo-context-meter-fill');
    const circumference = 87.96;
    const offset = circumference * (1 - usage.percent / 100);
    if (circle) circle.style.strokeDashoffset = String(offset);
    els.contextMeter.classList.toggle('ok', usage.percent > 0 && usage.percent < 70);
    els.contextMeter.classList.toggle('warn', usage.percent >= 70 && usage.percent < 90);
    els.contextMeter.classList.toggle('danger', usage.percent >= 90);
    const tip = [
      `上下文约 ${formatTokenCount(usage.used)} / ${formatTokenCount(usage.limit)}`,
      `${usage.percent.toFixed(usage.percent >= 10 ? 0 : 1)}%`,
      usage.modelName ? `模型 ${usage.modelName}` : '',
      '按当前对话将发送的内容估算（含系统规则、最近约 24 条、输入框与附件）',
    ].filter(Boolean).join(' · ');
    els.contextMeter.title = tip;
    els.contextMeter.setAttribute('aria-label', tip);
  }

  function renderMessages() {
    const active = ensureSession();
    els.title.textContent = active.title || '新对话';
    const messages = active.messages.filter(message => message.role !== 'system');
    if (!messages.length) {
      els.messages.innerHTML = `<div class="teemo-welcome">
        <img src="../icon/Teemo-app.png" alt="Teemo">
        <h2>今天想一起做点什么？</h2>
        <p>可以直接聊天，也可以上传图片、PDF、Word、文本或代码文件，我会先读取内容再回答。</p>
      </div>`;
      updateContextMeter();
      return;
    }
    els.messages.innerHTML = messages.map(message => {
      const role = message.role === 'user' ? 'user' : 'assistant';
      const content = typeof message.content === 'string' ? message.content : String(message.content || '');
      return `<article class="teemo-message ${role}"><div class="teemo-message-body">${window.Markdown.render(content)}</div></article>`;
    }).join('');
    Array.from(els.messages.querySelectorAll('.teemo-message')).forEach((article, index) => {
      const content = typeof messages[index]?.content === 'string' ? messages[index].content : '';
      bindThumbnailOpen(article, content);
    });
    if (window.Markdown && window.Markdown.bindCopyButtons) {
      window.Markdown.bindCopyButtons(els.messages);
    }
    scrollToBottom(false);
    updateContextMeter();
  }

  async function autoCaptureSkillOrRule(userText, assistantText) {
    if (!ruleCapture || !userText || !assistantText) return;
    const wants =
      ruleCapture._wantsNewSkill(userText)
      || ruleCapture.looksLikeManualSave(userText)
      || ruleCapture.looksLikeRuleRequest(userText);
    if (!wants) return;
    try {
      const result = await ruleCapture.captureFromConversation(userText, assistantText, { source: 'self' });
      if (!result || !result.created) return;
      if (typeof skills.reload === 'function') skills.reload();
      renderSkills();
      const label = (result.skill && result.skill.name) || (result.mode === 'new' ? '新 Skill' : 'Teemo 新增回复规则');
      const tip = result.mode === 'new'
        ? `\n\n✅ 已自动新增 Skill：${label}`
        : `\n\n✅ 已自动写入「${label}」`;
      setStatus(result.mode === 'new' ? `已新增 Skill：${label}` : `已写入规则：${label}`);
      return tip;
    } catch (error) {
      console.warn('[autoCaptureSkillOrRule]', error);
      return '';
    }
  }

  function extractOriginalImagePath(content) {
    const match = String(content || '').match(/📁\s*原图：\s*([A-Za-z]:\\[^\r\n`]+)/);
    return match ? match[1].trim() : '';
  }

  function bindThumbnailOpen(container, content) {
    if (!container) return;
    const originalPath = extractOriginalImagePath(content);
    container.querySelectorAll('img.md-img, .teemo-message-body img').forEach(image => {
      image.title = originalPath ? '单击查看原图' : '单击查看图片';
      if (!image.complete) {
        image.addEventListener('load', () => scrollToBottom(false), { once: true });
      }
      image.addEventListener('click', async () => {
        if (originalPath) {
          const error = await shell.openPath(originalPath);
          if (error) setStatus(`无法打开原图：${error}`, true);
          return;
        }
        const src = String(image.src || '');
        if (/^file:/i.test(src)) {
          const filePath = decodeURIComponent(new URL(src).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
          const error = await shell.openPath(filePath);
          if (error) setStatus(`无法打开图片：${error}`, true);
        } else if (/^https?:/i.test(src)) {
          shell.openExternal(src);
        }
      });
    });
  }

  function activeDirectorSessionId() {
    return history.getActive()?.id || null;
  }

  function directorAvailability() {
    if (!activeDirectorSessionId()) return { available: false, message: '请先创建或选择一个对话' };
    if (!creativeProfileService) return { available: false, message: 'Teemo 设计判断暂不可用' };
    try {
      const snapshot = creativeProfileService.getManagementSnapshot();
      if (snapshot.state.readError) return { available: false, message: '设计判断状态读取失败，挑战模式已停用' };
      if (snapshot.state.enabled === false) return { available: false, message: '需要先启用 Teemo 的设计判断' };
      return { available: true, message: '' };
    } catch (_) {
      return { available: false, message: 'Teemo 设计判断暂不可用' };
    }
  }

  function updateChallengeUi(runContext = null) {
    if (!creativeDirectorState) return;
    const sessionId = activeDirectorSessionId();
    const availability = directorAvailability();
    if (!availability.available && creativeDirectorState.getState(sessionId).mode !== 'balanced') {
      creativeDirectorState.setMode(sessionId, 'balanced', { intensity: 'standard', source: 'default' });
    }
    const state = creativeDirectorState.getState(sessionId);
    const challenge = availability.available && state.mode === 'challenge';
    const oneShot = Boolean(runContext && runContext.oneShot && runContext.mode === 'challenge');
    if (els.challengeQuick) {
      els.challengeQuick.disabled = !availability.available;
      els.challengeQuick.classList.toggle('active', challenge);
      els.challengeQuick.classList.toggle('one-shot', oneShot);
      els.challengeQuick.setAttribute('aria-pressed', challenge ? 'true' : 'false');
      els.challengeQuick.title = availability.available ? '切换当前对话的设计评审模式' : availability.message;
    }
    if (els.challengeQuickLabel) {
      els.challengeQuickLabel.textContent = oneShot ? '本轮 · 挑战' : (challenge ? `挑战 · ${state.intensity === 'light' ? '轻度' : state.intensity === 'strong' ? '强' : '标准'}` : '常规');
    }
    [els.directorBalanced, els.directorChallenge].forEach(button => {
      if (!button) return;
      button.disabled = !availability.available;
      button.classList.toggle('active', button.dataset.directorMode === state.mode);
    });
    if (els.directorIntensity) {
      els.directorIntensity.querySelectorAll('[data-director-intensity]').forEach(button => {
        button.disabled = !availability.available || !challenge;
        button.classList.toggle('active', challenge && button.dataset.directorIntensity === state.intensity);
      });
    }
    if (els.directorStatus) {
      els.directorStatus.textContent = availability.available
        ? (challenge ? `当前对话：挑战模式 · ${state.intensity === 'light' ? '轻度' : state.intensity === 'strong' ? '强' : '标准'}` : '当前对话：常规判断')
        : availability.message;
      els.directorStatus.classList.toggle('error', !availability.available);
    }
    if (oneShot) setTimeout(() => updateChallengeUi(), 1400);
  }

  function setDirectorMode(mode) {
    if (!creativeDirectorState || !directorAvailability().available) return;
    const sessionId = activeDirectorSessionId();
    const result = creativeDirectorState.setMode(sessionId, mode, { intensity: 'standard', source: 'ui' });
    if (!result.ok) return;
    updateChallengeUi();
  }

  function setDirectorIntensity(intensity) {
    if (!creativeDirectorState || !directorAvailability().available) return;
    const sessionId = activeDirectorSessionId();
    if (creativeDirectorState.getState(sessionId).mode !== 'challenge') return;
    const result = creativeDirectorState.setIntensity(sessionId, intensity, { source: 'ui' });
    if (!result.ok) return;
    updateChallengeUi();
  }

  function renderAll() {
    renderHistory();
    renderMessages();
    updateChallengeUi();
  }

  function openRenameDialog() {
    const active = history.getActive();
    if (!active) return;
    els.renameInput.value = active.title || '新对话';
    els.renameModal.hidden = false;
    requestAnimationFrame(() => {
      els.renameInput.focus();
      els.renameInput.select();
    });
  }

  function closeRenameDialog() {
    els.renameModal.hidden = true;
  }

  function saveRename() {
    const active = history.getActive();
    const title = els.renameInput.value.trim();
    if (!active || !title) return;
    history.rename(active.id, title);
    closeRenameDialog();
    renderAll();
    setStatus('对话已重命名');
  }

  const PROVIDER_PRESETS = {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelName: 'deepseek-chat' },
    openai: { baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4.1-mini' },
    qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelName: 'qwen-plus' },
    zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelName: 'glm-4-flash' },
    kimi: { baseUrl: 'https://api.moonshot.cn/v1', modelName: 'moonshot-v1-8k' },
  };

  const PROVIDER_LABELS = {
    deepseek: 'DeepSeek',
    openai: 'OpenAI',
    qwen: '通义千问',
    zhipu: '智谱',
    kimi: 'Kimi',
    custom: '自定义接口',
  };

  function getProviderLabel(provider, config) {
    const custom = store.get('customProviders') || {};
    const saved = (store.get('providerConfigs') || {})[provider] || {};
    return (config && config.label)
      || saved.label
      || (custom[provider] && custom[provider].label)
      || PROVIDER_LABELS[provider]
      || provider
      || '自定义接口';
  }

  function getProviderPreset(provider) {
    const custom = store.get('customProviders') || {};
    return PROVIDER_PRESETS[provider] || custom[provider] || null;
  }

  function ensureProviderOptions() {
    const custom = store.get('customProviders') || {};
    Object.entries(custom).forEach(([id, config]) => {
      let option = Array.from(els.apiProvider.options).find(item => item.value === id);
      if (!option) {
        option = document.createElement('option');
        option.value = id;
        els.apiProvider.appendChild(option);
      }
      option.textContent = config.label || id;
    });
  }

  function getSavedConnections() {
    const configs = { ...(store.get('providerConfigs') || {}) };
    const custom = store.get('customProviders') || {};
    Object.entries(custom).forEach(([provider, config]) => {
      if (!configs[provider]) {
        configs[provider] = {
          label: config.label || provider,
          apiKey: '',
          modelName: config.modelName || '新模型',
          baseUrl: config.baseUrl || 'https://',
        };
      }
    });
    const current = store.get('model') || {};
    if (current.provider && current.modelName && current.baseUrl && !configs[current.provider]) {
      configs[current.provider] = {
        apiKey: current.apiKey || '',
        modelName: current.modelName,
        baseUrl: current.baseUrl,
        label: current.label || '',
      };
    }
    return Object.entries(configs)
      .filter(([, config]) => config && (config.modelName || config.label || config.baseUrl))
      .map(([provider, config]) => ({ provider, ...config }));
  }

  function isConnectionPaused(config) {
    return !!(config && config.paused);
  }

  function isConnectionComplete(config) {
    return !!(config && config.apiKey && config.modelName && config.baseUrl
      && config.baseUrl !== 'https://' && config.modelName !== '新模型');
  }

  function getUsableConnections() {
    return getSavedConnections().filter(config => !isConnectionPaused(config) && isConnectionComplete(config));
  }

  function syncPauseApiButton() {
    if (!els.pauseApi) return;
    const provider = els.apiProvider ? els.apiProvider.value : '';
    const configs = store.get('providerConfigs') || {};
    const paused = !!(configs[provider] && configs[provider].paused);
    els.pauseApi.textContent = paused ? '恢复使用' : '暂停使用';
    els.pauseApi.classList.toggle('teemo-pause-active', paused);
  }

  function activateConnection(config, { announce = true } = {}) {
    const next = {
      ...store.get('model'),
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: String(config.baseUrl || '').replace(/\/$/, ''),
      apiKey: config.apiKey || '',
      label: config.label || getProviderLabel(config.provider, config),
    };
    configureActiveModel(next);
    setApiForm(next);
    renderApiConnections();
    if (announce) {
      els.apiSaveStatus.style.color = '';
      els.apiSaveStatus.textContent = `已切换到 ${getProviderLabel(next.provider, next)} · ${next.modelName}`;
      setStatus(`已切换模型：${getProviderLabel(next.provider, next)} · ${next.modelName}`);
    }
    return next;
  }

  function togglePauseCurrentApi() {
    const provider = els.apiProvider.value;
    const configs = { ...(store.get('providerConfigs') || {}) };
    if (!configs[provider]) {
      els.apiSaveStatus.style.color = '#e58b8b';
      els.apiSaveStatus.textContent = '请先保存这个接口，再暂停或恢复';
      return;
    }
    const label = getProviderLabel(provider, configs[provider]);
    const willPause = !configs[provider].paused;
    configs[provider] = {
      ...configs[provider],
      paused: willPause,
      label: els.apiRemarkName.value.trim() || configs[provider].label || label,
      apiKey: els.apiKey.value.trim() || configs[provider].apiKey || '',
      modelName: els.apiModelName.value.trim() || configs[provider].modelName || '',
      baseUrl: (els.apiBaseUrl.value.trim() || configs[provider].baseUrl || '').replace(/\/$/, ''),
    };
    store.setGroup('providerConfigs', configs);

    const current = store.get('model') || {};
    if (willPause && current.provider === provider) {
      const fallback = getUsableConnections().find(item => item.provider !== provider);
      if (fallback) {
        activateConnection(fallback, { announce: false });
        els.apiSaveStatus.style.color = '';
        els.apiSaveStatus.textContent = `已暂停 ${label}，已自动切换到 ${getProviderLabel(fallback.provider, fallback)}`;
        setStatus(`已暂停 ${label}，切换到 ${getProviderLabel(fallback.provider, fallback)}`);
      } else {
        renderApiConnections();
        syncPauseApiButton();
        els.apiSaveStatus.style.color = '#e0b45a';
        els.apiSaveStatus.textContent = `已暂停 ${label}。请新增或恢复其他接口后再聊天`;
        setStatus(`已暂停 ${label}`);
      }
      return;
    }

    renderApiConnections();
    syncPauseApiButton();
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = willPause
      ? `已暂停 ${label}（不会再被选为当前模型）`
      : `已恢复 ${label}，点击卡片即可切换使用`;
  }

  function setApiForm(config) {
    const next = config || {};
    ensureProviderOptions();
    els.apiProvider.value = Array.from(els.apiProvider.options).some(option => option.value === next.provider) ? next.provider : 'custom';
    els.apiRemarkName.value = next.label || getProviderLabel(next.provider || els.apiProvider.value, next);
    els.apiModelName.value = next.modelName || '';
    els.apiBaseUrl.value = next.baseUrl || '';
    els.apiKey.value = next.apiKey || '';
    syncPauseApiButton();
  }

  function configureActiveModel(next) {
    store.setGroup('model', next);
    modelConfig = next;
    systemPrompt = skills.getRules() || modelConfig.systemPrompt || '';
    ai.configure({ ...modelConfig, systemPrompt });
    els.model.textContent = modelConfig.modelName || '私人助理';
    if (els.quickModelLabel) {
      els.quickModelLabel.textContent = `${getProviderLabel(modelConfig.provider, modelConfig)} · ${modelConfig.modelName || '未设置模型'}`;
    }
    updateContextMeter();
  }

  /** 从磁盘重新读取 API / ComfyUI 配置，避免保存后聊天仍用旧 Key。 */
  function refreshModelConfig() {
    if (typeof store.reload === 'function') store.reload();
    modelConfig = store.get('model') || {};
    systemPrompt = skills.getRules() || modelConfig.systemPrompt || '';
    ai.configure({ ...modelConfig, systemPrompt });
    ai.imageConfig = store.get('imageModel') || {};
    els.model.textContent = modelConfig.modelName || '私人助理';
    if (comfyui && typeof comfyui.reload === 'function') comfyui.reload();
  }

  function renderApiConnections() {
    const connections = getSavedConnections();
    const current = store.get('model') || {};
    renderQuickModelSelect(connections, current);
    if (!connections.length) {
      els.apiConnections.innerHTML = '<div class="teemo-api-empty">保存一个 API 配置后，会显示在这里。</div>';
      return;
    }
    const editingProvider = els.apiProvider ? els.apiProvider.value : '';
    els.apiConnections.innerHTML = connections.map(config => {
      const active = current.provider === config.provider
        && current.modelName === config.modelName
        && String(current.baseUrl || '').replace(/\/$/, '') === String(config.baseUrl || '').replace(/\/$/, '');
      const editing = !active && config.provider === editingProvider;
      const paused = isConnectionPaused(config);
      const incomplete = !isConnectionComplete(config);
      const state = paused ? '已暂停' : (active ? '使用中' : (editing ? '编辑中' : (incomplete ? '待完善' : '切换')));
      return `<button class="teemo-api-connection ${active ? 'active' : ''} ${editing ? 'editing' : ''} ${paused ? 'paused' : ''}" data-api-provider="${escapeHtml(config.provider)}" type="button">
        <span class="teemo-api-connection-icon">${escapeHtml(getProviderLabel(config.provider, config).slice(0, 1).toUpperCase())}</span>
        <span class="teemo-api-connection-copy"><strong>${escapeHtml(getProviderLabel(config.provider, config))}</strong><span>${escapeHtml(config.modelName || '未命名模型')}</span></span>
        <span class="teemo-api-connection-state">${state}</span>
      </button>`;
    }).join('');
    syncPauseApiButton();
    els.apiConnections.querySelectorAll('[data-api-provider]').forEach(button => {
      button.addEventListener('click', () => {
        const config = getSavedConnections().find(item => item.provider === button.dataset.apiProvider);
        if (!config) return;
        const incomplete = !isConnectionComplete(config);
        const paused = isConnectionPaused(config);
        const next = {
          ...store.get('model'),
          provider: config.provider,
          modelName: config.modelName,
          baseUrl: String(config.baseUrl || '').replace(/\/$/, ''),
          apiKey: config.apiKey || '',
          label: config.label || getProviderLabel(config.provider, config),
        };
        setApiForm(next);
        if (paused) {
          openApiFormCollapse();
          renderApiConnections();
          els.apiSaveStatus.style.color = '#e0b45a';
          els.apiSaveStatus.textContent = `${next.label} 已暂停，点「恢复使用」后再切换`;
          return;
        }
        if (incomplete) {
          openApiFormCollapse();
          renderApiConnections();
          els.apiSaveStatus.style.color = '';
          els.apiSaveStatus.textContent = `正在编辑 ${next.label}，请完善后保存`;
          els.apiRemarkName.focus();
          return;
        }
        configureActiveModel(next);
        renderApiConnections();
        els.apiSaveStatus.style.color = '';
        els.apiSaveStatus.textContent = `已切换到 ${getProviderLabel(next.provider, next)} · ${next.modelName}`;
        setStatus(`已切换模型：${getProviderLabel(next.provider, next)} · ${next.modelName}`);
      });
    });
  }

  function renderQuickModelSelect(connections = getSavedConnections(), current = store.get('model') || {}) {
    if (!els.quickModel) return;
    const usable = connections.filter(config => !isConnectionPaused(config));
    if (!usable.length) {
      els.quickModelLabel.textContent = '暂无可用模型';
      els.quickModelButton.disabled = true;
      els.quickModelMenu.innerHTML = '';
      return;
    }
    els.quickModelButton.disabled = false;
    els.quickModelMenu.innerHTML = usable.map(config => {
      const label = getProviderLabel(config.provider, config);
      const active = config.provider === current.provider;
      return `<button class="teemo-quick-model-option${active ? ' active' : ''}" type="button" data-quick-provider="${escapeHtml(config.provider)}">
        <span>${escapeHtml(label)}</span><small>${escapeHtml(config.modelName)}</small>
      </button>`;
    }).join('');
    const active = usable.find(config => config.provider === current.provider);
    const selected = active || usable[0];
    els.quickModelLabel.textContent = `${getProviderLabel(selected.provider, selected)} · ${selected.modelName}`;
    els.quickModelMenu.querySelectorAll('[data-quick-provider]').forEach(button => {
      button.addEventListener('click', () => switchQuickModel(button.dataset.quickProvider));
    });
  }

  function switchQuickModel(provider) {
    const config = getSavedConnections().find(item => item.provider === provider);
    if (!config) return;
    if (isConnectionPaused(config)) {
      setStatus(`${getProviderLabel(config.provider, config)} 已暂停，请先恢复使用`);
      return;
    }
    const next = {
      ...store.get('model'),
      provider: config.provider,
      label: config.label || getProviderLabel(config.provider, config),
      modelName: config.modelName,
      baseUrl: String(config.baseUrl || '').replace(/\/$/, ''),
      apiKey: config.apiKey || '',
    };
    configureActiveModel(next);
    setApiForm(next);
    renderApiConnections();
    els.quickModelMenu.hidden = true;
    els.quickModel.classList.remove('open');
    setStatus(`已切换模型：${next.label} · ${next.modelName}`);
    els.input.focus();
  }

  function setImageIntentForm(mode) {
    const next = mode === 'keyword' ? 'keyword' : 'ai';
    if (els.imageIntentAi) els.imageIntentAi.checked = next === 'ai';
    if (els.imageIntentKeyword) els.imageIntentKeyword.checked = next === 'keyword';
  }

  function readImageIntentForm() {
    return (els.imageIntentKeyword && els.imageIntentKeyword.checked) ? 'keyword' : 'ai';
  }

  function setWebBrowseForm(config = store.get('webBrowse') || {}) {
    if (els.webBrowseEnabled) els.webBrowseEnabled.checked = config.enabled !== false;
  }

  function readWebBrowseForm() {
    const current = store.get('webBrowse') || {};
    return {
      ...current,
      enabled: !els.webBrowseEnabled || els.webBrowseEnabled.checked,
      maxPages: current.maxPages || 3,
      maxChars: current.maxChars || 12000,
      timeoutMs: current.timeoutMs || 20000,
    };
  }

  function setImageApiForm(config = store.get('imageModel') || {}) {
    if (!els.imageApiModelName) return;
    els.imageApiLabel.value = config.label || '';
    els.imageApiModelName.value = config.modelName || '';
    els.imageApiSize.value = config.size || '2048x2048';
    els.imageApiBaseUrl.value = config.baseUrl || '';
    els.imageApiKey.value = config.apiKey || '';
  }

  function readImageApiForm() {
    const options = Array.isArray((store.get('imageModel') || {}).options)
      ? (store.get('imageModel') || {}).options.slice()
      : [];
    const modelName = els.imageApiModelName.value.trim();
    if (modelName && !options.includes(modelName)) options.unshift(modelName);
    return {
      label: els.imageApiLabel.value.trim() || modelName || '生图 API',
      modelName,
      size: els.imageApiSize.value.trim() || '2048x2048',
      baseUrl: els.imageApiBaseUrl.value.trim().replace(/\/$/, ''),
      apiKey: els.imageApiKey.value.trim(),
      options,
    };
  }

  function isCloudImageReady(imgCfg = store.get('imageModel') || {}, chatCfg = store.get('model') || {}) {
    const modelName = imgCfg.modelName || '';
    const apiKey = imgCfg.apiKey || chatCfg.apiKey || '';
    const baseUrl = imgCfg.baseUrl || chatCfg.baseUrl || '';
    return !!(modelName && apiKey && baseUrl);
  }

  function saveImageApiSettings() {
    const next = readImageApiForm();
    if (!next.modelName) {
      els.imageApiSaveStatus.style.color = '#e58b8b';
      els.imageApiSaveStatus.textContent = '请填写生图模型名称';
      return;
    }
    store.setGroup('imageModel', next);
    ai.imageConfig = next;
    els.imageApiSaveStatus.style.color = '';
    els.imageApiSaveStatus.textContent = `已保存生图 API：${next.label} · ${next.modelName}`;
  }

  async function testImageApiConnection() {
    const draft = readImageApiForm();
    const chatCfg = store.get('model') || {};
    const apiKey = draft.apiKey || chatCfg.apiKey || '';
    const baseUrl = draft.baseUrl || chatCfg.baseUrl || '';
    if (!draft.modelName || !apiKey || !baseUrl) {
      els.imageApiSaveStatus.style.color = '#e58b8b';
      els.imageApiSaveStatus.textContent = '请填写模型名称；Key/地址可填这里，或复用上方对话 API';
      return;
    }
    els.imageApiSaveStatus.style.color = '';
    els.imageApiSaveStatus.textContent = '正在测试生图连接…';
    const probe = new window.AIService();
    probe.configure({ apiKey, baseUrl, modelName: chatCfg.modelName || draft.modelName });
    probe.imageConfig = { ...draft, apiKey, baseUrl };
    try {
      const result = await probe.generateImage({
        prompt: 'a simple red circle on white background, minimal',
        size: draft.size || '1024x1024',
      });
      const ok = !!(result && (result.url || result.b64));
      if (ok) {
        els.imageApiSaveStatus.style.color = '#7fd6a8';
        els.imageApiSaveStatus.textContent = `✓ 生图连接成功（Key 尾号 ${apiKey.slice(-4)}）· 请点击「保存生图 API」`;
      } else {
        els.imageApiSaveStatus.style.color = '#e58b8b';
        els.imageApiSaveStatus.textContent = '✗ 已连通但未返回图片';
      }
    } catch (error) {
      els.imageApiSaveStatus.style.color = '#e58b8b';
      els.imageApiSaveStatus.textContent = `✗ ${error.message || '生图连接失败'}`;
    }
  }

  function normalizeChatFontSize(value) {
    const size = Number(value);
    if (!Number.isFinite(size)) return 16;
    return Math.min(22, Math.max(12, Math.round(size)));
  }

  function applyChatFontSize(value, options = {}) {
    const size = normalizeChatFontSize(value);
    document.documentElement.style.setProperty('--chat-font-size', size + 'px');
    if (els.chatFontSize) els.chatFontSize.value = String(size);
    if (els.chatFontSizeValue) els.chatFontSizeValue.textContent = String(size);
    if (els.chatFontPreview) els.chatFontPreview.style.fontSize = size + 'px';
    if (options.persist) {
      store.set('appearance', 'chatFontSize', size);
      if (els.chatFontStatus) {
        els.chatFontStatus.style.color = '#7fd6a8';
        els.chatFontStatus.textContent = `已设为 ${size}px`;
      }
    }
    return size;
  }

  function setAudioApiForm(config = store.get('audioModel') || {}) {
    if (els.audioAnalysisEnabled) els.audioAnalysisEnabled.checked = config.enabled !== false;
    if (els.audioAnalysisModel) els.audioAnalysisModel.value = config.modelName || 'gpt-audio-1.5';
    if (els.audioTranscriptionModel) els.audioTranscriptionModel.value = config.transcriptionModel || 'gpt-4o-mini-transcribe';
    if (els.audioApiBaseUrl) els.audioApiBaseUrl.value = config.baseUrl || '';
    if (els.audioApiKey) els.audioApiKey.value = config.apiKey || '';
    if (els.audioApiSaveStatus) {
      const status = audioAnalysis.getStatus();
      els.audioApiSaveStatus.style.color = status.ready ? '#7fd6a8' : '#e0b45a';
      els.audioApiSaveStatus.textContent = status.ready ? `已就绪 · ${status.modelName}` : '等待配置可用的 GPT 音频接口';
    }
  }

  function saveAudioApiSettings() {
    const next = {
      ...(store.get('audioModel') || {}),
      enabled: !!(els.audioAnalysisEnabled && els.audioAnalysisEnabled.checked),
      modelName: (els.audioAnalysisModel && els.audioAnalysisModel.value.trim()) || 'gpt-audio-1.5',
      transcriptionModel: (els.audioTranscriptionModel && els.audioTranscriptionModel.value.trim()) || 'gpt-4o-mini-transcribe',
      baseUrl: (els.audioApiBaseUrl && els.audioApiBaseUrl.value.trim().replace(/\/+$/, '')) || '',
      apiKey: (els.audioApiKey && els.audioApiKey.value.trim()) || '',
    };
    store.setGroup('audioModel', next);
    setAudioApiForm(next);
    if (els.audioApiSaveStatus) {
      const status = audioAnalysis.getStatus();
      els.audioApiSaveStatus.style.color = status.ready ? '#7fd6a8' : '#e58b8b';
      els.audioApiSaveStatus.textContent = status.ready
        ? `✓ 已保存，使用 ${status.modelName}`
        : '已保存，但没有找到可复用的 GPT/OpenAI 接口';
    }
  }

  function populateSettings() {
    if (typeof store.reload === 'function') store.reload();
    if (typeof skills.reload === 'function') skills.reload();
    modelConfig = store.get('model') || {};
    setApiForm(modelConfig);
    setImageIntentForm((store.get('imageIntent') || {}).mode || 'ai');
    setWebBrowseForm();
    renderApiConnections();
    setAudioApiForm();
    setImageApiForm();
    renderLocalAccess();
    populateComfySettings();
    resetSkillEditor();
    renderSkills();
    applyChatFontSize((store.get('appearance') || {}).chatFontSize || 16);
    if (els.chatFontStatus) {
      els.chatFontStatus.style.color = '';
      els.chatFontStatus.textContent = '';
    }
    if (els.appVersionLabel) {
      ipcRenderer.invoke('get-app-version')
        .then(version => { els.appVersionLabel.textContent = `v${version}`; })
        .catch(() => { els.appVersionLabel.textContent = '版本未知'; });
    }
  }

  function showSettings() {
    populateSettings();
    els.chatView.hidden = true;
    if (els.memoryView) els.memoryView.hidden = true;
    if (els.creativeView) els.creativeView.hidden = true;
    els.settingsView.hidden = false;
  }

  function hideSettings() {
    refreshModelConfig();
    els.settingsView.hidden = true;
    if (els.memoryView) els.memoryView.hidden = true;
    if (els.creativeView) els.creativeView.hidden = true;
    els.chatView.hidden = false;
    renderAll();
    els.input.focus();
  }

  let cognitionCenter = null;

  function ensureCognitionCenter() {
    if (!cognitionCenter && window.TeemoCognitionCenter && cognitionService) {
      cognitionCenter = new window.TeemoCognitionCenter({
        service: cognitionService,
        projects: projectService,
        confirm: askConfirm,
        onBack: hideMemory,
      });
    }
    return cognitionCenter;
  }

  function showMemory() {
    els.chatView.hidden = true;
    els.settingsView.hidden = true;
    if (els.creativeView) els.creativeView.hidden = true;
    if (els.memoryView) els.memoryView.hidden = false;
    const center = ensureCognitionCenter();
    if (center) center.show();
  }

  function hideMemory() {
    if (els.memoryView) els.memoryView.hidden = true;
    els.settingsView.hidden = true;
    els.chatView.hidden = false;
    renderAll();
    els.input.focus();
  }

  let creativeProfileCenter = null;

  function ensureCreativeProfileCenter() {
    if (!creativeProfileCenter && window.TeemoCreativeProfileCenter && creativeProfileService) {
      creativeProfileCenter = new window.TeemoCreativeProfileCenter({
        service: creativeProfileService,
        onBack: hideCreativeProfile,
        onStateChange: updateChallengeUi,
      });
    }
    return creativeProfileCenter;
  }

  function showCreativeProfile() {
    els.chatView.hidden = true;
    els.settingsView.hidden = true;
    if (els.memoryView) els.memoryView.hidden = true;
    if (els.creativeView) els.creativeView.hidden = false;
    const center = ensureCreativeProfileCenter();
    if (center) center.show();
  }

  function hideCreativeProfile() {
    if (els.creativeView) els.creativeView.hidden = true;
    if (els.memoryView) els.memoryView.hidden = true;
    els.settingsView.hidden = true;
    els.chatView.hidden = false;
    renderAll();
    els.input.focus();
  }

  async function testApiConnection() {
    const draft = {
      provider: els.apiProvider.value,
      modelName: els.apiModelName.value.trim(),
      baseUrl: els.apiBaseUrl.value.trim().replace(/\/$/, ''),
      apiKey: els.apiKey.value.trim(),
    };
    if (!draft.apiKey || !draft.modelName || !draft.baseUrl) {
      els.apiSaveStatus.style.color = '#e58b8b';
      els.apiSaveStatus.textContent = '请先填写 API Key、模型名称和 Base URL';
      return;
    }
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = '正在测试 API 连接…';
    const probe = new window.AIService();
    probe.configure({ ...draft, systemPrompt: '' });
    try {
      const result = await probe.testConnection();
      if (result.ok) {
        els.apiSaveStatus.style.color = '#7fd6a8';
        els.apiSaveStatus.textContent = `✓ 连接成功（Key 尾号 ${draft.apiKey.slice(-4)}）· 请点击「保存 API 配置」`;
      } else {
        els.apiSaveStatus.style.color = '#e58b8b';
        els.apiSaveStatus.textContent = `✗ ${result.msg || '连接失败'}（Key 尾号 ${draft.apiKey.slice(-4)}）`;
      }
    } catch (error) {
      els.apiSaveStatus.style.color = '#e58b8b';
      els.apiSaveStatus.textContent = `✗ ${error.message || '连接失败'}`;
    }
  }

  function openApiFormCollapse() {
    if (els.apiFormCollapse) els.apiFormCollapse.open = true;
  }

  function openImageApiFormCollapse() {
    if (els.imageApiFormCollapse) els.imageApiFormCollapse.open = true;
  }

  function createNewApiConnection() {
    const custom = { ...(store.get('customProviders') || {}) };
    const configs = { ...(store.get('providerConfigs') || {}) };
    const id = `user_${Date.now().toString(36)}`;
    const count = getSavedConnections().length + 1;
    const label = `新模型 ${count}`;
    const draft = {
      label,
      baseUrl: 'https://',
      modelName: '新模型',
      apiKey: '',
    };
    custom[id] = { label, baseUrl: draft.baseUrl, modelName: draft.modelName };
    configs[id] = { ...draft };
    store.setGroup('customProviders', custom);
    store.setGroup('providerConfigs', configs);
    ensureProviderOptions();
    setApiForm({ provider: id, ...draft });
    els.apiProvider.value = id;
    openApiFormCollapse();
    renderApiConnections();
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = `已新增「${label}」，请填写备注、模型、地址和 Key 后保存`;
    els.apiRemarkName.focus();
    els.apiRemarkName.select();
  }

  function deleteCurrentApiConnection() {
    const provider = els.apiProvider.value;
    const configs = { ...(store.get('providerConfigs') || {}) };
    const custom = { ...(store.get('customProviders') || {}) };
    if (!configs[provider] && !custom[provider]) {
      els.apiSaveStatus.style.color = '#e58b8b';
      els.apiSaveStatus.textContent = '当前接口还没有保存，无需删除';
      return;
    }
    const label = getProviderLabel(provider, configs[provider]);
    if (!window.confirm(`确定删除接口“${label}”吗？`)) return;

    delete configs[provider];
    delete custom[provider];
    store.setGroup('providerConfigs', configs);
    store.setGroup('customProviders', custom);
    const option = Array.from(els.apiProvider.options).find(item => item.value === provider);
    if (option && provider.startsWith('user_')) option.remove();

    const fallbackEntry = Object.entries(configs).find(([, config]) => !isConnectionPaused(config))
      || Object.entries(configs)[0];
    if (fallbackEntry) {
      const [fallbackProvider, fallbackConfig] = fallbackEntry;
      const next = { ...store.get('model'), provider: fallbackProvider, ...fallbackConfig };
      configureActiveModel(next);
      setApiForm(next);
    } else {
      const next = { ...store.get('model'), provider: 'deepseek', ...PROVIDER_PRESETS.deepseek, apiKey: '', label: 'DeepSeek' };
      configureActiveModel(next);
      setApiForm(next);
    }
    renderApiConnections();
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = `已删除 ${label}`;
  }

  function saveApiSettings() {
    const label = els.apiRemarkName.value.trim()
      || getProviderLabel(els.apiProvider.value)
      || els.apiModelName.value.trim()
      || '自定义接口';
    const next = {
      ...store.get('model'),
      provider: els.apiProvider.value,
      label,
      modelName: els.apiModelName.value.trim(),
      baseUrl: els.apiBaseUrl.value.trim().replace(/\/$/, ''),
      apiKey: els.apiKey.value.trim(),
    };
    if (!next.modelName || !next.baseUrl) {
      els.apiSaveStatus.textContent = '请填写模型名称和 Base URL';
      els.apiSaveStatus.style.color = '#e58b8b';
      return;
    }
    const configs = { ...(store.get('providerConfigs') || {}) };
    const existing = configs[next.provider] || {};
    const paused = !!existing.paused;
    configs[next.provider] = {
      ...existing,
      label: next.label,
      apiKey: next.apiKey,
      modelName: next.modelName,
      baseUrl: next.baseUrl,
      paused,
    };
    store.setGroup('providerConfigs', configs);
    if (next.provider.startsWith('user_')) {
      const custom = { ...(store.get('customProviders') || {}) };
      custom[next.provider] = {
        ...(custom[next.provider] || {}),
        label: next.label,
        baseUrl: next.baseUrl,
        modelName: next.modelName,
      };
      store.setGroup('customProviders', custom);
      ensureProviderOptions();
    }
    store.setGroup('imageIntent', { mode: readImageIntentForm() });
    store.setGroup('webBrowse', readWebBrowseForm());
    if (paused) {
      renderApiConnections();
      syncPauseApiButton();
      els.apiSaveStatus.style.color = '#e0b45a';
      els.apiSaveStatus.textContent = `已保存 ${next.label}（仍暂停中，点「恢复使用」后再切换）`;
      return;
    }
    configureActiveModel(next);
    renderApiConnections();
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = `已保存 ${next.label} · ${next.modelName}`;
  }

  function setCheckpointOptions(checkpoints, selected) {
    const values = Array.from(new Set([selected, ...(checkpoints || [])].filter(Boolean)));
    els.comfyCheckpoint.innerHTML = values.map(value =>
      `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    ).join('');
    if (selected) els.comfyCheckpoint.value = selected;
  }

  function populateArchiveSettings() {
    const archive = store.get('imageArchive') || {};
    if (els.archiveEnabled) els.archiveEnabled.checked = archive.enabled !== false;
    if (els.archiveDir) els.archiveDir.value = archive.dir || 'D:\\Teemo助手';
    if (els.comfyOutputDir) els.comfyOutputDir.value = archive.comfyOutputDir || 'I:\\ComfyUI\\ComfyUI\\output';
  }

  function readArchiveForm() {
    return {
      enabled: els.archiveEnabled ? els.archiveEnabled.checked : true,
      dir: (els.archiveDir && els.archiveDir.value.trim()) || 'D:\\Teemo助手',
      comfyOutputDir: (els.comfyOutputDir && els.comfyOutputDir.value.trim()) || 'I:\\ComfyUI\\ComfyUI\\output',
    };
  }

  async function archiveGeneratedImage(options) {
    if (!window.teemoImageArchive) return null;
    return window.teemoImageArchive.saveFromChat(store, options);
  }

  function appendArchiveNote(text, archived) {
    if (!archived || !archived.ok || !archived.path) return text;
    return `${text}\n\n📁 已保存到：\`${archived.path}\``;
  }

  function populateComfySettings() {
    const config = store.get('comfyui') || comfyui.getConfig();
    comfyui.configure(config);
    els.comfyEnabled.checked = config.enabled !== false;
    els.comfyBaseUrl.value = config.baseUrl || 'http://127.0.0.1:8188';
    setCheckpointOptions([], config.checkpoint);
    els.comfyWidth.value = config.width || 1024;
    els.comfyHeight.value = config.height || 1024;
    els.comfySteps.value = config.steps || 26;
    els.comfyCfg.value = config.cfg || 5.5;
    els.comfyNegativePrompt.value = config.negativePrompt || '';
    populateArchiveSettings();
    renderComfyWorkflows();
  }

  function readComfyForm() {
    return {
      ...(store.get('comfyui') || {}),
      enabled: els.comfyEnabled.checked,
      baseUrl: els.comfyBaseUrl.value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8188',
      checkpoint: els.comfyCheckpoint.value,
      width: Number(els.comfyWidth.value) || 1024,
      height: Number(els.comfyHeight.value) || 1024,
      steps: Number(els.comfySteps.value) || 26,
      cfg: Number(els.comfyCfg.value) || 5.5,
      negativePrompt: els.comfyNegativePrompt.value.trim(),
      activeWorkflowId: els.comfyWorkflowSelect.value || 'builtin',
    };
  }

  function renderComfyWorkflows() {
    const config = store.get('comfyui') || comfyui.getConfig();
    const workflows = Array.isArray(config.workflows) ? config.workflows : [];
    els.comfyWorkflowSelect.innerHTML = [
      '<option value="builtin">Teemo 基础 SDXL 工作流</option>',
      ...workflows.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`),
    ].join('');
    const activeId = workflows.some(item => item.id === config.activeWorkflowId) ? config.activeWorkflowId : 'builtin';
    els.comfyWorkflowSelect.value = activeId;
    const current = workflows.find(item => item.id === activeId);
    if (current && current.summary) {
      els.comfyWorkflowSummary.textContent = `API 节点 ${current.summary.nodeCount} 个 · 提示词节点 ${current.summary.promptNode} · 尺寸节点 ${current.summary.sizeNode || '保留原值'} · 输出节点 ${current.summary.outputNode}`;
    } else {
      els.comfyWorkflowSummary.textContent = '内置最小流程：Checkpoint → CLIP → KSampler → VAE → SaveImage';
    }
    els.deleteComfyWorkflow.disabled = activeId === 'builtin';
  }

  function switchComfyWorkflow() {
    const next = {
      ...(store.get('comfyui') || comfyui.getConfig()),
      activeWorkflowId: els.comfyWorkflowSelect.value || 'builtin',
    };
    store.setGroup('comfyui', next);
    comfyui.configure(next);
    renderComfyWorkflows();
    const active = comfyui.getActiveWorkflow();
    els.comfySaveStatus.style.color = '';
    els.comfySaveStatus.textContent = `已切换到 ${active ? active.name : 'Teemo 基础 SDXL 工作流'}`;
  }

  async function importComfyWorkflow(file) {
    if (!file) return;
    try {
      const workflow = JSON.parse(await file.text());
      const record = comfyui.createWorkflowRecord(`Teemo-${file.name.replace(/\.json$/i, '')}`, workflow);
      const config = { ...(store.get('comfyui') || comfyui.getConfig()) };
      const workflows = Array.isArray(config.workflows) ? config.workflows.slice() : [];
      workflows.push(record);
      config.workflows = workflows;
      config.activeWorkflowId = record.id;
      store.setGroup('comfyui', config);
      comfyui.configure(config);
      renderComfyWorkflows();
      els.comfyWorkflowSelect.value = record.id;
      renderComfyWorkflows();
      els.comfySaveStatus.style.color = '';
      els.comfySaveStatus.textContent = `已导入并启用 ${record.name}`;
    } catch (error) {
      els.comfySaveStatus.style.color = '#e58b8b';
      els.comfySaveStatus.textContent = error.message || '工作流导入失败';
    }
  }

  function deleteComfyWorkflow() {
    const id = els.comfyWorkflowSelect.value;
    if (!id || id === 'builtin') return;
    const config = { ...(store.get('comfyui') || comfyui.getConfig()) };
    config.workflows = (Array.isArray(config.workflows) ? config.workflows : []).filter(item => item.id !== id);
    config.activeWorkflowId = 'builtin';
    store.setGroup('comfyui', config);
    comfyui.configure(config);
    renderComfyWorkflows();
    els.comfySaveStatus.style.color = '';
    els.comfySaveStatus.textContent = '工作流已删除，已切回基础 SDXL';
  }

  async function testComfyConnection() {
    els.testComfy.disabled = true;
    els.comfyConnectionStatus.className = 'teemo-comfy-status';
    els.comfyConnectionStatus.innerHTML = '<span class="teemo-status-dot"></span><strong>正在连接…</strong><span>读取本机 ComfyUI 与模型列表</span>';
    comfyui.configure(readComfyForm());
    try {
      const [status, checkpoints] = await Promise.all([comfyui.ping(), comfyui.listCheckpoints()]);
      setCheckpointOptions(checkpoints, els.comfyCheckpoint.value || comfyui.getConfig().checkpoint);
      const freeGb = status.vramFree ? (status.vramFree / 1024 / 1024 / 1024).toFixed(1) : '';
      els.comfyConnectionStatus.className = 'teemo-comfy-status connected';
      els.comfyConnectionStatus.innerHTML = `<span class="teemo-status-dot"></span><strong>连接正常</strong><span>${escapeHtml(status.version ? `ComfyUI ${status.version}` : 'ComfyUI')} · ${checkpoints.length} 个模型${freeGb ? ` · 显存可用 ${freeGb}GB` : ''}</span>`;
      els.comfySaveStatus.style.color = '';
      els.comfySaveStatus.textContent = '模型列表已刷新';
    } catch (error) {
      els.comfyConnectionStatus.className = 'teemo-comfy-status error';
      els.comfyConnectionStatus.innerHTML = `<span class="teemo-status-dot"></span><strong>连接失败</strong><span>${escapeHtml(error.message || '请先启动 ComfyUI')}</span>`;
      els.comfySaveStatus.style.color = '#e58b8b';
      els.comfySaveStatus.textContent = '未连接';
    } finally {
      els.testComfy.disabled = false;
    }
  }

  function saveComfySettings() {
    const next = readComfyForm();
    if (!next.checkpoint) {
      els.comfySaveStatus.style.color = '#e58b8b';
      els.comfySaveStatus.textContent = '请选择 Checkpoint 模型';
      return;
    }
    store.setGroup('comfyui', next);
    store.setGroup('imageArchive', readArchiveForm());
    comfyui.configure(next);
    if (window.comfyUIService) window.comfyUIService.configure(next);
    els.comfySaveStatus.style.color = '';
    els.comfySaveStatus.textContent = '已保存并同步到桌宠';
  }

  function getSkillContent(skill) {
    if (!skill) return '';
    if (skill.systemPrompt) return String(skill.systemPrompt);
    if (skill.promptTpl) return String(skill.promptTpl);
    if (typeof skill.prompt === 'string') return skill.prompt;
    return '';
  }

  function skillEditorFields(values = {}) {
    const name = values.name || '';
    const icon = values.icon || '⭐';
    const desc = values.desc || '';
    const content = values.content || '';
    const saveLabel = values.saveLabel || '保存';
    return `<div class="teemo-skill-inline-editor">
      <div class="teemo-skill-create">
        <label><span>名称</span><input id="skillName" placeholder="例如：海报设计规范" value="${escapeHtml(name)}"></label>
        <label><span>图标</span><input id="skillIcon" maxlength="4" value="${escapeHtml(icon)}"></label>
        <label class="teemo-form-wide"><span>简介</span><input id="skillDescription" placeholder="这个 Skill 适合处理什么任务" value="${escapeHtml(desc)}"></label>
        <label class="teemo-form-wide"><span>Skill 指令</span><textarea id="skillContent" rows="7" placeholder="写下希望 Teemo 遵循的方法、规则和输出格式…">${escapeHtml(content)}</textarea></label>
        <div class="teemo-form-wide teemo-card-actions">
          <button class="teemo-secondary-button" id="cancelSkillEditButton" type="button">取消</button>
          <button class="teemo-primary-button" id="addSkillButton" type="button">${escapeHtml(saveLabel)}</button>
        </div>
      </div>
    </div>`;
  }

  function routingEditorFields(manifest, revision) {
    if (!manifest) return '';
    const routing = manifest.routing;
    return `<details class="teemo-skill-routing-editor" data-routing-skill="${escapeHtml(manifest.skillId)}" data-routing-revision="${revision}">
      <summary>Routing Metadata · ${escapeHtml(routing.status)} · ${escapeHtml(routing.role)}</summary>
      <div class="teemo-routing-grid">
        <label><span>Auto Routing</span><select data-route-field="status"><option value="ready" ${routing.status === 'ready' ? 'selected' : ''}>Ready</option><option value="needs_review" ${routing.status === 'needs_review' ? 'selected' : ''}>Needs Review</option><option value="disabled" ${routing.status === 'disabled' ? 'selected' : ''}>Disabled</option></select></label>
        <label><span>Role</span><select data-route-field="role">${['task', 'domain', 'brand', 'utility'].map(role => `<option value="${role}" ${routing.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
        <label class="teemo-form-wide"><span>Aliases</span><input data-route-field="aliases" value="${escapeHtml((routing.aliases || []).join(', '))}"></label>
        <label class="teemo-form-wide"><span>Intents</span><textarea data-route-field="intents" rows="2">${escapeHtml((routing.intents || []).join('\n'))}</textarea></label>
        <label class="teemo-form-wide"><span>Domains</span><input data-route-field="domains" value="${escapeHtml((routing.domains || []).join(', '))}"></label>
        <label><span>Input Modality</span><input data-route-field="inputModalities" value="${escapeHtml((manifest.modalities.input || []).join(', '))}"></label>
        <label><span>Sensitivity</span><select data-route-field="sensitivity">${['general', 'sensitive', 'adult', 'unknown'].map(value => `<option value="${value}" ${manifest.content.sensitivity === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label class="teemo-form-wide"><span>Positive Examples</span><textarea data-route-field="positiveExamples" rows="2">${escapeHtml((routing.positiveExamples || []).join('\n'))}</textarea></label>
        <label class="teemo-form-wide"><span>Negative Examples</span><textarea data-route-field="negativeExamples" rows="2">${escapeHtml((routing.negativeExamples || []).join('\n'))}</textarea></label>
        <label class="teemo-form-wide"><span>Exclusions</span><textarea data-route-field="exclusions" rows="2">${escapeHtml((routing.exclusions || []).join('\n'))}</textarea></label>
        <label class="teemo-routing-check"><input data-route-field="allowComposition" type="checkbox" ${routing.allowComposition ? 'checked' : ''}> 允许多 Skill 组合</label>
        <label class="teemo-routing-check"><input data-route-field="continuity" type="checkbox" ${routing.continuity ? 'checked' : ''}> 允许同会话连续使用</label>
        <div class="teemo-form-wide teemo-card-actions"><button class="teemo-secondary-button" data-route-reset type="button">重置 Routing Override</button><button class="teemo-primary-button" data-route-save type="button">保存 Routing Metadata</button></div>
      </div>
    </details>`;
  }

  function bindSkillEditorEvents() {
    const addBtn = document.getElementById('addSkillButton');
    const cancelBtn = document.getElementById('cancelSkillEditButton');
    if (addBtn) addBtn.addEventListener('click', saveSkill);
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      resetSkillEditor();
      els.skillSaveStatus.textContent = '';
    });
    const nameInput = document.getElementById('skillName');
    if (nameInput) {
      requestAnimationFrame(() => nameInput.focus());
    }
  }

  function resetSkillEditor() {
    selectedSkillId = null;
    creatingSkill = false;
    skillDraft = { name: '', icon: '⭐', desc: '', content: '' };
    renderSkills();
  }

  function editSkill(id) {
    const skill = skills.get(id);
    if (!skill) return;
    if (selectedSkillId === id && !creatingSkill) {
      resetSkillEditor();
      els.skillSaveStatus.textContent = '';
      return;
    }
    creatingSkill = false;
    selectedSkillId = id;
    els.skillSaveStatus.style.color = '';
    els.skillSaveStatus.textContent = `正在编辑：${skill.name}`;
    renderSkills();
  }

  function startCreateSkill() {
    selectedSkillId = null;
    creatingSkill = true;
    skillDraft = { name: '', icon: '⭐', desc: '', content: '' };
    els.skillSaveStatus.style.color = '';
    els.skillSaveStatus.textContent = '在列表顶部填写新 Skill';
    renderSkills();
  }

  async function exportSkill(id) {
    const skill = skills.get(id);
    const exported = typeof skills.exportMarkdown === 'function' ? skills.exportMarkdown(id) : null;
    if (!skill || !exported) {
      els.skillSaveStatus.style.color = '#e58b8b';
      els.skillSaveStatus.textContent = '导出失败：Skill 不存在';
      return;
    }

    els.skillSaveStatus.style.color = '';
    els.skillSaveStatus.textContent = `正在导出「${skill.name}」…`;
    try {
      const result = await ipcRenderer.invoke('save-text-file', {
        text: exported.content,
        suggestedName: exported.filename,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result && result.ok) {
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = `已导出「${skill.name}」：${result.path}`;
      } else if (result && result.error === '已取消') {
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = '已取消导出';
      } else {
        throw new Error((result && result.error) || '文件保存失败');
      }
    } catch (error) {
      els.skillSaveStatus.style.color = '#e58b8b';
      els.skillSaveStatus.textContent = `导出失败：${error.message || error}`;
    }
  }

  function renderSkills() {
    els.skillList.querySelectorAll('[data-skill-group-section]').forEach(section => {
      skillGroupOpenState.set(section.dataset.skillGroupSection, section.open);
    });
    const existingUngrouped = els.skillList.querySelector('.teemo-skill-group-ungrouped');
    if (existingUngrouped) ungroupedSkillGroupOpen = existingUngrouped.open;
    const all = skills.getAll();
    const registry = skillManifestService && skillManifestService.reload ? skillManifestService.reload() : { ok: false, skills: [] };
    const manifests = new Map((registry.skills || []).map(item => [item.skillId, item]));
    const invalidManifests = new Map((registry.invalidSkills || []).map(item => [item.skillId, item]));
    const groups = typeof skills.getGroups === 'function' ? skills.getGroups() : [];
    const createBlock = creatingSkill
      ? `<div class="teemo-skill-item expanded creating">
          <div class="teemo-skill-row selected">
            <div class="teemo-skill-row-icon">＋</div>
            <div class="teemo-skill-row-copy"><strong>新建 Skill</strong><span>填写下方内容后保存</span></div>
          </div>
          ${skillEditorFields({ ...skillDraft, saveLabel: '新增 Skill' })}
        </div>`
      : '';

    const groupOptions = groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('');
    const skillRow = skill => {
      const expanded = !creatingSkill && selectedSkillId === skill.id;
      const manifest = manifests.get(String(skill.id));
      const invalidManifest = invalidManifests.get(String(skill.id));
      const values = expanded
        ? {
          name: skill.name || '',
          icon: skill.icon || '⭐',
          desc: skill.desc || '',
          content: getSkillContent(skill),
          saveLabel: skill.id === 'skill1' ? '保存回复规则' : '保存 Skill 修改',
        }
        : null;
      return `<div class="teemo-skill-item ${expanded ? 'expanded' : ''}" data-skill-id="${escapeHtml(skill.id)}">
        <div class="teemo-skill-row ${expanded ? 'selected' : ''}" data-skill-edit="${escapeHtml(skill.id)}">
          <div class="teemo-skill-row-icon">${escapeHtml(skill.icon || '⭐')}</div>
          <div class="teemo-skill-row-copy"><strong>${escapeHtml(skill.name)}</strong><span>${escapeHtml(skill.desc || (skill.id === 'skill1' ? '机器人当前回复规则' : '自定义 Skill'))}</span>${manifest ? `<em>${manifest.routing.status === 'needs_review' ? '路由信息待完善' : `Auto Routing · ${manifest.routing.status}`} · ${manifest.routing.role}</em>` : invalidManifest ? '<em class="invalid">Routing invalid · Needs repair</em>' : ''}</div>
          <label class="teemo-skill-group-picker" title="移动到分组">
            <span>分组</span>
            <select data-skill-group="${escapeHtml(skill.id)}">
              <option value="">未分组</option>
              ${groupOptions}
            </select>
          </label>
          <button class="teemo-skill-edit" data-skill-edit-button="${escapeHtml(skill.id)}" type="button">${expanded ? '收起' : '编辑'}</button>
          <button class="teemo-skill-export" data-skill-export="${escapeHtml(skill.id)}" type="button" title="下载为可重新导入的 Markdown 文件">导出</button>
          ${skill.custom ? `<button class="teemo-skill-delete" data-skill-delete="${escapeHtml(skill.id)}" type="button">删除</button>` : ''}
        </div>
        ${expanded ? (invalidManifest ? `<div class="teemo-skill-routing-error">Routing invalid · Needs repair<br>${escapeHtml((invalidManifest.errors || []).join('; '))}<br>该 Skill 已从自动路由隔离，Raw Skill 未被修改。</div>` : routingEditorFields(manifest, registry.revision)) + skillEditorFields(values) : ''}
      </div>`;

    };

    const groupedHtml = groups.map(group => {
      const items = all.filter(skill => skills.getSkillGroup(skill.id) === group.id);
      const openAttribute = skillGroupOpenState.get(group.id) === false ? '' : ' open';
      return `<details class="teemo-skill-group"${openAttribute} data-skill-group-section="${escapeHtml(group.id)}">
        <summary>
          <span class="teemo-skill-group-title"><button class="teemo-skill-group-drag" type="button" data-skill-group-drag="${escapeHtml(group.id)}" title="拖拽调整分组顺序" aria-label="拖拽调整 ${escapeHtml(group.name)} 分组顺序">⠿</button><strong>${escapeHtml(group.name)}</strong><em>${items.length}</em></span>
          <span class="teemo-skill-group-actions">
            <button type="button" data-skill-group-rename="${escapeHtml(group.id)}">重命名</button>
            <button type="button" data-skill-group-delete="${escapeHtml(group.id)}">删除分组</button>
          </span>
        </summary>
        <div class="teemo-skill-group-items">${items.length ? items.map(skillRow).join('') : '<div class="teemo-skill-group-empty">暂无 Skill，可通过右侧分组选择器移入</div>'}</div>
      </details>`;
    }).join('');
    const ungrouped = all.filter(skill => !skills.getSkillGroup(skill.id));
    const ungroupedHtml = `<details class="teemo-skill-group teemo-skill-group-ungrouped"${ungroupedSkillGroupOpen ? ' open' : ''}>
      <summary><span class="teemo-skill-group-title"><strong>未分组</strong><em>${ungrouped.length}</em></span></summary>
      <div class="teemo-skill-group-items">${ungrouped.length ? ungrouped.map(skillRow).join('') : '<div class="teemo-skill-group-empty">所有 Skill 都已归类</div>'}</div>
    </details>`;
    const listHtml = (groups.length ? groupedHtml : '') + ungroupedHtml;

    els.skillList.innerHTML = (registry.ok === false ? '<div class="teemo-skill-routing-error">Skill 路由数据无法读取。自动路由已关闭，普通聊天不受影响。</div>' : invalidManifests.size ? `<div class="teemo-skill-routing-error">${invalidManifests.size} 个 Skill 的 Routing Metadata 无效，已隔离并标记为 Needs repair；其他有效 Skill 仍可自动路由。</div>` : '') + createBlock + listHtml;

    els.skillList.querySelectorAll('[data-skill-group-section]').forEach(section => {
      section.addEventListener('toggle', () => {
        skillGroupOpenState.set(section.dataset.skillGroupSection, section.open);
        persistSkillGroupOpenState();
      });
    });
    const ungroupedSection = els.skillList.querySelector('.teemo-skill-group-ungrouped');
    if (ungroupedSection) {
      ungroupedSection.addEventListener('toggle', () => {
        ungroupedSkillGroupOpen = ungroupedSection.open;
        persistSkillGroupOpenState();
      });
    }

    const groupSections = [...els.skillList.querySelectorAll('[data-skill-group-section]')];
    const settingsScroller = els.skillList.closest('.teemo-settings-content');
    let draggedGroupId = '';
    let draggedPointerId = null;
    let dragStartY = 0;
    let dragMoved = false;
    let dropTarget = null;
    let dropBefore = true;
    const clearGroupDragState = () => {
      groupSections.forEach(section => section.classList.remove('dragging', 'drag-over-before', 'drag-over-after'));
      dropTarget = null;
    };
    groupSections.forEach(section => {
      const handle = section.querySelector('[data-skill-group-drag]');
      const dragSurface = section.querySelector('.teemo-skill-group-title');
      if (!handle || !dragSurface) return;
      let suppressTitleClick = false;
      dragSurface.addEventListener('click', event => {
        if (!suppressTitleClick && !event.target.closest('[data-skill-group-drag]')) return;
        suppressTitleClick = false;
        event.preventDefault();
        event.stopPropagation();
      });
      dragSurface.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        draggedGroupId = handle.dataset.skillGroupDrag || '';
        draggedPointerId = event.pointerId;
        dragStartY = event.clientY;
        dragMoved = false;
        section.classList.add('dragging');
        dragSurface.setPointerCapture(event.pointerId);
        event.stopPropagation();
      });
      dragSurface.addEventListener('pointermove', event => {
        if (draggedPointerId !== event.pointerId || !draggedGroupId) return;
        event.preventDefault();
        event.stopPropagation();
        if (!dragMoved && Math.abs(event.clientY - dragStartY) < 4) return;
        dragMoved = true;
        if (settingsScroller) {
          const scrollerRect = settingsScroller.getBoundingClientRect();
          if (event.clientY < scrollerRect.top + 54) settingsScroller.scrollTop -= 18;
          else if (event.clientY > scrollerRect.bottom - 54) settingsScroller.scrollTop += 18;
        }
        const candidates = groupSections.filter(item => item !== section);
        if (!candidates.length) return;
        const nearestTarget = candidates.reduce((nearest, item) => {
          const rect = item.getBoundingClientRect();
          const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
          return !nearest || distance < nearest.distance ? { item, rect, distance } : nearest;
        }, null);
        clearGroupDragState();
        section.classList.add('dragging');
        dropTarget = nearestTarget;
        if (!dropTarget) return;
        dropBefore = event.clientY < dropTarget.rect.top + dropTarget.rect.height / 2;
        dropTarget.item.classList.add(dropBefore ? 'drag-over-before' : 'drag-over-after');
      });
      const finishPointerDrag = event => {
        if (draggedPointerId !== event.pointerId || !draggedGroupId) return;
        event.preventDefault();
        event.stopPropagation();
        const target = dropTarget && dropTarget.item;
        const shouldSave = dragMoved && target && target !== section;
        if (dragSurface.hasPointerCapture(event.pointerId)) dragSurface.releasePointerCapture(event.pointerId);
        if (shouldSave) {
          if (dropBefore) target.before(section);
          else target.after(section);
        }
        const orderedIds = shouldSave
          ? [...els.skillList.querySelectorAll('[data-skill-group-section]')].map(item => item.dataset.skillGroupSection)
          : [];
        draggedGroupId = '';
        draggedPointerId = null;
        clearGroupDragState();
        if (!shouldSave) return;
        suppressTitleClick = true;
        const saved = typeof skills.reorderGroups === 'function' && skills.reorderGroups(orderedIds);
        els.skillSaveStatus.style.color = saved ? '' : '#e59090';
        els.skillSaveStatus.textContent = saved ? '分组顺序已保存' : '分组顺序保存失败';
      };
      dragSurface.addEventListener('pointerup', finishPointerDrag);
      dragSurface.addEventListener('pointercancel', event => {
        if (draggedPointerId !== event.pointerId) return;
        draggedGroupId = '';
        draggedPointerId = null;
        clearGroupDragState();
      });
    });

    els.skillList.querySelectorAll('[data-skill-edit]').forEach(row => {
      row.addEventListener('click', event => {
        if (event.target.closest('[data-skill-delete], [data-skill-export], [data-skill-edit-button], .teemo-skill-group-picker')) return;
        editSkill(row.dataset.skillEdit);
      });
    });
    els.skillList.querySelectorAll('[data-skill-group]').forEach(select => {
      const currentGroup = skills.getSkillGroup(select.dataset.skillGroup) || '';
      select.value = currentGroup;
      select.addEventListener('click', event => event.stopPropagation());
      select.addEventListener('change', event => {
        event.stopPropagation();
        const skill = skills.get(select.dataset.skillGroup);
        if (!skills.setSkillGroup(select.dataset.skillGroup, select.value)) return;
        const target = groups.find(group => group.id === select.value);
        renderSkills();
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = target
          ? `已将「${skill ? skill.name : 'Skill'}」移到「${target.name}」`
          : `已将「${skill ? skill.name : 'Skill'}」移到未分组`;
      });
    });
    els.skillList.querySelectorAll('[data-skill-group-rename]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const group = groups.find(item => item.id === button.dataset.skillGroupRename);
        if (!group) return;
        openFolderDialog({
          mode: 'skill-rename',
          folderId: group.id,
          title: '重命名 Skill 分组',
          tip: '只修改分组名称，不会改动组内 Skill。',
          value: group.name,
        });
      });
    });
    els.skillList.querySelectorAll('[data-skill-group-delete]').forEach(button => {
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const group = groups.find(item => item.id === button.dataset.skillGroupDelete);
        if (!group) return;
        const count = all.filter(skill => skills.getSkillGroup(skill.id) === group.id).length;
        const ok = await askConfirm('删除 Skill 分组', `确定删除「${group.name}」吗？\n组内 ${count} 个 Skill 会回到“未分组”，Skill 本身不会被删除。`);
        if (!ok) return;
        skills.removeGroup(group.id);
        skillGroupOpenState.delete(group.id);
        persistSkillGroupOpenState();
        renderSkills();
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = `已删除分组「${group.name}」，组内 Skill 已移到未分组`;
      });
    });
    els.skillList.querySelectorAll('[data-skill-edit-button]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        editSkill(button.dataset.skillEditButton);
      });
    });
    els.skillList.querySelectorAll('[data-skill-export]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        exportSkill(button.dataset.skillExport);
      });
    });
    els.skillList.querySelectorAll('[data-skill-delete]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        skills.remove(button.dataset.skillDelete);
        if (selectedSkillId === button.dataset.skillDelete) resetSkillEditor();
        else renderSkills();
        els.skillSaveStatus.style.color = '';
        els.skillSaveStatus.textContent = 'Skill 已删除';
      });
    });

    els.skillList.querySelectorAll('[data-route-save]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const editor = button.closest('[data-routing-skill]');
        const readList = field => String(editor.querySelector(`[data-route-field="${field}"]`)?.value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean);
        try {
          skillManifestService.updateRoutingOverride(editor.dataset.routingSkill, {
            status: editor.querySelector('[data-route-field="status"]').value,
            role: editor.querySelector('[data-route-field="role"]').value,
            aliases: readList('aliases'), intents: readList('intents'), domains: readList('domains'),
            inputModalities: readList('inputModalities'), sensitivity: editor.querySelector('[data-route-field="sensitivity"]').value,
            positiveExamples: readList('positiveExamples'), negativeExamples: readList('negativeExamples'), exclusions: readList('exclusions'),
            allowComposition: editor.querySelector('[data-route-field="allowComposition"]').checked,
            continuity: editor.querySelector('[data-route-field="continuity"]').checked,
          }, Number(editor.dataset.routingRevision));
          renderSkills();
          els.skillSaveStatus.style.color = '';
          els.skillSaveStatus.textContent = 'Routing Metadata 已保存；Raw Skill 未修改';
        } catch (error) {
          els.skillSaveStatus.style.color = '#e58b8b';
          els.skillSaveStatus.textContent = error.code === 'SKILL_REGISTRY_CHANGED' ? '另一窗口已修改，请重新载入后再保存' : `Routing 保存失败：${error.message || error}`;
        }
      });
    });
    els.skillList.querySelectorAll('[data-route-reset]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const editor = button.closest('[data-routing-skill]');
        try {
          skillManifestService.resetRoutingOverride(editor.dataset.routingSkill, Number(editor.dataset.routingRevision));
          renderSkills();
          els.skillSaveStatus.style.color = '';
          els.skillSaveStatus.textContent = 'Routing Override 已重置；Raw Skill 未修改';
        } catch (error) {
          els.skillSaveStatus.style.color = '#e58b8b';
          els.skillSaveStatus.textContent = error.code === 'SKILL_REGISTRY_CHANGED' ? '另一窗口已修改，请重新载入后再重置' : `Routing 重置失败：${error.message || error}`;
        }
      });
    });

    if (creatingSkill || selectedSkillId) bindSkillEditorEvents();
  }

  function readSkillForm() {
    return {
      name: (document.getElementById('skillName')?.value || '').trim(),
      icon: (document.getElementById('skillIcon')?.value || '').trim() || '⭐',
      desc: (document.getElementById('skillDescription')?.value || '').trim(),
      content: (document.getElementById('skillContent')?.value || '').trim(),
    };
  }

  function saveSkill() {
    const form = readSkillForm();
    if (!form.name || !form.content) {
      els.skillSaveStatus.textContent = '请填写名称和 Skill 指令';
      els.skillSaveStatus.style.color = '#e58b8b';
      return;
    }
    if (selectedSkillId) {
      skills.update(selectedSkillId, {
        name: form.name,
        icon: form.icon,
        desc: form.desc,
        systemPrompt: form.content,
      });
      if (selectedSkillId === 'skill1') {
        systemPrompt = skills.getRules() || modelConfig.systemPrompt || '';
        ai.configure({ ...modelConfig, systemPrompt });
        history.setSystemPrompt(systemPrompt);
      }
      els.skillSaveStatus.textContent = 'Skill 修改已同步到桌宠';
    } else {
      skills.upload({
        name: form.name,
        icon: form.icon,
        desc: form.desc,
        category: 'custom',
        inputs: [{ key: 'query', label: '你的需求', type: 'textarea' }],
        prompt: '请严格应用本 Skill，完成用户需求：\n\n{{query}}',
        systemPrompt: form.content,
      });
      els.skillSaveStatus.textContent = 'Skill 已新增并同步到桌宠';
    }
    els.skillSaveStatus.style.color = '';
    resetSkillEditor();
  }

  function isNearBottom(threshold = 120) {
    if (!els.messages) return true;
    const gap = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
    return gap <= threshold;
  }

  function updateScrollBottomButton() {
    if (!els.scrollBottom || !els.messages) return;
    const canScroll = els.messages.scrollHeight > els.messages.clientHeight + 8;
    els.scrollBottom.hidden = !(canScroll && !isNearBottom(140));
  }

  function scrollToBottom(smooth = true) {
    if (!smooth) {
      // 切换会话时在首次绘制前直接定位，避免从顶部滑到末尾。
      els.messages.style.scrollBehavior = 'auto';
      els.messages.scrollTop = els.messages.scrollHeight;
      requestAnimationFrame(() => {
        els.messages.scrollTop = els.messages.scrollHeight;
        els.messages.style.scrollBehavior = '';
        updateScrollBottomButton();
      });
      return;
    }
    requestAnimationFrame(() => {
      els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: 'smooth' });
      setTimeout(updateScrollBottomButton, 280);
    });
  }

  function resizeInput() {
    els.input.style.height = '0px';
    els.input.style.height = Math.min(els.input.scrollHeight, 150) + 'px';
  }

  /** 把用户上传的图片落到本地，聊天记录只存 file:// 缩略图路径（不存 base64） */
  function persistUploadImage(attachment) {
    try {
      const dataUrl = String(attachment && attachment.dataUrl || '');
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) return null;
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const extFromType = (match[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
      const rawName = String(attachment.name || `图片.${extFromType}`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
      const base = path.basename(rawName, path.extname(rawName)) || '图片';
      const ext = path.extname(rawName) || `.${extFromType}`;
      const filePath = path.join(UPLOAD_DIR, `${Date.now().toString(36)}_${base}${ext}`);
      fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
      const fileUrl = window.TeemoMessageSanitize && window.TeemoMessageSanitize.toFileUrl
        ? window.TeemoMessageSanitize.toFileUrl(filePath)
        : `file:///${filePath.replace(/\\/g, '/')}`;
      return { path: filePath, url: fileUrl, name: attachment.name || path.basename(filePath) };
    } catch (error) {
      console.warn('[persistUploadImage]', error);
      return null;
    }
  }

  /** 用户消息展示：文字 + 图片缩略图 + 视频/文档文件名 */
  function buildUserDisplayContent(text, attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    const images = list.filter(item => item.kind === 'image' && item.dataUrl);
    const videos = list.filter(item => item.kind === 'video');
    const docs = list.filter(item => item.kind === 'document');
    const parts = [];
    const bodyText = String(text || '').trim();
    if (bodyText) parts.push(bodyText);
    else if (!images.length && docs.length) parts.push('请读取并分析上传的文件');
    else if (!images.length && !docs.length) parts.push('请读取并分析上传的文件');

    for (const image of images) {
      const saved = persistUploadImage(image);
      if (saved && saved.url) parts.push(`![${saved.name || '图片'}](${saved.url})`);
      else parts.push(`📎 ${image.name || '图片'}`);
    }
    if (videos.length) parts.push(`🎬 ${videos.map(item => item.name).join('、')}`);
    if (docs.length) parts.push(`📎 ${docs.map(item => item.name).join('、')}`);
    return parts.join('\n\n') || '（媒体）';
  }

  function buildAttachmentPrompt(attachments, userText) {
    const sections = [];
    let used = 0;
    for (const item of attachments.filter(file => file.kind === 'document' && file.state === 'ready')) {
      const remaining = MAX_TOTAL_TEXT - used;
      if (remaining <= 0) break;
      const content = item.content.slice(0, remaining);
      used += content.length;
      sections.push(`\n\n--- 文件：${item.name} ---\n${content}\n--- 文件结束 ---`);
    }
    const hasVideo = attachments.some(item => item.kind === 'video');
    const base = userText || (sections.length ? '请阅读并总结这些文件。' : hasVideo ? '请分析这些视频。' : '请分析这些图片。');
    return base + sections.join('');
  }

  function attachmentModality(attachment) {
    if (attachment && ['image', 'video', 'audio'].includes(attachment.kind)) return attachment.kind;
    const extension = path.extname(String(attachment && attachment.name || '')).toLowerCase();
    if (extension === '.pdf') return 'pdf';
    if (['.xls', '.xlsx', '.csv', '.tsv'].includes(extension)) return 'spreadsheet';
    if (['.ppt', '.pptx'].includes(extension)) return 'slides';
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.sql', '.sh', '.ps1'].includes(extension)) return 'code';
    return attachment && attachment.kind === 'document' ? 'document' : 'unknown';
  }

  async function buildComfyPrompt(userText) {
    if (comfyui.isBareImageCommand(userText)) return userText;
    let routedSkillContext = '';
    try {
      const active = history.getActive();
      const route = skillRouter && skillRouter.route({ text: userText, modalities: ['text'], sessionId: active && active.id || null });
      const composed = route && route.selectedSkillIds.length && skillComposer && skillComposer.compose(route);
      routedSkillContext = composed && composed.systemMessage && composed.systemMessage.content || '';
    } catch (_) { /* Skill routing is optional; image generation continues. */ }
    const rules = [
      routedSkillContext,
      skills.getRules() || '',
    ].filter(Boolean).join('\n\n').slice(0, 2400);
    if (ai.useMock) return userText;
    try {
      const result = await ai.send([
        {
          role: 'system',
          content: 'You are an expert SDXL prompt designer. Convert the user request into one detailed English image-generation prompt. Include subject, environment, composition, lighting, color palette, materials, camera or illustration style and quality details. Apply supplied rules. If exact Chinese words must appear in the image, preserve only those words inside double quotes. Output the prompt only, within 180 English words.',
        },
        {
          role: 'user',
          content: `${rules ? `Rules:\n${rules}\n\n` : ''}Image request:\n${userText}`,
        },
      ], { timeout: 90000 });
      return String(result || userText).trim();
    } catch (error) {
      console.warn('[Teemo ComfyUI] 提示词扩写失败，使用用户原文:', error && error.message);
      return userText;
    }
  }

  function comfyProgressText(progress) {
    if (!progress) return '🎨 ComfyUI 正在生成图片…';
    if (progress.stage === 'connecting') return '🔌 正在连接本机 ComfyUI…';
    if (progress.stage === 'queued') return '🧾 生图任务已进入 ComfyUI 队列…';
    if (progress.stage === 'sampling') return `🎨 ComfyUI 正在采样 ${progress.value || 0}/${progress.max || 0}${progress.percent ? `（${progress.percent}%）` : ''}…`;
    if (progress.stage === 'downloading') return '📥 正在读取 ComfyUI 生成结果…';
    return '⏳ ComfyUI 正在加载模型并处理…';
  }

  function stripDataUrls(content) {
    if (window.TeemoMessageSanitize) return window.TeemoMessageSanitize.stripDataUrls(content);
    if (typeof content === 'string') {
      return content
        .replace(/!\[[^\]]*\]\(\s*data:[^)]+\)/g, '[图片]')
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/gi, '[图片]');
    }
    return content;
  }

  function buildImageReply(prefix, archived) {
    if (window.TeemoMessageSanitize && window.TeemoMessageSanitize.buildStoredImageReply) {
      const stored = window.TeemoMessageSanitize.buildStoredImageReply(prefix, archived);
      return { display: stored, stored };
    }
    return { display: `${prefix}\n\n[图片]`, stored: `${prefix}\n\n[图片]` };
  }

  function renderSkillRouteIndicator(messageElement, route) {
    if (!messageElement || !route) return;
    const old = messageElement.querySelector('.teemo-skill-route-chip');
    if (old) old.remove();
    const selected = Array.isArray(route.selectedSkillIds) ? route.selectedSkillIds : [];
    const ambiguous = Array.isArray(route.ambiguousCandidates) ? route.ambiguousCandidates : [];
    if (!selected.length && !ambiguous.length) return;
    const names = selected.map(id => {
      const manifest = skillManifestService && skillManifestService.getSkillManifest(id);
      return manifest ? manifest.name : id;
    });
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'teemo-skill-route-chip';
    chip.textContent = names.length ? `${names.length > 1 ? 'Skills' : 'Skill'} · ${names.join(' + ')}` : '未自动启用 Skill';
    const reasons = (route.reasons || []).map(item => item && item.code || item).filter(Boolean);
    chip.title = names.length
      ? `命中原因：${reasons.join('、') || '明确选择'}；置信度：${route.confidence === 'high' ? '高' : '中'}`
      : '存在多个相近候选，未自动启用 Skill';
    messageElement.insertBefore(chip, messageElement.firstChild);
  }

  async function sendMessage() {
    if (sending) {
      if (abortController) abortController.abort();
      return;
    }
    refreshModelConfig();
    const text = els.input.value.trim();
    if (!pendingFiles.some(file => file.state === 'ready')) {
      const attached = await attachLocalDocumentFromText(text);
      if (!attached) return;
    }
    const readyFiles = pendingFiles.filter(file => file.state === 'ready');
    if (!text && !readyFiles.length) return;
    if (pendingFiles.some(file => file.state === 'reading')) {
      setStatus('请等待文件读取完成', true);
      return;
    }

    const attachments = readyFiles.slice();
    const displayText = buildUserDisplayContent(text, attachments);
    let requestText = buildAttachmentPrompt(attachments, text);
    const images = attachments.filter(file => file.kind === 'image');
    const videos = attachments.filter(file => file.kind === 'video');

    els.input.value = '';
    resizeInput();
    pendingFiles = [];
    renderAttachments();
    history.addMessage('user', displayText);
    renderMessages();

    const assistant = history.addMessage('assistant', '');
    renderHistory();
    const article = document.createElement('article');
    article.className = 'teemo-message assistant';
    article.innerHTML = '<div class="teemo-message-body teemo-thinking">正在理解你的需求…</div>';
    article.hidden = false;
    els.messages.appendChild(article);
    const body = article.querySelector('.teemo-message-body');
    scrollToBottom();

    sending = true;
    abortController = new AbortController();
    els.send.classList.add('stop');
    els.send.title = '停止';
    setStatus('正在处理…');
    let full = '';
    let completedChallengeContext = null;
    // 先让浏览器绘制用户消息和助手状态，再开始联网、意图识别等异步预处理。
    // 避免发送后消息区短暂空白，让用户能立即确认 Teemo 已经开始处理。
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
      if (window.teemoWebBrowse && window.teemoWebBrowse.extractUrls(requestText).length) {
        article.hidden = false;
        body.classList.remove('teemo-thinking');
        body.textContent = '🌐 正在联网读取网页…';
        const browsed = await window.teemoWebBrowse.enrichPrompt(requestText, {
          store,
          signal: abortController.signal,
          onStatus: message => {
            setStatus(message);
            body.textContent = `🌐 ${message}`;
          },
        });
        requestText = browsed.prompt || requestText;
        const okCount = (browsed.fetched || []).filter(item => item.ok).length;
        if (okCount) setStatus(`已读取 ${okCount} 个网页，正在思考…`);
      }

      if (videos.length) {
        const audioSections = [];
        for (const video of videos) {
          try {
            article.hidden = false;
            body.classList.remove('teemo-thinking');
            const result = await audioAnalysis.analyzeVideo(video.file, {
              signal: abortController.signal,
              onStatus: message => {
                setStatus(message);
                body.textContent = `🎧 ${message}`;
              },
            });
            if (result && result.ok && result.text) {
              audioSections.push(`【${video.name} · 音频分析（${result.model}）】\n${result.text}`);
            } else if (result && result.error) {
              audioSections.push(`【${video.name} · 音频分析未完成】\n${result.error}`);
            }
          } catch (audioError) {
            console.warn('[Teemo.audioAnalysis]', audioError);
            audioSections.push(`【${video.name} · 音频分析未完成】\n${audioError.message || '未知错误'}`);
          }
        }
        if (audioSections.length) {
          requestText += `\n\n--- 视频音轨分析结果 ---\n${audioSections.join('\n\n')}\n--- 音轨分析结束 ---\n请把上述声音分析与视频画面结合起来回答，不要再声称自己听不到已经提供的音频分析结果。`;
        }
        setStatus('音轨处理完成，正在结合视频画面分析…');
        body.textContent = '🎬 正在结合视频画面与音轨…';
      }

      const active = history.getActive();
      const apiMessages = window.TeemoMessageSanitize
        ? window.TeemoMessageSanitize.buildApiMessages(
          active.messages.filter(message => message.role === 'system' || message.role === 'user' || message.role === 'assistant'),
          { maxMessages: 24 },
        )
        : active.messages
          .filter(message => message.role === 'system' || message.role === 'user' || message.role === 'assistant')
          .map(message => ({ role: message.role, content: stripDataUrls(message.content) }));
      // 当前会话中已经先写入了 user 消息和一个空的 assistant 占位。
      // API 请求不能携带这个占位，否则把“最后一条”改成 user 时会复制本轮消息。
      while (
        apiMessages.length > 0
        && apiMessages[apiMessages.length - 1].role === 'assistant'
        && !apiMessages[apiMessages.length - 1].content
      ) {
        apiMessages.pop();
      }
      let lastUserIndex = -1;
      for (let i = apiMessages.length - 1; i >= 0; i -= 1) {
        if (apiMessages[i].role === 'user') {
          lastUserIndex = i;
          break;
        }
      }

      if (images.length || videos.length) {
        const multimodal = [{ type: 'text', text: requestText }];
        images.forEach(image => multimodal.push({ type: 'image_url', image_url: { url: image.dataUrl } }));
        videos.forEach(video => multimodal.push({ type: 'video_url', video_url: { url: video.dataUrl } }));
        if (lastUserIndex >= 0) apiMessages[lastUserIndex] = { role: 'user', content: multimodal };
      } else if (lastUserIndex >= 0) {
        apiMessages[lastUserIndex] = { role: 'user', content: requestText };
      }

      // 用户明确要新增 Skill / 记住规则时，要求模型输出可落库格式。
      if (ruleCapture && (
        ruleCapture._wantsNewSkill(text)
        || ruleCapture.looksLikeManualSave(text)
        || ruleCapture.looksLikeRuleRequest(text)
      )) {
        apiMessages.unshift({
          role: 'system',
          content: [
            '用户正在要求新增 Skill 或长期记住规则。',
            '若是独立 Skill：请用完整 Markdown 输出，必须以「# Skill: 名称」开头，包含触发条件与执行步骤；不要只说“已添加”而不给正文。',
            '若是普通回复规则：请整理成清晰条目，系统会自动追加到「Teemo 新增回复规则」。',
          ].join('\n'),
        });
      }

      const localImageReady = comfyui.isEnabled();
      const cloudImageReady = isCloudImageReady(ai.imageConfig || store.get('imageModel') || {}, modelConfig);
      let useImageGen = false;
      let useComfy = false;
      let imagePrompt = text;
      // 只有本地 ComfyUI 或云端生图 API 可用时，才做生图意图判断。
      if (!attachments.length && (localImageReady || cloudImageReady) && window.teemoImageIntent) {
        const intent = await window.teemoImageIntent.detect(ai, text, { signal: abortController.signal });
        if (intent.wantImage) {
          useImageGen = true;
          useComfy = localImageReady;
          imagePrompt = intent.prompt || text;
        }
      }
      if (useImageGen && useComfy) {
        article.hidden = false;
        setStatus('正在整理生图提示词…');
        body.classList.remove('teemo-thinking');
        body.textContent = '✨ 正在为 SDXL 整理提示词…';
        const prompt = await buildComfyPrompt(imagePrompt);
        const sizeMatch = text.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
        const result = await comfyui.generate({
          prompt,
          size: sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : undefined,
          signal: abortController.signal,
          onProgress: progress => {
            body.textContent = comfyProgressText(progress);
            setStatus(progress.stage === 'sampling' ? `ComfyUI 生图 ${progress.percent || 0}%` : 'ComfyUI 正在生图…');
          },
        });
        const imageUrl = result.url || (result.b64 ? `data:image/png;base64,${result.b64}` : '');
        const archived = await archiveGeneratedImage({
          imageUrl,
          userPrompt: imagePrompt,
          source: 'comfyui',
          directUrl: (result.images && result.images[0] && result.images[0].directUrl) || '',
        });
        const reply = buildImageReply('✅ ComfyUI 图片已生成：', archived);
        full = reply.display;
        assistant.content = reply.stored;
      } else if (useImageGen) {
        article.hidden = false;
        setStatus('正在整理生图提示词…');
        body.classList.remove('teemo-thinking');
        body.textContent = '🎨 正在按你的描述生成图片…';
        const prompt = await buildComfyPrompt(imagePrompt);
        const sizeMatch = text.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
        const result = await ai.generateImage({
          prompt,
          size: sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : undefined,
          signal: abortController.signal,
        });
        const imageUrl = result.url || (result.b64 ? `data:image/png;base64,${result.b64}` : '');
        const archived = await archiveGeneratedImage({
          imageUrl,
          userPrompt: imagePrompt,
          source: 'cloud-api',
          directUrl: result.url || '',
        });
        const reply = buildImageReply('✅ 图片已生成：', archived);
        full = reply.display;
        assistant.content = reply.stored;
      } else {
        article.hidden = false;
        body.classList.add('teemo-thinking');
        body.textContent = '思考中';
        // 流式期间用纯文字快速刷（避免每次整段 Markdown 重排导致一卡一卡）；
        // 结束后再做一次完整排版。对 Kimi 这类“攒一段再推”的模型更明显。
        let streamPaintScheduled = false;
        let streamLatest = '';
        const paintStreamText = () => {
          streamPaintScheduled = false;
          body.classList.remove('teemo-thinking');
          body.textContent = streamLatest;
          if (isNearBottom(180)) scrollToBottom(false);
          else updateScrollBottomButton();
        };
        const onChunk = (chunk, accumulated) => {
          full = accumulated;
          streamLatest = accumulated || '';
          if (!streamPaintScheduled) {
            streamPaintScheduled = true;
            requestAnimationFrame(paintStreamText);
          }
        };
        if (agentCore) {
          const agentResult = await agentCore.runStream({
            messages: apiMessages,
            sessionId: active.id || null,
            userMessage: text || displayText,
            modalities: attachments.length ? [...new Set(attachments.map(attachmentModality))] : ['text'],
            signal: abortController.signal,
            disableActionContract: true,
            onChunk,
          });
          if (!agentResult.ok) {
            if (agentResult.error.cancelled) throw new DOMException('已停止生成', 'AbortError');
            throw new Error(agentResult.error.message);
          }
          completedChallengeContext = agentResult.run && agentResult.run.challengeContext;
          renderSkillRouteIndicator(article, agentResult.run && agentResult.run.skillRouting);
          full = agentResult.content;
        } else {
          full = await ai.stream(apiMessages, onChunk, abortController.signal);
        }
      }
      if (!useImageGen) {
        assistant.content = window.TeemoMessageSanitize
          ? window.TeemoMessageSanitize.stripForApi(full || '模型没有返回内容')
          : stripDataUrls(full || '模型没有返回内容');
        const tip = await autoCaptureSkillOrRule(text, full || assistant.content);
        if (tip) {
          full = `${full || assistant.content}${tip}`;
          assistant.content = window.TeemoMessageSanitize
            ? window.TeemoMessageSanitize.stripForApi(full)
            : stripDataUrls(full);
        }
      }
      history.updateLastMessage(assistant.content);
      history.flush();
      body.classList.remove('teemo-thinking');
      body.innerHTML = window.Markdown.render(full || assistant.content);
      if (useImageGen) bindThumbnailOpen(body, assistant.content);
      if (window.Markdown && window.Markdown.bindCopyButtons) {
        window.Markdown.bindCopyButtons(article);
      }
      setStatus(useImageGen ? '图片生成完成' : '回复完成');
    } catch (error) {
      article.hidden = false;
      const stopped = abortController && abortController.signal.aborted;
      const errorText = stopped ? (full || '已停止生成') : `⚠️ ${error.message || '请求失败'}`;
      assistant.content = errorText;
      history.updateLastMessage(errorText);
      history.flush();
      body.classList.remove('teemo-thinking');
      body.innerHTML = window.Markdown.render(errorText);
      setStatus(stopped ? '已停止' : '回复失败', !stopped);
    } finally {
      sending = false;
      abortController = null;
      els.send.classList.remove('stop');
      els.send.title = '发送';
      renderHistory();
      scrollToBottom();
      updateContextMeter();
      updateChallengeUi(completedChallengeContext);
    }
  }

  if (els.newFolder) {
    els.newFolder.addEventListener('click', () => {
      openFolderDialog({
        mode: 'create',
        title: '新建分组',
        tip: '给分组起个名字，比如：生图、提示词',
        value: '我的分组',
      });
    });
  }
  if (els.folderSave) els.folderSave.addEventListener('click', saveFolderDialog);
  if (els.folderCancel) els.folderCancel.addEventListener('click', closeFolderDialog);
  if (els.folderModal) {
    els.folderModal.addEventListener('click', event => {
      if (event.target === els.folderModal) closeFolderDialog();
    });
  }
  if (els.folderInput) {
    els.folderInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveFolderDialog();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeFolderDialog();
      }
    });
  }
  if (els.confirmOk) els.confirmOk.addEventListener('click', () => closeConfirmDialog(true));
  if (els.confirmCancel) els.confirmCancel.addEventListener('click', () => closeConfirmDialog(false));
  if (els.confirmModal) {
    els.confirmModal.addEventListener('click', event => {
      if (event.target === els.confirmModal) closeConfirmDialog(false);
    });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.teemo-history-actions, .teemo-history-move-menu')) closeHistoryMoveMenus();
  });

  els.newChat.addEventListener('click', () => {
    history.create(systemPrompt);
    pendingFiles = [];
    renderAttachments();
    renderAll();
    els.input.focus();
    setStatus('已新建对话');
  });
  els.clearChat.addEventListener('click', () => {
    const active = history.getActive();
    if (active) history.remove(active.id);
    history.create(systemPrompt);
    renderAll();
    setStatus('当前对话已清空');
  });
  els.renameChat.addEventListener('click', openRenameDialog);
  els.title.addEventListener('dblclick', openRenameDialog);
  els.renameCancel.addEventListener('click', closeRenameDialog);
  els.renameSave.addEventListener('click', saveRename);
  els.renameModal.addEventListener('click', event => {
    if (event.target === els.renameModal) closeRenameDialog();
  });
  els.renameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') saveRename();
    if (event.key === 'Escape') closeRenameDialog();
  });
  els.settingsButton.addEventListener('click', showSettings);
  els.settingsBack.addEventListener('click', hideSettings);
  if (els.memoryButton) els.memoryButton.addEventListener('click', showMemory);
  if (els.creativeButton) els.creativeButton.addEventListener('click', showCreativeProfile);
  if (els.challengeQuick) {
    els.challengeQuick.addEventListener('click', () => {
      const state = creativeDirectorState && creativeDirectorState.getState(activeDirectorSessionId());
      setDirectorMode(state && state.mode === 'challenge' ? 'balanced' : 'challenge');
    });
  }
  if (els.directorBalanced) els.directorBalanced.addEventListener('click', () => setDirectorMode('balanced'));
  if (els.directorChallenge) els.directorChallenge.addEventListener('click', () => setDirectorMode('challenge'));
  if (els.directorIntensity) {
    els.directorIntensity.addEventListener('click', event => {
      const button = event.target.closest('[data-director-intensity]');
      if (button) setDirectorIntensity(button.dataset.directorIntensity);
    });
  }
  if (els.addLocalAccess) els.addLocalAccess.addEventListener('click', authorizeLocalFolder);
  if (els.checkUpdate) {
    els.checkUpdate.addEventListener('click', async () => {
      els.checkUpdate.disabled = true;
      if (els.updateCheckStatus) els.updateCheckStatus.textContent = '正在检查…';
      try {
        const result = await ipcRenderer.invoke('check-for-updates');
        if (!result || !result.ok) {
          if (els.updateCheckStatus) els.updateCheckStatus.textContent = result && result.error ? result.error : '检查失败';
        } else if (result.updateAvailable) {
          if (els.updateCheckStatus) els.updateCheckStatus.textContent = `发现 v${result.latestVersion}，正在后台下载…`;
        } else if (els.updateCheckStatus) {
          els.updateCheckStatus.textContent = '已是最新版本';
        }
      } catch (error) {
        if (els.updateCheckStatus) els.updateCheckStatus.textContent = error.message || '检查失败';
      } finally {
        els.checkUpdate.disabled = false;
      }
    });
  }
  if (els.chatFontSize) {
    els.chatFontSize.addEventListener('input', () => {
      applyChatFontSize(els.chatFontSize.value);
    });
    els.chatFontSize.addEventListener('change', () => {
      applyChatFontSize(els.chatFontSize.value, { persist: true });
    });
  }
  if (els.resetChatFont) {
    els.resetChatFont.addEventListener('click', () => {
      applyChatFontSize(16, { persist: true });
      setStatus('聊天字号已恢复默认');
    });
  }
  els.apiProvider.addEventListener('change', () => {
    const saved = (store.get('providerConfigs') || {})[els.apiProvider.value];
    const preset = getProviderPreset(els.apiProvider.value);
    const next = saved || preset;
    if (!next) {
      els.apiRemarkName.value = getProviderLabel(els.apiProvider.value);
      els.apiBaseUrl.value = '';
      els.apiModelName.value = '';
      els.apiKey.value = '';
      syncPauseApiButton();
      return;
    }
    els.apiRemarkName.value = next.label || getProviderLabel(els.apiProvider.value, next);
    els.apiBaseUrl.value = next.baseUrl || '';
    els.apiModelName.value = next.modelName || '';
    els.apiKey.value = next.apiKey || '';
    els.apiSaveStatus.style.color = '';
    els.apiSaveStatus.textContent = saved ? `已载入 ${getProviderLabel(els.apiProvider.value, saved)} 的保存配置` : '';
    syncPauseApiButton();
  });
  els.toggleApiKey.addEventListener('click', () => {
    const showing = els.apiKey.type === 'text';
    els.apiKey.type = showing ? 'password' : 'text';
    els.toggleApiKey.textContent = showing ? '显示' : '隐藏';
  });
  els.saveApi.addEventListener('click', () => {
    openApiFormCollapse();
    saveApiSettings();
  });
  els.testApi.addEventListener('click', () => {
    openApiFormCollapse();
    testApiConnection();
  });
  els.newApi.addEventListener('click', createNewApiConnection);
  if (els.pauseApi) els.pauseApi.addEventListener('click', togglePauseCurrentApi);
  els.deleteApi.addEventListener('click', deleteCurrentApiConnection);
  if (els.saveImageApi) {
    els.saveImageApi.addEventListener('click', () => {
      openImageApiFormCollapse();
      saveImageApiSettings();
    });
  }
  if (els.testImageApi) {
    els.testImageApi.addEventListener('click', () => {
      openImageApiFormCollapse();
      testImageApiConnection();
    });
  }
  if (els.toggleImageApiKey) {
    els.toggleImageApiKey.addEventListener('click', () => {
      const showing = els.imageApiKey.type === 'text';
      els.imageApiKey.type = showing ? 'password' : 'text';
      els.toggleImageApiKey.textContent = showing ? '显示' : '隐藏';
    });
  }
  if (els.saveAudioApi) els.saveAudioApi.addEventListener('click', saveAudioApiSettings);
  if (els.toggleAudioApiKey) {
    els.toggleAudioApiKey.addEventListener('click', () => {
      const showing = els.audioApiKey.type === 'text';
      els.audioApiKey.type = showing ? 'password' : 'text';
      els.toggleAudioApiKey.textContent = showing ? '显示' : '隐藏';
    });
  }
  els.testComfy.addEventListener('click', testComfyConnection);
  els.saveComfy.addEventListener('click', saveComfySettings);
  if (els.openComfyOutput) {
    els.openComfyOutput.addEventListener('click', async () => {
      const result = await window.teemoImageArchive.openComfyOutput(store);
      if (!result || !result.ok) {
        els.comfySaveStatus.style.color = '#e58b8b';
        els.comfySaveStatus.textContent = result && result.error ? result.error : '无法打开文件夹';
      }
    });
  }
  if (els.openArchiveDir) {
    els.openArchiveDir.addEventListener('click', async () => {
      const result = await window.teemoImageArchive.openArchiveDir(store);
      if (!result || !result.ok) {
        els.comfySaveStatus.style.color = '#e58b8b';
        els.comfySaveStatus.textContent = result && result.error ? result.error : '无法打开文件夹';
      }
    });
  }
  els.comfyWorkflowSelect.addEventListener('change', switchComfyWorkflow);
  els.importComfyWorkflow.addEventListener('click', () => els.comfyWorkflowFileInput.click());
  els.comfyWorkflowFileInput.addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    importComfyWorkflow(file);
  });
  els.deleteComfyWorkflow.addEventListener('click', deleteComfyWorkflow);
  if (els.newSkillGroup) {
    els.newSkillGroup.addEventListener('click', () => {
      openFolderDialog({
        mode: 'skill-create',
        title: '新建 Skill 分组',
        tip: '创建后可在每个 Skill 右侧选择所属分组。',
        value: '',
      });
    });
  }
  els.newSkill.addEventListener('click', () => {
    startCreateSkill();
  });
  els.importSkill.addEventListener('click', () => els.skillFileInput.click());
  els.skillFileInput.addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      skills.uploadFromMarkdown(await file.text(), file.name);
      els.skillSaveStatus.style.color = '';
      els.skillSaveStatus.textContent = `已导入 ${file.name}`;
      renderSkills();
    } catch (error) {
      els.skillSaveStatus.style.color = '#e58b8b';
      els.skillSaveStatus.textContent = error.message || '导入失败';
    }
  });
  els.upload.addEventListener('click', () => els.fileInput.click());
  if (els.localDocument) els.localDocument.addEventListener('click', pickLocalDocument);
  els.fileInput.addEventListener('change', event => {
    addFiles(event.target.files);
    event.target.value = '';
  });
  els.input.addEventListener('input', () => {
    resizeInput();
    updateContextMeter();
  });
  if (els.contextMeter) {
    els.contextMeter.addEventListener('click', () => {
      const usage = collectContextUsage();
      setStatus(`上下文约 ${formatTokenCount(usage.used)} / ${formatTokenCount(usage.limit)}（${usage.percent.toFixed(usage.percent >= 10 ? 0 : 1)}%）`);
    });
  }
  els.input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  // Ctrl+V 粘贴图片：只在输入框监听一次（输入框在 dropZone 内，绑两处会粘贴出两份）
  els.input.addEventListener('paste', event => {
    handlePasteImages(event);
  });
  els.send.addEventListener('click', sendMessage);
  els.quickModelButton.addEventListener('click', event => {
    event.stopPropagation();
    const opening = els.quickModelMenu.hidden;
    els.quickModelMenu.hidden = !opening;
    els.quickModel.classList.toggle('open', opening);
  });
  document.addEventListener('click', event => {
    if (els.quickModel.contains(event.target)) return;
    els.quickModelMenu.hidden = true;
    els.quickModel.classList.remove('open');
  });

  ['dragenter', 'dragover'].forEach(type => {
    document.addEventListener(type, event => {
      if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
      event.preventDefault();
      if (type === 'dragenter') dragDepth++;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      els.dropZone.classList.add('drag-over');
    });
  });
  document.addEventListener('dragleave', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropZone.classList.remove('drag-over');
  });
  document.addEventListener('drop', event => {
    event.preventDefault();
    dragDepth = 0;
    els.dropZone.classList.remove('drag-over');
    addFiles(event.dataTransfer?.files || []);
  });

  /** 清掉误进页面的样式文本节点（曾出现 CSS 源码漏到窗口顶部） */
  function scrubLeakedStyleText() {
    const roots = [document.body, document.querySelector('.teemo-app-shell'), document.querySelector('.teemo-workspace')].filter(Boolean);
    roots.forEach(root => {
      Array.from(root.childNodes).forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const text = String(node.textContent || '').trim();
        if (!text) return;
        if (/template-columns|teemo-composer|teemo-quick-model|teemo-messages/.test(text)) {
          node.textContent = '';
        }
      });
    });
    if (els.status && /template-columns|teemo-composer|teemo-quick-model/.test(els.status.textContent || '')) {
      els.status.textContent = '随时可以开始';
    }
  }

  if (els.messages) {
    els.messages.addEventListener('scroll', updateScrollBottomButton, { passive: true });
  }
  if (els.scrollBottom) {
    els.scrollBottom.addEventListener('click', () => {
      scrollToBottom(true);
      setStatus('已回到底部');
    });
  }
  window.addEventListener('resize', updateScrollBottomButton);

  scrubLeakedStyleText();
  ensureSession();
  applyChatFontSize((store.get('appearance') || {}).chatFontSize || 16);
  renderQuickModelSelect();
  renderAll();
  resizeInput();
  updateScrollBottomButton();
  updateContextMeter();
  scrubLeakedStyleText();
  els.input.focus();
})();
