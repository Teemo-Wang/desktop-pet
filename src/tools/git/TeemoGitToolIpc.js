const crypto = require('crypto');
const TeemoGitClient = require('./TeemoGitClient');

function publicError(error) {
  if (error && error.teemoSafe === true && error.code) {
    return { code: error.code, message: String(error.message || 'Git operation failed.') };
  }
  return { code: 'GIT_OPERATION_FAILED', message: 'Git operation failed safely.' };
}

function registerTeemoGitToolIpc(ipcMain, gitService, options = {}) {
  if (!ipcMain || !gitService) throw new Error('Git tool IPC requires ipcMain and TeemoGitService.');
  const channels = TeemoGitClient.CHANNELS;
  const operations = new Map();
  const preparing = new Map();
  const rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
  const permissionService = options.permissionService || null;
  const ttlMs = Number(options.ttlMs) || 2 * 60 * 1000;
  const readTools = new Set(['git_status', 'git_diff', 'git_log', 'git_show']);

  function discard(operation) {
    operations.delete(operation.operationId);
    if (permissionService && typeof permissionService.discardExecutionAuthorization === 'function') {
      permissionService.discardExecutionAuthorization(operation.toolCallId);
    }
  }

  function ownerOperation(event, operationId) {
    const operation = operations.get(String(operationId || ''));
    if (!operation || operation.senderId !== event.sender.id || operation.expiresAt < Date.now()) {
      if (operation && operation.expiresAt < Date.now()) discard(operation);
      return null;
    }
    return operation;
  }

  ipcMain.handle(channels.prepare, async (event, payload = {}) => {
    const preparationKey = `${event.sender.id}:${String(payload.toolCallId || '')}`;
    const preparation = { senderId: event.sender.id, toolCallId: String(payload.toolCallId || ''), cancelled: false };
    preparing.set(preparationKey, preparation);
    try {
      for (const operation of Array.from(operations.values())) {
        if (operation.expiresAt < Date.now()) discard(operation);
      }
      if (Array.from(operations.values()).filter(operation => operation.senderId === event.sender.id).length >= 50) {
        return { ok: false, error: { code: 'GIT_OPERATION_FAILED', message: 'Too many pending Git operations.' } };
      }
      const prepared = await gitService.prepareOperation(payload.tool, payload.args || {}, rootsProvider(), {
        checkCancelled: () => preparation.cancelled,
      });
      if (preparation.cancelled) {
        return { ok: false, error: { code: 'GIT_CANCELLED', message: 'Git operation was cancelled.' } };
      }
      const operationId = `git_op_${crypto.randomUUID()}`;
      operations.set(operationId, {
        operationId,
        senderId: event.sender.id,
        prepared,
        toolCallId: String(payload.toolCallId || ''),
        runId: payload.runId == null ? null : String(payload.runId),
        sessionId: payload.sessionId == null ? null : String(payload.sessionId),
        permission: readTools.has(prepared.tool) ? 'read' : 'write',
        cancelled: false,
        executing: false,
        expiresAt: Date.now() + ttlMs,
      });
      return { ok: true, operationId, resource: prepared.resource, reason: prepared.reason };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      preparing.delete(preparationKey);
    }
  });

  ipcMain.handle(channels.execute, async (event, { operationId } = {}) => {
    const operation = ownerOperation(event, operationId);
    if (!operation || operation.executing) {
      return { ok: false, error: { code: 'GIT_PATH_INVALID', message: 'Prepared Git operation is unavailable.' } };
    }
    if (!permissionService || typeof permissionService.consumeExecutionAuthorization !== 'function'
      || !permissionService.consumeExecutionAuthorization({
        toolCallId: operation.toolCallId,
        runId: operation.runId,
        sessionId: operation.sessionId,
        toolName: operation.prepared.tool,
        permission: operation.permission,
        resource: operation.prepared.resource,
      })) {
      discard(operation);
      return { ok: false, error: { code: 'PERMISSION_CHECK_FAILED', message: 'Git execution authorization is missing or invalid.' } };
    }
    operation.executing = true;
    try {
      const data = await gitService.executePrepared(operation.prepared, rootsProvider(), {
        checkCancelled: () => operation.cancelled,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      operations.delete(operation.operationId);
    }
  });

  ipcMain.handle(channels.release, (event, { operationId } = {}) => {
    const operation = ownerOperation(event, operationId);
    if (!operation || operation.executing) return false;
    discard(operation);
    return true;
  });

  ipcMain.handle(channels.cancel, (event, { operationId, toolCallId } = {}) => {
    if (toolCallId) {
      const preparation = preparing.get(`${event.sender.id}:${String(toolCallId)}`);
      if (preparation) {
        preparation.cancelled = true;
        return true;
      }
    }
    const operation = ownerOperation(event, operationId);
    if (!operation) return false;
    operation.cancelled = true;
    if (!operation.executing) discard(operation);
    return true;
  });

  return { channels, operations, preparing };
}

module.exports = registerTeemoGitToolIpc;
