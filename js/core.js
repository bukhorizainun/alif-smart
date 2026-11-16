/* ============================================
   ALIF SMART — Core JS
   Mobile nav (with aria-hidden sync), header shadow,
   scroll reveal, footer year.
   Loaded by every page.
   ============================================ */

(function () {
  'use strict';

  // ---- Mobile navigation toggle ----
  const navToggle = document.getElementById('navToggle');
  const siteNav   = document.getElementById('siteNav');

  if (navToggle && siteNav) {
    const desktopMQ = window.matchMedia('(min-width: 860px)');

    // Keep aria-hidden in sync: on desktop the nav is always visible, on
    // mobile it mirrors the .open state. Without this, links inside the
    // collapsed mobile menu remain tab-able and announced by screen readers.
    function syncNavAria() {
      if (desktopMQ.matches) {
        siteNav.removeAttribute('aria-hidden');
      } else {
        siteNav.setAttribute('aria-hidden', siteNav.classList.contains('open') ? 'false' : 'true');
      }
    }

    navToggle.addEventListener('click', function () {
      const isOpen = siteNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Buka menu');
      syncNavAria();
    });

    // Close nav after tapping a link (mobile)
    siteNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (siteNav.classList.contains('open')) {
          siteNav.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.setAttribute('aria-label', 'Buka menu');
          syncNavAria();
        }
      });
    });

    desktopMQ.addEventListener('change', syncNavAria);
    syncNavAria();
  }

  // ---- Header shadow on scroll ----
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = function () {
      if (window.scrollY > 8) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Scroll reveal ----
  // .reveal-ready was set on <html> by the inline <head> script (only when JS
  // + IntersectionObserver are available), which hides reveal-group children
  // before first paint. Here we just register the observer to reveal them.
  const revealGroups = document.querySelectorAll('.reveal-group');
  if (document.documentElement.classList.contains('reveal-ready') && revealGroups.length) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealGroups.forEach(function (group) { io.observe(group); });
  }

  // ---- Footer year ----
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

})();
