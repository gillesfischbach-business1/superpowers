/**
 * Static audit of the browser module graph.
 *
 * The game is plain ES modules served straight to the browser: an import that
 * names something the target file does not export is not a warning there, it is
 * a hard failure — the entry module never executes and the page sits on its
 * loading screen forever. Node's own loader only catches it if something
 * actually imports that file, and the pipeline historically only read main.js as
 * text. This walks the graph the same way the browser would.
 */
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
const BARE_OK = new Set(['three']);

function parseImports(src) {
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const clause = m[1].trim();
    const spec = m[2];
    const named = [];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const local = part.trim().split(/\s+as\s+/)[0].trim();
        if (local) named.push(local);
      }
    }
    const namespace = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
    const defaultName = !braces && !namespace ? clause.match(/^([A-Za-z0-9_$]+)/)?.[1] : null;
    out.push({ spec, named, namespace: namespace ? namespace[1] : null, defaultName });
  }
  return out;
}

/** Exported bindings of a module, read without executing it. */
export function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/);
      const name = (alias[1] || alias[0] || '').trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\b/.test(src)) names.add('default');
  if (/export\s*\*\s*from/.test(src)) names.add('*'); // re-export: cannot resolve statically, do not flag
  return names;
}

/**
 * Walk every module reachable from `entry` and report anything the browser
 * would refuse to load.
 * @returns {{modules: string[], problems: string[], missingFiles: string[]}}
 */
export function auditModuleGraph(entry = 'public/js/game/main.js', { cwd = process.cwd() } = {}) {
  const modules = [];
  const problems = [];
  const missingFiles = [];
  const cycles = [];
  const seen = new Set();
  const edges = new Map();

  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    modules.push(path.relative(cwd, file));
    const src = fs.readFileSync(file, 'utf8');
    for (const imp of parseImports(src)) {
      const where = path.relative(cwd, file);
      if (imp.spec === 'three' || BARE_OK.has(imp.spec)) continue;
      if (!imp.spec.startsWith('.')) {
        problems.push(`${where}: bare specifier "${imp.spec}" is not in the import map`);
        continue;
      }
      const target = path.normalize(path.join(path.dirname(file), imp.spec));
      if (!fs.existsSync(target)) {
        problems.push(`${where}: ${imp.spec} does not exist`);
        missingFiles.push(target);
        continue;
      }
      if (!edges.has(file)) edges.set(file, []);
      edges.get(file).push(target);
      const targetSrc = fs.readFileSync(target, 'utf8');
      const exported = exportsOf(targetSrc);
      if (!exported.has('*')) {
        for (const name of imp.named) {
          if (!exported.has(name)) problems.push(`${where}: imports { ${name} } from ${imp.spec} — not exported there`);
        }
        if (imp.defaultName && !exported.has('default')) {
          problems.push(`${where}: default-imports ${imp.spec} — that module has no default export`);
        }
      }
      walk(target);
    }
  };

  walk(path.resolve(cwd, entry));

  // depth-first cycle search — a cycle in the client bundle is legal ESM but in
  // this codebase it has repeatedly meant a temporal-dead-zone trap at boot
  const state = new Map();
  const stack = [];
  const visit = (file) => {
    state.set(file, 'open');
    stack.push(file);
    for (const next of edges.get(file) || []) {
      if (state.get(next) === 'open') {
        const from = stack.indexOf(next);
        cycles.push([...stack.slice(from), next].map((f) => path.relative(cwd, f)).join(' → '));
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(file, 'done');
  };
  visit(path.resolve(cwd, entry));

  return { modules, problems, missingFiles, cycles };
}
