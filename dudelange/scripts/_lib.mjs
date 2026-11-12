/** Shared helpers for the agent stages. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildWorld } from '../public/js/core/world.js';

export const ROOT = process.cwd();
export const REPORTS = path.join(ROOT, 'data', 'reports');

export function ensureReports() {
  fs.mkdirSync(REPORTS, { recursive: true });
}

export function writeReport(name, data) {
  ensureReports();
  const file = path.join(REPORTS, name);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2));
  console.log(`report → data/reports/${name}`);
  return file;
}

export function readReport(name) {
  const file = path.join(REPORTS, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadWorld() {
  const seed = Number(process.env.WORLD_SEED || 20261112);
  return buildWorld({ seed });
}

export class Gate {
  constructor(agent) {
    this.agent = agent;
    this.results = [];
  }
  check(label, ok, detail = '') {
    this.results.push({ label, ok: !!ok, detail });
    console.log(`${ok ? '  ✔' : '  ✘'} ${label}${detail ? ` — ${detail}` : ''}`);
    return ok;
  }
  get passed() { return this.results.every((r) => r.ok); }
  finish() {
    const failed = this.results.filter((r) => !r.ok);
    console.log(`\n${this.agent}: ${this.results.length - failed.length}/${this.results.length} gates green`);
    if (failed.length) {
      console.log(`GATE FAILED: ${failed.map((f) => f.label).join(', ')}`);
      process.exitCode = 1;
    }
    return { agent: this.agent, passed: failed.length === 0, results: this.results };
  }
}

export function hashWorld(world) {
  const h = crypto.createHash('sha1');
  h.update(String(world.seed));
  h.update(String(world.stats.buildings));
  h.update(String(world.stats.trees));
  for (const b of world.buildings) {
    h.update(`${b.id}:${b.x.toFixed(2)}:${b.z.toFixed(2)}:${b.w.toFixed(2)}:${b.h.toFixed(2)}:${b.style}`);
  }
  for (const t of world.trees) h.update(`${t.x.toFixed(1)},${t.z.toFixed(1)}`);
  return h.digest('hex').slice(0, 16);
}

/** Mirrors the renderer's window grid so the perf budget is honest. */
export function estimateWindows(buildings) {
  let count = 0;
  for (const b of buildings) {
    const floors = Math.max(1, b.floors);
    const colsFront = Math.max(1, Math.floor(b.w / 3.4));
    const colsSide = Math.max(1, Math.floor(b.d / 4.2));
    for (let f = 0; f < floors; f++) {
      if (f === 0 && b.shop) continue;
      count += colsFront * 2 + colsSide * 2;
    }
  }
  return count;
}

export function stationOrder(world) {
  return world.rail.stations.map((s) => `${s.id}:${Math.round(s.railDist)}`).join(' → ');
}

export function fmt(n, digits = 0) { return Number(n).toFixed(digits); }
