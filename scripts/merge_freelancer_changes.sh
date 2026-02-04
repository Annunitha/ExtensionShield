#!/bin/bash
# Script to merge freelancer changes from share branch
# Usage: ./scripts/merge_freelancer_changes.sh

set -e

echo "🔄 Fetching latest changes from remote..."
git fetch origin share

echo ""
echo "📊 Comparing files between your current branch and share branch..."
echo ""

# Check what branch we're on
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo "Comparing with: origin/share"
echo ""

# Show files that differ
echo "Files that differ:"
git diff --name-status $CURRENT_BRANCH origin/share || true

echo ""
echo "📝 To see detailed differences for a specific file:"
echo "   git diff $CURRENT_BRANCH origin/share -- <file-path>"
echo ""
echo "🔀 To merge freelancer's changes:"
echo "   1. git checkout share"
echo "   2. git pull origin share"
echo "   3. Review changes: git log origin/share --oneline"
echo "   4. Compare specific files: git diff master origin/share -- <file>"
echo "   5. Merge to your branch: git checkout $CURRENT_BRANCH && git merge share"
echo ""
echo "💡 Or create a comparison branch:"
echo "   git checkout -b compare-freelancer origin/share"
echo ""

