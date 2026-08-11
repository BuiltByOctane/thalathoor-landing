/**
 * Renders data/*.json into the four HTML pages.
 *
 * Two mechanisms, deliberately kept separate:
 *
 * 1. MARKER REGIONS, for repeating blocks (rooms, reviews, FAQ, menu, gallery).
 *    Everything between `<!-- @data:name -->` and `<!-- /@data:name -->` is
 *    replaced. Anything outside a marker is hand-written and never touched, so
 *    the bespoke prose stays editable in place.
 *
 * 2. NORMALISERS, for scalar facts that appear scattered through the markup
 *    (the WhatsApp number, email, canonical domain, TripAdvisor URL). These
 *    rewrite values in place by matching their shape rather than a placeholder
 *    token, which keeps every page valid, standalone HTML that opens over
 *    file:// and stays readable in a diff.
 *
 * Both are idempotent: running twice changes nothing the second time.
 *
 * Usage: npm run build [-- --check]
 *   --check  report what would change and exit non-zero, without writing
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/assets.mjs';
import { readData, esc, wa, picture, posterPicture } from './lib/render.mjs';

const checkOnly = process.argv.includes('--check');

const site = readData('site.json');
const reviewsData = readData('reviews.json');
const roomsData = readData('rooms.json');
const faqData = readData('faq.json');
const menuData = readData('menu.json');
const signature = readData('signature-dishes.json');
const galleryData = readData('gallery.json');

const GENERATED = 'Generated from data/ by scripts/build-pages.mjs - edit the JSON, not this block.';

/* ------------------------------------------------------------------ regions */

function roomsRegion() {
  return roomsData.rooms.map((r) => {
    const enquiry = wa(site, `Hi, I'd like to check availability for the ${r.name} at Thalathoor. Dates: `);
    const facts = r.facts.map((f) =>
      `              <div class="room-card__fact"><span>${esc(f.label)}</span><span>${esc(f.value)}</span></div>`
    ).join('\n');
    return `        <div class="room-card">
          <div class="room-card__media" data-lightbox-src="assets/images/${esc(r.image)}" data-lightbox-type="image">
${picture(r.image, { sizes: '(max-width:520px) 100vw, (max-width:900px) 50vw, 620px', alt: r.description.split('.')[0], indent: 12 })}
            <span class="room-card__tier">${esc(r.tier)}</span>
          </div>
          <div class="room-card__body">
            <h3 class="room-card__name">${esc(r.name)}</h3>
            <div class="room-card__meta">${esc(r.meta)}</div>
            <p class="room-card__desc">${esc(r.description)}</p>
            <div class="room-card__facts">
${facts}
            </div>
            <div class="room-card__footer">
              <div><span class="room-card__price-from">from </span><span class="room-card__price">${esc(r.priceFrom)}</span><span class="room-card__price-unit"> ${esc(r.priceUnit)}</span></div>
              <a href="${enquiry}" target="_blank" rel="noopener" class="room-card__cta">${esc(r.ctaLabel)}</a>
            </div>
          </div>
        </div>`;
  }).join('\n');
}

function reviewsRegion() {
  const { rating, reviews } = reviewsData;
  const strip = `      <div class="trust-strip">
        <div class="trust-item">
          <div class="trust-item__headline">${esc(rating.value)} / ${esc(rating.best)}</div>
          <div class="trust-item__source">${esc(rating.count)} TripAdvisor reviews</div>
        </div>
        <div class="trust-item">
          <div class="trust-item__headline">${esc(rating.ranking)}</div>
          <div class="trust-item__source">${esc(rating.rankingNote)}</div>
        </div>
        <div class="trust-item">
          <div class="trust-item__headline">Since ${esc(site.foundingYear)}</div>
          <div class="trust-item__source">Family-run</div>
        </div>
      </div>`;

  const cards = reviews.map((r) => {
    const by = [r.name, r.place, r.date].filter(Boolean).join(' · ');
    return `        <figure class="review-card">
          <div class="review-card__stars" aria-label="${r.stars} out of ${esc(rating.best)}">${'★'.repeat(r.stars)}</div>
          <h3 class="review-card__title">${esc(r.title)}</h3>
          <blockquote class="review-card__quote">${esc(r.text)}</blockquote>
          <figcaption class="review-card__by">${esc(by)}</figcaption>
        </figure>`;
  }).join('\n');

  return `${strip}
      <div class="review-cols">
${cards}
      </div>
      <div class="section-outro section-outro--tight">
        <a href="${site.links.tripadvisor}" target="_blank" rel="noopener" class="section-outro__link">Read all ${esc(rating.count)} reviews on
          TripAdvisor →</a>
      </div>`;
}

function faqRegion() {
  return faqData.items.map((it) =>
`          <div class="faq-item">
            <button class="faq-item__q" aria-expanded="false"><span class="faq-item__q-text">${esc(it.q)}</span><span class="faq-item__sign">+</span></button>
            <p class="faq-item__a">${esc(it.a)}</p>
          </div>`).join('\n');
}

function signatureRegion() {
  return signature.dishes.map((d) =>
`                <div class="dish-item">
                  <div class="dish-item__name">${esc(d.name)}</div>
                  <div class="dish-item__note">${esc(d.note)}</div>
                </div>`).join('\n');
}

function menuRegion() {
  let first = true;
  return menuData.sections.map((sec) => {
    const cards = sec.dishes.map((d) => {
      const eager = first; first = false;
      const veg = d.veg ? '\n          <span class="dish-card__veg" aria-label="Vegetarian"></span>' : '';
      return `      <div class="dish-card">
        <div class="dish-card__media">
${picture(d.image, { sizes: '(max-width:520px) 100vw, 300px', alt: d.name, eager, indent: 10 })}${veg}
        </div>
        <div class="dish-card__body">
          <h3 class="dish-card__name">${esc(d.name)}</h3>
          <div class="dish-card__local">${esc(d.local)}</div>
          <p class="dish-card__desc">${esc(d.description)}</p>
        </div>
      </div>`;
    }).join('\n');

    return `    <section id="${esc(sec.id)}" class="menu-section">
      <div class="menu-section__head">
        <h2 class="menu-section__title">${esc(sec.title)}</h2>
        <div class="menu-section__rule"></div>
        <span class="menu-section__note">${esc(sec.note)}</span>
      </div>
      <div class="dish-grid-cards">
${cards}
      </div>
    </section>`;
  }).join('\n\n');
}

function galleryFiltersRegion() {
  return galleryData.filters.map((f, i) =>
`      <button class="gallery-filter${i === 0 ? ' is-active' : ''}" data-filter="${esc(f)}" aria-pressed="${i === 0}">${esc(f)}</button>`
  ).join('\n');
}

function galleryRegion() {
  const SIZES = '(max-width:520px) 100vw, (max-width:760px) 50vw, 33vw';
  return galleryData.tiles.map((t, i) => {
    const eager = i < 4;                       // roughly the first row
    const isVideo = t.type === 'video';
    const media = isVideo
      ? posterPicture(t.alt, { eager, indent: 8 })
      : picture(t.image, { sizes: SIZES, alt: t.alt, eager, indent: 8 });
    const poster = isVideo ? `\n        data-lightbox-poster="assets/images/opt/hero-poster.jpg"` : '';
    const play = isVideo ? '<span class="teaser-item__play"></span>' : '';
    return `      <div class="masonry-item masonry-item--h${t.height}" data-tag="${esc(t.tags.join(' '))}"
        data-lightbox-src="assets/images/${esc(t.image)}" data-lightbox-type="${esc(t.type)}"${poster}>
${media}${play}<span class="masonry-item__tag">${esc(t.label)}</span></div>`;
  }).join('\n');
}

function gettingHereRegion() {
  return site.gettingHere.map((r) =>
`          <div class="distance-row"><span class="distance-row__place">${esc(r.place)}</span><span class="distance-row__dist">${esc(r.distance)}</span></div>`
  ).join('\n');
}

function footerLinksRegion(indent) {
  const i = ' '.repeat(indent);
  const out = [];
  if (site.links.instagram) out.push(`${i}<a href="${site.links.instagram}" target="_blank" rel="noopener">Instagram</a>`);
  if (site.links.facebook) out.push(`${i}<a href="${site.links.facebook}" target="_blank" rel="noopener">Facebook</a>`);
  if (site.links.tripadvisor) out.push(`${i}<a href="${site.links.tripadvisor}" target="_blank" rel="noopener">TripAdvisor</a>`);
  return out.join('');
}

function creditRegion(indent) {
  const i = ' '.repeat(indent);
  const c = site.credit;
  return `${i}<div class="site-footer__credit">${esc(c.text)} <a href="${c.url}" target="_blank" rel="noopener">${esc(c.name)}</a></div>`;
}

const REGIONS = {
  rooms: roomsRegion,
  reviews: reviewsRegion,
  faq: faqRegion,
  'signature-dishes': signatureRegion,
  menu: menuRegion,
  'gallery-filters': galleryFiltersRegion,
  gallery: galleryRegion,
  'getting-here': gettingHereRegion,
  'footer-links': () => footerLinksRegion(10),
  credit: () => creditRegion(8),
};

/* ------------------------------------------------------------------ JSON-LD */

/**
 * Rebuilds the LodgingBusiness block on index.html from data/, so the
 * structured data cannot drift from the visible page. Only the keys owned by
 * data/ are replaced; anything else already in the block is preserved.
 */
function jsonLd(src) {
  const OPEN = '<script type="application/ld+json">';
  const start = src.indexOf(OPEN);
  if (start === -1) return src;
  const from = start + OPEN.length;
  const to = src.indexOf('</script>', from);

  const d = JSON.parse(src.slice(from, to));
  if (d['@type'] !== 'LodgingBusiness') return src;

  const { rating, reviews } = reviewsData;

  d.name = site.name;
  d.url = site.baseUrl + '/';
  d.telephone = site.contact.phoneSchema;
  d.email = site.contact.email;
  d.foundingDate = String(site.foundingYear);
  d.address = {
    '@type': 'PostalAddress',
    streetAddress: site.address.street,
    addressLocality: site.address.locality,
    addressRegion: site.address.region,
    postalCode: site.address.postalCode,
    addressCountry: site.address.country,
  };
  d.sameAs = [site.links.instagram, site.links.facebook, site.links.tripadvisor].filter(Boolean);
  d.aggregateRating = {
    '@type': 'AggregateRating',
    ratingValue: rating.value,
    reviewCount: String(rating.count),
    bestRating: rating.best,
    worstRating: rating.worst,
  };
  d.review = reviews.map((r) => ({
    '@type': 'Review',
    name: r.title,
    reviewBody: r.text,
    datePublished: monthToIso(r.date),
    author: { '@type': 'Person', name: r.name },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(r.stars),
      bestRating: rating.best,
      worstRating: rating.worst,
    },
  }));

  return src.slice(0, from) + '\n' + JSON.stringify(d, null, 2) + '\n' + src.slice(to);
}

const MONTHS = ['january','february','march','april','may','june',
                'july','august','september','october','november','december'];

/** "July 2026" -> "2026-07"; passes through anything already ISO-shaped. */
function monthToIso(s) {
  if (/^\d{4}(-\d{2})?$/.test(s)) return s;
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(s.trim());
  if (!m) return s;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  if (i === -1) return s;
  return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}

/* -------------------------------------------------------------- normalisers */

/** Scalar facts rewritten in place wherever their shape appears. */
function normalise(src) {
  const c = site.contact;
  const host = site.baseUrl.replace(/^https?:\/\//, '');

  return src
    // WhatsApp number, preserving each link's own prefilled message
    .replace(/wa\.me\/\d+/g, `wa.me/${c.whatsapp}`)
    .replace(/tel:\+?\d+/g, `tel:${c.phoneHref}`)
    .replace(/mailto:[^"']+/g, `mailto:${c.email}`)
    // canonical host in canonical/OG/JSON-LD URLs
    .replace(/https:\/\/www\.thalathoorheritage\.com/g, `https://${host}`)
    .replace(/"telephone": "[^"]*"/g, `"telephone": "${c.phoneSchema}"`)
    .replace(/"email": "[^"]*"/g, `"email": "${c.email}"`);
}

/* --------------------------------------------------------------------- main */

const MARKER = (name) => ({
  open: `<!-- @data:${name} -->`,
  close: `<!-- /@data:${name} -->`,
});

const pages = ['index.html', 'menu.html', 'events.html', 'gallery.html'];
let changedFiles = 0;
const report = [];

for (const page of pages) {
  const file = path.join(ROOT, page);
  const original = fs.readFileSync(file, 'utf8');
  let out = original;

  for (const [name, render] of Object.entries(REGIONS)) {
    const { open, close } = MARKER(name);
    if (!out.includes(open)) continue;
    if (!out.includes(close)) throw new Error(`${page}: ${open} has no matching ${close}`);

    const start = out.indexOf(open);
    const end = out.indexOf(close, start);
    const indent = (out.slice(0, start).match(/([ \t]*)$/) || ['', ''])[1];
    const body = render();
    const block = `${open}\n${indent}<!-- ${GENERATED} -->\n${body}\n${indent}${close}`;
    out = out.slice(0, start) + block + out.slice(end + close.length);
    report.push(`  ${page} :: ${name}`);
  }

  out = jsonLd(out);
  out = normalise(out);

  if (out !== original) {
    changedFiles++;
    if (!checkOnly) fs.writeFileSync(file, out);
  }
}

// sitemap host follows site.baseUrl too
const sitemapPath = path.join(ROOT, 'sitemap.xml');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const fixedSitemap = sitemap.replace(/https:\/\/[^/<]+/g, site.baseUrl);
if (fixedSitemap !== sitemap) {
  changedFiles++;
  if (!checkOnly) fs.writeFileSync(sitemapPath, fixedSitemap);
}

if (checkOnly) {
  if (changedFiles) {
    console.error(`DRIFT: ${changedFiles} file(s) do not match data/ - run \`npm run build\``);
    process.exit(1);
  }
  console.log('OK  every page matches data/');
} else {
  console.log(`rendered ${report.length} region(s):`);
  report.forEach((r) => console.log(r));
  console.log(changedFiles ? `wrote ${changedFiles} file(s)` : 'no changes needed');
}
