const crypto = require('crypto');
const TeemoFileClient = require('./TeemoFileClient');

function publicError(error) {
  if (error && error.teemoSafe === true && error.code) {
    return { code: error.code, message: String(error.message || 'File operation failed.') };
  }
  return { code: 'FILE_OPERATION_FAILED', message: 'File operation failed safely.' };
}

function registerTeemoFileToolIpc(ipcMain, fileService, options = {}) {
  if (!ipcMain || !fileService) throw new Error('File tool IPC requires ipcMain and a file service.');
  const channels = TeemoFileClient.CHANNELS;
  const operations = new Map();
  const rootsProvider = typeof options.rootsProvider === 'function' ? options.rootsProvider : () => [];
  const ttlMs = Number(options.ttlMs) || 2 * 60 * 1000;
  const permissionService = options.permissionService || null;
  const readTools = new Set(['list_directory', 'read_file', 'search_files', 'search_text']);
  const rootChannel = 'teemo-file-tool:list-roots';
  function rootRefs() { return rootsProvider().map(root => { try { const canonical = fileService.canonicalPath(root); return { rootId: `root_${crypto.createHash('sha256').update(canonical.toLowerCase()).digest('hex').slice(0, 16)}`, displayName: require('path').basename(canonical), capability: 'read-write' }; } catch (_) { return null; } }).filter(Boolean); }
  function resolveRootArgs(args = {}) { if (!args.rootId) return args; const ref = rootRefs().find(item => item.rootId === args.rootId); if (!ref || typeof args.relativePath !== 'string') { const error = new Error('Authorized root reference is unavailable.'); error.code = 'FILE_ROOT_REFERENCE_INVALID'; error.teemoSafe = true; throw error; } const root = rootsProvider().find(candidate => { try { return `root_${crypto.createHash('sha256').update(fileService.canonicalPath(candidate).toLowerCase()).digest('hex').slice(0, 16)}` === ref.rootId; } catch (_) { return false; } }); return { ...args, path: require('path').join(root, args.relativePath) }; }
  ipcMain.handle(rootChannel, () => ({ ok: true, roots: rootRefs() }));

  function ownerOperation(event, operationId) {
    const operation = operations.get(String(operationId || ''));
    if (!operation || operation.senderId !== event.sender.id || operation.expiresAt < Date.now()) {
      if (operation && operation.expiresAt < Date.now()) operations.delete(operation.operationId);
      return null;
    }
    return operation;
  }

  ipcMain.handle(channels.prepare, (event, payload = {}) => {
    try {
      for (const [operationId, operation] of operations) {
        if (operation.expiresAt < Date.now()) {
          operations.delete(operationId);
          if (permissionService && typeof permissionService.discardExecutionAuthorization === 'function') {
            permissionService.discardExecutionAuthorization(operation.toolCallId);
          }
        }
      }
      if (Array.from(operations.values()).filter(operation => operation.senderId === event.sender.id).length >= 100) {
        return { ok: false, error: { code: 'FILE_PREPARATION_LIMIT', message: 'Too many pending file operations.' } };
      }
      const prepared = fileService.prepareOperation(payload.tool, resolveRootArgs(payload.args || {}), rootsProvider());
      const operationId = `file_op_${crypto.randomUUID()}`;
      operations.set(operationId, {
        operationId,
        senderId: event.sender.id,
        prepared,
        toolCallId: String(payload.toolCallId || ''),
        runId: payload.runId == null ? null : String(payload.runId),
        sessionId: payload.sessionId == null ? null : String(payload.sessionId),
        permission: readTools.has(prepared.tool) ? 'read' : 'write',
        cancelled: false,
        expiresAt: Date.now() + ttlMs,
      });
      return { ok: true, operationId, resource: prepared.resource, reason: prepared.reason };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  });

  ipcMain.handle(channels.execute, async (event, { operationId } = {}) => {
    const operation = ownerOperation(event, operationId);
    if (!operation || operation.executing) return { ok: false, error: { code: 'FILE_PREPARATION_INVALID', message: 'Prepared file operation is unavailable.' } };
    if (!permissionService || typeof permissionService.consumeExecutionAuthorization !== 'function'
      || !permissionService.consumeExecutionAuthorization({
        toolCallId: operation.toolCallId,
        runId: operation.runId,
        sessionId: operation.sessionId,
        toolName: operation.prepared.tool,
        permission: operation.permission,
        resource: operation.prepared.resource,
      })) {
      operations.delete(operation.operationId);
      return { ok: false, error: { code: 'PERMISSION_CHECK_FAILED', message: 'File execution authorization is missing or invalid.' } };
    }
    operation.executing = true;
    try {
      const data = await fileService.executePrepared(operation.prepared, rootsProvider(), {
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
    operations.delete(operation.operationId);
    if (permissionService && typeof permissionService.discardExecutionAuthorization === 'function') {
      permissionService.discardExecutionAuthorization(operation.toolCallId);
    }
    return true;
  });

  ipcMain.handle(channels.cancel, (event, { operationId } = {}) => {
    const operation = ownerOperation(event, operationId);
    if (!operation) return false;
    operation.cancelled = true;
    if (!operation.executing && permissionService && typeof permissionService.discardExecutionAuthorization === 'function') {
      permissionService.discardExecutionAuthorization(operation.toolCallId);
    }
    return true;
  });

  return { channels, operations };
}

module.exports = registerTeemoFileToolIpc;
