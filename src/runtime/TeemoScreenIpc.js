const crypto = require('crypto');
const TeemoScreenClient = require('./TeemoScreenClient');

function publicError(error) {
  if (error && error.teemoSafe === true && error.code) {
    return { code: error.code, message: String(error.message || 'Screen operation failed safely.') };
  }
  return { code: 'SCREEN_OPERATION_FAILED', message: 'Screen operation failed safely.' };
}

function safeId(value, maxLength = 160) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : '';
}

function registerTeemoScreenIpc(ipcMain, options = {}) {
  const screenService = options.screenService;
  const permissionService = options.permissionService;
  const onSnapshotDiscarded = typeof options.onSnapshotDiscarded === 'function'
    ? options.onSnapshotDiscarded
    : null;
  if (!ipcMain || !screenService || !permissionService) {
    throw new Error('Teemo Screen IPC dependencies are incomplete.');
  }
  const operations = new Map();
  const ttlMs = Number.isInteger(options.operationTtlMs) ? options.operationTtlMs : 2 * 60 * 1000;
  const channels = TeemoScreenClient.CHANNELS;

  function ownerId(event) {
    return `webcontents_${event.sender.id}`;
  }

  function releaseOperation(operation) {
    if (!operation) return;
    operations.delete(operation.operationId);
    permissionService.discardExecutionAuthorization(operation.toolCallId);
  }

  function cleanup() {
    const now = Date.now();
    for (const operation of operations.values()) {
      if (operation.expiresAt <= now) releaseOperation(operation);
    }
    screenService.cleanup();
  }

  function ownedOperation(event, operationId) {
    cleanup();
    const operation = operations.get(safeId(operationId, 200));
    if (!operation || operation.ownerId !== ownerId(event) || operation.expiresAt <= Date.now()) return null;
    return operation;
  }

  function bindOwner(event) {
    if (event.sender.__teemoScreenOwnerBound) return;
    event.sender.__teemoScreenOwnerBound = true;
    event.sender.once('destroyed', () => {
      const owner = `webcontents_${event.sender.id}`;
      for (const operation of Array.from(operations.values())) {
        if (operation.ownerId === owner) releaseOperation(operation);
      }
      try { screenService.disposeOwner(owner); } catch (_) { /* owner is already gone */ }
    });
  }

  ipcMain.handle(channels.list, async event => {
    try {
      bindOwner(event);
      return { ok: true, displays: await screenService.listDisplays(ownerId(event)) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.prepare, (event, payload = {}) => {
    try {
      bindOwner(event);
      cleanup();
      const toolCallId = safeId(payload.toolCallId, 160);
      if (!toolCallId) return { ok: false, error: { code: 'SCREEN_REQUEST_INVALID', message: 'Screen capture request is invalid.' } };
      if (Array.from(operations.values()).filter(item => item.ownerId === ownerId(event)).length >= 8) {
        return { ok: false, error: { code: 'SCREEN_PREPARATION_LIMIT', message: 'Too many pending screen captures.' } };
      }
      const prepared = screenService.prepare(ownerId(event), payload.displayRef);
      const operationId = `screen_op_${crypto.randomUUID()}`;
      operations.set(operationId, Object.freeze({
        operationId,
        ownerId: ownerId(event),
        displayRef: prepared.displayRef,
        toolCallId,
        runId: safeId(payload.runId, 160) || null,
        sessionId: null,
        resource: prepared.resource,
        expiresAt: Date.now() + ttlMs,
      }));
      return { ok: true, operationId, resource: prepared.resource, reason: prepared.reason };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.execute, async (event, payload = {}) => {
    const operation = ownedOperation(event, payload.operationId);
    if (!operation) return { ok: false, error: { code: 'SCREEN_PREPARATION_INVALID', message: 'Prepared screen capture is unavailable.' } };
    if (!permissionService.consumeExecutionAuthorization({
      toolCallId: operation.toolCallId,
      runId: operation.runId,
      sessionId: operation.sessionId,
      toolName: 'screen_snapshot',
      permission: 'read',
      resource: operation.resource,
    })) {
      releaseOperation(operation);
      return { ok: false, error: { code: 'PERMISSION_CHECK_FAILED', message: 'Screen capture authorization is missing or invalid.' } };
    }
    try {
      const snapshot = await screenService.capture(operation.ownerId, operation.displayRef);
      return { ok: true, snapshot };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    } finally {
      operations.delete(operation.operationId);
    }
  });

  ipcMain.handle(channels.getPreview, (event, payload = {}) => {
    try {
      bindOwner(event);
      return { ok: true, preview: screenService.getPreview(ownerId(event), payload.snapshotId) };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.discard, (event, payload = {}) => {
    try {
      bindOwner(event);
      const owner = ownerId(event);
      const snapshotId = safeId(payload.snapshotId, 200);
      const discarded = screenService.discard(owner, snapshotId);
      if (discarded && onSnapshotDiscarded) onSnapshotDiscarded(owner, snapshotId);
      return { ok: true, discarded };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.release, (event, payload = {}) => {
    const operation = ownedOperation(event, payload.operationId);
    if (!operation) return { ok: true, released: false };
    releaseOperation(operation);
    return { ok: true, released: true };
  });

  return { channels, operations, disposeOwner: owner => screenService.disposeOwner(owner) };
}

module.exports = registerTeemoScreenIpc;
