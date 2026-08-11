# Thalathoor Heritage Homestay

Marketing site for a heritage homestay in Perumbala, Kasaragod, Kerala.

Four hand-written static pages. No framework, no bundler, and **nothing to build
before deploying** — the npm setup exists only to regenerate image, video and
font assets, whose output is committed.

```
index.html      landing page: hero, house, rooms, kitchen, nature, events, gallery, FAQ, contact
menu.html       full menu by course
events.html     supper club, retreats, weddings
gallery.html    filterable photo/video grid
css/style.css   the only hand-written stylesheet
css/fonts.css   GENERATED @font-face declarations — do not edit
js/main.js      one IIFE; every feature is guarded so the file serves all pages
assets/         images/ (sources) · images/opt/ (generated) · fonts/ · logo/ · icons/
```

## Running locally

```sh
npm install        # only needed for the asset scripts
npm run serve      # http://localhost:8080, logs 404s
```

Any static file server works. Opening `index.html` over `file://` also works,
apart from the Google Maps iframe.

## Deploying

Serve the repository root as static files. There is no build step.

Two things worth configuring on the host:

- **Long `Cache-Control` for `assets/`** — filenames in `assets/images/opt/`
  encode their width, so they can be cached immutably.
- **Compression** (gzip or brotli) for `.html`, `.css`, `.js` and `.svg`.
  `logo.svg` alone drops from 24 KB to 10 KB gzipped. Images and video are
  already compressed; do not re-compress them.

## Asset pipeline

Run after adding or replacing anything in `assets/images/`:

```sh
npm run assets          # images + video + logo
npm run assets:images   # AVIF + JPEG variants -> assets/images/opt/
npm run assets:video    # hero loop + poster
npm run assets:svg      # re-minify logo.svg
npm run check           # fail on broken asset refs; warn on unreferenced files
```

`npm run check` is the useful one to wire into CI. It catches references to
files that do not exist — the bug that had `gallery.html` pointing at an
`outhome2.jpg` that was never in the repo.

### Why these formats

Measured on this photo set rather than assumed:

| | saving vs source JPEG |
|---|---|
| WebP, full size | ~11% (larger for some foliage frames) |
| AVIF, full size | ~52% |
| AVIF at real display width | ~87% |

So: **AVIF is the serving format, resizing does most of the work, and WebP is
not generated at all** — a third file per image is not worth 11%. A small JPEG
fallback is emitted at 480w and 768w for browsers without AVIF; the untouched
source acts as the largest fallback.

The hero video went 10.49 MB → 1.07 MB. Duration was the lever, not resolution:
the source is 640×360 (not 1080p) and runs 2m21s as a muted background loop.
`scripts/optimize-video.mjs` trims it to 20s and strips the audio track. Set
`LOOP_SECONDS = null` there to keep the full clip. `assets/images/main.mp4` is
kept as the source of record and is still what the gallery lightbox plays.

### Fonts

`scripts/fetch-fonts.mjs` downloads latin-subset variable woff2 files and
regenerates `css/fonts.css`. Rerun it only to change weights or families:

```sh
node scripts/fetch-fonts.mjs
```

Variable cuts, not one file per weight — four DM Sans weights cost 4 × 36 KB as
static faces and 61 KB as one variable file. DM Sans *italic* is deliberately
absent: its variable cut is 74 KB and the one rule that wanted it renders at
11.5px, where synthetic oblique is indistinguishable.

All three families are SIL OFL 1.1; see `assets/fonts/OFL.txt`.

## Conventions

- **Images.** Content photographs are `<picture>` + `<img class="media-fill">`
  so they can be lazy-loaded and prioritised, which a CSS `background-image`
  cannot be. `.media-fill` reproduces `background-size:cover` inside any
  positioned parent. Decorative and tiled art stays in CSS via `image-set()`.
  Above-the-fold images get `fetchpriority="high"`; everything else gets
  `loading="lazy"`. Always set `width`/`height`.
- **No inline `style` attributes.** All four pages are at zero; keep them there.
- **No `!important`** except inside the `prefers-reduced-motion` block. Raise
  specificity instead.
- **Fonts** come from the `--font-display`, `--font-body` and `--font-mono`
  variables, never a hard-coded family name.
- **Gallery `data-tag`** is a space-separated token list, so one tile can appear
  under several filters. Every `data-filter` button must match at least one tile.

## Known gaps

- The guest-reviews section is removed pending real content. See the TODO comment
  in `index.html` for exactly what is needed to restore it.
- Instagram and Facebook links were removed from the footer; no URLs were
  available. The TripAdvisor link is live.
- `assets/logo/logo-full.png` and the UUID-named PNG are unreferenced source
  masters, kept deliberately. They are never served, so they cost page weight
  nothing — `npm run check` lists them as unreferenced.
- Ten unreferenced photos remain in `assets/images/`. Also never served; kept in
  case they are wanted later.
