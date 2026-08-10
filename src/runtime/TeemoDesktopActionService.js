/* Main-process-only P4-2 action service. It accepts only a point from a fresh P4-1 preview. */
const crypto = require('crypto');

function desktopActionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  return error;
}

function safeId(value, maxLength = 200) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : '';
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const canonicalX = Math.round(x * 1000000) / 1000000;
  const canonicalY = Math.round(y * 1000000) / 1000000;
  return Object.freeze({
    x: canonicalX,
    y: canonicalY,
    key: `${canonicalX.toFixed(6)}-${canonicalY.toFixed(6)}`,
  });
}

function displaySignature(binding) {
  const bounds = binding && binding.bounds;
  if (!binding || !safeId(binding.displayRef) || !safeId(binding.nativeId)
    || !bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger)
    || bounds.width < 1 || bounds.height < 1) {
    throw desktopActionError('DESKTOP_ACTION_DISPLAY_INVALID', 'The selected display is unavailable.');
  }
  return `${binding.displayRef}|${binding.nativeId}|${bounds.x}|${bounds.y}|${bounds.width}|${bounds.height}`;
}

function resolveCoordinate(binding, point) {
  const bounds = binding.bounds;
  const x = bounds.x + Math.round(point.x * (bounds.width - 1));
  const y = bounds.y + Math.round(point.y * (bounds.height - 1));
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
    || x < -2147483648 || x > 2147483647 || y < -2147483648 || y > 2147483647) {
    throw desktopActionError('DESKTOP_ACTION_DISPLAY_INVALID', 'The selected display is unavailable.');
  }
  return Object.freeze({ x, y });
}

class TeemoDesktopActionService {
  constructor(options = {}) {
    if (!options.screenService || typeof options.screenService.getActionBinding !== 'function') {
      throw new Error('TeemoDesktopActionService requires TeemoScreenService.');
    }
    if (!options.inputAdapter || typeof options.inputAdapter.clickPrimaryAt !== 'function') {
      throw new Error('TeemoDesktopActionService requires a restricted primary-click adapter.');
    }
    this.screenService = options.screenService;
    this.inputAdapter = options.inputAdapter;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.actionTtlMs = Number.isInteger(options.actionTtlMs) && options.actionTtlMs > 0
      ? options.actionTtlMs
      : 45 * 1000;
    this.maxActionsPerOwner = Number.isInteger(options.maxActionsPerOwner) && options.maxActionsPerOwner > 0
      ? options.maxActionsPerOwner
      : 8;
    this.actions = new Map();
  }

  _ownerId(owner) {
    const ownerId = safeId(owner, 80);
    if (!ownerId) throw desktopActionError('DESKTOP_ACTION_OWNER_INVALID', 'Desktop action owner is invalid.');
    return ownerId;
  }

  _deleteAction(actionId) {
    const action = this.actions.get(actionId);
    if (!action) return false;
    this.actions.delete(actionId);
    if (action.timer) clearTimeout(action.timer);
    return true;
  }

  cleanup() {
    const now = this.now();
    for (const [actionId, action] of this.actions) {
      if (action.expiresAt <= now) this._deleteAction(actionId);
    }
  }

  async prepare(owner, snapshotId, rawPoint) {
    this.cleanup();
    const ownerId = this._ownerId(owner);
    const point = normalizePoint(rawPoint);
    if (!point) throw desktopActionError('DESKTOP_ACTION_POINT_INVALID', 'Select one point inside the local preview.');
    const actionCount = Array.from(this.actions.values()).filter(action => action.ownerId === ownerId).length;
    if (actionCount >= this.maxActionsPerOwner) {
      throw desktopActionError('DESKTOP_ACTION_LIMIT', 'Too many pending desktop actions.');
    }
    const binding = await this.screenService.getActionBinding(ownerId, snapshotId);
    const signature = displaySignature(binding);
    const actionId = `desktop_action_${crypto.randomUUID()}`;
    const expiresAt = this.now() + this.actionTtlMs;
    const action = {
      actionId,
      ownerId,
      snapshotId: binding.snapshotId,
      displayRef: binding.displayRef,
      point,
      displaySignature: signature,
      expiresAt,
      timer: null,
    };
    action.timer = setTimeout(() => this._deleteAction(actionId), this.actionTtlMs);
    if (action.timer && typeof action.timer.unref === 'function') action.timer.unref();
    this.actions.set(actionId, action);
    return Object.freeze({
      actionId,
      resource: `desktop://display/${action.displayRef}/primary-click/${point.key}`,
      reason: 'Dispatch one primary pointer click at the selected point on this local preview.',
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  _ownedAction(owner, actionId) {
    this.cleanup();
    const ownerId = this._ownerId(owner);
    const id = safeId(actionId, 200);
    const action = this.actions.get(id);
    if (!action || action.ownerId !== ownerId || action.expiresAt <= this.now()) {
      throw desktopActionError('DESKTOP_ACTION_UNAVAILABLE', 'Prepared desktop action is unavailable.');
    }
    return action;
  }

  async execute(owner, actionId) {
    const action = this._ownedAction(owner, actionId);
    this._deleteAction(action.actionId);
    const binding = await this.screenService.getActionBinding(action.ownerId, action.snapshotId);
    if (binding.displayRef !== action.displayRef || displaySignature(binding) !== action.displaySignature) {
      throw desktopActionError('DESKTOP_ACTION_DISPLAY_CHANGED', 'The display configuration changed. Capture a fresh local preview.');
    }
    const coordinate = resolveCoordinate(binding, action.point);
    try {
      const result = await this.inputAdapter.clickPrimaryAt(coordinate);
      if (!result || result.dispatched !== true) {
        throw desktopActionError('DESKTOP_ACTION_DISPATCH_FAILED', 'Desktop primary click could not be dispatched.');
      }
      return Object.freeze({ dispatched: true });
    } catch (error) {
      if (error && error.teemoSafe === true) throw error;
      throw desktopActionError('DESKTOP_ACTION_DISPATCH_FAILED', 'Desktop primary click could not be dispatched.');
    }
  }

  release(owner, actionId) {
    const action = this._ownedAction(owner, actionId);
    return this._deleteAction(action.actionId);
  }

  releaseSnapshot(owner, snapshotId) {
    const ownerId = this._ownerId(owner);
    const id = safeId(snapshotId, 200);
    let released = 0;
    for (const action of Array.from(this.actions.values())) {
      if (action.ownerId === ownerId && action.snapshotId === id && this._deleteAction(action.actionId)) released += 1;
    }
    return released;
  }

  disposeOwner(owner) {
    const ownerId = this._ownerId(owner);
    let released = 0;
    for (const action of Array.from(this.actions.values())) {
      if (action.ownerId === ownerId && this._deleteAction(action.actionId)) released += 1;
    }
    return released;
  }
}

TeemoDesktopActionService.desktopActionError = desktopActionError;
TeemoDesktopActionService.normalizePoint = normalizePoint;
module.exports = TeemoDesktopActionService;
