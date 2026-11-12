/**
 * Build one self-contained HTML file: diddeleng-standalone.html
 *
 * The game is plain ES modules plus a vendored three.js, which normally needs
 * the little Node server. This bundles the module graph (including three), inlines
 * the stylesheet and writes a single file that runs from a `file://` URL — no
 * server, no network, no install. Saves fall back to doing nothing, which the
 * game already tolerates.
 *
 *   npm run build:standalone
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'diddeleng-standalone.html');

const result = await build({
  entryPoints: [path.join(ROOT, 'public', 'js', 'game', 'main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  write: false,
  alias: { three: path.join(ROOT, 'public', 'vendor', 'three.module.js') },
  logLevel: 'warning'
});

// The bundle lives inside a <script> element: any literal "</script" in the
// game's own template strings would close the element early and blank the page.
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

// the import map and the external module script are replaced by the bundle
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/\s*<script type="module" src="\/js\/game\/main\.js"><\/script>/, '');
// replacer functions everywhere: a replacement *string* treats "$&", "$1" and
// friends as capture patterns, and minified three is full of "$" identifiers
html = html.replace(/<link rel="stylesheet" href="\/css\/style\.css" \/>/, () => `<style>\n${css}\n</style>`);

const banner = `<script>\n/* Diddeleng — single-file build. Everything below is bundled: no server, no network. */\n</script>\n`;
html = html.replace('</body>', () => `${banner}<script>${js}</script>\n</body>`);

fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`standalone build → ${path.basename(OUT)} (${kb} kB: ${(js.length / 1024).toFixed(0)} kB js, ${(css.length / 1024).toFixed(0)} kB css)`);
console.log('  open it directly in a browser — file:// works, no server needed');
