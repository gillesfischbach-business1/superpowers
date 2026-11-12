/**
 * Minimal DOM/Canvas stub so the browser entry module can be imported in Node.
 *
 * The point is not to render anything — WebGL is unavailable here — but to walk
 * the same top-level code path the browser walks: module graph, class
 * initialisation order, world build, UI construction. Everything up to the GPU
 * has to survive; a temporal-dead-zone error or a missing export does not.
 */

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

const node = (id) => ({
  id, textContent: '', innerHTML: '', value: '', width: 1280, height: 720,
  style: new Proxy({}, { get: () => '', set: () => true }),
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; }, toString() { return ''; } },
  dataset: {}, children: [],
  appendChild(child) { this.children.push(child); return child; },
  removeChild() {}, remove() {}, insertBefore() {},
  addEventListener() {}, removeEventListener() {},
  setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; },
  querySelector() { return node('q'); }, querySelectorAll() { return []; },
  getContext(kind) { return kind === '2d' ? ctx2d : null; },
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
  focus() {}, blur() {}, click() {}, scrollIntoView() {},
  insertAdjacentHTML() {}, cloneNode() { return node(id); },
  offsetWidth: 1280, offsetHeight: 720, clientWidth: 1280, clientHeight: 720
});

/** Install the stub on globalThis and return handles the test can inspect. */
export function installDomStub() {
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
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node', maxTouchPoints: 0, language: 'en', hardwareConcurrency: 4 },
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

  return { registry, byId };
}
