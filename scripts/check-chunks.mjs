// Chunk-budget guard for the production bundle (Node only, zero dependencies).
// Locks the #51 layout in place: three.js core + addons ship in a separately
// cached `three-vendor` chunk while the app entry stays small, so a regressed
// split or unchecked growth fails `npm run build` loudly instead of silently
// raising first-load cost on slow networks.
//
// Usage: node scripts/check-chunks.mjs [--dist dist]

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ENTRY_CAP_BYTES = 200 * 1024;
const CHUNK_CAP_BYTES = 800 * 1024;
const TOTAL_CAP_BYTES = 850 * 1024;
const VENDOR_PATTERN = /^three-vendor-.*\.js$/;

function parseDistDir(argv) {
  const flag = argv.indexOf('--dist');
  if (flag >= 0 && flag + 1 < argv.length) return resolve(argv[flag + 1]);
  const eq = argv.find((a) => a.startsWith('--dist='));
  if (eq !== undefined) return resolve(eq.slice('--dist='.length));
  return resolve('dist');
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function fail(message) {
  console.error(`chunk budget violated: ${message}`);
  process.exitCode = 1;
}

const distDir = parseDistDir(process.argv.slice(2));
const assetsDir = join(distDir, 'assets');

let names;
try {
  names = readdirSync(assetsDir).filter((name) => name.endsWith('.js')).sort();
} catch {
  fail(`assets dir not found: ${assetsDir} (run vite build first)`);
  process.exit(1);
}

const chunks = names.map((name) => ({
  name,
  bytes: statSync(join(assetsDir, name)).size,
}));

for (const chunk of chunks) {
  console.log(`${chunk.name} ${formatKb(chunk.bytes)}`);
}
const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
console.log(`total ${formatKb(total)} (${chunks.length} chunks)`);

if (!chunks.some((chunk) => VENDOR_PATTERN.test(chunk.name))) {
  fail('missing three-vendor-*.js chunk (manualChunks split regressed)');
} else if (chunks.length < 2) {
  fail(`expected >= 2 JS chunks, found ${chunks.length}`);
}

for (const chunk of chunks) {
  if (!VENDOR_PATTERN.test(chunk.name) && chunk.bytes > ENTRY_CAP_BYTES) {
    fail(`non-vendor chunk ${chunk.name} is ${formatKb(chunk.bytes)}, over entry cap ${formatKb(ENTRY_CAP_BYTES)}`);
  }
  if (chunk.bytes > CHUNK_CAP_BYTES) {
    fail(`chunk ${chunk.name} is ${formatKb(chunk.bytes)}, over per-chunk cap ${formatKb(CHUNK_CAP_BYTES)}`);
  }
}

if (total > TOTAL_CAP_BYTES) {
  fail(`total JS is ${formatKb(total)}, over total cap ${formatKb(TOTAL_CAP_BYTES)}`);
}

if (process.exitCode !== 1) {
  console.log('chunk budget ok: vendor split present, entry <= 200 kB, total <= 850 kB');
}
