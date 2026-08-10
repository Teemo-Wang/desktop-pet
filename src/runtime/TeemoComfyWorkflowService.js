/* P4-3 fixed local ComfyUI adapter. No arbitrary graph, endpoint, filesystem, or provider path is exposed. */
const crypto = require('crypto');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024;
const ADAPTER_ID = 'teemo_comfyui_builtin_sdxl';
const RESOURCE = 'comfyui://local/teemo-builtin-sdxl/v1';
const CHECKPOINT = 'SDXL\\Realistic\\speciosa25D_v12.safetensors';
const LOOPBACK_ORIGIN = 'http://127.0.0.1:8188';

function comfyError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.teemoSafe = true;
  return error;
}

function safeId(value, max = 200) {
  const text = String(value || '').trim();
  return text && text.length <= max ? text : '';
}

function pngInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384) return null;
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > bytes.length) return null;
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IEND') {
      if (length !== 0 || next !== bytes.length) return null;
      sawEnd = true;
      break;
    }
    offset = next;
  }
  return sawEnd ? Object.freeze({ width, height }) : null;
}

function normalizeInput(input = {}) {
  const prompt = typeof input.prompt === 'string' ? input.prompt.replace(/\r\n/g, '\n').trim() : '';
  const width = Number(input.width == null ? 1024 : input.width);
  const height = Number(input.height == null ? 1024 : input.height);
  if (!prompt || Buffer.byteLength(prompt, 'utf8') > 1200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(prompt)) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 512 || width > 1024 || height < 512 || height > 1024 || width % 64 || height % 64) return null;
  return Object.freeze({ prompt, width, height });
}

function buildWorkflow(input) {
  return Object.freeze({
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'worst quality, low quality, lowres, blurry, deformed, watermark, signature', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: input.width, height: input.height, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { seed: Math.floor(Math.random() * 2147483647), steps: 26, cfg: 5.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'Teemo_P4_3', images: ['6', 0] } },
  });
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(comfyError('COMFYUI_CANCELLED', 'Local render was cancelled.'));
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(comfyError('COMFYUI_CANCELLED', 'Local render was cancelled.'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

class TeemoComfyLoopbackTransport {
  constructor(options = {}) {
    if (typeof (options.fetch || global.fetch) !== 'function') throw new Error('TeemoComfyLoopbackTransport requires fetch.');
    this.fetch = options.fetch || global.fetch;
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 90000;
    this.requestTimeoutMs = Number.isInteger(options.requestTimeoutMs) && options.requestTimeoutMs > 0 ? options.requestTimeoutMs : 15000;
  }

  async _fetch(pathname, options = {}) {
    const controller = new AbortController();
    const signal = options.signal || null;
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const forwardAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', forwardAbort, { once: true });
    try {
      const response = await this.fetch(`${LOOPBACK_ORIGIN}${pathname}`, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response || !response.ok) throw comfyError('COMFYUI_LOCAL_UNAVAILABLE', 'Local ComfyUI did not accept this render request.');
      return response;
    } catch (error) {
      if (error && error.teemoSafe) throw error;
      if (signal && signal.aborted) throw comfyError('COMFYUI_CANCELLED', 'Local render was cancelled.');
      if (controller.signal.aborted) throw comfyError('COMFYUI_TIMEOUT', 'Local ComfyUI did not respond in time.');
      throw comfyError('COMFYUI_LOCAL_UNAVAILABLE', 'Local ComfyUI is unavailable.');
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', forwardAbort);
    }
  }

  async _readBytes(response, limit, errorCode, message) {
    const header = Number(response && response.headers && response.headers.get && response.headers.get('content-length'));
    if (Number.isFinite(header) && header > limit) throw comfyError(errorCode, message);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw comfyError(errorCode, message);
    return bytes;
  }

  async _readJson(response) {
    const bytes = await this._readBytes(response, MAX_JSON_BYTES, 'COMFYUI_LOCAL_INVALID', 'Local ComfyUI returned an invalid render response.');
    try { return JSON.parse(bytes.toString('utf8')); }
    catch (_) { throw comfyError('COMFYUI_LOCAL_INVALID', 'Local ComfyUI returned an invalid render response.'); }
  }

  async render({ workflow, signal }) {
    const submitted = await this._fetch('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
      signal,
    });
    const queued = await this._readJson(submitted);
    const promptId = safeId(queued && queued.prompt_id, 160);
    if (!promptId || !/^[A-Za-z0-9_-]+$/.test(promptId)) throw comfyError('COMFYUI_LOCAL_INVALID', 'Local ComfyUI returned an invalid render request.');

    const until = Date.now() + this.timeoutMs;
    let history = null;
    while (Date.now() < until) {
      await abortableDelay(800, signal);
      const response = await this._fetch(`/history/${encodeURIComponent(promptId)}`, { signal });
      const data = await this._readJson(response);
      history = data && data[promptId];
      if (history) break;
    }
    if (!history) throw comfyError('COMFYUI_TIMEOUT', 'Local ComfyUI did not finish in time.');
    const image = history.outputs && history.outputs['7'] && history.outputs['7'].images && history.outputs['7'].images[0];
    const filename = safeId(image && image.filename, 160);
    if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename)
      || String(image.subfolder || '') || String(image.type || 'output') !== 'output') {
      throw comfyError('COMFYUI_LOCAL_INVALID', 'Local ComfyUI returned an invalid image result.');
    }
    const imageResponse = await this._fetch(`/view?filename=${encodeURIComponent(filename)}&type=output`, { signal });
    const png = await this._readBytes(imageResponse, MAX_RESULT_BYTES, 'COMFYUI_RESULT_INVALID', 'Local render result is too large.');
    if (!pngInfo(png)) throw comfyError('COMFYUI_RESULT_INVALID', 'Local ComfyUI returned an invalid image result.');
    return Object.freeze({ png });
  }
}

class TeemoComfyWorkflowService {
  constructor(options = {}) {
    if (!options.transport || typeof options.transport.render !== 'function') throw new Error('TeemoComfyWorkflowService requires a fixed local transport.');
    this.transport = options.transport;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.ttlMs = Number.isInteger(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : 60000;
    this.previewTtlMs = Number.isInteger(options.previewTtlMs) && options.previewTtlMs > 0 ? options.previewTtlMs : 60000;
    this.actions = new Map();
    this.previews = new Map();
    this.runs = new Map();
  }

  _owner(owner) {
    const value = safeId(owner, 80);
    if (!value) throw comfyError('COMFYUI_OWNER_INVALID', 'Local render owner is invalid.');
    return value;
  }

  _drop(map, id) {
    const item = map.get(id);
    if (!item) return false;
    map.delete(id);
    if (item.timer) clearTimeout(item.timer);
    if (item.png) item.png.fill(0);
    return true;
  }

  cleanup() {
    const now = this.now();
    for (const [id, item] of this.actions) if (item.expiresAt <= now) this._drop(this.actions, id);
    for (const [id, item] of this.previews) if (item.expiresAt <= now) this._drop(this.previews, id);
  }

  prepare(owner, input) {
    this.cleanup();
    const ownerId = this._owner(owner);
    const normalized = normalizeInput(input);
    if (!normalized) throw comfyError('COMFYUI_RENDER_INVALID', 'Local render input is invalid.');
    if ([...this.actions.values(), ...this.runs.values()].some(item => item.ownerId === ownerId)) {
      throw comfyError('COMFYUI_RENDER_BUSY', 'A local render is already pending.');
    }
    const actionId = `comfy_action_${crypto.randomUUID()}`;
    const action = { actionId, ownerId, input: normalized, expiresAt: this.now() + this.ttlMs, timer: null };
    action.timer = setTimeout(() => this._drop(this.actions, actionId), this.ttlMs);
    if (action.timer.unref) action.timer.unref();
    this.actions.set(actionId, action);
    return Object.freeze({
      actionId,
      resource: RESOURCE,
      reason: 'Render one image with Teemo’s fixed local ComfyUI workflow. The local workflow may create its normal ComfyUI output.',
      expiresAt: new Date(action.expiresAt).toISOString(),
    });
  }

  _action(owner, actionId) {
    this.cleanup();
    const action = this.actions.get(safeId(actionId));
    if (!action || action.ownerId !== this._owner(owner)) throw comfyError('COMFYUI_RENDER_UNAVAILABLE', 'Prepared local render is unavailable.');
    return action;
  }

  async execute(owner, actionId) {
    const action = this._action(owner, actionId);
    this._drop(this.actions, action.actionId);
    const controller = new AbortController();
    const run = { ...action, controller };
    this.runs.set(action.actionId, run);
    try {
      const result = await this.transport.render({ adapterId: ADAPTER_ID, workflow: buildWorkflow(action.input), signal: controller.signal });
      const png = result && Buffer.from(result.png || []);
      if (!pngInfo(png) || png.length > MAX_RESULT_BYTES) throw comfyError('COMFYUI_RESULT_INVALID', 'Local render returned an invalid image result.');
      const previewId = `comfy_preview_${crypto.randomUUID()}`;
      const preview = { previewId, ownerId: action.ownerId, png, expiresAt: this.now() + this.previewTtlMs, timer: null };
      preview.timer = setTimeout(() => this._drop(this.previews, previewId), this.previewTtlMs);
      if (preview.timer.unref) preview.timer.unref();
      this.previews.set(previewId, preview);
      return Object.freeze({ previewId, expiresAt: new Date(preview.expiresAt).toISOString() });
    } catch (error) {
      if (error && error.teemoSafe) throw error;
      throw comfyError(controller.signal.aborted ? 'COMFYUI_CANCELLED' : 'COMFYUI_LOCAL_FAILED', controller.signal.aborted ? 'Local render was cancelled.' : 'Local render failed safely.');
    } finally {
      this.runs.delete(action.actionId);
    }
  }

  cancel(owner, actionId) {
    const ownerId = this._owner(owner);
    const id = safeId(actionId);
    const run = this.runs.get(id);
    if (run && run.ownerId === ownerId) {
      run.controller.abort();
      return true;
    }
    const action = this.actions.get(id);
    return !!(action && action.ownerId === ownerId && this._drop(this.actions, action.actionId));
  }

  getPreview(owner, previewId) {
    this.cleanup();
    const preview = this.previews.get(safeId(previewId));
    if (!preview || preview.ownerId !== this._owner(owner)) throw comfyError('COMFYUI_PREVIEW_UNAVAILABLE', 'Local render preview is unavailable.');
    return Object.freeze({
      previewId: preview.previewId,
      dataUrl: `data:image/png;base64,${preview.png.toString('base64')}`,
      expiresAt: new Date(preview.expiresAt).toISOString(),
    });
  }

  discard(owner, previewId) {
    const preview = this.previews.get(safeId(previewId));
    return !!(preview && preview.ownerId === this._owner(owner) && this._drop(this.previews, preview.previewId));
  }

  disposeOwner(owner) {
    const ownerId = this._owner(owner);
    for (const item of [...this.actions.values()]) if (item.ownerId === ownerId) this._drop(this.actions, item.actionId);
    for (const item of [...this.previews.values()]) if (item.ownerId === ownerId) this._drop(this.previews, item.previewId);
    for (const item of this.runs.values()) if (item.ownerId === ownerId) item.controller.abort();
  }
}

TeemoComfyWorkflowService.RESOURCE = RESOURCE;
TeemoComfyWorkflowService.ADAPTER_ID = ADAPTER_ID;
TeemoComfyWorkflowService.CHECKPOINT = CHECKPOINT;
TeemoComfyWorkflowService.buildWorkflow = buildWorkflow;
TeemoComfyWorkflowService.normalizeInput = normalizeInput;
TeemoComfyWorkflowService.pngInfo = pngInfo;
TeemoComfyWorkflowService.TeemoComfyLoopbackTransport = TeemoComfyLoopbackTransport;
module.exports = TeemoComfyWorkflowService;
