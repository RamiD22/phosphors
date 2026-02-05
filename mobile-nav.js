// Mobile Navigation - Hamburger Menu
(function() {
  'use strict';

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Find existing nav links from desktop nav
    const desktopNav = document.querySelector('header nav');
    if (!desktopNav) return;

    const navLinks = Array.from(desktopNav.querySelectorAll('a'));
    
    // Create hamburger button
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    hamburger.setAttribute('aria-label', 'Open menu');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = '<span></span><span></span><span></span>';

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';

    // Create mobile nav panel
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'mobile-nav';
    mobileNav.setAttribute('aria-label', 'Mobile navigation');

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mobile-nav-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

    // Build nav links
    const linksList = document.createElement('ul');
    linksList.className = 'mobile-nav-links';
    
    navLinks.forEach(link => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.textContent;
      if (link.classList.contains('active') || link.getAttribute('aria-current') === 'page') {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
      li.appendChild(a);
      linksList.appendChild(li);
    });

    // Footer
    const footer = document.createElement('div');
    footer.className = 'mobile-nav-footer';
    footer.textContent = '© 2026 Phosphors';

    // Assemble
    mobileNav.appendChild(closeBtn);
    mobileNav.appendChild(linksList);
    mobileNav.appendChild(footer);

    // Insert into DOM
    const header = document.querySelector('header');
    header.appendChild(hamburger);
    document.body.appendChild(overlay);
    document.body.appendChild(mobileNav);

    // Toggle functions
    function openMenu() {
      hamburger.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      overlay.classList.add('active');
      mobileNav.classList.add('active');
      document.body.classList.add('menu-open');
      
      // Focus first link
      setTimeout(() => {
        const firstLink = mobileNav.querySelector('a');
        if (firstLink) firstLink.focus();
      }, 100);
    }

    function closeMenu() {
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('active');
      mobileNav.classList.remove('active');
      document.body.classList.remove('menu-open');
      hamburger.focus();
    }

    // Event listeners
    hamburger.addEventListener('click', function() {
      if (mobileNav.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    // Close on escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
        closeMenu();
      }
    });

    // Close when clicking a link (for same-page navigation)
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Trap focus within mobile nav when open
    mobileNav.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      
      const focusable = mobileNav.querySelectorAll('button, a');
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
