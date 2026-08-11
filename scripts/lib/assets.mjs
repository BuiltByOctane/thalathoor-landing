/**
 * Shared config + helpers for the asset scripts.
 *
 * Source images live in assets/images/ and are never modified.
 * Derived variants are written to assets/images/opt/ and are committed,
 * so the deployed site needs no build step.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC_DIR = path.join(ROOT, 'assets', 'images');
export const OUT_DIR = path.join(SRC_DIR, 'opt');
export const MANIFEST = path.join(OUT_DIR, 'manifest.json');

/**
 * Width ladder. Every source gets each width that does not exceed its own
 * intrinsic width, so nothing is ever upscaled. Chosen to cover both 1x and
 * 2x for the real display sizes on the site: gallery tiles land ~415px,
 * room/media panels ~630px, hero is full-bleed. No source here is wider than
 * 1200px, so larger rungs would never be produced.
 */
export const WIDTHS = [480, 768, 1024];

/**
 * JPEG exists only as the <picture> fallback for browsers without AVIF
 * (roughly the pre-2021 tail). Generating it at every rung cost more disk than
 * the AVIFs that actually get served, and a native-width JPEG is nearly a copy
 * of the source file that is already in the repo. So: two small rungs for the
 * fallback path, and the untouched source serves as the largest fallback.
 */
export const JPEG_WIDTHS = [480, 768];

/** Quality settings, tuned against this photo set (see README). */
export const AVIF = { quality: 58, effort: 4, chromaSubsampling: '4:2:0' };
export const JPEG = { quality: 80, mozjpeg: true, progressive: true };

export const RASTER_EXT = new Set(['.jpg', '.jpeg', '.png']);

/** Source files to process, sorted, excluding the output dir. */
export function listSources() {
  return fs
    .readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && RASTER_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

/** `nature1.jpg` -> `nature1` */
export function stem(file) {
  return path.basename(file, path.extname(file));
}

export function readManifest() {
  if (!fs.existsSync(MANIFEST)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

export function writeManifest(data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
}

export function kb(bytes) {
  return (bytes / 1024).toFixed(0) + 'K';
}

export function mb(bytes) {
  return (bytes / 1048576).toFixed(2) + ' MB';
}

/** True when `out` is missing or older than `src`. */
export function stale(src, out) {
  if (!fs.existsSync(out)) return true;
  return fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs;
}
