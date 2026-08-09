const TeemoResourceMatcher = require('./TeemoResourceMatcher');

const PERMISSIONS = new Set(['none', 'read', 'write', 'execute']);
const SCOPES = new Set(['once', 'session', 'resource']);

function makeId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function safeText(value, maxLength = 200) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

class TeemoPermissionService {
  constructor(options = {}) {
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : 60000;
    this.decisionProvider = typeof options.decisionProvider === 'function'
      ? options.decisionProvider
      : null;
    this.resourceMatcher = options.resourceMatcher || new TeemoResourceMatcher();
    this.grants = new Map();
    this.pending = new Map();
    this.audit = [];
    this.executionAuthorizations = new Map();
    this.executionAuthorizationTtlMs = Number(options.executionAuthorizationTtlMs) || 2 * 60 * 1000;
  }

  _normalizeRequest(input = {}) {
    const permission = safeText(input.permission, 20).toLowerCase();
    const request = {
      toolCallId: safeText(input.toolCallId, 120),
      runId: safeText(input.runId, 120) || null,
      sessionId: safeText(input.sessionId, 120) || null,
      toolName: safeText(input.toolName, 120),
      permission,
      resource: input.resource == null ? null : this.resourceMatcher.normalize(input.resource),
      requiresExecutionAuthorization: input.requiresExecutionAuthorization === true,
      reason: safeText(input.reason, 240) || null,
    };
    if (!request.toolCallId || !request.toolName || !PERMISSIONS.has(permission)) return null;
    if (input.resource != null && !request.resource) return null;
    return request;
  }

  _publicRequest(request, permissionRequestId, createdAt) {
    return Object.freeze({
      permissionRequestId,
      toolCallId: request.toolCallId,
      runId: request.runId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      permission: request.permission,
      resource: request.resource,
      reason: request.reason,
      createdAt,
    });
  }

  _matchingGrant(request) {
    for (const grant of this.grants.values()) {
      if (grant.permission !== request.permission || grant.toolName !== request.toolName) continue;
      if (grant.sessionId !== request.sessionId) continue;
      if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) continue;
      if (grant.scope === 'session' && !grant.resource) return grant;
      if ((grant.scope === 'session' || grant.scope === 'resource')
        && grant.resource && this.resourceMatcher.contains(grant.resource, request.resource)) return grant;
    }
    return null;
  }

  evaluate(input) {
    const request = this._normalizeRequest(input);
    if (!request) return { decision: 'deny', reason: 'permission_request_invalid', source: 'fail_closed' };
    if (request.permission === 'none') return { decision: 'allow', source: 'none_required' };
    const grant = this._matchingGrant(request);
    if (grant) {
      return {
        decision: 'allow',
        source: grant.scope === 'resource' || grant.resource ? 'resource_grant' : 'session_grant',
        grantId: grant.grantId,
        scope: grant.scope,
      };
    }
    return { decision: 'prompt', permission: request.permission, source: 'no_matching_grant' };
  }

  grant(input, options = {}) {
    const request = this._normalizeRequest(input);
    const scope = safeText(options.scope, 20).toLowerCase();
    if (!request || request.permission === 'none' || !SCOPES.has(scope)) return null;
    if (scope === 'once') {
      return Object.freeze({ scope: 'once', toolCallId: request.toolCallId, source: 'user_once' });
    }
    if (!request.sessionId) return null;
    if (scope === 'resource' && !request.resource) return null;
    const grant = Object.freeze({
      grantId: makeId('permission_grant'),
      toolName: request.toolName,
      permission: request.permission,
      sessionId: request.sessionId,
      resource: request.resource,
      scope,
      grantedAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      source: safeText(options.source, 40) || `user_${scope}`,
    });
    this.grants.set(grant.grantId, grant);
    return { ...grant };
  }

  deny(permissionRequestId, reason = 'user_denied') {
    return this.respond(permissionRequestId, { decision: 'deny', reason });
  }

  revoke(grantId) {
    return this.grants.delete(safeText(grantId, 160));
  }

  listGrants(filters = {}) {
    if (!filters || typeof filters !== 'object') filters = {};
    return Array.from(this.grants.values())
      .filter(grant => !filters.sessionId || grant.sessionId === filters.sessionId)
      .map(grant => ({ ...grant }));
  }

  clearSessionGrants(sessionId) {
    const target = safeText(sessionId, 120);
    let removed = 0;
    for (const [grantId, grant] of this.grants) {
      if (grant.sessionId === target) {
        this.grants.delete(grantId);
        removed += 1;
      }
    }
    return removed;
  }

  listAudit() {
    return this.audit.map(event => ({ ...event }));
  }

  _auditRequest(request, permissionRequestId, createdAt) {
    const event = {
      permissionRequestId,
      toolCallId: request.toolCallId,
      runId: request.runId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      permission: request.permission,
      decision: 'prompt',
      scope: null,
      createdAt,
      resolvedAt: null,
    };
    this.audit.push(event);
    return event;
  }

  _finishPending(pending, result) {
    if (!pending || !pending.active) return false;
    pending.active = false;
    this.pending.delete(pending.request.permissionRequestId);
    clearTimeout(pending.timer);
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    pending.audit.decision = result.decision;
    pending.audit.scope = result.scope || null;
    pending.audit.resolvedAt = new Date().toISOString();
    if (result.decision === 'allow' && pending.normalized.requiresExecutionAuthorization) {
      this._recordExecutionAuthorization(pending.normalized);
    }
    pending.resolve(result);
    return true;
  }

  async requestPermission(input, options = {}) {
    const request = this._normalizeRequest(input);
    if (!request) return { decision: 'deny', reason: 'permission_request_invalid', source: 'fail_closed' };
    const evaluated = this.evaluate(request);
    if (evaluated.decision !== 'prompt') {
      if (evaluated.decision === 'allow' && request.permission !== 'none'
        && request.requiresExecutionAuthorization) {
        this._recordExecutionAuthorization(request);
      }
      return evaluated;
    }
    const signal = options.signal || null;
    if (signal && signal.aborted) return { decision: 'deny', reason: 'cancelled', source: 'abort' };

    const permissionRequestId = makeId('permission_request');
    const createdAt = new Date().toISOString();
    const publicRequest = this._publicRequest(request, permissionRequestId, createdAt);
    const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : this.timeoutMs;

    return new Promise(resolve => {
      const pending = {
        active: true,
        request: publicRequest,
        normalized: request,
        resolve,
        signal,
        abortListener: null,
        audit: this._auditRequest(request, permissionRequestId, createdAt),
        timer: null,
      };
      pending.timer = setTimeout(() => {
        this._finishPending(pending, { decision: 'deny', reason: 'timeout', source: 'timeout' });
      }, timeoutMs);
      if (signal) {
        pending.abortListener = () => {
          this._finishPending(pending, { decision: 'deny', reason: 'cancelled', source: 'abort' });
        };
        signal.addEventListener('abort', pending.abortListener, { once: true });
      }
      this.pending.set(permissionRequestId, pending);

      try {
        if (typeof options.onPrompt === 'function') options.onPrompt(publicRequest);
      } catch (_) {
        this._finishPending(pending, { decision: 'deny', reason: 'check_failed', source: 'fail_closed' });
        return;
      }

      const provider = typeof options.decisionProvider === 'function'
        ? options.decisionProvider
        : this.decisionProvider;
      if (provider) {
        Promise.resolve().then(() => provider(publicRequest)).then(response => {
          this.respond(permissionRequestId, response);
        }).catch(() => {
          this._finishPending(pending, { decision: 'deny', reason: 'check_failed', source: 'fail_closed' });
        });
      }
    });
  }

  respond(permissionRequestId, response = {}) {
    const pending = this.pending.get(safeText(permissionRequestId, 160));
    if (!pending || !pending.active) return false;
    const decision = safeText(response.decision, 20).toLowerCase();
    if (decision !== 'allow') {
      return this._finishPending(pending, {
        decision: 'deny',
        reason: safeText(response.reason, 80) || 'user_denied',
        source: 'user',
      });
    }
    const scope = safeText(response.scope, 20).toLowerCase();
    if (!SCOPES.has(scope)) {
      return this._finishPending(pending, { decision: 'deny', reason: 'invalid_scope', source: 'fail_closed' });
    }
    const grant = this.grant(pending.normalized, { scope, source: `user_${scope}` });
    if (!grant) {
      return this._finishPending(pending, { decision: 'deny', reason: 'grant_failed', source: 'fail_closed' });
    }
    return this._finishPending(pending, {
      decision: 'allow',
      source: `user_${scope}`,
      scope,
      grantId: grant.grantId || null,
    });
  }

  cancel(input = {}) {
    const permissionRequestId = safeText(input.permissionRequestId, 160);
    const toolCallId = safeText(input.toolCallId, 160);
    let cancelled = 0;
    for (const pending of Array.from(this.pending.values())) {
      if ((permissionRequestId && pending.request.permissionRequestId === permissionRequestId)
        || (toolCallId && pending.request.toolCallId === toolCallId)) {
        if (this._finishPending(pending, { decision: 'deny', reason: 'cancelled', source: 'abort' })) cancelled += 1;
      }
    }
    return cancelled;
  }

  _recordExecutionAuthorization(request) {
    if (!request || !request.toolCallId || request.permission === 'none') return false;
    for (const [toolCallId, authorization] of this.executionAuthorizations) {
      if (authorization.expiresAt < Date.now()) this.executionAuthorizations.delete(toolCallId);
    }
    this.executionAuthorizations.set(request.toolCallId, Object.freeze({
      toolCallId: request.toolCallId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      permission: request.permission,
      resource: request.resource,
      expiresAt: Date.now() + this.executionAuthorizationTtlMs,
    }));
    return true;
  }

  consumeExecutionAuthorization(input = {}) {
    const request = this._normalizeRequest(input);
    if (!request) return false;
    const authorization = this.executionAuthorizations.get(request.toolCallId);
    if (!authorization || authorization.expiresAt < Date.now()) {
      this.executionAuthorizations.delete(request.toolCallId);
      return false;
    }
    const matches = authorization.sessionId === request.sessionId
      && authorization.toolName === request.toolName
      && authorization.permission === request.permission
      && authorization.resource === request.resource;
    if (!matches) return false;
    this.executionAuthorizations.delete(request.toolCallId);
    return true;
  }

  discardExecutionAuthorization(toolCallId) {
    return this.executionAuthorizations.delete(safeText(toolCallId, 120));
  }
}

TeemoPermissionService.PERMISSIONS = Object.freeze(Array.from(PERMISSIONS));
TeemoPermissionService.SCOPES = Object.freeze(Array.from(SCOPES));
module.exports = TeemoPermissionService;
