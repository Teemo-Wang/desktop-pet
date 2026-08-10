/* P4-1 Main-process-only screen snapshot service. Screen pixels never leave this service without owner-bound IPC. */
const crypto = require('crypto');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function screenError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  return error;
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function safeId(value, maxLength = 160) {
  const text = String(value || '').trim();
  return text && text.length <= maxLength ? text : '';
}

function startsWith(buffer, prefix) {
  return Buffer.isBuffer(buffer) && buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

class TeemoScreenService {
  constructor(options = {}) {
    if (!options.displayProvider || typeof options.displayProvider.list !== 'function') {
      throw new Error('TeemoScreenService requires a display provider.');
    }
    if (!options.captureProvider || typeof options.captureProvider.capture !== 'function') {
      throw new Error('TeemoScreenService requires a capture provider.');
    }
    this.displayProvider = options.displayProvider;
    this.captureProvider = options.captureProvider;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.referenceTtlMs = Number.isInteger(options.referenceTtlMs) ? options.referenceTtlMs : 2 * 60 * 1000;
    this.snapshotTtlMs = Number.isInteger(options.snapshotTtlMs) ? options.snapshotTtlMs : 60 * 1000;
    this.limits = Object.freeze({
      maxDisplays: Number.isInteger(options.maxDisplays) ? options.maxDisplays : 16,
      maxWidth: Number.isInteger(options.maxWidth) ? options.maxWidth : 1600,
      maxHeight: Number.isInteger(options.maxHeight) ? options.maxHeight : 1000,
      maxEncodedBytes: Number.isInteger(options.maxEncodedBytes) ? options.maxEncodedBytes : 4 * 1024 * 1024,
    });
    this.references = new Map();
    this.snapshots = new Map();
    this.snapshotByOwner = new Map();
  }

  _ownerId(value) {
    const ownerId = safeId(value, 80);
    if (!ownerId) throw screenError('SCREEN_OWNER_INVALID', 'Screen request owner is invalid.');
    return ownerId;
  }

  _normalizeDisplay(value) {
    const nativeId = safeId(value && value.nativeId, 160);
    const x = value && value.x == null ? 0 : Number(value && value.x);
    const y = value && value.y == null ? 0 : Number(value && value.y);
    const width = Number(value && value.width);
    const height = Number(value && value.height);
    if (!nativeId || !Number.isInteger(x) || !Number.isInteger(y)
      || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || height < 1 || width > 16384 || height > 16384) {
      return null;
    }
    return Object.freeze({ nativeId, x, y, width, height });
  }

  async _displays() {
    const raw = await this.displayProvider.list();
    if (!Array.isArray(raw)) throw screenError('SCREEN_DISPLAY_UNAVAILABLE', 'Screen displays are unavailable.');
    const seen = new Set();
    const displays = [];
    for (const candidate of raw) {
      const display = this._normalizeDisplay(candidate);
      if (!display || seen.has(display.nativeId)) continue;
      seen.add(display.nativeId);
      displays.push(display);
      if (displays.length >= this.limits.maxDisplays) break;
    }
    return displays;
  }

  _deleteSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;
    this.snapshots.delete(snapshotId);
    if (this.snapshotByOwner.get(snapshot.ownerId) === snapshotId) this.snapshotByOwner.delete(snapshot.ownerId);
    if (snapshot.timer) clearTimeout(snapshot.timer);
    snapshot.png.fill(0);
    return true;
  }

  _clearOwnerReferences(ownerId) {
    for (const [reference, entry] of this.references) {
      if (entry.ownerId === ownerId) this.references.delete(reference);
    }
  }

  cleanup() {
    const now = this.now();
    for (const [reference, entry] of this.references) {
      if (entry.expiresAt <= now) this.references.delete(reference);
    }
    for (const [snapshotId, entry] of this.snapshots) {
      if (entry.expiresAt <= now) this._deleteSnapshot(snapshotId);
    }
  }

  async listDisplays(owner) {
    const ownerId = this._ownerId(owner);
    this.cleanup();
    this._clearOwnerReferences(ownerId);
    const displays = await this._displays();
    const expiresAt = this.now() + this.referenceTtlMs;
    return displays.map((display, index) => {
      const reference = makeId('screen_ref');
      this.references.set(reference, Object.freeze({
        ownerId,
        nativeId: display.nativeId,
        expiresAt,
      }));
      return Object.freeze({
        displayRef: reference,
        label: `显示器 ${index + 1}`,
      });
    });
  }

  _reference(owner, displayRef) {
    this.cleanup();
    const ownerId = this._ownerId(owner);
    const reference = safeId(displayRef, 200);
    const entry = this.references.get(reference);
    if (!entry || entry.ownerId !== ownerId || entry.expiresAt <= this.now()) {
      throw screenError('SCREEN_REFERENCE_INVALID', 'The selected display reference is unavailable.');
    }
    return { ownerId, reference, entry };
  }

  prepare(owner, displayRef) {
    const { reference } = this._reference(owner, displayRef);
    return Object.freeze({
      resource: `screen://display/${reference}`,
      reason: 'Capture one local screen preview for this request only.',
      displayRef: reference,
    });
  }

  async capture(owner, displayRef) {
    const { ownerId, reference, entry } = this._reference(owner, displayRef);
    const displays = await this._displays();
    if (!displays.some(display => display.nativeId === entry.nativeId)) {
      throw screenError('SCREEN_DISPLAY_UNAVAILABLE', 'The selected display is no longer available.');
    }
    const captured = await this.captureProvider.capture(entry.nativeId, {
      maxWidth: this.limits.maxWidth,
      maxHeight: this.limits.maxHeight,
    });
    const png = captured && captured.png;
    const width = Number(captured && captured.width);
    const height = Number(captured && captured.height);
    if (!startsWith(png, PNG_SIGNATURE) || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || height < 1 || width > this.limits.maxWidth || height > this.limits.maxHeight
      || png.length > this.limits.maxEncodedBytes) {
      throw screenError('SCREEN_CAPTURE_INVALID', 'Screen capture failed validation.');
    }

    const priorSnapshotId = this.snapshotByOwner.get(ownerId);
    if (priorSnapshotId) this._deleteSnapshot(priorSnapshotId);
    const snapshotId = makeId('screen_snapshot');
    const expiresAt = this.now() + this.snapshotTtlMs;
    const entrySnapshot = {
      snapshotId,
      ownerId,
      displayRef: reference,
      png: Buffer.from(png),
      width,
      height,
      expiresAt,
      timer: null,
    };
    entrySnapshot.timer = setTimeout(() => this._deleteSnapshot(snapshotId), this.snapshotTtlMs);
    if (entrySnapshot.timer && typeof entrySnapshot.timer.unref === 'function') entrySnapshot.timer.unref();
    this.snapshots.set(snapshotId, entrySnapshot);
    this.snapshotByOwner.set(ownerId, snapshotId);
    return Object.freeze({ snapshotId, width, height, expiresAt: new Date(expiresAt).toISOString() });
  }

  getPreview(owner, snapshotId) {
    this.cleanup();
    const ownerId = this._ownerId(owner);
    const id = safeId(snapshotId, 200);
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.ownerId !== ownerId || snapshot.expiresAt <= this.now()) {
      throw screenError('SCREEN_SNAPSHOT_UNAVAILABLE', 'The local screen preview is unavailable.');
    }
    return Object.freeze({
      snapshotId: snapshot.snapshotId,
      width: snapshot.width,
      height: snapshot.height,
      expiresAt: new Date(snapshot.expiresAt).toISOString(),
      dataUrl: `data:image/png;base64,${snapshot.png.toString('base64')}`,
    });
  }

  async getActionBinding(owner, snapshotId) {
    this.cleanup();
    const ownerId = this._ownerId(owner);
    const id = safeId(snapshotId, 200);
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.ownerId !== ownerId || snapshot.expiresAt <= this.now()) {
      throw screenError('SCREEN_SNAPSHOT_UNAVAILABLE', 'The local screen preview is unavailable.');
    }
    const reference = this.references.get(snapshot.displayRef);
    if (!reference || reference.ownerId !== ownerId || reference.expiresAt <= this.now()) {
      throw screenError('SCREEN_REFERENCE_INVALID', 'The selected display reference is unavailable.');
    }
    const displays = await this._displays();
    const display = displays.find(candidate => candidate.nativeId === reference.nativeId);
    if (!display) {
      throw screenError('SCREEN_DISPLAY_UNAVAILABLE', 'The selected display is no longer available.');
    }
    return Object.freeze({
      snapshotId: snapshot.snapshotId,
      displayRef: snapshot.displayRef,
      nativeId: display.nativeId,
      bounds: Object.freeze({ x: display.x, y: display.y, width: display.width, height: display.height }),
      expiresAt: snapshot.expiresAt,
    });
  }

  discard(owner, snapshotId) {
    const ownerId = this._ownerId(owner);
    const id = safeId(snapshotId, 200);
    const snapshot = this.snapshots.get(id);
    if (!snapshot || snapshot.ownerId !== ownerId) return false;
    return this._deleteSnapshot(id);
  }

  disposeOwner(owner) {
    const ownerId = this._ownerId(owner);
    this._clearOwnerReferences(ownerId);
    const snapshotId = this.snapshotByOwner.get(ownerId);
    if (snapshotId) this._deleteSnapshot(snapshotId);
  }
}

TeemoScreenService.screenError = screenError;
module.exports = TeemoScreenService;
