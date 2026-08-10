/* Restricted Windows input adapter. P4-2 intentionally exposes one action only. */
function desktopActionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  return error;
}

function normalizeCoordinate(value) {
  const coordinate = Number(value);
  if (!Number.isInteger(coordinate) || !Number.isSafeInteger(coordinate)
    || coordinate < -2147483648 || coordinate > 2147483647) {
    return null;
  }
  return coordinate;
}

class TeemoWindowsPrimaryClickAdapter {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.koffi = options.koffi || null;
    this.nativeApi = null;
  }

  _loadNativeApi() {
    if (this.nativeApi) return this.nativeApi;
    if (this.platform !== 'win32') {
      throw desktopActionError('DESKTOP_ACTION_UNAVAILABLE', 'Desktop primary click is unavailable on this platform.');
    }
    try {
      const koffi = this.koffi || require('koffi');
      const user32 = koffi.load('user32.dll');
      this.nativeApi = Object.freeze({
        setCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
        mouseEvent: user32.func('void __stdcall mouse_event(uint32_t flags, uint32_t x, uint32_t y, uint32_t data, uintptr_t extraInfo)'),
      });
      return this.nativeApi;
    } catch (_) {
      throw desktopActionError('DESKTOP_ACTION_UNAVAILABLE', 'Desktop primary click is unavailable.');
    }
  }

  clickPrimaryAt(point = {}) {
    const x = normalizeCoordinate(point.x);
    const y = normalizeCoordinate(point.y);
    if (x == null || y == null) {
      throw desktopActionError('DESKTOP_ACTION_POINT_INVALID', 'Desktop click coordinates are invalid.');
    }
    const nativeApi = this._loadNativeApi();
    if (nativeApi.setCursorPos(x, y) !== true) {
      throw desktopActionError('DESKTOP_ACTION_DISPATCH_FAILED', 'Desktop primary click could not be dispatched.');
    }

    let pointerDown = false;
    try {
      nativeApi.mouseEvent(0x0002, 0, 0, 0, 0);
      pointerDown = true;
      nativeApi.mouseEvent(0x0004, 0, 0, 0, 0);
      pointerDown = false;
    } catch (_) {
      if (pointerDown) {
        try { nativeApi.mouseEvent(0x0004, 0, 0, 0, 0); } catch (_) { /* fail closed after release attempt */ }
      }
      throw desktopActionError('DESKTOP_ACTION_DISPATCH_FAILED', 'Desktop primary click could not be dispatched.');
    }
    return Object.freeze({ dispatched: true });
  }
}

TeemoWindowsPrimaryClickAdapter.desktopActionError = desktopActionError;
module.exports = TeemoWindowsPrimaryClickAdapter;
