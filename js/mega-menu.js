/**
 * Phosphors Mega Menu Component
 * Include this script after the HTML structure for navigation
 */
(function() {
  'use strict';

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    initHeaderScroll();
    initMegaMenu();
    initMobileNav();
  }

  // =========================================================================
  // HEADER SCROLL EFFECT
  // =========================================================================
  function initHeaderScroll() {
    const header = document.querySelector('.header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  // =========================================================================
  // MEGA MENU (Desktop)
  // =========================================================================
  function initMegaMenu() {
    const trigger = document.getElementById('mega-menu-trigger');
    const menu = document.getElementById('mega-menu');
    const overlay = document.getElementById('mega-menu-overlay');

    if (!trigger || !menu || !overlay) return;

    function open() {
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      menu.classList.add('active');
      overlay.classList.add('active');
    }

    function close() {
      trigger.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
      menu.classList.remove('active');
      overlay.classList.remove('active');
    }

    function toggle() {
      if (menu.classList.contains('active')) {
        close();
      } else {
        open();
      }
    }

    // Event listeners
    trigger.addEventListener('click', toggle);
    overlay.addEventListener('click', close);

    // Close on link click
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', close);
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        close();
        trigger.focus();
      }
    });

    // Close on scroll (snappier feel)
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollY) > 50 && menu.classList.contains('active')) {
        close();
      }
      lastScrollY = currentScrollY;
    }, { passive: true });
  }

  // =========================================================================
  // MOBILE NAV
  // =========================================================================
  function initMobileNav() {
    const hamburger = document.getElementById('hamburger');
    const nav = document.getElementById('mobile-nav');
    const overlay = document.getElementById('mobile-nav-overlay');
    const closeBtn = document.getElementById('mobile-nav-close');

    if (!hamburger || !nav || !overlay) return;

    function open() {
      hamburger.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      nav.classList.add('active');
      overlay.classList.add('active');
      document.body.classList.add('menu-open');

      // Focus first link after animation
      setTimeout(() => {
        const firstLink = nav.querySelector('a');
        if (firstLink) firstLink.focus();
      }, 100);
    }

    function close() {
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      nav.classList.remove('active');
      overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
      hamburger.focus();
    }

    function toggle() {
      if (nav.classList.contains('active')) {
        close();
      } else {
        open();
      }
    }

    // Event listeners
    hamburger.addEventListener('click', toggle);
    overlay.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Close on link click
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', close);
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('active')) {
        close();
      }
    });

    // Focus trap
    nav.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;

      const focusable = nav.querySelectorAll('button, a');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
})();
