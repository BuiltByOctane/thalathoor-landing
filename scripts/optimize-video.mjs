/**
 * Compresses the hero video and extracts a poster frame.
 *
 *   assets/images/main.mp4  (10.5 MB, 640x360, 2m21s, with audio)
 *     -> assets/images/opt/hero-loop.mp4  h264 640x360, CRF 30, no audio, 20s
 *        assets/images/opt/hero-poster.jpg / .avif
 *
 * Three things drive the ~90% saving, in order of impact:
 *
 * 1. LOOP_SECONDS. The source runs 2m21s, but it plays as a muted background
 *    loop with no controls, so nothing past the first few seconds is ever
 *    watched. Trimming is worth ~4.8 MB; re-encoding the full duration only
 *    gets to 5.85 MB. Set LOOP_SECONDS to null to keep the full clip.
 * 2. Audio is stripped: the element is `muted`, so the 96 kb/s AAC track was
 *    pure download cost.
 * 3. CRF 30 re-encode.
 *
 * The source is 640x360 and is never upscaled - an earlier version of this
 * script scaled to 720p and produced a file 55% LARGER than the input.
 *
 * Usage: npm run assets:video [-- --force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';
import { SRC_DIR, OUT_DIR, AVIF, JPEG, stale, mb } from './lib/assets.mjs';

/** Seconds of the source to keep. `null` keeps the full clip. */
const LOOP_SECONDS = 20;

/** Poster is grabbed a little in, so it is not a dark fade-in frame. */
const POSTER_AT = '00:00:02';

const force = process.argv.includes('--force');

const src = path.join(SRC_DIR, 'main.mp4');
if (!fs.existsSync(src)) {
  console.error(`missing source video: ${src}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const videoOut = path.join(OUT_DIR, 'hero-loop.mp4');
const frameTmp = path.join(OUT_DIR, '.hero-frame.png');
const posterJpg = path.join(OUT_DIR, 'hero-poster.jpg');
const posterAvif = path.join(OUT_DIR, 'hero-poster.avif');

const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

if (force || stale(src, videoOut)) {
  console.log(`encoding hero-loop.mp4 (${LOOP_SECONDS ? LOOP_SECONDS + 's' : 'full duration'}) ...`);
  run([
    ...(LOOP_SECONDS ? ['-t', String(LOOP_SECONDS)] : []),
    '-i', src,
    '-an',                        // drop audio; the hero is muted
    '-c:v', 'libx264',            // no -vf scale: never upscale the 640x360 source
    '-preset', 'slow',
    '-crf', '30',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',    // moov atom first, so playback starts early
    videoOut,
  ]);
} else {
  console.log('hero-loop.mp4 up to date');
}

if (force || stale(src, posterJpg)) {
  console.log('extracting poster frame ...');
  run(['-ss', POSTER_AT, '-i', src, '-frames:v', '1', frameTmp]);
  await sharp(frameTmp).jpeg(JPEG).toFile(posterJpg);
  await sharp(frameTmp).avif(AVIF).toFile(posterAvif);
  fs.unlinkSync(frameTmp);
} else {
  console.log('poster up to date');
}

const before = fs.statSync(src).size;
const after = fs.statSync(videoOut).size;
console.log('-'.repeat(56));
console.log(`main.mp4       ${mb(before)}  (kept as the source of record)`);
console.log(`hero-loop.mp4  ${mb(after)}  (-${(100 - (after / before) * 100).toFixed(0)}%)`);
console.log(`poster         ${mb(fs.statSync(posterJpg).size)} jpg / ${mb(fs.statSync(posterAvif).size)} avif`);
