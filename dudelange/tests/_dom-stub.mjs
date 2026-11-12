/**
 * Minimal DOM/Canvas stub so the browser entry module can be imported in Node.
 *
 * The point is not to render anything — WebGL is unavailable here — but to walk
 * the same top-level code path the browser walks: module graph, class
 * initialisation order, world build, UI construction. Everything up to the GPU
 * has to survive; a temporal-dead-zone error or a missing export does not.
 */


/* --------------------------------------------------------------- fake WebGL */
let constCounter = 1000;
const constCache = new Map();
const KNOWN = {
  VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724, VENDOR: 7936, RENDERER: 7937,
  MAX_TEXTURE_SIZE: 3379, MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_TEXTURE_IMAGE_UNITS: 34930,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
  MAX_VERTEX_UNIFORM_VECTORS: 36347, MAX_FRAGMENT_UNIFORM_VECTORS: 36348,
  MAX_VERTEX_ATTRIBS: 34921, MAX_VARYING_VECTORS: 36348, MAX_SAMPLES: 36183,
  MAX_VIEWPORT_DIMS: 3386, MAX_RENDERBUFFER_SIZE: 34024, MAX_3D_TEXTURE_SIZE: 32883,
  MAX_ARRAY_TEXTURE_LAYERS: 35071, MAX_DRAW_BUFFERS: 34852,
  SCISSOR_BOX: 3088, VIEWPORT: 2978, DEPTH_BITS: 3414, STENCIL_BITS: 3415
};

const glTarget = {
  canvas: { width: 1280, height: 720 },
  drawingBufferWidth: 1280, drawingBufferHeight: 720,
  getContextAttributes: () => ({ alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' }),
  getParameter(p) {
    const n = Number(p);
    if (n === 7938 || n === 35724) return 'WebGL 2.0 (stub)';
    if (n === 7936 || n === 7937) return 'stub';
    if (n === 34930 || n === 35660 || n === 34076 || n === 3379 || n === 34024 || n === 36347 || n === 36348) return 16384;
    if (n === 36349 || n === 3386) return 16;
    if (n === 3378) return new Int32Array([16384, 16384]);
    if (n === 2978 || n === 3088) return new Int32Array([0, 0, 1280, 720]);
    if (n === 36183 || n === 32883) return 1024;
    return 8;
  },
  getExtension(name) {
    if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
    if (name === 'EXT_texture_filter_anisotropic') return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047, TEXTURE_MAX_ANISOTROPY_EXT: 34046 };
    if (name === 'WEBGL_lose_context') return { loseContext() {}, restoreContext() {} };
    return {};
  },
  getSupportedExtensions: () => [],
  getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
  getProgramParameter: () => true,
  getShaderParameter: () => true,
  getProgramInfoLog: () => '',
  getShaderInfoLog: () => '',
  getError: () => 0,
  checkFramebufferStatus: () => 36053,
  getActiveUniform: () => ({ name: 'u', size: 1, type: 5126 }),
  getActiveAttrib: () => ({ name: 'a', size: 1, type: 5126 }),
  getUniformLocation: () => ({}),
  getAttribLocation: () => 0,
  isContextLost: () => false,
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
  createTexture: () => ({}), createFramebuffer: () => ({}), createRenderbuffer: () => ({}),
  createVertexArray: () => ({}), createSampler: () => ({}), createQuery: () => ({}),
  createTransformFeedback: () => ({})
};

let useFakeGL = true;

export const fakeGL = new Proxy(glTarget, {
  get(target, key) {
    if (key in target) return target[key];
    if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) {
      if (KNOWN[key]) return KNOWN[key];
      if (!constCache.has(key)) constCache.set(key, (constCounter += 1));
      return constCache.get(key);
    }
    return () => {};
  }
});

const ctx2d = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'canvas') return null;
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
    if (key === 'createPattern') return () => ({});
    return () => {};
  },
  set(target, key, value) { target[key] = value; return true; }
});

const node = (id) => {
  const n = {
    id, innerHTML: '', value: '', width: 1280, height: 720,
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; }, toString() { return ''; } },
    dataset: {}, children: [],
    appendChild(child) { n.children.push(child); return child; },
    removeChild() {}, remove() {}, insertBefore() {},
    _handlers: new Map(),
    addEventListener(type, fn) {
      if (!n._handlers.has(type)) n._handlers.set(type, []);
      n._handlers.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = n._handlers.get(type) || [];
      n._handlers.set(type, list.filter((f) => f !== fn));
    },
    dispatch(type, event = {}) {
      const payload = { type, target: n, currentTarget: n, preventDefault() {}, stopPropagation() {}, ...event };
      for (const fn of n._handlers.get(type) || []) fn(payload);
      return payload;
    },
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    querySelector() { return node('q'); }, querySelectorAll() { return []; },
    getContext(kind) { return kind === '2d' ? ctx2d : useFakeGL ? fakeGL : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    focus() {}, blur() {}, scrollIntoView() {},
    click() { if (typeof n.onclick === 'function') return n.onclick({ target: n }); return undefined; },
    insertAdjacentHTML() {}, cloneNode() { return node(id); },
    offsetWidth: 1280, offsetHeight: 720, clientWidth: 1280, clientHeight: 720,
    _text: ''
  };
  // Like the real thing: setting textContent drops the children, reading it
  // concatenates them. The failure panel is built from nodes, so the tests have
  // to be able to read it back the way a player would see it.
  Object.defineProperty(n, 'textContent', {
    get() {
      return n._text || n.children.map((c) => (c && c.textContent) || '').join('');
    },
    set(v) {
      n._text = v == null ? '' : String(v);
      n.children.length = 0;
    },
    enumerable: true
  });
  return n;
};

/** Install the stub on globalThis and return handles the test can inspect. */
export function installDomStub({ webgl = true } = {}) {
  useFakeGL = webgl;
  const registry = new Map();
  const byId = (id) => {
    if (!registry.has(id)) registry.set(id, node(id));
    return registry.get(id);
  };

  globalThis.document = {
    getElementById: byId,
    createElement: (tag) => node(tag),
    createElementNS: (_ns, tag) => node(tag),
    querySelector: (sel) => node(sel),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => globalThis.addEventListener(type, fn),
    removeEventListener: (type, fn) => globalThis.removeEventListener(type, fn),
    createTextNode: (text) => ({ textContent: text }),
    body: node('body'), documentElement: node('html'), head: node('head'),
    pointerLockElement: null, hidden: false, visibilityState: 'visible'
  };

  globalThis.window = globalThis;
  globalThis.self = globalThis;     // three only starts its animation loop when `self` exists
  globalThis.top = globalThis;      // top-level frame unless a test says otherwise
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn));
  };
  globalThis.dispatchEvent = () => true;
  // Fire an event the way a browser would, so tests can actually press keys.
  const fire = (type, event = {}) => {
    const payload = { type, target: globalThis, currentTarget: globalThis, preventDefault() {}, stopPropagation() {}, ...event };
    for (const fn of listeners.get(type) || []) fn(payload);
    return payload;
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  // three's setAnimationLoop rides on requestAnimationFrame. Capturing the
  // callbacks lets a test drive real frames — the only way to reach the code
  // that once threw "ride is not defined" on the very first rendered frame.
  // Track every timer: playing the game arms a 4 s audio tick and a 30 s
  // autosave, and a test process must not stay alive waiting for them.
  const timers = new Set();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const handle = realSetTimeout((...a) => { timers.delete(handle); if (typeof fn === 'function') fn(...a); }, ms, ...args);
    timers.add(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => { timers.delete(handle); realClearTimeout(handle); };
  globalThis.setInterval = (fn, ms, ...args) => {
    const handle = realSetInterval(fn, ms, ...args);
    timers.add(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => { timers.delete(handle); realClearInterval(handle); };
  const clearTimers = () => {
    for (const handle of timers) { realClearTimeout(handle); realClearInterval(handle); }
    timers.clear();
  };

  const rafQueue = [];
  let virtualNow = Date.now();
  globalThis.performance = { now: () => virtualNow, timeOrigin: 0 };
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  const pumpFrames = (count, stepMs = 16) => {
    let fired = 0;
    for (let i = 0; i < count; i++) {
      virtualNow += stepMs;
      const callbacks = rafQueue.splice(0, rafQueue.length);
      if (!callbacks.length) break;
      for (const cb of callbacks) { cb(virtualNow); fired += 1; }
    }
    return fired;
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.location = { href: 'http://localhost:5173/', protocol: 'http:', host: 'localhost:5173', search: '' };
  const beacons = [];
  // Capture Blob parts so a test can read what sendBeacon handed the browser.
  globalThis.Blob = class { constructor(parts, options) { this.parts = parts; this.type = options && options.type; } };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'node', maxTouchPoints: 0, language: 'en', hardwareConcurrency: 4,
      sendBeacon(url, blob) {
        const body = blob && (blob.parts ? blob.parts.join('') : String(blob));
        beacons.push({ url: String(url), body: String(body) });
        return true;
      }
    },
    configurable: true
  });
  // WebAudio, faithful enough for AudioEngine.ensure(): every node chains
  // connect() and every param has the scheduling methods the engine calls.
  const param = (value = 0) => ({
    value,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {}, setValueCurveAtTime() {}
  });
  const audioNode = (extra = {}) => ({ connect(next) { return next; }, disconnect() {}, ...extra });
  globalThis.AudioContext = class {
    constructor() {
      this.destination = audioNode();
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 44100;
    }
    createGain() { return audioNode({ gain: param(1) }); }
    createOscillator() { return audioNode({ type: 'sine', frequency: param(440), detune: param(0), start() {}, stop() {} }); }
    createBuffer(channels = 1, length = 8) {
      const data = Array.from({ length: channels }, () => new Float32Array(Math.min(length, 64)));
      return { length: data[0].length, numberOfChannels: channels, getChannelData: (i) => data[i] || data[0] };
    }
    createBufferSource() { return audioNode({ buffer: null, playbackRate: param(1), loop: false, start() {}, stop() {} }); }
    createBiquadFilter() { return audioNode({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); }
    createStereoPanner() { return audioNode({ pan: param(0) }); }
    createDynamicsCompressor() { return audioNode({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }); }
    createWaveShaper() { return audioNode({ curve: null, oversample: 'none' }); }
    createDelay() { return audioNode({ delayTime: param(0) }); }
    createConvolver() { return audioNode({ buffer: null }); }
    createAnalyser() { return audioNode({ fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData() {} }); }
    createChannelMerger() { return audioNode(); }
    resume() { this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
  };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext(kind) { return kind === '2d' ? ctx2d : null; }
  };
  globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} closePath() {} };

  return { registry, byId, beacons, pumpFrames, rafQueue, clearTimers, fire, listeners };
}
