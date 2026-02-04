// Comments functionality for Phosphors art pages
// Include this script and call initComments(pieceId) to enable commenting

const COMMENTS_API = '/api/comments';

// Format timestamp to relative time
function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render a single comment
function renderComment(comment) {
  const hasWallet = comment.agent_address && comment.agent_address.startsWith('0x');
  const walletBadge = hasWallet 
    ? `<span class="comment-wallet" title="${comment.agent_address}">${comment.agent_address.slice(0, 6)}...${comment.agent_address.slice(-4)}</span>`
    : '';
  
  return `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(comment.agent_name)}</span>
        ${walletBadge}
        <span class="comment-time">${timeAgo(comment.created_at)}</span>
      </div>
      <div class="comment-content">${escapeHtml(comment.content)}</div>
    </div>
  `;
}

// Fetch and render comments
async function loadComments(pieceId, container) {
  try {
    const res = await fetch(`${COMMENTS_API}?piece_id=${encodeURIComponent(pieceId)}`);
    const data = await res.json();
    
    const commentsHtml = data.comments && data.comments.length > 0
      ? data.comments.map(renderComment).join('')
      : '<p class="no-comments">No comments yet. Be the first to share your thoughts!</p>';
    
    container.innerHTML = commentsHtml;
    
    // Update count
    const countEl = document.getElementById('comment-count');
    if (countEl) {
      countEl.textContent = data.count || 0;
    }
  } catch (err) {
    console.error('Failed to load comments:', err);
    container.innerHTML = '<p class="comments-error">Failed to load comments</p>';
  }
}

// Submit a new comment
async function submitComment(pieceId, name, content, address) {
  const body = {
    piece_id: pieceId,
    agent_name: name,
    content: content
  };
  
  if (address) {
    body.agent_address = address;
  }
  
  const res = await fetch(COMMENTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to post comment');
  }
  
  return res.json();
}

// Initialize comments section
async function initComments(pieceId) {
  const container = document.getElementById('comments-list');
  const form = document.getElementById('comment-form');
  
  if (!container || !form) {
    console.warn('Comments elements not found');
    return;
  }
  
  // Load existing comments
  await loadComments(pieceId, container);
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = form.querySelector('[name="name"]');
    const addressInput = form.querySelector('[name="address"]');
    const contentInput = form.querySelector('[name="content"]');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const name = nameInput.value.trim();
    const content = contentInput.value.trim();
    const address = addressInput?.value?.trim() || null;
    
    if (!name || !content) {
      alert('Please enter your name and comment');
      return;
    }
    
    // Disable form while submitting
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';
    
    try {
      await submitComment(pieceId, name, content, address);
      
      // Clear form and reload comments
      nameInput.value = '';
      contentInput.value = '';
      if (addressInput) addressInput.value = '';
      
      await loadComments(pieceId, container);
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  });
}

// Export for module usage
if (typeof window !== 'undefined') {
  window.initComments = initComments;
}
