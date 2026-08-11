/**
 * Generates responsive AVIF + JPEG variants for every source image.
 *
 *   assets/images/nature1.jpg
 *     -> assets/images/opt/nature1-480.avif   nature1-480.jpg
 *        assets/images/opt/nature1-768.avif   nature1-768.jpg
 *        ...
 *
 * WebP is deliberately not generated: measured against this photo set it saved
 * only ~11% over the source JPEGs (and was larger for some foliage-heavy
 * frames), while AVIF saved ~52% at full size and ~87% once combined with
 * display-width resizing. A third format per image is not worth the bytes in
 * the repo for that margin.
 *
 * Re-runs are incremental; only sources newer than their output are encoded.
 * Usage: npm run assets:images [-- --force]
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  SRC_DIR, OUT_DIR, WIDTHS, JPEG_WIDTHS, AVIF, JPEG,
  listSources, stem, readManifest, writeManifest, stale, kb, mb,
} from './lib/assets.mjs';

const force = process.argv.includes('--force');

fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = readManifest();
const sources = listSources();

let srcBytes = 0;
let outBytes = 0;
let encoded = 0;
let skipped = 0;

for (const file of sources) {
  const srcPath = path.join(SRC_DIR, file);
  const name = stem(file);
  const meta = await sharp(srcPath).metadata();
  srcBytes += fs.statSync(srcPath).size;

  // Never upscale. Always include the intrinsic width so full-bleed hero
  // images still have a variant at native resolution.
  const targets = [...new Set([...WIDTHS.filter((w) => w < meta.width), meta.width])]
    .sort((a, b) => a - b);

  const variants = [];

  for (const width of targets) {
    const avifOut = path.join(OUT_DIR, `${name}-${width}.avif`);
    const pipeline = () => sharp(srcPath).resize({ width, withoutEnlargement: true });

    if (force || stale(srcPath, avifOut)) {
      await pipeline().avif(AVIF).toFile(avifOut);
      encoded++;
    } else {
      skipped++;
    }
    outBytes += fs.statSync(avifOut).size;

    // JPEG only on the fallback rungs; see JPEG_WIDTHS.
    let jpg = null;
    let jpgBytes = null;
    if (JPEG_WIDTHS.includes(width)) {
      const jpegOut = path.join(OUT_DIR, `${name}-${width}.jpg`);
      if (force || stale(srcPath, jpegOut)) {
        await pipeline().jpeg(JPEG).toFile(jpegOut);
        encoded++;
      } else {
        skipped++;
      }
      jpgBytes = fs.statSync(jpegOut).size;
      outBytes += jpgBytes;
      jpg = path.posix.join('assets/images/opt', `${name}-${width}.jpg`);
    }

    const height = Math.round((meta.height / meta.width) * width);
    variants.push({
      width,
      height,
      avif: path.posix.join('assets/images/opt', `${name}-${width}.avif`),
      avifBytes: fs.statSync(avifOut).size,
      jpg,
      jpgBytes,
    });
  }

  manifest[file] = {
    source: path.posix.join('assets/images', file),
    width: meta.width,
    height: meta.height,
    variants,
  };

  const best = variants[0];
  process.stdout.write(
    `${file.padEnd(26)} ${String(meta.width + 'x' + meta.height).padStart(10)}  ` +
    `${targets.length} widths  smallest avif ${kb(best.avifBytes).padStart(6)}\n`
  );
}

writeManifest(manifest);

console.log('\n' + '-'.repeat(64));
console.log(`sources          ${sources.length} files   ${mb(srcBytes)}`);
console.log(`variants written ${encoded} encoded, ${skipped} up to date`);
console.log(`all variants     ${mb(outBytes)} on disk (only one width is ever fetched per view)`);
console.log(`manifest         assets/images/opt/manifest.json`);
