/**
 * Responsive regression check, run in a real browser.
 *
 * Three failures this catches, all of which had shipped before it existed:
 *
 * 1. Horizontal overflow. A `white-space:nowrap` button forced the document to
 *    436px on a 360px phone. The page had `overflow-x:hidden` on <body>, which
 *    hid the scrollbar but not the symptom: the hero is 100vw, so everything
 *    past it showed as bare background. Measuring scrollWidth catches this;
 *    looking at the page in a desktop browser does not.
 * 2. Overlapping controls. The sticky WhatsApp button sat directly on top of
 *    the hero carousel dots at every width.
 * 3. Touch targets under 24px (WCAG 2.5.8). The carousel dots render at 9px.
 *    Their hit area is enlarged with a pseudo-element, so this measures what is
 *    actually clickable via elementFromPoint rather than the element's own box.
 *
 * Requires Chrome. Skips with a warning if none is found, so it never blocks a
 * deploy on a machine without one.
 *
 * Usage: npm run check:responsive
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from './lib/assets.mjs';

const WIDTHS = [360, 390, 414, 768, 1024, 1440];
const PAGES = ['/', '/menu.html', '/events.html', '/gallery.html', '/404.html'];
/** Controls that must never overlap one another. */
const CONTROLS = ['.wa-fab', '.hero__dot', '.hero__scroll', '.nav__burger', '.review-arrow', '.btn'];
const MIN_TARGET = 24;

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chrome = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!chrome) {
  console.warn('check:responsive skipped - no Chrome found. Set CHROME_PATH to run it.');
  process.exit(0);
}

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  console.warn('check:responsive skipped - puppeteer-core is not installed.');
  process.exit(0);
}

// --- serve dist/ if it exists, otherwise the working tree -------------------
const root = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const abs = path.resolve(root, (url === '/' ? 'index.html' : url).replace(/^\/+/, ''));
  if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404).end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

/**
 * The loading screen covers the page for MIN_SHOW ms and would make every
 * control test as unclickable. Wait it out before measuring.
 */
async function ready(page) {
  await page.waitForFunction(
    () => {
      const l = document.querySelector('.loader');
      return !l || l.classList.contains('is-done');
    },
    { timeout: 10000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
}

const failures = [];

for (const pagePath of PAGES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844 });
    await page.goto(BASE + pagePath, { waitUntil: 'networkidle2' });
    await ready(page);

    const result = await page.evaluate((sels) => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

      const rects = [];
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el, i) => {
          const r = el.getBoundingClientRect();
          if (r.width && r.height && r.top < innerHeight && r.bottom > 0) {
            rects.push({ sel: `${sel}[${i}]`, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
          }
        });
      }
      const overlaps = [];
      const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          if (hit(rects[i], rects[j])) overlaps.push(`${rects[i].sel} x ${rects[j].sel}`);
        }
      }
      return { overflow, overlaps: [...new Set(overlaps)] };
    }, CONTROLS);

    if (result.overflow > 1) {
      failures.push(`${pagePath} @${width}px: horizontal overflow +${result.overflow}px`);
    }
    for (const o of result.overlaps) {
      failures.push(`${pagePath} @${width}px: controls overlap - ${o}`);
    }
    await page.close();
  }
}

// --- touch targets, measured by what is actually clickable ------------------
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
for (const pagePath of PAGES) {
  await page.goto(BASE + pagePath, { waitUntil: 'networkidle2' });
  await ready(page);
  const small = await page.evaluate((min) => {
    const out = [];
    document.querySelectorAll('a,button').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.width >= min && r.height >= min) return;
      // The box is small; the hit area may still be large via a pseudo-element.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cy < 0 || cy > innerHeight) return;
      const inside = (dx, dy) => {
        const h = document.elementFromPoint(cx + dx, cy + dy);
        return h === el || el.contains(h);
      };
      let up = 0; let down = 0; let left = 0; let right = 0;
      while (up < min && inside(0, -(up + 1))) up++;
      while (down < min && inside(0, down + 1)) down++;
      while (left < min && inside(-(left + 1), 0)) left++;
      while (right < min && inside(right + 1, 0)) right++;
      if (up + down < min || left + right < min) {
        let cls = el.className;
        if (cls && typeof cls !== 'string') cls = cls.baseVal ?? '';
        out.push(`${el.tagName.toLowerCase()}.${String(cls || '').slice(0, 30)} clickable ${left + right}x${up + down}`);
      }
    });
    return [...new Set(out)];
  }, MIN_TARGET);
  for (const s of small) failures.push(`${pagePath} @390px: touch target under ${MIN_TARGET}px - ${s}`);
}
await page.close();

await browser.close();
server.close();

if (failures.length) {
  console.error(`\ncheck:responsive FAILED (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`OK  no overflow, no overlapping controls, no small touch targets ` +
  `(${PAGES.length} pages x ${WIDTHS.length} widths, serving ${path.relative(ROOT, root) || '.'})`);
