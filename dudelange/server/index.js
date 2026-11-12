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

  try {
    /* ---------------------------------------------------------- API */
    if (pathname === '/api/health') {
      return json(res, 200, {
        ok: true, service: 'diddeleng', version: '1.0.0',
        uptime: Math.round(process.uptime()),
        world: world.stats,
        saves: (await listSaves()).length,
        pipeline: pipeline.status()
      });
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
    'cache-control': ext === '.js' || ext === '.css' ? 'public, max-age=60' : 'no-cache'
  });
  fs.createReadStream(file).pipe(res);
}

server.listen(PORT, HOST, () => {
  console.log(`\n  Diddeleng — Dudelange open world`);
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  world: ${world.stats.buildings} buildings · ${world.stats.roadKm} km roads · ${world.stats.stations} stations`);
  console.log(`  build dashboard: http://${HOST}:${PORT}/agents\n`);
});

export { server, world };
