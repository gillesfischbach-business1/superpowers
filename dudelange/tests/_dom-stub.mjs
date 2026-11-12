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
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
    querySelector() { return node('q'); }, querySelectorAll() { return []; },
    getContext(kind) { return kind === '2d' ? ctx2d : useFakeGL ? fakeGL : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
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
    addEventListener() {}, removeEventListener() {},
    createTextNode: (text) => ({ textContent: text }),
    body: node('body'), documentElement: node('html'), head: node('head'),
    pointerLockElement: null, hidden: false, visibilityState: 'visible'
  };

  globalThis.window = globalThis;
  globalThis.top = globalThis;      // top-level frame unless a test says otherwise
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
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
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.AudioContext = class {
    constructor() { this.destination = {}; this.state = 'running'; this.currentTime = 0; }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, detune: { value: 0 }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createBuffer() { return { getChannelData() { return new Float32Array(8); } }; }
    createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, loop: false, connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect() {}, disconnect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {} }; }
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} }; }
    resume() {}
  };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext(kind) { return kind === '2d' ? ctx2d : null; }
  };
  globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} closePath() {} };

  return { registry, byId, beacons };
}
