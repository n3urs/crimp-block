/* ============================================================================
   DEADPOINT — site behaviour
   Three things only: nav state, one orchestrated entrance, and the held-phone
   screen swap that is this site's signature interaction. Everything degrades
   to a fully readable page with JS off, and everything stands still under
   prefers-reduced-motion.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav: solid once you've left the top, plus the mobile drawer ------ */
  var nav = document.querySelector('.nav');
  if (nav) {
    var setScrolled = function () {
      nav.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false');
    };
    setScrolled();
    window.addEventListener('scroll', setScrolled, { passive: true });
  }

  var burger = document.querySelector('.burger');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = document.body.getAttribute('data-menu') === 'open';
      document.body.setAttribute('data-menu', open ? 'closed' : 'open');
      burger.setAttribute('aria-expanded', String(!open));
    });
    // A link tap inside the drawer should close it, or the next page loads
    // behind an open menu on browsers that restore scroll position.
    document.querySelectorAll('.navlinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.body.setAttribute('data-menu', 'closed');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- the entrance: once, in reading order, never replayed ------------- */
  var revealables = document.querySelectorAll('[data-reveal],[data-reveal-group]');
  var revealAll = function () {
    revealables.forEach(function (el) { el.classList.add('in'); });
  };
  if (!revealables.length) return start();

  // A page opened in a background tab (a middle-click, "open in new tab", a
  // restored session) has its IntersectionObserver callbacks paused, so every
  // revealable would sit at opacity 0 until the tab is first looked at. Since
  // there is no animation worth staging for a tab nobody is watching, show
  // everything immediately and let the observer sit this one out.
  if (reduced || !('IntersectionObserver' in window) || document.visibilityState === 'hidden') {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target); // once means once
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  start();

  /* ---- signature interaction: the held phone --------------------------- */
  /* The device stays put; each beat of the argument claims it and swaps the
     screen to the one that proves that beat. The screens are the real app,
     preloaded as stacked <img>, so a swap is a cross-fade and never a
     network stall mid-scroll. */
  function start() {
    var stage = document.querySelector('[data-device-stage]');
    if (!stage) return;

    var screens = stage.querySelectorAll('img[data-screen]');
    var beats = document.querySelectorAll('.beat[data-screen-for]');
    var caption = document.querySelector('[data-device-caption]');
    if (!screens.length || !beats.length) return;

    var showing = null;
    var show = function (key, label, accent) {
      if (key === showing) return;
      showing = key;
      screens.forEach(function (img) {
        img.classList.toggle('is-live', img.getAttribute('data-screen') === key);
      });
      if (caption && label) {
        caption.textContent = label;
        caption.style.color = accent || '';
      }
    };

    // First beat owns the device before any scrolling happens, so the phone
    // is never blank on load.
    var first = beats[0];
    show(first.getAttribute('data-screen-for'), first.getAttribute('data-screen-label'), null);
    first.classList.add('is-live');

    if (!('IntersectionObserver' in window)) return;

    // A tall band across the middle of the viewport: whichever beat is
    // sitting in it owns the screen. Narrow enough that two beats can't both
    // claim it, tall enough that a fast scroll never leaves it empty.
    var beatIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        beats.forEach(function (b) { b.classList.toggle('is-live', b === el); });
        show(
          el.getAttribute('data-screen-for'),
          el.getAttribute('data-screen-label'),
          getComputedStyle(el).getPropertyValue('--beat').trim()
        );
      });
    }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });

    beats.forEach(function (b) { beatIO.observe(b); });
  }
})();
