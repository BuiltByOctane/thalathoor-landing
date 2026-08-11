/**
 * Fails the build when an HTML or CSS file points at an asset that is not on
 * disk. Written after `gallery.html` was found referencing an image
 * (`outhome2.jpg`) that had never existed, which rendered as a silent blank
 * tile in production.
 *
 * Also reports assets on disk that nothing references, so dead weight does not
 * accumulate. Unreferenced files are a warning, not a failure.
 *
 * Usage: npm run check
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/assets.mjs';

/** Files whose references we validate. */
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const SHEETS = ['css/style.css'];

/** Directories scanned for unreferenced files. */
const ASSET_DIRS = ['assets/images', 'assets/images/opt', 'assets/logo', 'assets/icons', 'assets/fonts'];

/** Referenced but intentionally absent (generated at runtime, external, etc.). */
const IGNORE_REFS = new Set();

const ASSET_RE = /(?:src|href|srcset|data-lightbox-src|data-lightbox-poster)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

const referenced = new Map(); // resolved path -> Set of "file:line"
const missing = [];

function record(ref, file, line) {
  // Skip protocol-relative, absolute, external, anchor, and data refs.
  if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(ref)) return;
  if (IGNORE_REFS.has(ref)) return;

  // srcset can hold a comma-separated candidate list with descriptors.
  const candidates = ref.includes(',')
    ? ref.split(',').map((c) => c.trim().split(/\s+/)[0])
    : [ref];

  for (const cand of candidates) {
    if (!cand) continue;
    const clean = cand.split('#')[0].split('?')[0];
    if (!clean || /^(https?:|data:)/i.test(clean)) continue;
    const abs = path.resolve(ROOT, path.dirname(file), clean);
    const rel = path.relative(ROOT, abs);
    if (!referenced.has(rel)) referenced.set(rel, new Set());
    referenced.get(rel).add(`${file}:${line}`);
    if (!fs.existsSync(abs)) missing.push({ ref: clean, file, line });
  }
}

for (const file of [...PAGES, ...SHEETS]) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const m of text.matchAll(ASSET_RE)) {
      record(m[1] ?? m[2], file, i + 1);
    }
  });
}

// ---- report ----------------------------------------------------------------

let failed = false;

if (missing.length) {
  failed = true;
  console.error(`\nMISSING ASSETS (${missing.length}):`);
  for (const m of missing) {
    console.error(`  ${m.file}:${m.line}  ->  ${m.ref}`);
  }
} else {
  console.log(`OK  every asset reference resolves (${referenced.size} unique paths)`);
}

const onDisk = new Set();
for (const dir of ASSET_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
    if (f.isFile() && !f.name.startsWith('.') && f.name !== 'manifest.json') {
      onDisk.add(path.posix.join(dir, f.name));
    }
  }
}

const unreferenced = [...onDisk].filter((f) => !referenced.has(f)).sort();
if (unreferenced.length) {
  let bytes = 0;
  console.warn(`\nUNREFERENCED (${unreferenced.length}) - not an error:`);
  for (const f of unreferenced) {
    const size = fs.statSync(path.join(ROOT, f)).size;
    bytes += size;
    console.warn(`  ${(size / 1024).toFixed(0).padStart(6)}K  ${f}`);
  }
  console.warn(`  ${'='.repeat(6)}  ${(bytes / 1048576).toFixed(2)} MB total`);
}

process.exit(failed ? 1 : 0);
