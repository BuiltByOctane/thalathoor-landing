/**
 * Finds every asset the site actually references.
 *
 * Shared by check-assets.mjs (which validates them) and build-dist.mjs (which
 * copies them). Keeping one implementation means the deploy artifact and the
 * validator can never disagree about what "referenced" means.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './assets.mjs';

/** Entry documents that can point at assets. */
export function entryFiles() {
  return [
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
    'css/style.css',
    'css/fonts.css',
    'site.webmanifest',
  ].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

const ATTR_RE = /(?:src|href|srcset|poster|data-src|data-srcset|data-lightbox-src|data-lightbox-poster)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const JSON_RE = /"(?:src|url|icon)"\s*:\s*"([^"]+)"/g;

const EXTERNAL = /^(https?:|mailto:|tel:|data:|#|\/\/)/i;

/**
 * @returns {{ referenced: Map<string, Set<string>>, missing: Array<{ref:string,file:string,line:number}> }}
 *   referenced maps a repo-relative path to the "file:line" sites that use it.
 */
export function scanReferences(files = entryFiles()) {
  const referenced = new Map();
  const missing = [];

  const record = (ref, file, line) => {
    if (!ref || EXTERNAL.test(ref)) return;
    // srcset is a comma-separated candidate list, each with an optional width
    // or density descriptor. A single candidate has no comma but still has a
    // descriptor, so always split on both.
    for (const candidate of ref.split(',')) {
      const raw = candidate.trim().split(/\s+/)[0];
      if (!raw) continue;
      const clean = raw.split('#')[0].split('?')[0];
      if (!clean || EXTERNAL.test(clean)) continue;

      const abs = path.resolve(ROOT, path.dirname(file), clean);
      const rel = path.relative(ROOT, abs);
      if (!referenced.has(rel)) referenced.set(rel, new Set());
      referenced.get(rel).add(`${file}:${line}`);
      if (!fs.existsSync(abs)) missing.push({ ref: clean, file, line });
    }
  };

  for (const file of files) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    // JSON documents (the webmanifest) write "src": "…" rather than src="…".
    const isJson = /\.(webmanifest|json)$/.test(file);
    fs.readFileSync(abs, 'utf8').split('\n').forEach((text, i) => {
      const re = isJson ? JSON_RE : ATTR_RE;
      for (const m of text.matchAll(re)) record(m[1] ?? m[2], file, i + 1);
    });
  }

  return { referenced, missing };
}

/**
 * Maps each source asset to the files generated from it, so a source counts as
 * used when any of its variants is referenced.
 */
export function derivedOutputs() {
  const map = new Map();
  for (const [manifestPath, dir] of [
    ['assets/images/opt/manifest.json', 'assets/images'],
    ['assets/videos/opt/manifest.json', 'assets/videos'],
  ]) {
    const abs = path.join(ROOT, manifestPath);
    if (!fs.existsSync(abs)) continue;
    const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
    for (const [name, entry] of Object.entries(m)) {
      const outputs = [];
      for (const v of entry.variants ?? []) {
        if (v.avif) outputs.push(v.avif);
        if (v.jpg) outputs.push(v.jpg);
      }
      for (const k of ['video', 'posterJpg', 'posterAvif']) if (entry[k]) outputs.push(entry[k]);
      map.set(path.posix.join(dir, name), outputs);
    }
  }
  return map;
}
