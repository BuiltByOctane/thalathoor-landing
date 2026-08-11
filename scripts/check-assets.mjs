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
const SHEETS = ['css/style.css', 'css/fonts.css'];
/** Non-HTML files that also point at assets. */
const EXTRAS = ['site.webmanifest'];

/** Directories scanned for unreferenced files. */
const ASSET_DIRS = [
  'assets/images', 'assets/images/opt',
  'assets/videos', 'assets/videos/opt',
  'assets/logo', 'assets/logo/brand', 'assets/icons', 'assets/fonts',
];

/** Referenced but intentionally absent (generated at runtime, external, etc.). */
const IGNORE_REFS = new Set();

/**
 * Files that are never served but are kept on purpose: originals the pipeline
 * derives from, and licence text. Reported separately from genuine orphans.
 */
const KEPT_SOURCES = [
  /^assets\/fonts\/OFL\.txt$/,
  /^assets\/logo\/brand\/NOTICE\.md$/,
  /^assets\/logo\/(logo-full\.png|ccf0ada9-.*\.png)$/,
  // Inlined into the footer by build-pages.mjs, never fetched by URL.
  /^assets\/logo\/brand\/.*\.svg$/,
];

const ASSET_RE = /(?:src|href|srcset|poster|data-src|data-srcset|data-lightbox-src|data-lightbox-poster)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

const referenced = new Map(); // resolved path -> Set of "file:line"
const missing = [];

function record(ref, file, line) {
  // Skip protocol-relative, absolute, external, anchor, and data refs.
  if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(ref)) return;
  if (IGNORE_REFS.has(ref)) return;

  // srcset holds a comma-separated candidate list, each optionally followed by
  // a width or density descriptor. A single-candidate srcset has no comma but
  // still carries its descriptor, so always split on both.
  const candidates = ref.split(',').map((c) => c.trim().split(/\s+/)[0]);

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

for (const file of [...PAGES, ...SHEETS, ...EXTRAS]) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  // JSON files (the webmanifest) express paths as "src": "..." rather than
  // src="...", so the attribute regex alone would miss them.
  const isJson = /\.(webmanifest|json)$/.test(file);
  lines.forEach((text, i) => {
    if (isJson) {
      for (const m of text.matchAll(/"(?:src|url|icon)"\s*:\s*"([^"]+)"/g)) record(m[1], file, i + 1);
      return;
    }
    for (const m of text.matchAll(ASSET_RE)) record(m[1] ?? m[2], file, i + 1);
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

/**
 * A source asset counts as referenced when any variant generated from it is.
 * Pages point at assets/images/opt/<name>-480.avif, never at the source JPEG,
 * so without this every original would be reported as dead.
 */
const derivedFrom = new Map();
for (const [manifestPath, dir] of [
  ['assets/images/opt/manifest.json', 'assets/images'],
  ['assets/videos/opt/manifest.json', 'assets/videos'],
]) {
  const abs = path.join(ROOT, manifestPath);
  if (!fs.existsSync(abs)) continue;
  const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const [srcName, entry] of Object.entries(m)) {
    const outputs = [];
    for (const v of entry.variants ?? []) {
      if (v.avif) outputs.push(v.avif);
      if (v.jpg) outputs.push(v.jpg);
    }
    for (const k of ['video', 'posterJpg', 'posterAvif']) if (entry[k]) outputs.push(entry[k]);
    derivedFrom.set(path.posix.join(dir, srcName), outputs);
  }
}

const isReferenced = (f) => {
  if (referenced.has(f)) return true;
  const outputs = derivedFrom.get(f);
  return Boolean(outputs && outputs.some((o) => referenced.has(o)));
};

const orphans = [...onDisk].filter((f) => !isReferenced(f)).sort();
const kept = orphans.filter((f) => KEPT_SOURCES.some((re) => re.test(f)));
const unreferenced = orphans.filter((f) => !kept.includes(f));

if (kept.length) {
  console.log(`\nKEPT ON PURPOSE (${kept.length}) - masters and licences, never served:`);
  for (const f of kept) {
    console.log(`  ${(fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0).padStart(6)}K  ${f}`);
  }
}
const size = (f) => fs.statSync(path.join(ROOT, f)).size;
const isVariant = (f) => f.includes('/opt/');
const sources = unreferenced.filter((f) => !isVariant(f));
const variants = unreferenced.filter(isVariant);

if (sources.length) {
  let bytes = 0;
  console.warn(`\nUNREFERENCED SOURCES (${sources.length}) - nothing on the site uses these:`);
  for (const f of sources) {
    bytes += size(f);
    console.warn(`  ${(size(f) / 1024).toFixed(0).padStart(6)}K  ${f}`);
  }
  console.warn(`  ${'='.repeat(6)}  ${(bytes / 1048576).toFixed(2)} MB`);
}
if (variants.length) {
  const bytes = variants.reduce((a, f) => a + size(f), 0);
  console.warn(`\nUNUSED VARIANTS: ${variants.length} generated file(s), ` +
    `${(bytes / 1048576).toFixed(2)} MB - derived from the sources above, or rungs no layout requests.`);
}

process.exit(failed ? 1 : 0);
