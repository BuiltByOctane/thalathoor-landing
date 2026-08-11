/**
 * Shared rendering helpers for build-pages.mjs.
 *
 * Everything here returns HTML strings. Values that originate in data/*.json are
 * escaped; markup this repo authors is not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, OUT_DIR } from './assets.mjs';

export const DATA_DIR = path.join(ROOT, 'data');

export function readData(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

let manifestCache = null;
export function manifest() {
  if (!manifestCache) {
    manifestCache = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'));
  }
  return manifestCache;
}

/** Escape for use in text nodes and double-quoted attributes. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a wa.me link with a prefilled message. Apostrophes are percent-encoded
 * too; encodeURIComponent leaves them raw, which is legal in a URL but reads
 * badly inside an HTML attribute.
 */
export function wa(site, message) {
  const text = encodeURIComponent(message).replace(/'/g, '%27');
  return `https://wa.me/${site.contact.whatsapp}?text=${text}`;
}

/**
 * A <picture> for a source image, sized for a given layout.
 *
 * `sizes` is the CSS sizes attribute. `eager` skips lazy loading and asks for
 * high fetch priority, for anything above the fold.
 */
export function picture(image, { sizes, alt, eager = false, indent = 0 }) {
  const entry = manifest()[image];
  if (!entry) throw new Error(`${image} is not in the image manifest - run \`npm run assets:images\``);

  const avif = entry.variants.map((v) => `${v.avif} ${v.width}w`).join(', ');
  const jpegs = entry.variants.filter((v) => v.jpg);
  const jpgSrcset = jpegs.map((v) => `${v.jpg} ${v.width}w`).join(', ');
  const fallback = jpegs.at(-1) ?? entry.variants.at(-1);

  const i = ' '.repeat(indent);
  return [
    `${i}<picture>`,
    `${i}  <source type="image/avif" srcset="${avif}" sizes="${esc(sizes)}">`,
    `${i}  <img class="media-fill" src="${fallback.jpg ?? fallback.avif}"`,
    `${i}    srcset="${jpgSrcset}" sizes="${esc(sizes)}"`,
    `${i}    width="${entry.width}" height="${entry.height}" alt="${esc(alt)}"`,
    `${i}    ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`,
    `${i}</picture>`,
  ].join('\n');
}

/** Poster-only <picture>, used for the video tile. */
export function posterPicture(alt, { eager = true, indent = 0 } = {}) {
  const i = ' '.repeat(indent);
  return [
    `${i}<picture>`,
    `${i}  <source type="image/avif" srcset="assets/images/opt/hero-poster.avif">`,
    `${i}  <img class="media-fill" src="assets/images/opt/hero-poster.jpg"`,
    `${i}    width="640" height="360" alt="${esc(alt)}"`,
    `${i}    ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`,
    `${i}</picture>`,
  ].join('\n');
}
