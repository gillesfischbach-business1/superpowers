/**
 * HUD, map, journal, dialogue, shop and build-agent dashboard.
 * Plain DOM — no framework.
 */
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(world) {
    this.world = world;
    this.toastTimer = [];
    this.mapBase = null;
    this.player = { x: 0, z: 0, rot: 0 };
    this.cart = [];
    this.shop = null;
    this.onBuy = null;
    this.panelOpen = false;
    this.dialogOpen = false;
    this.shopOpen = false;
    this.drunk = 0;
    this.buildMapBase();
  }

  /* ------------------------------------------------------------- loading */
  loadingStep(text, done) {
    const ul = $('loadsteps');
    const li = document.createElement('li');
    li.textContent = text;
    if (done) li.classList.add('done');
    ul.appendChild(li);
  }
  setLoadProgress(p, text) {
    $('loadfill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('loadtext').textContent = text;
  }
  ready(onStart) {
    $('startBtn').classList.remove('hidden');
    $('loadtext').textContent = 'Dudelange is ready.';
    $('loadsteps').querySelectorAll('li').forEach((li) => li.classList.add('done'));
    $('startBtn').onclick = async () => {
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      onStart();
      this.toast('Welcome to Diddeleng. The tourist desk is on Place de l’Hôtel de Ville.', 'good');
    };
  }

  /* ----------------------------------------------------------------- hud */
  setDistrict(name, sub, banner = true) {
    $('districtName').textContent = name;
    $('zoneLabel').textContent = name;
    if (banner) {
      $('bannerTitle').textContent = name;
      $('bannerSub').textContent = sub || 'Dudelange';
      const b = $('districtBanner');
      b.classList.remove('hidden');
      b.classList.add('on');
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => b.classList.remove('on'), 2600);
    }
  }
  setMoney(v) { $('money').textContent = Math.round(v); $('tradeMoney').textContent = Math.round(v); }
  setXP(xp, level) {
    const need = level * 100;
    $('xpfill').style.width = `${Math.min(100, (xp % need) / need * 100)}%`;
    $('level').textContent = `Level ${level}`;
    $('xp').textContent = `${xp} XP`;
  }
  setDay(name, waiting = false) {
    const el = $('day');
    const text = `${name.slice(0, 3)}${waiting ? ' ⏩' : ''}`;
    if (el && el.textContent !== text) el.textContent = text;
  }
  setClock(minutes, weather, temp) {
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    $('weather').textContent = weather;
    $('temp').textContent = `${temp} °C`;
  }
  setObjective(text) { $('objectiveText').textContent = text; }

  /* --------------------------------------------------------------- drunk */
  setDrunk(v, label) {
    if (Math.abs(v - (this.drunk || 0)) < 0.008) { this.drunk = v; return; }
    this.drunk = v;
    const meter = $('drunkMeter');
    if (!meter) return;
    if (v < 0.04) { meter.classList.add('hidden'); }
    else {
      meter.classList.remove('hidden');
      const fill = $('drunkFill');
      if (fill) fill.style.width = `${Math.min(100, v * 100)}%`;
      const text = $('drunkLabel');
      if (text) text.textContent = `${label || ''} ${'·'.repeat(Math.min(4, Math.floor(v * 4)))}`.trim();
    }
    const fx = $('drunkfx');
    if (fx) {
      const k = Math.min(1, v);
      fx.style.opacity = String(Math.min(0.92, k * 0.95));
      fx.style.setProperty('--db', `${(k * 2.6).toFixed(2)}px`);
      fx.style.setProperty('--ds', String((1 - k * 0.35).toFixed(2)));
    }
    document.body.classList.toggle('drunk', v > 0.35);
  }

  blackout(cb) {
    const b = $('blackout');
    if (!b) { cb && cb(); return; }
    b.classList.add('on');
    setTimeout(() => { cb && cb(); }, 950);
    setTimeout(() => b.classList.remove('on'), 2100);
  }

  /** Speech gets sloppy once the meter climbs. */
  slur(text) {
    if (!text || this.drunk < 0.35) return text;
    const k = Math.min(1, (this.drunk - 0.35) / 0.8);
    let out = String(text);
    const swaps = [['sch', 'sh'], ['sp', 'shp'], ['st', 'sht'], ['s', 'sh'], ['r', 'w']];
    for (const [from, to] of swaps) {
      if (Math.random() > k * 0.8) continue;
      const re = new RegExp(`(?<=[a-zäëéöü])${from}`, 'g');
      out = out.replace(re, to);
    }
    if (this.drunk > 0.75) out += ' *hic*';
    return out;
  }
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    $('promptText').textContent = text;
    el.classList.remove('hidden');
  }
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = kind === 'bad' ? text : this.slur(text);
    $('toasts').appendChild(el);
    const t = setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 420);
    }, 5200);
    this.toastTimer.push(t);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  showSpeed(kmh) {
    const el = $('speedo');
    if (kmh === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<b>${Math.round(kmh)}</b> km/h`;
  }
  flash() {
    const f = $('flash');
    f.style.opacity = 0.85;
    setTimeout(() => { f.style.opacity = 0; }, 90);
  }
  setCoords(lat, lon) {
    $('coords').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
  compass(bearingDeg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    $('compass').textContent = dirs[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8];
  }

  /* ---------------------------------------------------------------- maps */
  buildMapBase() {
    const w = this.world;
    const size = 1500;
    const b = w.meta.bbox;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const toPx = this.toPxFactory(size);
    ctx.fillStyle = '#0f1c24';
    ctx.fillRect(0, 0, size, size);

    // forests
    ctx.fillStyle = 'rgba(58,92,52,0.55)';
    for (const f of w.forests) {
      const p = toPx(f.centre.x, f.centre.z);
      const rx = (f.rx / (b.east - b.west) / 111320 * 6.6) * size * 0.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(12, f.rx / 9000 * size), Math.max(12, f.rz / 9000 * size), 0, 0, 7);
      ctx.fill();
    }

    // districts
    for (const d of w.districts) {
      ctx.beginPath();
      d.poly.forEach((p, i) => {
        const px = toPx(p.x, p.z);
        if (i === 0) ctx.moveTo(px.x, px.y); else ctx.lineTo(px.x, px.y);
      });
      ctx.closePath();
      ctx.fillStyle = hexA(d.color, 0.1);
      ctx.fill();
      ctx.strokeStyle = hexA(d.color, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // water
    ctx.strokeStyle = 'rgba(110,170,190,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    w.water.stream.points.forEach((p, i) => {
      const px = toPx(p.x, p.z);
      if (i === 0) ctx.moveTo(px.x, px.y); else ctx.lineTo(px.x, px.y);
    });
    ctx.stroke();
    const pond = toPx(w.water.pond.x, w.water.pond.z);
    ctx.fillStyle = 'rgba(110,170,190,0.7)';
    ctx.beginPath(); ctx.arc(pond.x, pond.y, 4, 0, 7); ctx.fill();

    // roads
    const widths = { motorway: 5, primary: 3.4, secondary: 2.8, residential: 1.2, foot: 0.7 };
    const colors = { motorway: '#e07a3f', primary: '#d8cfbc', secondary: '#c9bfa8', residential: '#766f61', foot: '#6c7d63' };
    for (const cls of ['foot', 'residential', 'secondary', 'primary', 'motorway']) {
      ctx.strokeStyle = colors[cls];
      ctx.lineWidth = widths[cls];
      ctx.lineCap = 'round';
      for (const r of w.roads.filter((x) => x.cls === cls)) {
        ctx.beginPath();
        r.points.forEach((p, i) => {
          const px = toPx(p.x, p.z);
          if (i === 0) ctx.moveTo(px.x, px.y); else ctx.lineTo(px.x, px.y);
        });
        ctx.stroke();
      }
    }

    // rail
    ctx.strokeStyle = '#4a90c2';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    w.rail.points.forEach((p, i) => {
      const px = toPx(p.x, p.z);
      if (i === 0) ctx.moveTo(px.x, px.y); else ctx.lineTo(px.x, px.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // station markers
    for (const s of w.rail.stations) {
      const px = toPx(s.x, s.z);
      ctx.fillStyle = '#4a90c2';
      ctx.strokeStyle = '#0f1c24';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px.x, px.y, 5, 0, 7); ctx.fill(); ctx.stroke();
    }

    // POI dots
    for (const p of w.pois) {
      if (p.kind === 'station') continue;
      const px = toPx(p.x, p.z);
      ctx.fillStyle = poiColor(p.kind);
      ctx.beginPath(); ctx.arc(px.x, px.y, p.kind === 'industrial' ? 4 : 3, 0, 7); ctx.fill();
    }

    // scale bar
    ctx.fillStyle = 'rgba(244,239,227,0.7)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('1 km', 20, size - 22);
    ctx.fillRect(20, size - 40, (1000 / 4090) * size, 3);

    this.mapBase = c;
  }

  toPxFactory(size) {
    const b = this.world.meta.bbox;
    const nw = { x: (b.west - this.world.meta.centre.lon) * 72400, z: (this.world.meta.centre.lat - b.north) * 110574 };
    const se = { x: (b.east - this.world.meta.centre.lon) * 72400, z: (this.world.meta.centre.lat - b.south) * 110574 };
    const w = se.x - nw.x, h = se.z - nw.z;
    const scale = size / Math.max(w, h);
    const ox = (size - w * scale) / 2, oy = (size - h * scale) / 2;
    return (x, z) => ({ x: ox + (x - nw.x) * scale, y: oy + (z - nw.z) * scale });
  }

  /** minimap: cropped window of the base map, north up */
  updateMinimap(player, rot = 0) {
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, 7); ctx.clip();
    const b = this.world.meta.bbox;
    const full = this.toPxFactory(1500);
    const p = full(player.x, player.z);
    const zoom = 4.6;
    const srcSize = 240 / zoom * 2.4;
    ctx.fillStyle = '#0f1c24';
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(this.mapBase, p.x - srcSize / 2, p.y - srcSize / 2, srcSize, srcSize, 0, 0, S, S);

    // POI dots within view
    const toMini = (x, z) => {
      const q = full(x, z);
      return { x: (q.x - (p.x - srcSize / 2)) / srcSize * S, y: (q.y - (p.y - srcSize / 2)) / srcSize * S };
    };
    for (const poi of this.world.pois) {
      const m = toMini(poi.x, poi.z);
      if (m.x < -6 || m.y < -6 || m.x > S + 6 || m.y > S + 6) continue;
      ctx.fillStyle = poiColor(poi.kind);
      ctx.beginPath(); ctx.arc(m.x, m.y, poi.kind === 'station' ? 4 : 2.6, 0, 7); ctx.fill();
    }
    // player
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-rot + Math.PI);
    ctx.fillStyle = '#f4efe3';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 7); ctx.lineTo(0, 4); ctx.lineTo(-5.5, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();

    // ring
    ctx.strokeStyle = 'rgba(233,196,106,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  }

  openMap(player, rot) {
    this.player = player;
    const html = `
      <div class="mapwrap">
        <canvas id="bigmap" width="1500" height="1500"></canvas>
        <div class="legend">
          <h3>Quarters</h3>
          ${this.world.districts.map((d) => `<p><span class="swatch" style="background:${d.color}"></span>${d.name}</p>`).join('')}
          <h3>Legend</h3>
          <p><span class="swatch" style="background:#4a90c2"></span>CFL line 60a</p>
          <p><span class="swatch" style="background:#e07a3f"></span>A3 / Porte de France</p>
          <p><span class="swatch" style="background:#2f6b3d"></span>Supermarket</p>
          <p><span class="swatch" style="background:#9b2226"></span>Restaurant</p>
          <p><span class="swatch" style="background:#8a4b32"></span>Industrial heritage</p>
          <h3>Facts</h3>
          <p>${this.world.meta.facts.slice(0, 4).join('<br><br>')}</p>
          <p style="margin-top:10px;color:rgba(244,239,227,.45)">Street geometry © OpenStreetMap contributors. Heights from EU-DEM 25 m.</p>
        </div>
      </div>`;
    this.openPanel('Map of Diddelange', html);
    const cv = $('bigmap');
    const ctx = cv.getContext('2d');
    ctx.drawImage(this.mapBase, 0, 0);
    const full = this.toPxFactory(1500);
    const p = full(player.x, player.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-rot + Math.PI);
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#0b1216';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 11); ctx.lineTo(0, 6); ctx.lineTo(-9, 11);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // labels for landmarks in the map overlay
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20,28,32,0.9)';
    const labels = ['townhall', 'church', 'delhaize', 'rolling_mill', 'mont_st_jean', 'cna'];
    for (const id of labels) {
      const l = this.world.landmarks.find((x) => x.id === id);
      if (!l) continue;
      const q = full(l.x, l.z);
      ctx.fillStyle = 'rgba(244,239,227,0.92)';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(l.name.split('—')[0].slice(0, 28), q.x + 10, q.y - 8);
    }
  }

  /* --------------------------------------------------------------- panels */
  openPanel(title, html) {
    $('panelTitle').textContent = title;
    $('panelBody').innerHTML = html;
    $('panel').classList.remove('hidden');
    this.panelOpen = true;
  }
  closePanel() {
    $('panel').classList.add('hidden');
    this.panelOpen = false;
  }

  journal(quests, player, stats) {
    const rows = quests.map((q) => `
      <div class="quest ${q.done ? 'done' : ''}">
        <div class="tick">${q.done ? '✔' : '○'}</div>
        <div><h4>${q.title}</h4><p>${q.desc}</p></div>
        <div class="reward">+€${q.money} · ${q.xp} XP</div>
      </div>`).join('');
    this.openPanel('Journal', `
      <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:start">
        <div>${rows}</div>
        <div>
          <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:0 0 10px">Traveller</h3>
          <p style="font-family:system-ui;font-size:13px;line-height:1.7;color:rgba(244,239,227,.75)">
            Distance walked: <b>${(player.distance / 1000).toFixed(2)} km</b><br>
            Level: <b>${player.level}</b> · XP: <b>${player.xp}</b><br>
            Euro: <b>€${player.money}</b><br>
            Visited stations: <b>${player.visitedStations.size}/4</b><br>
            World: <b>${stats.buildings}</b> buildings, <b>${stats.roads}</b> streets, <b>${stats.roadKm} km</b> of road
          </p>
          <h3 style="font:600 11px system-ui;letter-spacing:.22em;text-transform:uppercase;color:#e9c46a;margin:22px 0 10px">Diddeleng, in facts</h3>
          <div class="facts" style="grid-template-columns:1fr">${this.world.meta.facts.map((f) => `<div>${f}</div>`).join('')}</div>
        </div>
      </div>`);
  }

  async agents() {
    this.openPanel('Build pipeline · multi-agent environment', `
      <p style="font-family:system-ui;font-size:12.5px;color:rgba(244,239,227,.65);max-width:640px;margin-top:0">
        The world is produced by nine specialised agents. Each one owns a stage, writes a report and hands off to the next.
        Stage gates run on the server against the same deterministic world the browser renders.
      </p>
      <div class="agents-grid" id="agentCards"><p class="small">Loading pipeline…</p></div>
      <div class="agent-actions">
        <button id="runAll">Run full pipeline</button>
        <button id="runQA">QA gate only</button>
        <button id="openDash">Open full dashboard ↗</button>
      </div>
      <div class="agent-log" id="agentLog">idle — no pipeline run in this session.</div>
    `);
    $('openDash').onclick = () => window.open('/agents.html', '_blank');
    $('runAll').onclick = () => this.runPipeline('all');
    $('runQA').onclick = () => this.runPipeline('qa');
    await this.refreshAgents();
    if (this._agentStream) this._agentStream.close();
    this._agentStream = new EventSource('/api/agents/stream');
    this._agentStream.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'log') this.appendLog(data.text);
        if (data.type === 'state') this.renderAgentState(data.agents);
      } catch (e) { /* ignore */ }
    };
  }

  appendLog(text) {
    const log = $('agentLog');
    if (!log) return;
    if (log.textContent.startsWith('idle')) log.textContent = '';
    log.textContent += text + '\n';
    log.scrollTop = log.scrollHeight;
  }

  async refreshAgents() {
    try {
      const res = await fetch('/api/agents/status');
      const data = await res.json();
      this.renderAgentState(data.agents);
    } catch (e) {
      const el = $('agentCards');
      if (el) el.innerHTML = '<p class="small">Pipeline API unavailable — run the server with <code>npm start</code>.</p>';
    }
  }

  renderAgentState(agents) {
    const box = $('agentCards');
    if (!box || !agents) return;
    box.innerHTML = agents.map((a) => `
      <div class="agent-card">
        <header>
          <div><h4>${a.name}</h4><div class="role">${a.role}</div></div>
          <span class="status ${a.status}">${a.status}</span>
        </header>
        <p>${a.summary}</p>
        <ul>${a.outputs.map((o) => `<li>${o}</li>`).join('')}</ul>
      </div>`).join('');
  }

  async runPipeline(scope = 'all') {
    this.appendLog(`$ pipeline ${scope} — dispatching agents…`);
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope })
      });
      if (!res.ok) throw new Error('run failed');
    } catch (e) {
      this.appendLog('error: could not start pipeline (is the server running?)');
    }
  }

  /* ------------------------------------------------------------- dialogue */
  showDialog({ speaker, text, choices }) {
    $('dlgSpeaker').textContent = speaker;
    $('dlgText').textContent = this.slur(text);
    const box = $('dlgChoices');
    box.innerHTML = '';
    (choices || [{ label: 'Close' }]).forEach((c, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${c.label}`;
      b.onclick = () => { this.hideDialog(); c.action && c.action(); };
      box.appendChild(b);
    });
    $('dialog').classList.remove('hidden');
    this.dialogOpen = true;
  }
  hideDialog() {
    $('dialog').classList.add('hidden');
    this.dialogOpen = false;
  }

  /* ----------------------------------------------------------------- shop */
  openShop(shop, money, onBuy) {
    this.shop = shop;
    this.cart = [];
    this.onBuy = onBuy;
    this.moneyRef = typeof money === 'function' ? money : () => money;
    $('tradeTitle').textContent = shop.title;
    $('tradeMoney').textContent = Math.round(this.moneyRef());
    $('tradeClose').onclick = () => this.closeShop();
    $('tradeBuy').onclick = () => {
      if (!this.cart.length) { this.toast('Your basket is empty.'); return; }
      const total = this.cart.reduce((s, i) => s + i.price * i.qty, 0);
      if (total > this.moneyRef()) { this.toast('Not enough euro for that.', 'bad'); return; }
      this.onBuy(this.cart, total);
      this.cart = [];
      this.renderCart();
    };
    this.renderShopList();
    this.renderCart();
    $('trade').classList.remove('hidden');
    this.shopOpen = true;
  }
  renderShopList() {
    const list = $('tradeList');
    list.innerHTML = '';
    for (const item of this.shop.items) {
      const row = document.createElement('div');
      row.className = 'trade-row';
      row.innerHTML = `
        <div><span class="nm">${item.name}</span><span class="cat">${item.cat || ''} · ${item.desc || ''}</span></div>
        <div class="pr">€${item.price.toFixed(2)}</div>
        <button>Add</button>`;
      row.querySelector('button').onclick = () => {
        const found = this.cart.find((c) => c.id === item.id);
        if (found) found.qty++;
        else this.cart.push({ ...item, qty: 1 });
        this.renderCart();
      };
      list.appendChild(row);
    }
  }
  renderCart() {
    const cart = $('cart');
    if (!this.cart.length) { cart.innerHTML = '<p class="small" style="margin:0">Nothing yet.</p>'; return; }
    cart.innerHTML = this.cart.map((c) => `<div class="line"><span>${c.qty} × ${c.name}</span><span>€${(c.price * c.qty).toFixed(2)}</span></div>`).join('') +
      `<div class="line" style="border-top:1px solid rgba(244,239,227,.15);padding-top:8px;margin-top:4px"><b>Total</b><b>€${this.cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)}</b></div>`;
  }
  closeShop() {
    $('trade').classList.add('hidden');
    this.shopOpen = false;
  }

  setTradeMoney(v) { $('tradeMoney').textContent = Math.round(v); }
  setShopMoney(v) { $('tradeMoney').textContent = Math.round(v); }
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function poiColor(kind) {
  switch (kind) {
    case 'station': return '#4a90c2';
    case 'supermarket': return '#2f6b3d';
    case 'restaurant': return '#9b2226';
    case 'industrial': return '#8a4b32';
    case 'culture': return '#7b5ea7';
    case 'civic': return '#e9c46a';
    case 'church': return '#c9b99a';
    case 'park': return '#4f7a3a';
    case 'nature': return '#4f7a3a';
    case 'sport': return '#2a9d8f';
    case 'school': return '#e07a3f';
    case 'hotel': return '#a47148';
    case 'border': return '#8d99ae';
    default: return '#9aa5ab';
  }
}
