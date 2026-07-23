(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.remove('no-js');

  /* ---------------- Loading screen ---------------- */
  var loader = document.querySelector('.loader');
  if (loader) {
    window.setTimeout(function () {
      loader.setAttribute('aria-hidden', 'true');
    }, 1650);
  }

  /* ---------------- Nav: scroll shrink + mobile drawer ---------------- */
  var navFixed = document.querySelector('.nav-fixed');
  if (navFixed) {
    var onScroll = function () {
      var scrolled = window.scrollY > 60;
      navFixed.classList.toggle('is-scrolled', scrolled);
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
  }

  /* ---------------- Hero carousel ---------------- */
  var slides = document.querySelectorAll('.hero__slide');
  var dots = document.querySelectorAll('.hero__dot');
  if (slides.length) {
    var current = 0;
    var timer = null;

    var goTo = function (i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, idx) {
        s.classList.toggle('is-active', idx === current);
        var video = s.querySelector('video');
        if (video) {
          if (idx === current) { video.play().catch(function () {}); }
          else { video.pause(); }
        }
      });
      dots.forEach(function (d, idx) {
        d.classList.toggle('is-active', idx === current);
      });
    };

    var startAuto = function () {
      if (reduceMotion) return;
      timer = window.setInterval(function () { goTo(current + 1); }, 6000);
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
    };

    var closeLightbox = function () {
      lightbox.setAttribute('hidden', '');
      mediaHost.querySelectorAll('video').forEach(function (v) { v.pause(); });
      mediaHost.innerHTML = '';
      document.body.style.overflow = '';
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

  /* ---------------- Gallery filters ---------------- */
  var filterBar = document.querySelector('.gallery-filters');
  if (filterBar) {
    var items = document.querySelectorAll('.masonry-item');
    filterBar.querySelectorAll('.gallery-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBar.querySelectorAll('.gallery-filter').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        var tag = btn.getAttribute('data-filter');
        items.forEach(function (item) {
          var match = tag === 'All' || item.getAttribute('data-tag') === tag;
          item.hidden = !match;
        });
      });
    });
  }
})();
