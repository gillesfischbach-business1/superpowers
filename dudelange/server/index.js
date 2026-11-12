/**
 * Diddeleng server — zero-dependency Node HTTP.
 *  · serves the client (three.js vendored under /vendor)
 *  · save slots on disk (data/saves)
 *  · leaderboard
 *  · multi-agent build pipeline with SSE progress
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../public/js/core/world.js';
import { Pipeline } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SAVES = path.join(ROOT, 'data', 'saves');
const REPORTS = path.join(ROOT, 'data', 'reports');
const CLIENT_ERRORS = [];   // last failures reported by a real browser
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

await fsp.mkdir(SAVES, { recursive: true });
await fsp.mkdir(REPORTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const world = buildWorld();
const pipeline = new Pipeline({ root: ROOT, world });

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(data);
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const safeId = (id) => /^[a-zA-Z0-9_-]{4,40}$/.test(id);

async function listSaves() {
  const files = await fsp.readdir(SAVES);
  const out = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const raw = await fsp.readFile(path.join(SAVES, f), 'utf8');
      const parsed = JSON.parse(raw);
      out.push({ id: f.replace(/\.json$/, ''), at: parsed.at, money: parsed.money, xp: parsed.xp, level: parsed.level });
    } catch (e) { /* skip corrupt */ }
  }
  return out;
}

/* ----------------------------------------------------------------- routes */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // A preview host may probe the app from another origin; a failed preflight
  // looks exactly like a dead server. This game has no secrets, so allow it.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-max-age': '600' });
    return res.end();
  }

  try {
    /* ---------------------------------------------------------- API */
    if (pathname === '/health' || pathname === '/healthz' || pathname === '/ping' || pathname === '/api/ping') {
      // deliberately world-free: answers instantly even while warming up
      return json(res, 200, { ok: true, service: 'diddeleng', uptime: Math.round(process.uptime()) });
    }

    if (pathname === '/api/health') {
      return json(res, 200, {
        ok: true, service: 'diddeleng', version: '1.0.0',
        uptime: Math.round(process.uptime()),
        world: world.stats,
        saves: (await listSaves()).length,
        pipeline: pipeline.status()
      });
    }

    if (pathname === '/api/errors') {
      if (req.method === 'POST') {
        const body = await readBody(req, 16 * 1024).catch(() => null);
        if (!body) return json(res, 400, { error: 'bad body' });
        const entry = {
          at: new Date().toISOString(),
          kind: String(body.kind || 'error').slice(0, 40),
          phase: String(body.phase || '').slice(0, 80),
          message: String(body.message || '').slice(0, 900),
          stack: String(body.stack || '').slice(0, 2500),
          url: String(body.url || '').slice(0, 300),
          ua: String(body.ua || '').slice(0, 300)
        };
        CLIENT_ERRORS.push(entry);
        while (CLIENT_ERRORS.length > 25) CLIENT_ERRORS.shift();
        console.log(`  client ${entry.kind} [${entry.phase || 'boot'}]: ${entry.message}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 200, { errors: CLIENT_ERRORS.slice().reverse(), count: CLIENT_ERRORS.length });
    }

    if (pathname === '/api/world/meta') {
      return json(res, 200, { meta: world.meta, stats: world.stats, elevation: world.meta.elevation });
    }

    if (pathname === '/api/world/pois') {
      return json(res, 200, { pois: world.pois, stations: world.rail.stations });
    }

    if (pathname.startsWith('/api/save/')) {
      const id = pathname.slice('/api/save/'.length);
      if (!safeId(id)) return json(res, 400, { error: 'invalid save id' });
      const file = path.join(SAVES, `${id}.json`);
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return json(res, 404, { error: 'no save' });
        const raw = await fsp.readFile(file, 'utf8');
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(raw);
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad body' });
        const payload = { ...body, at: new Date().toISOString() };
        await fsp.writeFile(file, JSON.stringify(payload, null, 2));
        return json(res, 200, { ok: true, saved: `${id}.json` });
      }
      return json(res, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/leaderboard') {
      const saves = await listSaves();
      saves.sort((a, b) => (b.xp + b.level * 100) - (a.xp + a.level * 100));
      return json(res, 200, { leaderboard: saves.slice(0, 20) });
    }

    if (pathname === '/api/agents/status') {
      return json(res, 200, { agents: pipeline.agents(), running: pipeline.running, updated: pipeline.updatedAt });
    }

    if (pathname === '/api/agents/events') {
      return json(res, 200, { events: pipeline.recentEvents(30) });
    }

    if (pathname === '/api/agents/run' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      if (pipeline.running) return json(res, 409, { error: 'pipeline already running' });
      const scope = body.scope === 'qa' ? 'qa' : body.agent || 'all';
      pipeline.run(scope).catch((e) => console.error('pipeline error', e));
      return json(res, 202, { started: true, scope });
    }

    if (pathname === '/api/agents/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*'
      });
      res.write(`retry: 3000\n\n`);
      pipeline.addClient(res);
      req.on('close', () => pipeline.removeClient(res));
      return;
    }

    if (pathname === '/api/reports') {
      const files = (await fsp.readdir(REPORTS)).filter((f) => f.endsWith('.json') || f.endsWith('.md'));
      const out = {};
      for (const f of files) {
        const raw = await fsp.readFile(path.join(REPORTS, f), 'utf8');
        out[f] = f.endsWith('.json') ? JSON.parse(raw) : raw;
      }
      return json(res, 200, out);
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

    /* ------------------------------------------------------- static */
    if (pathname === '/agents' || pathname === '/agents/') return serveFile(res, path.join(PUBLIC, 'agents.html'));
    if (pathname === '/diag' || pathname === '/diag/') return serveFile(res, path.join(PUBLIC, 'diag.html'));
    if (pathname === '/standalone' || pathname === '/standalone.html') {
      const file = path.join(ROOT, 'diddeleng-standalone.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'run `npm run build:standalone` first' });
      return serveFile(res, file);
    }

    if (pathname === '/download/standalone.html') {
      const file = path.join(ROOT, 'diddeleng-standalone.html');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'run `npm run build:standalone` first' });
      res.setHeader('content-disposition', 'attachment; filename="diddeleng-standalone.html"');
      res.setHeader('cache-control', 'no-store');
      return serveFile(res, file);
    }

    if (pathname === '/download' || pathname === '/download/' || pathname === '/download/diddeleng.zip') {
      const zips = fs.existsSync(ROOT)
        ? fs.readdirSync(ROOT).filter((f) => f.startsWith('diddeleng-') && f.endsWith('.zip'))
        : [];
      if (!zips.length) {
        return json(res, 404, { error: 'no zip yet — run `npm run pack`' });
      }
      zips.sort((a, b) => fs.statSync(path.join(ROOT, b)).mtimeMs - fs.statSync(path.join(ROOT, a)).mtimeMs);
      const file = path.join(ROOT, zips[0]);
      const stat = fs.statSync(file);
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': stat.size,
        'content-disposition': `attachment; filename="${zips[0]}"`,
        'cache-control': 'no-store'
      });
      return fs.createReadStream(file).pipe(res);
    }

    if (pathname === '/vendor/three.module.js') return serveFile(res, path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'));
    if (pathname === '/vendor/three.core.js') return serveFile(res, path.join(ROOT, 'node_modules', 'three', 'build', 'three.core.js'));

    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.join(PUBLIC, rel);
    if (!target.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
    return serveFile(res, target);
  } catch (err) {
    console.error('request failed', req.method, pathname, err);
    if (!res.headersSent) json(res, 500, { error: 'internal error', detail: String(err.message || err) });
    else res.end();
  }
});

function serveFile(res, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    // always revalidate: a cached module is how a fixed build keeps looking broken
    'cache-control': 'no-cache, must-revalidate'
  });
  fs.createReadStream(file).pipe(res);
}

process.on('uncaughtException', (err) => {
  console.error('  uncaught exception (still serving):', err && err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('  unhandled rejection (still serving):', err && err.message ? err.message : err);
});

let listenTries = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && listenTries < 6) {
    listenTries += 1;
    console.log(`  port ${PORT} still held by another process — retry ${listenTries}/6 in 700 ms`);
    setTimeout(() => server.listen(PORT, HOST), 700);
    return;
  }
  console.error(`  cannot serve on ${HOST}:${PORT} — ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Diddeleng — Dudelange open world`);
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  world: ${world.stats.buildings} buildings · ${world.stats.roadKm} km roads · ${world.stats.stations} stations`);
  console.log(`  build dashboard: http://${HOST}:${PORT}/agents`);
  console.log(`  self check:      http://${HOST}:${PORT}/diag`);
  console.log(`  liveness:        /health  (0.3 s cold start)\n`);
});

export { server, world };
