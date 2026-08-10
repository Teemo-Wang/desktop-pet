(function (root, factory) {
  const Contracts = root && root.TeemoInspirationContracts
    ? root.TeemoInspirationContracts
    : require('./TeemoInspirationContracts');
  const Registry = root && root.TeemoInspirationConnectorRegistry
    ? root.TeemoInspirationConnectorRegistry
    : require('./TeemoInspirationConnectorRegistry');
  const Guard = factory(Contracts, Registry);
  if (root) root.TeemoInspirationAccessGuard = Guard;
  if (typeof window !== 'undefined') window.TeemoInspirationAccessGuard = Guard;
  if (typeof module === 'object' && module.exports) module.exports = Guard;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contracts, Registry) {
  const METHODS = Registry.CAPABILITY_METHODS;

  function makeId() {
    return `inspiration_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  class TeemoInspirationAccessGuard {
    constructor(options = {}) {
      this.registry = options.registry || null;
      this.permissionService = options.permissionService || null;
    }

    _permissionRequest(connectorId, operation, context) {
      return {
        toolCallId: Contracts.safeText(context.toolCallId, 120) || makeId(),
        runId: Contracts.safeText(context.runId, 120) || null,
        sessionId: Contracts.safeText(context.sessionId, 120) || null,
        toolName: Contracts.safeText(context.permissionToolName, 120) || `inspiration_${operation}`,
        permission: 'read',
        resource: Contracts.safeText(context.permissionResource, 32768) || `inspiration://source/${encodeURIComponent(connectorId)}`,
        requiresExecutionAuthorization: context.requiresExecutionAuthorization === true,
        reason: `读取灵感来源：${connectorId}`,
      };
    }

    async _authorize(request, context) {
      if (!this.permissionService) {
        throw Contracts.inspirationError('permissionDenied', 'Permission Service 不可用');
      }
      try {
        if (typeof this.permissionService.authorize === 'function') {
          return await this.permissionService.authorize(request, { signal: context.signal || null });
        }
        if (typeof this.permissionService.requestPermission === 'function') {
          return await this.permissionService.requestPermission(request, { signal: context.signal || null });
        }
      } catch (error) {
        if (context.signal && context.signal.aborted) throw Contracts.inspirationError('aborted', '读取已取消');
        throw Contracts.inspirationError('permissionDenied', 'Permission Service 调用失败');
      }
      throw Contracts.inspirationError('permissionDenied', 'Permission Service 接口无效');
    }

    async authorizeIndexScan(sourceId, context = {}) {
      const id = Contracts.safeText(sourceId, 120);
      if (!id) throw Contracts.inspirationError('requestInvalid', '灵感索引请求无效');
      if (context.signal && context.signal.aborted) throw Contracts.inspirationError('aborted', '索引已取消');
      const sourceKind = context.sourceKind === 'eagle_library' ? 'eagle_library' : 'local_folder';
      const resourceType = sourceKind === 'eagle_library' ? 'eagle-library' : 'local-folder';
      const request = {
        toolCallId: Contracts.safeText(context.toolCallId, 120) || makeId(),
        runId: Contracts.safeText(context.runId, 120) || null,
        sessionId: Contracts.safeText(context.sessionId, 120) || null,
        toolName: 'inspiration_metadata_index',
        permission: 'read',
        resource: `inspiration://${resourceType}/${encodeURIComponent(id)}`,
        requiresExecutionAuthorization: true,
        reason: `建立本地灵感素材索引：${id}`,
      };
      const permission = await this._authorize(request, context);
      if (!permission || permission.decision !== 'allow') {
        const code = permission && permission.decision === 'prompt' ? 'permissionRequired' : 'permissionDenied';
        throw Contracts.inspirationError(code, '灵感索引读取未获授权');
      }
      if (context.signal && context.signal.aborted) throw Contracts.inspirationError('aborted', '索引已取消');
      return {
        toolCallId: request.toolCallId,
        runId: request.runId,
        sessionId: request.sessionId,
        resource: request.resource,
      };
    }

    async execute(connectorId, operation, request = {}, context = {}) {
      const id = Contracts.safeText(connectorId, 100);
      const capability = Contracts.safeText(operation, 60);
      const method = METHODS[capability];
      if (!id || !method) throw Contracts.inspirationError('connectorInvalid', '不支持的只读 Connector 操作');
      if (context.signal && context.signal.aborted) throw Contracts.inspirationError('aborted', '读取已取消');

      const permissionRequest = this._permissionRequest(id, capability, context);
      const permission = await this._authorize(permissionRequest, context);
      if (!permission || permission.decision !== 'allow') {
        const code = permission && permission.decision === 'prompt' ? 'permissionRequired' : 'permissionDenied';
        throw Contracts.inspirationError(code, '灵感来源读取未获授权');
      }
      if (context.signal && context.signal.aborted) throw Contracts.inspirationError('aborted', '读取已取消');
      if (!this.registry) throw Contracts.inspirationError('connectorUnavailable', 'Connector Registry 不可用');

      const connector = this.registry.getConnector(id);
      if (typeof connector[method] !== 'function') {
        throw Contracts.inspirationError('connectorInvalid', 'Connector 未实现声明的只读操作');
      }
      try {
        return await connector[method](Contracts.clone(request), {
          signal: context.signal || null,
          toolCallId: permissionRequest.toolCallId,
          runId: permissionRequest.runId,
          sessionId: permissionRequest.sessionId,
        });
      } catch (error) {
        if ((context.signal && context.signal.aborted) || (error && (error.name === 'AbortError' || error.code === 'ABORT_ERR'))) {
          throw Contracts.inspirationError('aborted', '读取已取消');
        }
        if (error && Object.values(Contracts.ERROR_CODES).includes(error.code)) throw error;
        throw Contracts.inspirationError('connectorUnavailable', 'Connector 调用失败');
      }
    }
  }

  return TeemoInspirationAccessGuard;
});
