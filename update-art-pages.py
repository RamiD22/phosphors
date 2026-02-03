#!/usr/bin/env python3
"""Update all art pages with buy card after description"""
import re
import os

ART_DIR = 'site/art'

# CSS for buy section (add to style tag)
BUY_CSS = """
    .buy-section { margin-top: 1.5rem; padding: 1.5rem; background: rgba(100, 200, 100, 0.05); border: 1px solid rgba(100, 200, 100, 0.2); border-radius: 8px; }
    .buy-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .buy-price { font-size: 1.5rem; font-weight: 600; color: #80c0a0; }
    .buy-network { font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(100, 200, 100, 0.1); border-radius: 2px; color: var(--muted); }
    .buy-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; background: rgba(100, 200, 100, 0.15); border: 1px solid rgba(100, 200, 100, 0.4); border-radius: 4px; color: #80c0a0; font-size: 1rem; font-weight: 500; cursor: pointer; transition: all 0.3s; font-family: inherit; }
    .buy-btn:hover { background: rgba(100, 200, 100, 0.25); border-color: rgba(100, 200, 100, 0.6); }
    .buy-info { margin-top: 0.75rem; font-size: 0.7rem; color: var(--muted); text-align: center; }
    .buy-info code { background: rgba(255,255,255,0.05); padding: 0.1rem 0.3rem; border-radius: 2px; font-size: 0.65rem; }"""

# Map page filename to piece ID
def get_piece_id(filename):
    if 'threshold-001' in filename:
        return 'genesis-001'
    elif 'threshold-002' in filename:
        return 'genesis-002'
    elif 'threshold-003' in filename:
        return 'genesis-003'
    elif 'threshold-004' in filename:
        return 'genesis-004'
    elif 'threshold-005' in filename:
        return 'genesis-005'
    elif 'threshold-006' in filename:
        return 'genesis-006'
    elif 'threshold-007' in filename:
        return 'genesis-007'
    elif 'threshold-008' in filename:
        return 'genesis-008'
    elif 'threshold-009' in filename:
        return 'genesis-009'
    elif 'threshold-010' in filename:
        return 'genesis-010'
    elif 'hypnagogia' in filename:
        return 'platform-hypnagogia'
    elif 'phosphene' in filename:
        return 'platform-phosphene'
    return None

def update_page(filepath):
    piece_id = get_piece_id(filepath)
    if not piece_id:
        print(f"  Skipping {filepath} - no piece ID mapping")
        return
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Skip if already has buy-section in correct place (after description)
    if '.buy-section' in content and 'buy-section' in content.split('</p>')[1][:500] if '</p>' in content else False:
        print(f"  {filepath} - already updated")
        return
    
    # Add CSS if not present
    if '.buy-section' not in content:
        content = content.replace(
            '@media (max-width: 900px)',
            BUY_CSS + '\n    @media (max-width: 900px)'
        )
    
    # Find the description paragraph and add buy section after it
    # Pattern: </p>\n        \n        <div class="details">
    desc_pattern = r'(</p>\s*)\n(\s*<div class="details">)'
    
    buy_html = f'''</p>
        
        <div class="buy-section">
          <div class="buy-header">
            <span class="buy-price">0.10 USDC</span>
            <span class="buy-network">Base Sepolia</span>
          </div>
          <button class="buy-btn" id="buy-btn">
            <span>⚡</span>
            <span>Collect via x402</span>
          </button>
          <p class="buy-info">Agents: <code>GET /api/buy/{piece_id}</code></p>
        </div>
        
        <div class="love-section" style="margin-top: 1.5rem; border-top: none; padding-top: 0;">
          <button class="love-btn" id="love-btn">
            <span class="heart">♡</span>
            <span class="love-count" id="love-count">0</span>
          </button>
          <span class="love-label">Show some love</span>
        </div>
        
        <div class="details">'''
    
    if re.search(desc_pattern, content):
        content = re.sub(desc_pattern, buy_html, content)
        
        # Remove old love-section at the bottom (after share-section)
        old_love_pattern = r'\s*<div class="love-section">\s*<button class="love-btn" id="love-btn">\s*<span class="heart">♡</span>\s*<span class="love-count" id="love-count">0</span>\s*</button>\s*<span class="love-label">Show some love</span>\s*</div>\s*</div>\s*</main>'
        content = re.sub(old_love_pattern, '\n      </div>\n    </main>', content)
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"  ✅ {filepath} - updated with buy card for {piece_id}")
    else:
        print(f"  ⚠️ {filepath} - pattern not found")

# Process all page files
pages = [f for f in os.listdir(ART_DIR) if f.endswith('-page.html')]
print(f"Found {len(pages)} art pages to update:\n")

for page in sorted(pages):
    filepath = os.path.join(ART_DIR, page)
    update_page(filepath)

print("\nDone!")
