/**
 * Diddeleng — self-check page.
 *
 * Answers the only question that matters when the preview is empty: is the
 * problem the machine (files, MIME, WebGL) or the game? Everything here runs in
 * the user's own browser, in the same frame the game would use.
 */
const out = document.getElementById('out');
const rows = [];

function line(label, ok, detail) {
  rows.push({ label, ok, detail });
  render();
}

function render() {
  out.innerHTML = rows
    .map((r) => `<div class="row ${r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'warn'}">
      <span class="mark">${r.ok === true ? '✔' : r.ok === false ? '✘' : '…'}</span>
      <span class="label">${r.label}</span>
      <span class="detail">${r.detail || ''}</span>
    </div>`)
    .join('');
}

const say = (label) => (detail) => {
  const i = rows.findIndex((r) => r.label === label);
  if (i >= 0) rows[i].detail = detail;
  else rows.push({ label, ok: null, detail });
  render();
};

/* 1. GPU ---------------------------------------------------------------- */
function checkWebGL(kind) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext(kind);
  if (!gl) return null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gl,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION)
  };
}

const gl2 = checkWebGL('webgl2');
line('WebGL 2 context', !!gl2, gl2 ? `${gl2.version} · ${gl2.renderer}` : 'blocked by the browser or iframe');

if (!gl2) {
  const gl1 = checkWebGL('webgl');
  line('WebGL 1 fallback', !!gl1, gl1 ? 'available, but the game needs WebGL 2' : 'also unavailable');
  const hint = document.getElementById('hint');
  hint.classList.remove('hidden');
  hint.textContent =
    'No WebGL 2 in this frame. Open the game in its own tab (the ⤢ button on the preview) and reload — ' +
    'the sandboxed iframe is usually what denies the GPU context.';
}

line('Device pixel ratio', true, String(window.devicePixelRatio || 1));
line('Viewport', true, `${window.innerWidth} × ${window.innerHeight}`);

/* 2. Files the page needs ------------------------------------------------ */
const files = [
  '/',
  '/js/game/main.js',
  '/js/game/ui.js',
  '/js/game/world-render.js',
  '/js/core/world.js',
  '/js/core/hours.js',
  '/js/core/interiors.js',
  '/vendor/three.module.js',
  '/vendor/three.core.js',
  '/css/style.css'
];

const fileRow = line('Assets', null, `0 / ${files.length}`);
let loaded = 0;
let failed = 0;
const bad = [];

for (const url of files) {
  fetch(url, { cache: 'no-store' })
    .then(async (res) => {
      const type = res.headers.get('content-type') || '';
      const size = (await res.text()).length;
      const js = url.endsWith('.js');
      const okType = !js || /javascript/i.test(type);
      if (!res.ok || !okType) {
        failed += 1;
        bad.push(`${url} → ${res.status} ${type}`);
      }
      loaded += 1;
      const label = `Assets`;
      const i = rows.findIndex((r) => r.label === label);
      if (i >= 0) {
        rows[i].ok = failed === 0 && loaded === files.length ? true : failed ? false : null;
        rows[i].detail = `${loaded} / ${files.length} · ${failed ? bad.join(' · ') : 'all 200, correct MIME'}`;
      }
      render();
    })
    .catch((err) => {
      loaded += 1;
      failed += 1;
      bad.push(`${url} → ${err.message}`);
      const i = rows.findIndex((r) => r.label === 'Assets');
      if (i >= 0) {
        rows[i].ok = false;
        rows[i].detail = bad.join(' · ');
      }
      render();
    });
}

/* 3. Boot the actual game in a frame and watch it ------------------------ */
line('Game boot', null, 'loading / in a frame below…');
const frame = document.getElementById('frame');
const bootSet = say('Game boot');
const errors = [];

window.addEventListener('message', (e) => {
  if (e.data === 'booted') bootSet('reported booted');
});

frame.addEventListener('load', () => {
  let win;
  try {
    win = frame.contentWindow;
    win.addEventListener('error', (e) => errors.push(e.message || 'script error'));
    win.addEventListener('unhandledrejection', (e) => errors.push(String((e.reason && e.reason.message) || e.reason)));
  } catch (err) {
    errors.push(`cannot inspect frame: ${err.message}`);
  }

  const poll = setInterval(() => {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    const text = doc && doc.getElementById('loadtext');
    const box = doc && doc.getElementById('errors');
    if (box && box.textContent.trim()) {
      errors.push(box.textContent.trim().split('\n')[0]);
    }
    if (text && /ready|Something went wrong|Still loading/i.test(text.textContent)) {
      clearInterval(poll);
      const ready = /ready/i.test(text.textContent);
      const i = rows.findIndex((r) => r.label === 'Game boot');
      if (i >= 0) {
        rows[i].ok = ready && errors.length === 0;
        rows[i].detail = ready
          ? 'Dudelange is ready'
          : `${text.textContent}${errors.length ? ` — ${errors[0]}` : ''}`;
      }
      render();
    }
  }, 400);

  setTimeout(() => {
    clearInterval(poll);
    const i = rows.findIndex((r) => r.label === 'Game boot');
    if (i >= 0 && rows[i].ok === null) {
      rows[i].ok = false;
      rows[i].detail = `still loading after 20 s${errors.length ? ` — ${errors[0]}` : ''}`;
      render();
    }
  }, 20000);
});
