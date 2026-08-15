class TeemoWindowsDesktopHitTest {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.koffi = options.koffi || null;
    this.nativeApi = options.nativeApi || null;
    this.nativeApiLoadAttempted = Boolean(options.nativeApi);
    this.lastError = null;
  }

  _loadNativeApi() {
    if (this.nativeApiLoadAttempted) return this.nativeApi;
    this.nativeApiLoadAttempted = true;
    if (this.platform !== 'win32') return null;

    try {
      const koffi = this.koffi || require('koffi');
      const user32 = koffi.load('user32.dll');
      koffi.struct('TeemoDesktopHitPoint', { x: 'long', y: 'long' });
      koffi.struct('TeemoDesktopHitRect', {
        left: 'long',
        top: 'long',
        right: 'long',
        bottom: 'long',
      });
      this.nativeApi = Object.freeze({
        getCursorPos: user32.func('bool __stdcall GetCursorPos(_Out_ TeemoDesktopHitPoint *point)'),
        getClientRect: user32.func('bool __stdcall GetClientRect(uintptr_t hwnd, _Out_ TeemoDesktopHitRect *rect)'),
        clientToScreen: user32.func('bool __stdcall ClientToScreen(uintptr_t hwnd, _Inout_ TeemoDesktopHitPoint *point)'),
        getWindowLongPtr: user32.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t hwnd, int index)'),
        setWindowLongPtr: user32.func('intptr_t __stdcall SetWindowLongPtrW(uintptr_t hwnd, int index, intptr_t value)'),
        setWindowPos: user32.func('bool __stdcall SetWindowPos(uintptr_t hwnd, uintptr_t after, int x, int y, int width, int height, uint32_t flags)'),
      });
      this.lastError = null;
      return this.nativeApi;
    } catch (error) {
      this.lastError = error?.message || String(error);
      console.warn('[desktop-hit] Windows native cursor mapping unavailable:', this.lastError);
      return null;
    }
  }

  _getNativeHandle(window) {
    const bytes = window?.getNativeWindowHandle?.();
    if (!Buffer.isBuffer(bytes)) return null;
    if (bytes.length >= 8) return bytes.readBigUInt64LE(0);
    if (bytes.length >= 4) return bytes.readUInt32LE(0);
    return null;
  }

  getCursorClientPoint(window) {
    try {
      const nativeApi = this._loadNativeApi();
      const hwnd = this._getNativeHandle(window);
      const contentBounds = window?.getContentBounds?.();
      if (!nativeApi || hwnd == null || !contentBounds) return null;

      const cursor = {};
      const clientOrigin = { x: 0, y: 0 };
      const clientRect = {};
      if (nativeApi.getCursorPos(cursor) !== true
        || nativeApi.clientToScreen(hwnd, clientOrigin) !== true
        || nativeApi.getClientRect(hwnd, clientRect) !== true) return null;

      const nativeWidth = clientRect.right - clientRect.left;
      const nativeHeight = clientRect.bottom - clientRect.top;
      if (nativeWidth <= 0 || nativeHeight <= 0
        || contentBounds.width <= 0 || contentBounds.height <= 0) return null;

      return {
        x: (cursor.x - clientOrigin.x) * contentBounds.width / nativeWidth,
        y: (cursor.y - clientOrigin.y) * contentBounds.height / nativeHeight,
      };
    } catch (error) {
      this.lastError = error?.message || String(error);
      return null;
    }
  }

  setMousePassthrough(window, ignore) {
    try {
      const nativeApi = this._loadNativeApi();
      const hwnd = this._getNativeHandle(window);
      if (!nativeApi || hwnd == null) return false;

      const style = Number(nativeApi.getWindowLongPtr(hwnd, -20));
      if (!Number.isSafeInteger(style)) return false;
      const nextStyle = ignore ? (style | 0x20) : (style & ~0x20);
      if (nextStyle !== style) nativeApi.setWindowLongPtr(hwnd, -20, nextStyle);
      return nativeApi.setWindowPos(hwnd, 0, 0, 0, 0, 0, 0x37) === true;
    } catch (error) {
      this.lastError = error?.message || String(error);
      return false;
    }
  }
}

module.exports = TeemoWindowsDesktopHitTest;
