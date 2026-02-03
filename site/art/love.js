// Shared love functionality for Phosphors
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';

function getVisitorId() {
  let id = localStorage.getItem('phosphors_visitor');
  if (!id) {
    id = 'visitor_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('phosphors_visitor', id);
  }
  return id;
}

// All pieces use identifier column
// Genesis format: genesis-001_visitor_xxx  
// Submission format: sub-{uuid}_visitor_xxx

function makeIdentifier(pieceId, visitorId, isSubmission) {
  const prefix = isSubmission ? 'sub-' + pieceId : pieceId;
  return prefix + '_' + visitorId;
}

function makePrefix(pieceId, isSubmission) {
  return isSubmission ? 'sub-' + pieceId + '_' : pieceId + '_';
}

async function getLoveCount(pieceId, isSubmission = false) {
  try {
    const prefix = makePrefix(pieceId, isSubmission);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/loves?select=identifier`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const loves = await res.json();
    return loves.filter(l => l.identifier && l.identifier.startsWith(prefix)).length;
  } catch (e) {
    console.error('Failed to get love count:', e);
    return 0;
  }
}

async function hasLoved(pieceId, isSubmission = false) {
  // Check localStorage first (instant, works offline)
  const storageKey = 'loved_' + pieceId;
  if (localStorage.getItem(storageKey)) {
    return true;
  }
  
  const visitorId = getVisitorId();
  const identifier = makeIdentifier(pieceId, visitorId, isSubmission);
  
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/loves?identifier=eq.${encodeURIComponent(identifier)}&select=id`,
      { headers: { 'apikey': SUPABASE_KEY } }
    );
    const data = await res.json();
    if (data.length > 0) {
      localStorage.setItem(storageKey, 'true');
      return true;
    }
  } catch (e) {
    console.error('Failed to check love status:', e);
  }
  return false;
}

async function addLove(pieceId, isSubmission = false) {
  const visitorId = getVisitorId();
  const storageKey = 'loved_' + pieceId;
  const identifier = makeIdentifier(pieceId, visitorId, isSubmission);
  
  // Save locally first as backup
  localStorage.setItem(storageKey, 'true');
  
  try {
    const body = { identifier };
    // Also set submission_id for platform pieces (for leaderboard compatibility)
    if (isSubmission) {
      body.submission_id = pieceId;
    }
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error('Failed to save love:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Failed to save love:', e);
  }
}

async function initLoveButton(pieceId, isSubmission = false) {
  const btn = document.getElementById('love-btn');
  const countEl = document.getElementById('love-count');
  const heartEl = btn.querySelector('.heart');
  
  // Load initial state
  const [count, loved] = await Promise.all([
    getLoveCount(pieceId, isSubmission),
    hasLoved(pieceId, isSubmission)
  ]);
  
  countEl.textContent = count;
  
  if (loved) {
    btn.classList.add('loved');
    heartEl.textContent = '♥';
  }
  
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('loved')) return;
    
    btn.classList.add('loved');
    heartEl.textContent = '♥';
    countEl.textContent = parseInt(countEl.textContent) + 1;
    
    await addLove(pieceId, isSubmission);
  });
}
