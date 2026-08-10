const TeemoComfyWorkflowService = require('./TeemoComfyWorkflowService');
const TeemoComfyWorkflowClient = require('./TeemoComfyWorkflowClient');

function publicError(error) {
  if (error && error.teemoSafe === true && error.code) {
    return { code: error.code, message: String(error.message || 'Local render failed safely.') };
  }
  return { code: 'COMFYUI_LOCAL_FAILED', message: 'Local render failed safely.' };
}

function safeId(value, maxLength = 200) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : '';
}

function registerTeemoComfyWorkflowIpc(ipcMain, options = {}) {
  const workflowService = options.workflowService;
  const permissionService = options.permissionService;
  if (!ipcMain || !workflowService || !permissionService) throw new Error('Teemo ComfyUI Workflow IPC dependencies are incomplete.');
  const operations = new Map();
  const operationTtlMs = Number.isInteger(options.operationTtlMs) && options.operationTtlMs > 0 ? options.operationTtlMs : 60000;
  const channels = TeemoComfyWorkflowClient.CHANNELS;

  function ownerId(event) { return `webcontents_${event.sender.id}`; }

  function releaseOperation(operation) {
    if (!operation) return false;
    operations.delete(operation.actionId);
    if (operation.timer) clearTimeout(operation.timer);
    permissionService.discardExecutionAuthorization(operation.toolCallId);
    try { workflowService.cancel(operation.ownerId, operation.actionId); } catch (_) { /* already consumed, expired, or completed */ }
    return true;
  }

  function cleanup() {
    const now = Date.now();
    for (const operation of Array.from(operations.values())) if (operation.expiresAt <= now) releaseOperation(operation);
    workflowService.cleanup();
  }

  function ownedOperation(event, actionId, allowExecuting = false) {
    cleanup();
    const operation = operations.get(safeId(actionId, 200));
    if (!operation || operation.ownerId !== ownerId(event) || operation.expiresAt <= Date.now() || (!allowExecuting && operation.executing)) return null;
    return operation;
  }

  function disposeOwner(owner) {
    for (const operation of Array.from(operations.values())) if (operation.ownerId === owner) releaseOperation(operation);
    try { workflowService.disposeOwner(owner); } catch (_) { /* owner already released */ }
  }

  function bindOwner(event) {
    if (event.sender.__teemoComfyWorkflowOwnerBound) return;
    event.sender.__teemoComfyWorkflowOwnerBound = true;
    event.sender.once('destroyed', () => disposeOwner(`webcontents_${event.sender.id}`));
  }

  ipcMain.handle(channels.prepare, (event, payload = {}) => {
    try {
      bindOwner(event);
      cleanup();
      const toolCallId = safeId(payload.toolCallId, 160);
      if (!toolCallId || payload.sessionId != null) {
        return { ok: false, error: { code: 'COMFYUI_REQUEST_INVALID', message: 'Local render request is invalid.' } };
      }
      if (Array.from(operations.values()).some(item => item.ownerId === ownerId(event))) {
        return { ok: false, error: { code: 'COMFYUI_RENDER_BUSY', message: 'A local render is already pending.' } };
      }
      const prepared = workflowService.prepare(ownerId(event), {
        prompt: payload.prompt,
        width: payload.width,
        height: payload.height,
      });
      if (prepared.resource !== TeemoComfyWorkflowService.RESOURCE) {
        try { workflowService.cancel(ownerId(event), prepared.actionId); } catch (_) { /* fail closed */ }
        return { ok: false, error: { code: 'COMFYUI_REQUEST_INVALID', message: 'Local render request is invalid.' } };
      }
      const operation = {
        actionId: prepared.actionId,
        ownerId: ownerId(event),
        toolCallId,
        runId: safeId(payload.runId, 160) || null,
        sessionId: null,
        resource: TeemoComfyWorkflowService.RESOURCE,
        expiresAt: Date.now() + operationTtlMs,
        executing: false,
        timer: null,
      };
      operation.timer = setTimeout(() => releaseOperation(operation), operationTtlMs);
      if (operation.timer.unref) operation.timer.unref();
      operations.set(operation.actionId, operation);
      return { ok: true, actionId: operation.actionId, resource: operation.resource, reason: prepared.reason, expiresAt: prepared.expiresAt };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.execute, async (event, payload = {}) => {
    const operation = ownedOperation(event, payload.actionId);
    if (!operation) return { ok: false, error: { code: 'COMFYUI_RENDER_UNAVAILABLE', message: 'Prepared local render is unavailable.' } };
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId: operation.toolCallId,
      runId: operation.runId,
      sessionId: null,
      toolName: 'comfyui_builtin_render',
      permission: 'execute',
      resource: TeemoComfyWorkflowService.RESOURCE,
    })) {
      releaseOperation(operation);
      return { ok: false, error: { code: 'PERMISSION_CHECK_FAILED', message: 'Local render authorization is missing or invalid.' } };
    }
    operation.executing = true;
    try {
      return { ok: true, result: await workflowService.execute(operation.ownerId, operation.actionId) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      releaseOperation(operation);
    }
  });

  ipcMain.handle(channels.getPreview, (event, payload = {}) => {
    try {
      bindOwner(event);
      return { ok: true, preview: workflowService.getPreview(ownerId(event), payload.previewId) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.discard, (event, payload = {}) => {
    try {
      bindOwner(event);
      return { ok: true, discarded: workflowService.discard(ownerId(event), payload.previewId) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.release, (event, payload = {}) => {
    const operation = ownedOperation(event, payload.actionId, true);
    if (!operation) return { ok: true, released: false };
    releaseOperation(operation);
    return { ok: true, released: true };
  });

  return { channels, operations, disposeOwner };
}

module.exports = registerTeemoComfyWorkflowIpc;
