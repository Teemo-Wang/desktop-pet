/* Teemo V1.4 Chat-first productization helpers. No capability is granted here. */
(function (root, factory) {
  const api = factory();
  if (root) root.TeemoChatProductization = api;
  if (typeof window !== 'undefined') window.TeemoChatProductization = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROUTES = Object.freeze({
    NORMAL_CHAT: 'normal_chat',
    SAFE_FILE_OPERATION: 'safe_file_operation',
    INSPIRATION_RETRIEVAL: 'inspiration_retrieval',
    PLANNING: 'planning',
    AUTONOMOUS_EXECUTION: 'autonomous_execution',
    CONTROLLED_SELF_UPGRADE: 'controlled_self_upgrade',
  });

  const STATES = Object.freeze({
    IDLE: 'idle',
    PLANNING: 'planning',
    WAITING_PERMISSION: 'waiting_permission',
    RUNNING: 'running',
    VERIFYING: 'verifying',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  });

  const SAFE_FILE_TOOLS = Object.freeze([
    'create_directory', 'create_file', 'list_directory', 'patch_file',
    'read_file', 'rename_file', 'search_files', 'search_text',
  ]);

  const PLANNING_INTENT = /(?:^|[\s，。！？、])(?:先|只|请)?(?:规划|制定(?:一个)?计划|列(?:出)?计划步骤|给出(?:一个)?执行计划|plan\b)|(?:不要|无需|先别|暂不)(?:执行|操作|修改)/i;
  const CANCEL_INTENT = /^(?:请)?(?:取消|停止|终止)(?:当前|本次|这个|这次)?(?:任务|操作|执行|升级|运行)?[\s。！？!]*$/i;
  const WINDOWS_READ_INTENT = /(?:读取|阅读|查看|列出|搜索|查找|检索|创建|新建|修改|改写|重命名|写入|read|list|search|find|create|patch|rename|write)[^\r\n]{0,200}\b[a-z]:[\\/]/i;
  const SAFE_FILE_NL_INTENT = /(?:读取|阅读|查看|列出|搜索|查找|检索|创建|新建|修改|改写|重命名|写入|patch|read|list|search|create|rename|write).{0,120}(?:文件|目录|文件夹|\.md|\.js|\.json|docs\/|Teemo-source|INDEX\.md|test\.md)/i;
  const INSPIRATION_INTENT = /(?:灵感库|素材库|我的灵感|我的素材|从我的(?:灵感|素材)|找(?:一些|几个)?[^\r\n]{0,40}(?:参考|灵感|素材))/i;
  const EXECUTE_PLAN_INTENT = /^(?:请)?(?:就)?(?:按|执行|开始执行).{0,40}(?:计划|方案)(?:做|执行|开始)?[\s。！？!]*$/i;
  const SELF_UPGRADE_INTENT = /(?:修改|改掉|改一下|升级).{0,40}(?:你自己|Teemo(?:助理)?(?:自己)?|自身)|受控升级|自升级|修改你自己的/i;
  const BROWSER_COMFY_INTENT = /(?:打开|开启|打开一下).{0,28}(?:comfy\s*ui|comfyui)/i;
  const BROWSER_URL_INTENT = /(?:打开|打开一下|访问|浏览).{0,48}(https?:\/\/[^\s)\]}>，。！？、]+)/i;
  const BROWSER_NEW_WINDOW_INTENT = /(?:帮我)?(?:新建|打开|开启).{0,20}(?:一个)?浏览器(?:窗口|页面)?|(?:新建|打开).{0,12}浏览器窗口/i;
  const INTENT_KEYS = Object.freeze(['schemaVersion', 'intent', 'action', 'target', 'needsPlanning', 'confidence']);
  const INTENT_ACTIONS = Object.freeze({
    [ROUTES.NORMAL_CHAT]: Object.freeze(['discuss']),
    [ROUTES.SAFE_FILE_OPERATION]: Object.freeze(['read', 'list', 'search', 'create', 'patch', 'rename']),
    [ROUTES.INSPIRATION_RETRIEVAL]: Object.freeze(['retrieve']),
    [ROUTES.PLANNING]: Object.freeze(['plan']),
    [ROUTES.AUTONOMOUS_EXECUTION]: Object.freeze(['execute_plan']),
    [ROUTES.CONTROLLED_SELF_UPGRADE]: Object.freeze(['modify_self']),
  });
  const INTENT_MIN_CONFIDENCE = 0.75;
  const EFFECTFUL_INTENT_MIN_CONFIDENCE = 0.9;
  const INTENT_TARGET_MAX_CHARS = 240;

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function matchHighConfidenceIntent(options = {}) {
    const text = cleanText(options.text);
    if (!text && !options.hasAttachments) return null;
    if (options.activeRun && CANCEL_INTENT.test(text)) {
      return Object.freeze({ type: 'local_control', action: 'cancel_current_task', route: null, source: 'local_high_confidence' });
    }
    if (BROWSER_COMFY_INTENT.test(text)) {
      return Object.freeze({
        type: 'local_control',
        action: 'open_browser',
        payload: Object.freeze({ mode: 'comfyui' }),
        route: null,
        source: 'local_high_confidence',
      });
    }
    const urlMatch = text.match(BROWSER_URL_INTENT);
    if (urlMatch && urlMatch[1]) {
      return Object.freeze({
        type: 'local_control',
        action: 'open_browser',
        payload: Object.freeze({ mode: 'url', url: urlMatch[1] }),
        route: null,
        source: 'local_high_confidence',
      });
    }
    if (BROWSER_NEW_WINDOW_INTENT.test(text)) {
      return Object.freeze({
        type: 'local_control',
        action: 'open_browser',
        payload: Object.freeze({ mode: 'new_window' }),
        route: null,
        source: 'local_high_confidence',
      });
    }
    if (options.planningMode || PLANNING_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'plan', route: ROUTES.PLANNING, source: 'local_high_confidence' });
    }
    // Prefer self-upgrade over plain execute when the user clearly targets Teemo itself.
    if (options.currentPlanExecutable && SELF_UPGRADE_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'modify_self', route: ROUTES.CONTROLLED_SELF_UPGRADE, source: 'local_high_confidence' });
    }
    if (options.currentPlanExecutable && EXECUTE_PLAN_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'execute_plan', route: ROUTES.AUTONOMOUS_EXECUTION, source: 'local_high_confidence' });
    }
    if (WINDOWS_READ_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'read', route: ROUTES.SAFE_FILE_OPERATION, source: 'local_high_confidence' });
    }
    if (SAFE_FILE_NL_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'read', route: ROUTES.SAFE_FILE_OPERATION, source: 'local_high_confidence' });
    }
    if (options.inspirationAvailable && INSPIRATION_INTENT.test(text)) {
      return Object.freeze({ type: 'route', action: 'retrieve', route: ROUTES.INSPIRATION_RETRIEVAL, source: 'local_high_confidence' });
    }
    return null;
  }

  // Single-pass default: ordinary Chat is the main path. No pre-send AI classifier.
  function routeIntent(options = {}) {
    const matched = matchHighConfidenceIntent(options);
    return matched && matched.route ? matched.route : ROUTES.NORMAL_CHAT;
  }

  function buildLocalRouteDecision(route, action, text, source) {
    return Object.freeze({
      schemaVersion: 1,
      intent: route,
      action,
      target: cleanText(text).slice(0, INTENT_TARGET_MAX_CHARS),
      needsPlanning: route === ROUTES.PLANNING || route === ROUTES.CONTROLLED_SELF_UPGRADE,
      confidence: 1,
      source: source || 'local_high_confidence',
    });
  }

  function resolveSinglePassIntent(options = {}) {
    const text = cleanText(options.text);
    const snapshot = options.capabilitySnapshot || {};
    const local = matchHighConfidenceIntent({
      text,
      planningMode: options.planningMode,
      activeRun: options.activeRun,
      currentPlanExecutable: Boolean(snapshot.currentPlanExecutable),
      inspirationAvailable: Boolean(snapshot.inspirationRetrieval),
      hasAttachments: Boolean(options.hasAttachments),
    });
    if (local && local.type === 'local_control') {
      return Object.freeze({
        ok: true,
        route: ROUTES.NORMAL_CHAT,
        localControl: local.action,
        localControlPayload: local.payload || null,
        decision: null,
        source: local.source,
      });
    }
    if (local && local.route) {
      const decision = buildLocalRouteDecision(local.route, local.action, text, local.source);
      const validated = validateIntentDecision(decision, snapshot);
      if (!validated.ok) {
        // Keep conversation alive: soft-fallback to single-pass normal Chat.
        return Object.freeze({
          ok: true,
          route: ROUTES.NORMAL_CHAT,
          decision: buildLocalRouteDecision(ROUTES.NORMAL_CHAT, 'discuss', text, 'single_pass_soft_fallback'),
          source: 'single_pass_soft_fallback',
          softFallbackReason: validated.error && validated.error.code || 'CAPABILITY_UNAVAILABLE',
        });
      }
      return Object.freeze({
        ok: true,
        route: validated.route,
        decision,
        source: local.source,
      });
    }
    if (!text && options.hasAttachments) {
      return Object.freeze({
        ok: true,
        route: ROUTES.NORMAL_CHAT,
        decision: buildLocalRouteDecision(ROUTES.NORMAL_CHAT, 'discuss', '', 'local_attachment'),
        source: 'local_attachment',
      });
    }
    return Object.freeze({
      ok: true,
      route: ROUTES.NORMAL_CHAT,
      decision: buildLocalRouteDecision(ROUTES.NORMAL_CHAT, 'discuss', text, 'single_pass_default'),
      source: 'single_pass_default',
    });
  }

  function intentError(code, message) {
    return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
  }

  function parseIntentResponse(raw) {
    const source = typeof raw === 'string' ? raw.trim() : raw;
    let value = source;
    if (typeof source === 'string') {
      try { value = JSON.parse(source); } catch (_) {
        return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned invalid JSON.');
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier must return one object.');
    }
    const keys = Object.keys(value).sort();
    const expected = [...INTENT_KEYS].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned unexpected fields.');
    }
    const route = String(value.intent || '');
    const action = String(value.action || '');
    if (value.schemaVersion !== 1 || !Object.prototype.hasOwnProperty.call(INTENT_ACTIONS, route)) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned an unsupported intent.');
    }
    if (!INTENT_ACTIONS[route].includes(action)) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned an incompatible action.');
    }
    if (typeof value.target !== 'string' || typeof value.needsPlanning !== 'boolean') {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned invalid target or planning fields.');
    }
    const confidence = Number(value.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'Intent classifier returned invalid confidence.');
    }
    const decision = Object.freeze({
      schemaVersion: 1,
      intent: route,
      action,
      target: cleanText(value.target).slice(0, INTENT_TARGET_MAX_CHARS),
      needsPlanning: value.needsPlanning,
      confidence,
      source: 'ai_structured_intent',
    });
    const minimum = [ROUTES.AUTONOMOUS_EXECUTION, ROUTES.CONTROLLED_SELF_UPGRADE].includes(route)
      ? EFFECTFUL_INTENT_MIN_CONFIDENCE
      : INTENT_MIN_CONFIDENCE;
    if (confidence < minimum) {
      return Object.freeze({
        ok: false,
        decision,
        fallbackRoute: ROUTES.NORMAL_CHAT,
        clarificationRequired: true,
        error: Object.freeze({ code: 'INTENT_CONFIDENCE_LOW', message: 'Intent confidence is too low for capability routing.' }),
      });
    }
    return Object.freeze({ ok: true, decision });
  }

  function buildIntentClassificationMessages(options = {}) {
    const snapshot = options.capabilitySnapshot || {};
    const planSummary = options.currentPlanSummary && typeof options.currentPlanSummary === 'object'
      ? {
        available: Boolean(options.currentPlanSummary.available),
        goal: cleanText(options.currentPlanSummary.goal).slice(0, INTENT_TARGET_MAX_CHARS),
      }
      : { available: false, goal: '' };
    const runtime = {
      chatRoutableIntents: Object.values(ROUTES),
      currentPlan: planSummary,
      availability: {
        normal_chat: Boolean(snapshot.normalChat),
        safe_file_operation: Boolean(snapshot.safeFileOperation),
        inspiration_retrieval: Boolean(snapshot.inspirationRetrieval),
        planning: Boolean(snapshot.planning),
        autonomous_execution: Boolean(snapshot.autonomousExecution),
        controlled_self_upgrade: Boolean(snapshot.controlledSelfUpgrade),
      },
    };
    return [
      {
        role: 'system',
        content: [
          'Classify only the user intent. Do not execute, authorize, call tools, or claim success.',
          'Return exactly one JSON object and no markdown with keys: schemaVersion, intent, action, target, needsPlanning, confidence.',
          `intent must be one of: ${Object.values(ROUTES).join(', ')}.`,
          'Actions: normal_chat=discuss; safe_file_operation=read|list|search|create|patch|rename; inspiration_retrieval=retrieve; planning=plan; autonomous_execution=execute_plan; controlled_self_upgrade=modify_self.',
          'Discussion, advice, readiness, and new goals without an explicit request to begin the current plan are normal_chat.',
          'Use autonomous_execution only for executing an ordinary current plan. Use controlled_self_upgrade only for beginning changes to Teemo itself under the current plan.',
          'When the request executes the current plan, use the bounded current-plan summary to distinguish ordinary execution from Teemo self-upgrade.',
          'Unsupported capabilities are not valid intents. Low certainty must use the best safe intent with an honest confidence.',
          'The classification grants no permission and cannot change runtime availability.',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify({ message: cleanText(options.text).slice(0, 2000), runtime }) },
    ];
  }

  function buildCapabilitySnapshot(options = {}) {
    const registry = options.toolRegistry;
    const registered = registry && typeof registry.list === 'function' ? registry.list() : [];
    const registeredSet = new Set(Array.isArray(registered) ? registered : []);
    const safeFileTools = SAFE_FILE_TOOLS.filter(name => registeredSet.has(name));
    const authorizedRoots = Array.isArray(options.authorizedRoots) ? options.authorizedRoots : [];
    return Object.freeze({
      normalChat: Boolean(options.aiAvailable),
      safeFileOperation: safeFileTools.length > 0,
      safeFileTools,
      authorizedRootCount: authorizedRoots.length,
      inspirationRetrieval: Boolean(options.inspirationContextBuilder),
      planning: Boolean(options.planningAvailable),
      autonomousExecution: Boolean(options.autonomousExecutionAvailable),
      currentPlanAvailable: Boolean(options.currentPlanAvailable),
      currentPlanExecutable: options.currentPlanExecutable !== false && Boolean(options.currentPlanAvailable),
      controlledSelfUpgrade: Boolean(options.controlledSelfUpgradeAvailable),
      activeExecution: Boolean(options.activeExecution),
      activeUpgrade: Boolean(options.activeUpgrade),
      intentClassification: Boolean(options.intentClassificationAvailable),
      browserControl: Boolean(options.browserControlEnabled),
    });
  }

  function validateIntentDecision(decision, snapshot = {}) {
    if (!decision || !Object.prototype.hasOwnProperty.call(INTENT_ACTIONS, decision.intent)) {
      return intentError('INTENT_CLASSIFICATION_INVALID', 'A valid structured intent is required.');
    }
    const unavailable = message => intentError('CAPABILITY_UNAVAILABLE', message);
    switch (decision.intent) {
      case ROUTES.NORMAL_CHAT:
        return snapshot.normalChat ? Object.freeze({ ok: true, route: decision.intent, decision }) : unavailable('Normal Chat is unavailable.');
      case ROUTES.SAFE_FILE_OPERATION:
        return snapshot.safeFileOperation && Array.isArray(snapshot.safeFileTools)
          && snapshot.safeFileTools.length === SAFE_FILE_TOOLS.length && snapshot.authorizedRootCount > 0
          ? Object.freeze({ ok: true, route: decision.intent, decision })
          : unavailable('Safe File operations require all approved tools and an authorized root.');
      case ROUTES.INSPIRATION_RETRIEVAL:
        return snapshot.inspirationRetrieval ? Object.freeze({ ok: true, route: decision.intent, decision }) : unavailable('Inspiration retrieval is unavailable.');
      case ROUTES.PLANNING:
        return snapshot.planning ? Object.freeze({ ok: true, route: decision.intent, decision }) : unavailable('Planning is unavailable.');
      case ROUTES.AUTONOMOUS_EXECUTION:
        return snapshot.autonomousExecution && snapshot.currentPlanAvailable && snapshot.currentPlanExecutable
          && !snapshot.activeExecution && !snapshot.activeUpgrade
          ? Object.freeze({ ok: true, route: decision.intent, decision })
          : intentError('EXECUTION_PLAN_INVALID', 'A current valid ordinary plan and idle session are required.');
      case ROUTES.CONTROLLED_SELF_UPGRADE:
        return snapshot.controlledSelfUpgrade && snapshot.currentPlanAvailable && snapshot.currentPlanExecutable
          && !snapshot.activeExecution && !snapshot.activeUpgrade
          ? Object.freeze({ ok: true, route: decision.intent, decision })
          : intentError('UPGRADE_CONTEXT_INVALID', 'A current valid self-upgrade plan and idle session are required.');
      default:
        return intentError('INTENT_CLASSIFICATION_INVALID', 'Unsupported intent.');
    }
  }

  function createSafeFileRegistryView(registry) {
    if (!registry || typeof registry.listDefinitions !== 'function' || typeof registry.execute !== 'function') return null;
    return Object.freeze({
      listDefinitions() {
        return registry.listDefinitions().filter(definition => definition && SAFE_FILE_TOOLS.includes(definition.name));
      },
      list() { return this.listDefinitions().map(definition => definition.name); },
      get(name) { return SAFE_FILE_TOOLS.includes(name) && typeof registry.get === 'function' ? registry.get(name) : null; },
      execute(name, args, context) {
        if (!SAFE_FILE_TOOLS.includes(name)) {
          return Promise.resolve({
            ok: false,
            status: 'failed',
            error: { code: 'UNKNOWN_TOOL', message: 'The requested tool is unavailable in ordinary Chat.' },
          });
        }
        return registry.execute(name, args, context);
      },
    });
  }

  function shouldExposeSafeFileTools(route) {
    // Only the Safe File route receives Provider tool definitions.
    // Ordinary normal_chat stays tool-free and streaming to keep greetings fast and reliable.
    return route === ROUTES.SAFE_FILE_OPERATION;
  }

  function buildCapabilityContext(snapshot, route) {
    const value = snapshot || {};
    const available = [];
    if (value.normalChat) available.push('normal chat');
    if (value.safeFileOperation) {
      available.push(`Safe File operations (${(value.safeFileTools || []).join(', ')}) within ${value.authorizedRootCount || 0} authorized root(s)`);
    }
    if (value.inspirationRetrieval) available.push('authorized local inspiration retrieval when explicitly requested');
    if (value.planning) available.push('tool-free planning');
    if (value.autonomousExecution) {
      available.push(`bounded execution with existing confirmations and verification (${value.currentPlanAvailable ? 'current session plan available' : 'no current session plan'})`);
    }
    if (value.controlledSelfUpgrade) available.push('owner-controlled P5-3 self-upgrade through its dedicated controller');
    if (value.browserControl) {
      available.push('browser open (http/https URL, new browser window, or configured ComfyUI page) after user confirmation');
    }
    return {
      role: 'system',
      content: [
        '[Teemo V1.4 Runtime Capability Snapshot]',
        `Selected intent route: ${route || ROUTES.NORMAL_CHAT}.`,
        `Provider Safe File tool definitions exposed for this route: ${shouldExposeSafeFileTools(route) ? (value.safeFileTools || []).length : 0}.`,
        `Actually available now: ${available.length ? available.join('; ') : 'normal response only'}.`,
        'Use only the declared Provider tools. Never claim an available capability is inaccessible merely because the user described it in natural language.',
        value.browserControl
          ? 'Browser control is enabled: when the user asks to open a browser window, a URL, or ComfyUI, acknowledge that Teemo can open it after confirmation. Do not say browser control is unavailable.'
          : 'Browser control is disabled in settings; tell the user to enable 浏览器控制 under 设置 → 操作批准.',
        'This snapshot grants no permission, adds no tool, and does not weaken confirmation, validation, or local security boundaries.',
      ].join('\n'),
    };
  }

  const ERROR_MESSAGES = Object.freeze({
    permission_denied: '操作未获授权，已安全停止。',
    permission_timeout: '授权等待已超时，操作未执行。',
    file_not_found: '没有找到请求的文件或目录，请检查名称和相对路径。',
    invalid_request: '请求参数或目标不完整，请确认后重试。',
    provider_unavailable: '当前 AI 服务暂时不可用，请稍后重试或检查模型设置。',
    execution_failed: '操作执行失败，未确认完成。',
    verification_failed: '操作结果未通过核验，已停止后续步骤。',
  });

  function errorCode(error) {
    return String(error && (error.code || (error.error && error.error.code)) || '').toUpperCase();
  }

  function normalizeError(error) {
    const code = errorCode(error);
    const rawMessage = cleanText(error && (error.message || (error.error && error.error.message)));
    let category = 'execution_failed';
    if (/PERMISSION_DENIED|PERMISSION_CHECK_FAILED|FILE_OUTSIDE_AUTHORIZED_ROOT|FILE_ROOT_REFERENCE_STALE/.test(code)) category = 'permission_denied';
    else if (/PERMISSION.*TIMEOUT|PERMISSION_TIMEOUT/.test(code)) category = 'permission_timeout';
    else if (/FILE_(?:NOT_FOUND|PARENT_NOT_FOUND)|ENOENT/.test(code)) category = 'file_not_found';
    else if (/VERIFICATION|VERIFY/.test(code)) category = 'verification_failed';
    else if (/PROVIDER|NATIVE_TOOL_CALLING_UNSUPPORTED|REQUEST_FAILED|FETCH|NETWORK|ECONN|ETIMEDOUT/.test(code)) category = 'provider_unavailable';
    else if (/INVALID|UNKNOWN_TOOL|SCHEMA|CONTRACT|ARGUMENT|MAX_STEPS|PLAN_INVALID|OWNER_INVALID|BOUNDS_INVALID/.test(code)) category = 'invalid_request';
    else if (!code && /not found|does not exist/i.test(rawMessage)) category = 'file_not_found';
    const userMessage = code === 'EXECUTION_PLAN_INVALID'
      ? '当前会话没有可执行的有效计划，请先让我制定并确认计划。'
      : code === 'EXECUTION_PLAN_BLOCKED'
        ? '当前规划包含尚未满足前置条件的阻塞步骤，请先补充条件或修订规划后再执行。'
        : code === 'UPGRADE_CONTEXT_INVALID'
          ? '当前会话没有可用于受控升级的有效规划，请先完成并确认规划。'
          : code === 'CAPABILITY_UNAVAILABLE'
            ? '当前请求对应的能力或前置状态不可用，请先检查授权、规划或运行状态。'
            : code === 'INTENT_CLASSIFICATION_INVALID' || code === 'INTENT_CONFIDENCE_LOW'
              ? '意图分类未能确认任何可执行能力，已保持普通聊天且未调用工具。'
            : /FILE_PATH_CONTRACT_INVALID|TOOL_ARGUMENT_VALIDATION_FAILED|TOOL_ARGUMENT_NORMALIZATION_FAILED|NATIVE_TOOL_ARGUMENTS_INVALID|NATIVE_TOOL_CALL_INVALID|FILE_ROOT_REFERENCE_INVALID|FILE_SEARCH_QUERY_INVALID/.test(code)
              ? '文件路径参数不完整。若你已给出完整盘符路径，请直接再说一次该路径；或改用“本地文件”按钮选择文件。'
        : ERROR_MESSAGES[category];
    return Object.freeze({
      category,
      code: code || 'EXECUTION_FAILED',
      userMessage,
    });
  }

  function mapExecutionState(value, fallback = STATES.RUNNING) {
    const state = cleanText(value).toLowerCase();
    if (state === 'idle') return STATES.IDLE;
    if (state === 'planning') return STATES.PLANNING;
    if (['permission_waiting', 'awaiting_user_approval', 'awaiting_step_confirmation', 'authorizing', 'awaiting_begin_approval', 'awaiting_manifest_approval', 'awaiting_patch_confirmation', 'awaiting_script_confirmation'].includes(state)) return STATES.WAITING_PERMISSION;
    if (state === 'verifying') return STATES.VERIFYING;
    if (state === 'succeeded' || state === 'completed') return STATES.SUCCEEDED;
    if (state === 'cancelled') return STATES.CANCELLED;
    if (['failed', 'blocked', 'timed_out'].includes(state)) return STATES.FAILED;
    if (['thinking', 'tool_waiting', 'continuing', 'pending', 'running', 'validating_baseline', 'requesting_manifest', 'patching'].includes(state)) return STATES.RUNNING;
    return fallback;
  }

  function createExecutionStateTracker(initialState = STATES.IDLE) {
    let ownerToken = null;
    let state = mapExecutionState(initialState, STATES.IDLE);
    const terminal = new Set([STATES.SUCCEEDED, STATES.FAILED, STATES.CANCELLED]);
    return Object.freeze({
      begin(ownerId) {
        ownerToken = `${cleanText(ownerId) || 'session'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        state = STATES.IDLE;
        return ownerToken;
      },
      update(token, sourceState) {
        if (!token || token !== ownerToken) return Object.freeze({ accepted: false, state });
        if (terminal.has(state)) return Object.freeze({ accepted: false, state });
        state = mapExecutionState(sourceState, STATES.RUNNING);
        return Object.freeze({ accepted: true, state });
      },
      snapshot() { return Object.freeze({ ownerToken, state }); },
    });
  }

  return Object.freeze({
    ROUTES,
    STATES,
    SAFE_FILE_TOOLS,
    INTENT_KEYS,
    INTENT_ACTIONS,
    INTENT_MIN_CONFIDENCE,
    EFFECTFUL_INTENT_MIN_CONFIDENCE,
    matchHighConfidenceIntent,
    routeIntent,
    resolveSinglePassIntent,
    parseIntentResponse,
    buildIntentClassificationMessages,
    validateIntentDecision,
    buildCapabilitySnapshot,
    buildCapabilityContext,
    createSafeFileRegistryView,
    shouldExposeSafeFileTools,
    normalizeError,
    mapExecutionState,
    createExecutionStateTracker,
  });
});
