/**
 * Procedural canvas textures — keeps the game asset-free (0 binaries) while
 * still giving asphalt, brick, plaster, slate and glass some grain.
 */
import * as THREE from 'three';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(key, w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function noise(ctx, w, h, amount, alpha, base) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] = Math.min(255, Math.max(0, base ? base[0] + n : img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, base ? base[1] + n : img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, base ? base[2] + n : img.data[i + 2] + n));
    if (alpha !== undefined) img.data[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export const TEX = {
  asphalt: () => tex('asphalt', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3c3e'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 34);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${120 + Math.random() * 60},${120 + Math.random() * 60},${120 + Math.random() * 60},0.12)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
  }, { repeat: [12, 12] }),

  paving: () => tex('paving', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b9b4a8'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 18);
    ctx.strokeStyle = 'rgba(70,68,62,0.28)'; ctx.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, { repeat: [6, 6] }),

  grass: () => tex('grass', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f8f4a'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 26);
    for (let i = 0; i < 2200; i++) {
      ctx.strokeStyle = `rgba(${90 + Math.random() * 70},${120 + Math.random() * 70},${60 + Math.random() * 50},0.5)`;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 3 - 1.5, y - Math.random() * 5); ctx.stroke();
    }
  }, { repeat: [80, 80] }),

  gravel: () => tex('gravel', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8b8578'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 30);
    for (let i = 0; i < 1400; i++) {
      const g = 90 + Math.random() * 90;
      ctx.fillStyle = `rgba(${g},${g - 6},${g - 16},0.5)`;
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.4, 0, 7); ctx.fill();
    }
  }, { repeat: [8, 8] }),

  ballast: () => tex('ballast', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e5a54'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const g = 70 + Math.random() * 80;
      ctx.fillStyle = `rgba(${g},${g - 4},${g - 10},0.85)`;
      const s = 1.5 + Math.random() * 3.5;
      ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
  }, { repeat: [2, 24] }),

  concrete: () => tex('concrete', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a9a69e'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 16);
    ctx.strokeStyle = 'rgba(60,58,54,0.2)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, { repeat: [3, 3] }),

  plaster: () => tex('plaster', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 12);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(120,110,96,0.05)';
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 22, 0, 7); ctx.fill();
    }
  }, { repeat: [2, 2] }),

  brick: () => tex('brick', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b9a79c'; ctx.fillRect(0, 0, w, h);
    const bw = 42, bh = 20;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const y = row * bh;
        const g = 200 + Math.random() * 45;
        ctx.fillStyle = `rgb(${g},${g - 14 + Math.random() * 10},${g - 26})`;
        ctx.fillRect(x + 1.6, y + 1.6, bw - 3.2, bh - 3.2);
      }
    }
    noise(ctx, w, h, 16);
  }, { repeat: [3, 3] }),

  slate: () => tex('slate', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4d4a48'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 12; col++) {
        const x = col * 22 + (row % 2 ? 11 : 0), y = row * 26;
        const g = 62 + Math.random() * 30;
        ctx.fillStyle = `rgb(${g},${g - 2},${g + 2})`;
        ctx.fillRect(x, y, 20, 24);
      }
    }
    noise(ctx, w, h, 14);
  }, { repeat: [4, 4] }),

  windowDay: () => tex('windowDay', 128, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#5b7c92'); g.addColorStop(0.45, '#8fb0c4'); g.addColorStop(0.55, '#3c5566'); g.addColorStop(1, '#263947');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.lineTo(w * 0.8, 0); ctx.lineTo(w, 0); ctx.lineTo(0, h); ctx.fill();
    ctx.strokeStyle = '#f4efe3'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, w, h);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.fillStyle = '#cfc7b6'; ctx.fillRect(0, h - 10, w, 10);
  }),

  windowLit: () => tex('windowLit', 128, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffe6b0'); g.addColorStop(0.6, '#ffc46b'); g.addColorStop(1, '#c78a3f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,70,20,0.25)';
    ctx.fillRect(0, h * 0.28, w, h * 0.1);
    ctx.strokeStyle = '#4a4034'; ctx.lineWidth = 12; ctx.strokeRect(0, 0, w, h);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  }),

  shopfront: () => tex('shopfront', 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1f2b33'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(150,190,205,0.55)';
    ctx.fillRect(8, 8, w - 16, h - 26);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 5; i++) ctx.fillRect(20 + i * 40, 10, 10, h - 30);
    ctx.fillStyle = '#2f3a3f'; ctx.fillRect(w / 2 - 4, 8, 8, h - 26);
    ctx.fillStyle = '#d9d2c2'; ctx.fillRect(0, h - 18, w, 18);
  }),

  door: () => tex('door', 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a3f2c'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3d2a1c'; ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeRect(26, 30, w - 52, h * 0.35);
    ctx.strokeRect(26, h * 0.5, w - 52, h * 0.4);
    ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.arc(w - 28, h * 0.55, 6, 0, 7); ctx.fill();
  }),

  water: () => tex('water', 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#4a6f7a'); g.addColorStop(0.5, '#5d8791'); g.addColorStop(1, '#3a5a63');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = `rgba(220,240,245,${0.05 + Math.random() * 0.15})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, y);
      ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 2);
      ctx.stroke();
    }
  }, { repeat: [8, 8] }),

  sign: (text, opts = {}) => tex(`sign:${text}:${JSON.stringify(opts)}`, 512, 128, (ctx, w, h) => {
    const bg = opts.bg || '#1d3557';
    const fg = opts.fg || '#f8f5ec';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = `${opts.weight || 700} ${opts.size || 54}px ${opts.font || 'Georgia, serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opts.size || 54) * 1.1));
  }),

  poster: (seed) => tex(`poster:${seed}`, 256, 384, (ctx, w, h) => {
    const rng = mulberry(seed);
    const hue = Math.floor(rng() * 360);
    ctx.fillStyle = `hsl(${hue}, 55%, 88%)`; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `hsl(${(hue + 40) % 360}, 45%, 35%)`;
    ctx.fillRect(18, 18, w - 36, h * 0.55);
    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 40%, 45%)`;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.35, w * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = '#242424';
    ctx.font = '700 26px Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MINETT', w / 2, h * 0.74);
    ctx.font = '400 18px Helvetica, Arial';
    ctx.fillText(['TRAIL', 'CNA', 'NEI SCHMELZ', 'DIDDELENG'][Math.floor(rng() * 4)], w / 2, h * 0.82);
  }),

  minimapTexture: () => null
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
