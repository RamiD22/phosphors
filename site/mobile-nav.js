// Mobile Navigation - Enhanced Hamburger Menu
// Works with existing HTML structure from mega-menu.css
(function() {
  'use strict';

  function init() {
    // Find existing elements
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
    const mobileNavClose = document.getElementById('mobile-nav-close');
    
    // Exit if elements don't exist
    if (!hamburger || !mobileNav) {
      console.warn('Mobile nav: Required elements not found');
      return;
    }

    // State
    let isOpen = false;
    let lastFocusedElement = null;

    // Open menu
    function openMenu() {
      if (isOpen) return;
      isOpen = true;
      
      lastFocusedElement = document.activeElement;
      
      hamburger.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      
      if (mobileNavOverlay) {
        mobileNavOverlay.classList.add('active');
      }
      
      mobileNav.classList.add('active');
      document.body.classList.add('menu-open');
      
      // Focus first link after animation
      requestAnimationFrame(() => {
        setTimeout(() => {
          const firstLink = mobileNav.querySelector('a, button:not(.mobile-nav__close)');
          if (firstLink) firstLink.focus();
        }, 100);
      });
    }

    // Close menu
    function closeMenu() {
      if (!isOpen) return;
      isOpen = false;
      
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      
      if (mobileNavOverlay) {
        mobileNavOverlay.classList.remove('active');
      }
      
      mobileNav.classList.remove('active');
      document.body.classList.remove('menu-open');
      
      // Restore focus
      if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
      }
    }

    // Toggle menu
    function toggleMenu() {
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    // Event: Hamburger click
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Event: Close button click
    if (mobileNavClose) {
      mobileNavClose.addEventListener('click', closeMenu);
    }

    // Event: Overlay click
    if (mobileNavOverlay) {
      mobileNavOverlay.addEventListener('click', closeMenu);
    }

    // Event: ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
      }
    });

    // Event: Link clicks (close menu on navigation)
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        // Small delay to allow click to register
        setTimeout(closeMenu, 50);
      });
    });

    // Event: Focus trap within mobile nav
    mobileNav.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !isOpen) return;
      
      const focusableElements = mobileNav.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    });

    // Event: Resize handler (close menu if resized to desktop)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 768 && isOpen) {
          closeMenu();
        }
      }, 100);
    }, { passive: true });

    // Event: Handle swipe to close (touch)
    let touchStartX = 0;
    let touchEndX = 0;
    
    mobileNav.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    mobileNav.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeDistance = touchEndX - touchStartX;
      
      // Swipe right to close (since nav slides in from right)
      if (swipeDistance > 80 && isOpen) {
        closeMenu();
      }
    }, { passive: true });

    // Prevent scroll when menu is open
    mobileNav.addEventListener('touchmove', (e) => {
      // Allow scroll within nav if content overflows
      if (mobileNav.scrollHeight > mobileNav.clientHeight) {
        return;
      }
      e.preventDefault();
    }, { passive: false });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
