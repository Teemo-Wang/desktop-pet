(function (root, factory) {
  const api = factory();
  if (root) root.TeemoInspirationContracts = api;
  if (typeof window !== 'undefined') window.TeemoInspirationContracts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCHEMA_VERSION = 1;
  const READ_CAPABILITIES = Object.freeze(['health', 'list_items', 'item_metadata', 'preview']);
  const READ_CAPABILITY_SET = new Set(READ_CAPABILITIES);
  const WRITE_CAPABILITY_PATTERN = /(write|create|update|delete|remove|move|rename|upload|sync_write)/i;
  const FORBIDDEN_METHODS = Object.freeze([
    'createItem', 'updateItem', 'deleteItem', 'moveItem', 'renameSourceItem', 'uploadItem', 'syncWrite',
  ]);
  const ERROR_CODES = Object.freeze({
    disabled: 'INSPIRATION_DISABLED',
    stateUnreadable: 'INSPIRATION_STATE_UNREADABLE',
    stateChanged: 'INSPIRATION_STATE_CHANGED',
    permissionDenied: 'INSPIRATION_PERMISSION_DENIED',
    permissionRequired: 'INSPIRATION_PERMISSION_REQUIRED',
    connectorNotFound: 'INSPIRATION_CONNECTOR_NOT_FOUND',
    connectorInvalid: 'INSPIRATION_CONNECTOR_INVALID',
    connectorUnavailable: 'INSPIRATION_CONNECTOR_UNAVAILABLE',
    offline: 'INSPIRATION_OFFLINE',
    timeout: 'INSPIRATION_TIMEOUT',
    aborted: 'INSPIRATION_ABORTED',
    sourcesUnreadable: 'INSPIRATION_SOURCES_UNREADABLE',
    sourcesChanged: 'INSPIRATION_SOURCES_CHANGED',
    sourceNotFound: 'INSPIRATION_SOURCE_NOT_FOUND',
    sourceUnavailable: 'INSPIRATION_SOURCE_UNAVAILABLE',
    sourceAuthorizationRequired: 'INSPIRATION_SOURCE_AUTHORIZATION_REQUIRED',
    sourceMissing: 'INSPIRATION_SOURCE_MISSING',
    sourceInvalid: 'INSPIRATION_SOURCE_INVALID',
    sourceAlreadyExists: 'INSPIRATION_SOURCE_ALREADY_EXISTS',
    sourceLimitReached: 'INSPIRATION_SOURCE_LIMIT_REACHED',
    sourceMismatch: 'INSPIRATION_SOURCE_MISMATCH',
    sourceChanged: 'INSPIRATION_SOURCE_CHANGED',
    pathInvalid: 'INSPIRATION_PATH_INVALID',
    pathOutsideSource: 'INSPIRATION_PATH_OUTSIDE_SOURCE',
    depthExceeded: 'INSPIRATION_DEPTH_EXCEEDED',
    linkUnsupported: 'INSPIRATION_LINK_UNSUPPORTED',
    notDirectory: 'INSPIRATION_NOT_DIRECTORY',
    notFile: 'INSPIRATION_NOT_FILE',
    previewUnsupported: 'INSPIRATION_PREVIEW_UNSUPPORTED',
    fileTooLarge: 'INSPIRATION_FILE_TOO_LARGE',
    fileTypeMismatch: 'INSPIRATION_FILE_TYPE_MISMATCH',
    requestInvalid: 'INSPIRATION_REQUEST_INVALID',
    internal: 'INSPIRATION_INTERNAL_ERROR',
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeText(value, maxLength = 160) {
    return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
  }

  function inspirationError(code, message, details = null) {
    const error = new Error(safeText(message, 240) || '灵感服务暂不可用');
    error.code = ERROR_CODES[code] || code || ERROR_CODES.internal;
    if (details && typeof details === 'object') error.details = clone(details);
    return error;
  }

  function publicError(error) {
    const known = new Set(Object.values(ERROR_CODES));
    const code = error && known.has(error.code) ? error.code : ERROR_CODES.internal;
    const messages = {
      [ERROR_CODES.disabled]: '灵感系统尚未启用',
      [ERROR_CODES.stateUnreadable]: '灵感系统状态无法读取，已安全停用',
      [ERROR_CODES.stateChanged]: '灵感系统状态已在其他窗口更新，请刷新后重试',
      [ERROR_CODES.permissionDenied]: '没有读取该灵感来源的权限',
      [ERROR_CODES.permissionRequired]: '读取该灵感来源需要明确授权',
      [ERROR_CODES.connectorNotFound]: '找不到该灵感来源',
      [ERROR_CODES.connectorInvalid]: '该灵感来源配置无效',
      [ERROR_CODES.connectorUnavailable]: '该灵感来源暂不可用',
      [ERROR_CODES.offline]: '该灵感来源当前离线',
      [ERROR_CODES.timeout]: '读取灵感来源超时',
      [ERROR_CODES.aborted]: '已取消读取灵感来源',
      [ERROR_CODES.sourcesUnreadable]: '灵感来源配置无法读取，已安全停用',
      [ERROR_CODES.sourcesChanged]: '灵感来源已在其他窗口更新，请刷新后重试',
      [ERROR_CODES.sourceNotFound]: '找不到该灵感来源',
      [ERROR_CODES.sourceUnavailable]: '本地灵感来源暂不可用',
      [ERROR_CODES.sourceAuthorizationRequired]: '该灵感来源需要重新授权',
      [ERROR_CODES.sourceMissing]: '本地灵感文件夹或项目不存在',
      [ERROR_CODES.sourceInvalid]: '灵感来源配置无效',
      [ERROR_CODES.sourceAlreadyExists]: '该文件夹已经是灵感来源',
      [ERROR_CODES.sourceLimitReached]: '本地灵感来源已达到数量上限',
      [ERROR_CODES.sourceMismatch]: '请选择原来的灵感来源文件夹',
      [ERROR_CODES.sourceChanged]: '本地灵感项目在读取时发生变化',
      [ERROR_CODES.pathInvalid]: '只能访问灵感来源内的相对路径',
      [ERROR_CODES.pathOutsideSource]: '请求路径超出灵感来源范围',
      [ERROR_CODES.depthExceeded]: '目录层级超过安全限制',
      [ERROR_CODES.linkUnsupported]: '不支持访问链接或联接目标',
      [ERROR_CODES.notDirectory]: '请求项目不是文件夹',
      [ERROR_CODES.notFile]: '请求项目不是普通文件',
      [ERROR_CODES.previewUnsupported]: '该文件类型不支持预览',
      [ERROR_CODES.fileTooLarge]: '图片超过预览大小限制',
      [ERROR_CODES.fileTypeMismatch]: '图片扩展名与文件内容不一致',
      [ERROR_CODES.requestInvalid]: '本地灵感请求无效',
      [ERROR_CODES.internal]: '灵感服务暂不可用',
    };
    return { code, message: messages[code] || messages[ERROR_CODES.internal] };
  }

  function validateDefinition(input) {
    const errors = [];
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const connectorId = safeText(source.connectorId, 100);
    const kind = safeText(source.kind, 60);
    const displayName = safeText(source.displayName, 100);
    const version = safeText(source.version, 32);
    const capabilities = Array.isArray(source.capabilities)
      ? Array.from(new Set(source.capabilities.map(item => safeText(item, 60)).filter(Boolean)))
      : [];
    const authorization = source.authorization && typeof source.authorization === 'object'
      ? { type: safeText(source.authorization.type, 60) }
      : { type: '' };
    const offlineBehavior = safeText(source.offlineBehavior, 60);
    const privacyClass = safeText(source.privacyClass, 60);

    if (!/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(connectorId)) errors.push('connectorId');
    if (!kind) errors.push('kind');
    if (!displayName) errors.push('displayName');
    if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push('version');
    if (source.readOnly !== true) errors.push('readOnly');
    if (!authorization.type) errors.push('authorization.type');
    if (!offlineBehavior) errors.push('offlineBehavior');
    if (!privacyClass) errors.push('privacyClass');
    if (capabilities.some(item => WRITE_CAPABILITY_PATTERN.test(item) || !READ_CAPABILITY_SET.has(item))) {
      errors.push('capabilities');
    }

    return {
      ok: errors.length === 0,
      errors,
      value: {
        connectorId,
        kind,
        displayName,
        version,
        readOnly: true,
        capabilities,
        authorization,
        offlineBehavior,
        privacyClass,
      },
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    READ_CAPABILITIES,
    FORBIDDEN_METHODS,
    ERROR_CODES,
    safeText,
    clone,
    inspirationError,
    publicError,
    validateDefinition,
  });
});
