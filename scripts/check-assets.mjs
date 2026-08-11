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
import { entryFiles, scanReferences, derivedOutputs } from './lib/refs.mjs';

/** Directories scanned for files that nothing references. */
const ASSET_DIRS = [
  'assets/images', 'assets/images/opt',
  'assets/videos', 'assets/videos/opt',
  'assets/logo', 'assets/logo/brand', 'assets/icons', 'assets/fonts',
];

/**
 * Never served, kept on purpose: originals the pipeline derives from, licence
 * text, and the brand marks that build-pages.mjs inlines into the HTML.
 */
const KEPT_SOURCES = [
  /^assets\/fonts\/OFL\.txt$/,
  /^assets\/logo\/brand\/NOTICE\.md$/,
  /^assets\/logo\/brand\/.*\.svg$/,
  /^assets\/logo\/(logo-full\.png|ccf0ada9-.*\.png)$/,
];

const { referenced, missing } = scanReferences(entryFiles());

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

// A source counts as referenced when any variant generated from it is: pages
// point at assets/images/opt/<name>-480.avif, never at the source JPEG.
const derivedFrom = derivedOutputs();

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
