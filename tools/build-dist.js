// Build the PUBLIC bundle: dist/ = index.html + every client script minified+mangled (terser).
// The readable source (and its design-note comments) never leaves the private repo — what the
// public server ships is functionally identical but stripped. Dev stays no-build; this is a
// deploy-only step:  node tools/build-dist.js   then   PULSAR_PUBLIC=1 node mpserver.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('no <script src> tags found in index.html'); process.exit(1); }

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'src'), { recursive: true });

// index.html ships as-is: it's presentation markup — the tell-nothing part.
fs.writeFileSync(path.join(DIST, 'index.html'), html);

let inBytes = 0, outBytes = 0;
for (const rel of scripts) {
  const src = path.join(ROOT, rel), out = path.join(DIST, rel);
  execSync(`npx --yes terser "${src}" --compress --mangle -o "${out}"`, { stdio: 'inherit', cwd: ROOT });
  inBytes += fs.statSync(src).size; outBytes += fs.statSync(out).size;
  console.log(`  ${rel}  ${(fs.statSync(src).size / 1024).toFixed(1)}kb -> ${(fs.statSync(out).size / 1024).toFixed(1)}kb`);
}
console.log(`\ndist/ built: ${scripts.length} scripts, ${(inBytes / 1024).toFixed(0)}kb -> ${(outBytes / 1024).toFixed(0)}kb (${Math.round(100 - outBytes / inBytes * 100)}% smaller, zero comments)`);
