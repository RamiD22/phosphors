#!/bin/bash
# Clean git history to remove exposed API key files
# This removes sensitive files from ALL git history

set -e

echo "🔐 Phosphors Git History Cleaner"
echo "================================"
echo ""
echo "⚠️  WARNING: This will rewrite git history!"
echo "   - All commits containing sensitive files will be rewritten"
echo "   - Force push will be required after this"
echo "   - All collaborators must re-clone the repo"
echo ""

# Files to remove from history
FILES_TO_REMOVE=(
  "api-key-tatemoderm.txt"
  "uffizi-api-key.txt"
)

# Check if we're in a git repo
if [ ! -d ".git" ]; then
  echo "❌ Not in a git repository root"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ You have uncommitted changes. Commit or stash them first."
  exit 1
fi

echo "Files to remove from history:"
for file in "${FILES_TO_REMOVE[@]}"; do
  echo "  - $file"
done
echo ""

read -p "Continue? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🧹 Removing files from git history..."

# Use git filter-repo if available (preferred), otherwise fall back to filter-branch
if command -v git-filter-repo &> /dev/null; then
  echo "Using git-filter-repo..."
  
  # Build the paths argument
  PATHS_ARG=""
  for file in "${FILES_TO_REMOVE[@]}"; do
    PATHS_ARG="$PATHS_ARG --path $file"
  done
  
  git filter-repo --invert-paths $PATHS_ARG --force
  
else
  echo "Using git filter-branch (git-filter-repo recommended)..."
  echo "Install git-filter-repo: pip install git-filter-repo"
  echo ""
  
  # Build the rm command
  RM_CMD=""
  for file in "${FILES_TO_REMOVE[@]}"; do
    RM_CMD="$RM_CMD git rm --cached --ignore-unmatch '$file';"
  done
  
  git filter-branch --force --index-filter "$RM_CMD" --prune-empty --tag-name-filter cat -- --all
  
  # Clean up refs
  echo "Cleaning up refs..."
  rm -rf .git/refs/original/
  git reflog expire --expire=now --all
  git gc --prune=now --aggressive
fi

echo ""
echo "✅ Git history cleaned!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify the files are gone: git log --all --full-history -- api-key-*.txt"
echo "   2. Force push to remote: git push origin --force --all"
echo "   3. Force push tags: git push origin --force --tags"
echo "   4. Notify all collaborators to re-clone the repository"
echo ""
echo "⚠️  IMPORTANT: Also invalidate the exposed keys in Supabase!"
echo "   Run: node scripts/rotate-compromised-keys.mjs"
