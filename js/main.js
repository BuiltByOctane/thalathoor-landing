(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.remove('no-js');

  /* ---------------- Loading screen ----------------
     Dismissed when the page is actually ready rather than after a fixed delay.
     The previous version held the screen for a hard 1.65s (a CSS animation at
     1.15s plus a 1650ms timeout), which was the single largest contributor to
     perceived load time. MAX_WAIT is a safety net for a stalled resource. */
  var loader = document.querySelector('.loader');
  if (loader) {
    // Deliberately long: the loading screen is an entrance, not a spinner, so
    // it holds even when the page is already ready. MAX_WAIT caps the wait if
    // a resource stalls.
    var MIN_SHOW = 2000;
    var MAX_WAIT = 4000;
    var shown = Date.now();
    var dismissed = false;

    var dismiss = function () {
      if (dismissed) return;
      dismissed = true;
      var waited = Date.now() - shown;
      window.setTimeout(function () {
        loader.classList.add('is-done');
        loader.setAttribute('aria-hidden', 'true');
      }, Math.max(0, MIN_SHOW - waited));
    };

    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss);
    window.setTimeout(dismiss, MAX_WAIT);
  }

  /* ---------------- Nav: scroll shrink + mobile drawer ---------------- */
  var navFixed = document.querySelector('.nav-fixed');
  if (navFixed) {
    var onScroll = function () {
      navFixed.classList.toggle('is-scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var burger = document.querySelector('.nav__burger');
  var scrim = document.querySelector('.nav-scrim');
  if (burger) {
    var closeDrawer = function () {
      document.documentElement.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
    };
    burger.addEventListener('click', function () {
      var isOpen = document.documentElement.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    if (scrim) scrim.addEventListener('click', closeDrawer);
    document.querySelectorAll('.nav-drawer__link').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.documentElement.classList.contains('nav-open')) {
        closeDrawer();
        burger.focus();
      }
    });
  }

  /* ---------------- Hero carousel ----------------
     Only the first slide ships with a real src; the rest hold theirs in
     data-src / data-srcset. Slides sit inside the viewport even while
     transparent, so loading="lazy" would not defer them - hydrating on demand is
     the only way to keep them off the initial load. Each slide is hydrated when
     it is about to be shown, plus one ahead, so the next clip is ready in time.
     Slide composition and the interval come from data/hero.json. */
  var slides = document.querySelectorAll('.hero__slide');
  // Slide interval comes from data/hero.json via a data attribute on the hero.
  var heroEl = document.querySelector('.hero');
  var autoplayMs = (heroEl && Number(heroEl.dataset.autoplaySeconds) * 1000) || 4000;
  var dots = document.querySelectorAll('.hero__dot');
  if (slides.length) {
    var current = 0;
    var timer = null;

    var hydrate = function (slide) {
      if (!slide || slide.dataset.hydrated) return;
      slide.dataset.hydrated = '1';
      slide.querySelectorAll('source[data-srcset], img[data-srcset], img[data-src], video[data-src]')
        .forEach(function (el) {
          if (el.dataset.srcset) el.srcset = el.dataset.srcset;
          if (el.dataset.src) el.src = el.dataset.src;
          delete el.dataset.srcset;
          delete el.dataset.src;
          // A <video> whose src is set after parse needs an explicit load()
          // before play() will resolve.
          if (el.tagName === 'VIDEO') {
            el.preload = 'metadata';
            el.load();
          }
        });
    };

    var goTo = function (i) {
      current = (i + slides.length) % slides.length;
      hydrate(slides[current]);
      hydrate(slides[(current + 1) % slides.length]);

      slides.forEach(function (s, idx) {
        s.classList.toggle('is-active', idx === current);
        var video = s.querySelector('video');
        if (video) {
          if (idx === current) video.play().catch(function () {});
          else video.pause();
        }
      });
      dots.forEach(function (d, idx) {
        d.classList.toggle('is-active', idx === current);
        d.setAttribute('aria-current', idx === current ? 'true' : 'false');
      });
    };

    var startAuto = function () {
      if (reduceMotion) return;
      timer = window.setInterval(function () { goTo(current + 1); }, autoplayMs);
    };
    var restartAuto = function () {
      if (timer) window.clearInterval(timer);
      startAuto();
    };

    dots.forEach(function (dot, idx) {
      dot.addEventListener('click', function () {
        goTo(idx);
        restartAuto();
      });
    });

    // Pause the rotation while the tab is hidden; nobody is watching.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (timer) window.clearInterval(timer);
        timer = null;
      } else if (!timer) {
        startAuto();
      }
    });

    goTo(0);
    startAuto();
  }

  /* ---------------- Scroll reveal ---------------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------------- FAQ accordion ---------------- */
  document.querySelectorAll('.faq-item__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var wasOpen = item.classList.contains('is-open');
      item.parentElement.querySelectorAll('.faq-item.is-open').forEach(function (open) {
        open.classList.remove('is-open');
        open.querySelector('.faq-item__sign').textContent = '+';
        open.querySelector('.faq-item__q').setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('is-open');
        item.querySelector('.faq-item__sign').textContent = '–';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------------- Lightbox ---------------- */
  var lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    var mediaHost = lightbox.querySelector('.lightbox__media-host');
    var closeBtn = lightbox.querySelector('.lightbox__close');
    var lastFocused = null;

    var openLightbox = function (type, src, poster) {
      mediaHost.innerHTML = '';
      var el;
      if (type === 'video') {
        el = document.createElement('video');
        el.src = src;
        el.controls = true;
        el.autoplay = true;
        el.playsInline = true;
        if (poster) el.poster = poster;
      } else {
        el = document.createElement('img');
        el.src = src;
        el.alt = '';
      }
      el.className = 'lightbox__media';
      mediaHost.appendChild(el);
      lightbox.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      lastFocused = document.activeElement;
      if (closeBtn) closeBtn.focus();
    };

    var closeLightbox = function () {
      lightbox.setAttribute('hidden', '');
      mediaHost.querySelectorAll('video').forEach(function (v) { v.pause(); });
      mediaHost.innerHTML = '';
      document.body.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
      lastFocused = null;
    };

    document.querySelectorAll('[data-lightbox-src]').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        openLightbox(
          trigger.getAttribute('data-lightbox-type') || 'image',
          trigger.getAttribute('data-lightbox-src'),
          trigger.getAttribute('data-lightbox-poster')
        );
      });
    });

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lightbox.hasAttribute('hidden')) closeLightbox();
    });
  }

  /* ---------------- Reviews carousel ----------------
     The track scrolls natively with scroll-snap, so touch and keyboard already
     work without this; the arrows and dots are progressive enhancement, and are
     hidden by CSS when JS is unavailable. State is derived from scrollLeft
     rather than tracked separately, so dragging and clicking stay in sync. */
  var track = document.querySelector('.review-track');
  if (track) {
    var cards = Array.prototype.slice.call(track.querySelectorAll('.review-card'));
    var reviewDots = Array.prototype.slice.call(document.querySelectorAll('.review-dot'));
    var prev = document.querySelector('.review-arrow--prev');
    var next = document.querySelector('.review-arrow--next');

    var nearestIndex = function () {
      var best = 0;
      var bestGap = Infinity;
      cards.forEach(function (card, i) {
        var gap = Math.abs(card.offsetLeft - track.scrollLeft);
        if (gap < bestGap) { bestGap = gap; best = i; }
      });
      return best;
    };

    var scrollToCard = function (i) {
      var card = cards[Math.max(0, Math.min(cards.length - 1, i))];
      if (!card) return;
      // Not scrollIntoView: that would also scroll the page vertically.
      track.scrollTo({ left: card.offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    var syncState = function () {
      // With more than one card in view the last cards share the final scroll
      // position, so not every card is a reachable snap point. Hide the dots
      // that could never become active; recomputed on resize.
      var maxScroll = track.scrollWidth - track.clientWidth;
      var i = nearestIndex();
      reviewDots.forEach(function (d, idx) {
        var card = cards[idx];
        var reachable = card && card.offsetLeft <= maxScroll + 2;
        d.hidden = !reachable;
        var active = reachable && idx === i;
        d.classList.toggle('is-active', active);
        d.setAttribute('aria-current', active ? 'true' : 'false');
      });
      // A 2px tolerance: fractional scroll offsets never hit the ends exactly.
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= maxScroll - 2;
    };

    if (prev) prev.addEventListener('click', function () { scrollToCard(nearestIndex() - 1); });
    if (next) next.addEventListener('click', function () { scrollToCard(nearestIndex() + 1); });
    reviewDots.forEach(function (dot, idx) {
      dot.addEventListener('click', function () { scrollToCard(idx); });
    });

    var scrollTick = null;
    track.addEventListener('scroll', function () {
      if (scrollTick) window.clearTimeout(scrollTick);
      scrollTick = window.setTimeout(syncState, 80);
    }, { passive: true });
    window.addEventListener('resize', syncState);

    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollToCard(nearestIndex() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToCard(nearestIndex() - 1); }
    });

    syncState();
  }

  /* ---------------- Gallery filters ----------------
     `data-tag` holds a space-separated token list, so one tile can appear under
     several filters. It was previously an exact string match, which meant the
     "Video" button matched nothing at all (no tile carried that single value)
     and a lower-case "nature" typo hid a tile from its own filter. */
  var filterBar = document.querySelector('.gallery-filters');
  if (filterBar) {
    var items = document.querySelectorAll('.masonry-item');
    var buttons = filterBar.querySelectorAll('.gallery-filter');

    var apply = function (tag) {
      items.forEach(function (item) {
        var tags = (item.getAttribute('data-tag') || '').split(/\s+/);
        item.hidden = !(tag === 'All' || tags.indexOf(tag) !== -1);
      });
    };

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        apply(btn.getAttribute('data-filter'));
      });
    });
  }
})();
