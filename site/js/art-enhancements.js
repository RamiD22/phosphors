// Art Enhancements: Share Buttons + Fullscreen View
// Include this script on gallery detail pages

(function() {
  'use strict';

  // =========================================================================
  // SHARE BUTTONS
  // =========================================================================
  
  function createShareButtons() {
    const artDetails = document.querySelector('.art-details') || document.querySelector('.art-info');
    if (!artDetails) return;
    
    const title = document.querySelector('h1')?.textContent || document.title;
    const artist = document.querySelector('.artist a')?.textContent || 
                   document.querySelector('.art-info .artist')?.textContent?.replace('by ', '') || 
                   'Unknown Artist';
    const url = window.location.href;
    
    // Check if share buttons already exist
    if (document.querySelector('.share-buttons')) return;
    
    // Create share buttons container
    const shareContainer = document.createElement('div');
    shareContainer.className = 'share-buttons';
    shareContainer.innerHTML = `
      <div class="share-buttons__label">Share</div>
      <div class="share-buttons__row">
        <button class="share-btn share-btn--twitter" title="Share on X/Twitter">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          <span>Tweet</span>
        </button>
        <button class="share-btn share-btn--copy" title="Copy link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span>Copy Link</span>
        </button>
      </div>
    `;
    
    // Insert after art-meta or art-info
    const insertPoint = document.querySelector('.art-meta') || document.querySelector('.art-info .description');
    if (insertPoint) {
      insertPoint.parentNode.insertBefore(shareContainer, insertPoint.nextSibling);
    } else {
      artDetails.appendChild(shareContainer);
    }
    
    // Twitter/X share
    shareContainer.querySelector('.share-btn--twitter').addEventListener('click', () => {
      const tweetText = `"${title}" by ${artist} on @phosphors_xyz ✨\n\n${url}`;
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank', 'width=550,height=420');
    });
    
    // Copy link
    const copyBtn = shareContainer.querySelector('.share-btn--copy');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        const span = copyBtn.querySelector('span');
        const originalText = span.textContent;
        span.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          span.textContent = originalText;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        const span = copyBtn.querySelector('span');
        span.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          span.textContent = 'Copy Link';
          copyBtn.classList.remove('copied');
        }, 2000);
      }
    });
  }

  // =========================================================================
  // FULLSCREEN ART VIEW
  // =========================================================================
  
  function createFullscreenView() {
    const artFrame = document.querySelector('.art-frame');
    if (!artFrame) return;
    
    const iframe = artFrame.querySelector('iframe');
    if (!iframe) return;
    
    // Check if fullscreen already initialized
    if (document.querySelector('.fullscreen-overlay')) return;
    
    // Add fullscreen trigger button
    const fullscreenTrigger = document.createElement('button');
    fullscreenTrigger.className = 'fullscreen-trigger';
    fullscreenTrigger.title = 'View fullscreen';
    fullscreenTrigger.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/>
      </svg>
    `;
    artFrame.style.position = 'relative';
    artFrame.appendChild(fullscreenTrigger);
    
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-overlay';
    overlay.innerHTML = `
      <div class="fullscreen-content">
        <button class="fullscreen-close" title="Close (ESC)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="fullscreen-frame">
          <iframe src="${iframe.src}" title="${iframe.title || 'Fullscreen Art View'}"></iframe>
        </div>
        <div class="fullscreen-info">
          <span class="fullscreen-hint">Press ESC or click outside to close</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // Open fullscreen
    function openFullscreen() {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    
    // Close fullscreen
    function closeFullscreen() {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
    
    // Event listeners
    fullscreenTrigger.addEventListener('click', openFullscreen);
    artFrame.addEventListener('dblclick', openFullscreen); // Double-click to open
    
    overlay.querySelector('.fullscreen-close').addEventListener('click', closeFullscreen);
    
    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('fullscreen-content')) {
        closeFullscreen();
      }
    });
    
    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        closeFullscreen();
      }
    });
  }

  // =========================================================================
  // INJECT STYLES
  // =========================================================================
  
  function injectStyles() {
    if (document.querySelector('#art-enhancements-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'art-enhancements-styles';
    styles.textContent = `
      /* Share Buttons */
      .share-buttons {
        margin: var(--space-6, 1.5rem) 0;
        padding: var(--space-4, 1rem) 0;
        border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
      }
      
      .share-buttons__label {
        font-size: var(--text-xs, 0.75rem);
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim, #404048);
        margin-bottom: var(--space-3, 0.75rem);
      }
      
      .share-buttons__row {
        display: flex;
        gap: var(--space-3, 0.75rem);
        flex-wrap: wrap;
      }
      
      .share-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
        border-radius: var(--radius-md, 8px);
        color: var(--text-muted, #606068);
        font-family: inherit;
        font-size: var(--text-sm, 0.875rem);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .share-btn:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--border-hover, rgba(255,255,255,0.12));
        color: var(--text-primary, #f5f5f7);
        transform: translateY(-2px);
      }
      
      .share-btn svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      
      .share-btn--twitter:hover {
        background: rgba(29, 161, 242, 0.1);
        border-color: rgba(29, 161, 242, 0.3);
        color: #1DA1F2;
      }
      
      .share-btn--copy.copied {
        background: rgba(77, 212, 172, 0.1);
        border-color: rgba(77, 212, 172, 0.3);
        color: var(--success, #4dd4ac);
      }
      
      /* Fullscreen Trigger */
      .fullscreen-trigger {
        position: absolute;
        bottom: var(--space-4, 1rem);
        right: var(--space-4, 1rem);
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md, 8px);
        color: var(--text-primary, #f5f5f7);
        cursor: pointer;
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 10;
      }
      
      .art-frame:hover .fullscreen-trigger {
        opacity: 1;
      }
      
      .fullscreen-trigger:hover {
        background: rgba(var(--accent-rgb, 184, 140, 255), 0.2);
        border-color: rgba(var(--accent-rgb, 184, 140, 255), 0.4);
        transform: scale(1.1);
      }
      
      .fullscreen-trigger svg {
        width: 20px;
        height: 20px;
      }
      
      /* Fullscreen Overlay */
      .fullscreen-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .fullscreen-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      
      .fullscreen-content {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 2rem);
      }
      
      .fullscreen-close {
        position: absolute;
        top: var(--space-6, 1.5rem);
        right: var(--space-6, 1.5rem);
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md, 8px);
        color: var(--text-primary, #f5f5f7);
        cursor: pointer;
        transition: all 0.3s ease;
        z-index: 10;
      }
      
      .fullscreen-close:hover {
        background: rgba(255, 107, 107, 0.2);
        border-color: rgba(255, 107, 107, 0.4);
        transform: scale(1.1);
      }
      
      .fullscreen-close svg {
        width: 24px;
        height: 24px;
      }
      
      .fullscreen-frame {
        width: 100%;
        max-width: min(90vw, 90vh);
        aspect-ratio: 1;
        background: var(--bg-secondary, #080810);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-lg, 12px);
        overflow: hidden;
        box-shadow: 
          0 0 100px rgba(var(--accent-rgb, 184, 140, 255), 0.15),
          0 40px 80px rgba(0, 0, 0, 0.5);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .fullscreen-overlay.active .fullscreen-frame {
        transform: scale(1);
        opacity: 1;
        transition-delay: 0.1s;
      }
      
      .fullscreen-frame iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      
      .fullscreen-info {
        margin-top: var(--space-4, 1rem);
        text-align: center;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.4s ease;
        transition-delay: 0.3s;
      }
      
      .fullscreen-overlay.active .fullscreen-info {
        opacity: 1;
        transform: translateY(0);
      }
      
      .fullscreen-hint {
        font-size: var(--text-xs, 0.75rem);
        color: var(--text-dim, #404048);
        letter-spacing: 0.05em;
      }
      
      /* Responsive */
      @media (max-width: 768px) {
        .share-buttons__row {
          flex-direction: column;
        }
        
        .share-btn {
          justify-content: center;
        }
        
        .fullscreen-trigger {
          opacity: 1;
          width: 40px;
          height: 40px;
        }
        
        .fullscreen-trigger svg {
          width: 18px;
          height: 18px;
        }
        
        .fullscreen-content {
          padding: var(--space-4, 1rem);
        }
        
        .fullscreen-close {
          top: var(--space-4, 1rem);
          right: var(--space-4, 1rem);
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // =========================================================================
  // INITIALIZE
  // =========================================================================
  
  function init() {
    injectStyles();
    createShareButtons();
    createFullscreenView();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
