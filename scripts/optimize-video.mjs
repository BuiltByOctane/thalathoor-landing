/**
 * Compresses the hero clips in assets/videos/ and extracts a poster for each.
 *
 *   assets/videos/hero-video-1.mp4
 *     -> assets/videos/opt/hero-video-1.mp4        h264, no audio, 30fps, CRF 32
 *        assets/videos/opt/hero-video-1-poster.jpg / .avif
 *
 * Three things drive the saving, in order of impact:
 *
 * 1. Frame rate. Two of the source clips are 60fps, which a muted background
 *    loop has no use for; FPS_CAP halves their frame count.
 * 2. Audio is stripped. The hero <video> elements are `muted` with no controls,
 *    so every audio track was pure download cost.
 * 3. CRF 30 re-encode with +faststart, so playback can begin before the whole
 *    file arrives.
 *
 * Sources are never upscaled: MAX_WIDTH only ever scales down. An earlier
 * version of this script scaled a 640x360 source up to 720p and produced a file
 * 55% LARGER than its input.
 *
 * A manifest is written so build-pages.mjs knows each clip's real dimensions
 * and can set width/height on the elements.
 *
 * Usage: npm run assets:video [-- --force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';
import { ROOT, AVIF, JPEG, stale, mb, kb } from './lib/assets.mjs';

const SRC_DIR = path.join(ROOT, 'assets', 'videos');
const OUT_DIR = path.join(SRC_DIR, 'opt');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

/** Never scale up; only clamp anything wider than this. */
const MAX_WIDTH = 1280;
/** Background loops gain nothing from 60fps. */
const FPS_CAP = 30;
/* 32 rather than 30: clip 3 is rain over foliage - fine detail across the whole
   frame, which is expensive to encode. A 30-vs-34 frame comparison was
   indistinguishable behind the hero's gradient overlay, so 32 leaves margin. */
const CRF = 32;
/** Poster frame grabbed slightly in, to avoid a fade-from-black first frame. */
const POSTER_AT = '00:00:01';

const force = process.argv.includes('--force');

if (!fs.existsSync(SRC_DIR)) {
  console.error(`missing ${path.relative(ROOT, SRC_DIR)}/`);
  process.exit(1);
}

const sources = fs.readdirSync(SRC_DIR)
  .filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f))
  .sort();

if (!sources.length) {
  console.error(`no video files in ${path.relative(ROOT, SRC_DIR)}/`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/** Read width/height/duration/fps without failing on ffmpeg's exit code. */
function probe(file) {
  let out = '';
  try {
    execFileSync(ffmpeg, ['-i', file, '-hide_banner'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stderr || '').toString();
  }
  const dims = /,\s(\d{2,5})x(\d{2,5})[\s,]/.exec(out);
  const fps = /([\d.]+)\s+fps/.exec(out);
  const dur = /Duration:\s(\d+):(\d+):([\d.]+)/.exec(out);
  return {
    width: dims ? Number(dims[1]) : null,
    height: dims ? Number(dims[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    seconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(out),
  };
}

const manifest = {};
let srcTotal = 0;
let outTotal = 0;

for (const file of sources) {
  const src = path.join(SRC_DIR, file);
  const stem = path.basename(file, path.extname(file));
  const videoOut = path.join(OUT_DIR, `${stem}.mp4`);
  const posterJpg = path.join(OUT_DIR, `${stem}-poster.jpg`);
  const posterAvif = path.join(OUT_DIR, `${stem}-poster.avif`);
  const frameTmp = path.join(OUT_DIR, `.${stem}-frame.png`);

  const meta = probe(src);
  srcTotal += fs.statSync(src).size;

  // `scale` only when the source exceeds MAX_WIDTH; -2 keeps dimensions even.
  const filters = [];
  if (meta.width && meta.width > MAX_WIDTH) filters.push(`scale=${MAX_WIDTH}:-2`);
  if (meta.fps && meta.fps > FPS_CAP) filters.push(`fps=${FPS_CAP}`);

  if (force || stale(src, videoOut)) {
    run([
      '-i', src,
      '-an',
      ...(filters.length ? ['-vf', filters.join(',')] : []),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', String(CRF),
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      videoOut,
    ]);
  }

  if (force || stale(src, posterJpg)) {
    run(['-ss', POSTER_AT, '-i', src, '-frames:v', '1', frameTmp]);
    await sharp(frameTmp).jpeg(JPEG).toFile(posterJpg);
    await sharp(frameTmp).avif(AVIF).toFile(posterAvif);
    fs.unlinkSync(frameTmp);
  }

  const after = probe(videoOut);
  const outBytes = fs.statSync(videoOut).size;
  outTotal += outBytes;

  manifest[file] = {
    source: path.posix.join('assets/videos', file),
    video: path.posix.join('assets/videos/opt', `${stem}.mp4`),
    posterJpg: path.posix.join('assets/videos/opt', `${stem}-poster.jpg`),
    posterAvif: path.posix.join('assets/videos/opt', `${stem}-poster.avif`),
    width: after.width ?? meta.width,
    height: after.height ?? meta.height,
    seconds: Number((after.seconds ?? meta.seconds ?? 0).toFixed(2)),
    fps: after.fps ?? meta.fps,
    bytes: outBytes,
  };

  const before = fs.statSync(src).size;
  console.log(
    `${file.padEnd(20)} ${String(meta.width + 'x' + meta.height).padStart(10)} ` +
    `${String(Math.round(meta.fps) + 'fps').padStart(6)} ${kb(before).padStart(7)}` +
    `  ->  ${String(manifest[file].width + 'x' + manifest[file].height).padStart(10)} ` +
    `${String(Math.round(manifest[file].fps) + 'fps').padStart(6)} ${kb(outBytes).padStart(7)}` +
    `  (-${(100 - (outBytes / before) * 100).toFixed(0)}%)`
  );
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

console.log('-'.repeat(78));
console.log(`${sources.length} clip(s)   ${mb(srcTotal)}  ->  ${mb(outTotal)}   (-${(100 - (outTotal / srcTotal) * 100).toFixed(0)}%)`);
console.log(`manifest  ${path.relative(ROOT, MANIFEST)}`);
