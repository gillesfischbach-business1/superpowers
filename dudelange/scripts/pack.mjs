/**
 * Pack the game into a single downloadable zip.
 *
 * Uses `git archive` so the archive is exactly the committed tree: no
 * node_modules, no save files, no stray build output, and the same bytes for the
 * same commit. The result is written to the repository root and served by the
 * preview at /download/diddeleng.zip.
 *
 *   npm run pack            # diddeleng-<version>-<sha>.zip
 *   npm run pack -- --out ~/Downloads/diddeleng.zip
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;

const name = `diddeleng-${pkg.version}-${sha}${dirty ? '-uncommitted' : ''}.zip`;
const out = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, name));

execFileSync('git', ['archive', '--format=zip', '--prefix=diddeleng/', `--output=${out}`, 'HEAD'], {
  cwd: ROOT,
  stdio: ['ignore', 'inherit', 'inherit']
});

const bytes = fs.statSync(out).size;
const entries = execFileSync('unzip', ['-Z1', out], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

console.log(`packed ${entries.length} files → ${path.relative(process.cwd(), out) || out}`);
console.log(`  ${(bytes / 1024 / 1024).toFixed(2)} MB · commit ${sha}${dirty ? ' (working tree has uncommitted changes — zip is HEAD)' : ''}`);
console.log(`  download: /download/diddeleng.zip while the preview is running`);
