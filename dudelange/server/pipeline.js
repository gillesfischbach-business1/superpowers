/**
 * Multi-agent build pipeline.
 *
 * Each agent in agents/manifest.json owns a stage, a script and a set of
 * deliverables. The orchestrator runs them in order, streams every line to SSE
 * clients, writes state + events to disk and records a build report.
 */
import fs from 'node:fs';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';

const LOG_CAP = 400;
const EVENT_CAP = 200;

export class Pipeline {
  constructor({ root, world }) {
    this.root = root;
    this.world = world;
    this.manifest = JSON.parse(fs.readFileSync(path.join(root, 'agents', 'manifest.json'), 'utf8'));
    this.statePath = path.join(root, 'data', 'agents-state.json');
    this.eventsPath = path.join(root, 'data', 'agent-events.json');
    this.running = false;
    this.updatedAt = new Date().toISOString();
    this.clients = new Set();
    this.logs = [];
    this.eventId = 1;
    this.events = [];
    this.state = {};
    this.loadState();
  }

  loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this.state = raw.agents || {};
      this.updatedAt = raw.updated || this.updatedAt;
      this.eventId = raw.eventId || 1;
    } catch (e) {
      for (const a of this.manifest.agents) this.state[a.id] = { status: 'pending' };
    }
    try {
      const ev = JSON.parse(fs.readFileSync(this.eventsPath, 'utf8'));
      this.events = Array.isArray(ev) ? ev : [];
      if (this.events.length) this.eventId = Math.max(this.eventId, ...this.events.map((e) => e.id)) + 1;
    } catch (e) { this.events = []; }
  }

  async persist() {
    this.updatedAt = new Date().toISOString();
    const payload = { updated: this.updatedAt, running: this.running, eventId: this.eventId, agents: this.state };
    await fsp.mkdir(path.dirname(this.statePath), { recursive: true });
    await fsp.writeFile(this.statePath, JSON.stringify(payload, null, 2));
    await fsp.writeFile(this.eventsPath, JSON.stringify(this.events.slice(-EVENT_CAP), null, 2));
  }

  agents() {
    return this.manifest.agents.map((a) => ({
      ...a,
      status: this.state[a.id]?.status || 'pending',
      duration: this.state[a.id]?.duration || null,
      exitCode: this.state[a.id]?.exitCode ?? null,
      log: (this.state[a.id]?.log || []).slice(-12)
    }));
  }

  status() {
    return {
      running: this.running,
      updated: this.updatedAt,
      done: Object.values(this.state).filter((s) => s.status === 'done').length,
      total: this.manifest.agents.length
    };
  }

  recentEvents(n = 30) { return this.events.slice(-n); }

  /* --------------------------------------------------------------- SSE */
  addClient(res) {
    this.clients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', agents: this.agents() })}\n\n`);
    for (const line of this.logs.slice(-60)) {
      res.write(`data: ${JSON.stringify({ type: 'log', text: line })}\n\n`);
    }
  }
  removeClient(res) { this.clients.delete(res); }

  broadcast(obj, event = 'message') {
    const payload = `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;
    for (const client of this.clients) {
      try { client.write(payload); } catch (e) { this.clients.delete(client); }
    }
  }

  log(text, agent = null, kind = 'log') {
    const line = agent ? `[${agent}] ${text}` : text;
    this.logs.push(line);
    if (this.logs.length > LOG_CAP) this.logs.shift();
    this.broadcast({ type: 'log', text: line });
    if (kind !== 'log') {
      const ev = { id: this.eventId++, ts: new Date().toISOString(), agent, kind, text };
      this.events.push(ev);
      if (this.events.length > EVENT_CAP) this.events.shift();
      this.persist().catch(() => {});
    }
  }

  /* --------------------------------------------------------------- run */
  async run(scope = 'all') {
    if (this.running) return { error: 'already running' };
    this.running = true;
    const started = Date.now();
    this.log(`pipeline start · scope=${scope} · seed=${this.world.seed}`);
    let list = this.manifest.agents;
    if (scope === 'qa') list = list.filter((a) => a.id === 'qa' || a.id === 'release');
    else if (scope !== 'all') list = list.filter((a) => a.id === scope);
    if (!list.length) {
      this.log(`no agents matched scope "${scope}"`);
      this.running = false;
      return { error: 'no such agent' };
    }

    for (const agent of list) {
      await this.runAgent(agent);
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const failed = list.filter((a) => this.state[a.id].status === 'failed').length;
    this.log(`pipeline finished in ${secs}s · ${list.length - failed}/${list.length} stages green`);
    this.broadcast({ type: 'state', agents: this.agents() });
    this.running = false;
    await this.persist();
    return { ok: failed === 0, seconds: Number(secs) };
  }

  runAgent(agent) {
    return new Promise((resolve) => {
      this.state[agent.id] = { status: 'running', startedAt: new Date().toISOString(), log: [] };
      this.broadcast({ type: 'state', agents: this.agents() });
      this.log(`▶ ${agent.name} — ${agent.summary}`, agent.id, 'start');
      this.log(`  $ node ${agent.script}`, agent.id);

      const child = spawn(process.execPath, [agent.script], {
        cwd: this.root,
        env: { ...process.env, WORLD_SEED: String(this.world.seed), AGENT_ID: agent.id },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const started = Date.now();
      let buffer = '';
      const onData = (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          this.state[agent.id].log.push(line);
          if (this.state[agent.id].log.length > 60) this.state[agent.id].log.shift();
          this.log(line, agent.id);
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (c) => {
        const text = c.toString().trim();
        if (text) this.log(text, agent.id, 'log');
      });

      const timeout = setTimeout(() => {
        this.log('stage timeout after 120s — terminating', agent.id, 'fail');
        child.kill('SIGKILL');
      }, 120000);

      child.on('close', async (code) => {
        clearTimeout(timeout);
        if (buffer.trim()) this.log(buffer.trim(), agent.id);
        const duration = Date.now() - started;
        const ok = code === 0;
        this.state[agent.id] = {
          ...this.state[agent.id],
          status: ok ? 'done' : 'failed',
          exitCode: code,
          duration,
          finishedAt: new Date().toISOString()
        };
        this.log(`${ok ? '✔' : '✘'} ${agent.name} ${ok ? 'completed' : 'failed'} in ${(duration / 1000).toFixed(2)}s`, agent.id, ok ? 'done' : 'fail');
        this.broadcast({ type: 'state', agents: this.agents() });
        await this.persist();
        resolve();
      });
    });
  }
}
