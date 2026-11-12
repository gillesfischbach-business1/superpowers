/**
 * Keep the preview alive — exactly once.
 *
 * The sandbox gets recycled between sessions, and a preview that finds nothing
 * listening on the port reports the app as asleep. This supervisor owns the
 * port and restarts the server within a second if it ever stops (crash, stray
 * SIGTERM, port squatter).
 *
 * Because it can be launched from several places (the agent's process manager,
 * a shell hook), it is single-instance by design:
 *   • a pid lock file stops a second supervisor from existing;
 *   • a live /health answer makes a would-be duplicate stand down politely.
 *
 *   node scripts/serve-forever.mjs [--port 5173]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? args[portArg + 1] : process.env.PORT || '5173';
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LOCK = path.join('/tmp', `diddeleng-supervisor-${PORT}.pid`);
const URL_HEALTH = `http://127.0.0.1:${PORT}/health`;

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${stamp()}] supervisor: ${msg}`);

/* ------------------------------------------------------------------ lock */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function takeLock() {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (pid && pid !== process.pid && alive(pid)) return false;
  } catch { /* no lock yet */ }
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK);
  } catch { /* already gone */ }
}

async function someoneIsServing() {
  try {
    const res = await fetch(URL_HEALTH, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

if (!takeLock()) {
  log(`another supervisor already owns :${PORT} — standing down`);
  process.exit(0);
}

if (await someoneIsServing()) {
  log(`:${PORT} is already answering — standing down`);
  releaseLock();
  process.exit(0);
}

/* ------------------------------------------------------------- supervisor */
let child = null;
let stopping = false;
let restarts = 0;
let lastStart = 0;

function start() {
  lastStart = Date.now();
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT, HOST, FORCE_COLOR: '0' },
    stdio: 'inherit'
  });

  child.on('exit', async (code, signal) => {
    if (stopping) return;

    // if something else grabbed the port in the meantime, do not fight it
    if (await someoneIsServing()) {
      log('another server is answering on the port — standing down');
      releaseLock();
      process.exit(0);
    }

    restarts += 1;
    const ranFor = Date.now() - lastStart;
    const wait = ranFor < 3000 ? Math.min(5000, 500 * restarts) : 1000;
    const how = signal ? `signal ${signal}` : `code ${code}`;
    log(`server exited (${how}) after ${(ranFor / 1000).toFixed(1)} s — restart ${restarts} in ${wait} ms`);
    setTimeout(start, wait);
  });

  child.on('error', (err) => {
    log(`could not spawn the server: ${err.message}`);
    setTimeout(start, 2000);
  });
}

function shutdown(signal) {
  stopping = true;
  log(`${signal} received — stopping`);
  releaseLock();
  if (child && !child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 400);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => log(`uncaught in supervisor: ${err.message}`));
process.on('unhandledRejection', (err) => log(`unhandled in supervisor: ${err && err.message}`));
process.on('exit', releaseLock);

log(`owning ${HOST}:${PORT} — the server is restarted whenever it stops`);
start();
