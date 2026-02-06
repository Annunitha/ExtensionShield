#!/bin/bash
# Security Smoke Test Script
# Quick validation of basic security hygiene

set -e

echo "🔒 ExtensionShield Security Smoke Test"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# 1. Check images/env not tracked
echo "1. Checking if images/env is tracked..."
if git ls-files | grep -q '^images/env$'; then
    echo "   ❌ ERROR: images/env is tracked in git"
    ((ERRORS++))
else
    echo "   ✅ images/env is not tracked"
fi
echo ""

# 2. Check for secret patterns in tracked files
echo "2. Scanning for API key patterns in tracked files..."
SECRET_COUNT=$(git grep -n "sk-[A-Za-z0-9]\{20,\}" . 2>/dev/null | grep -v ".gitignore" | grep -v "template" | grep -v "SECURITY" | wc -l | tr -d ' ')
if [ "$SECRET_COUNT" -gt 0 ]; then
    echo "   ⚠️  WARNING: Found $SECRET_COUNT potential API key patterns"
    echo "   (May be false positives - review manually)"
    ((WARNINGS++))
else
    echo "   ✅ No API key patterns found"
fi
echo ""

# 3. Check .gitignore includes images/env
echo "3. Checking .gitignore coverage..."
if grep -q "^images/env" .gitignore 2>/dev/null; then
    echo "   ✅ images/env is in .gitignore"
else
    echo "   ⚠️  WARNING: images/env not found in .gitignore"
    ((WARNINGS++))
fi
echo ""

# 4. Optional: Check security headers (if HEALTHCHECK_URL is set)
if [ -n "${HEALTHCHECK_URL:-}" ]; then
    echo "4. Checking security headers..."
    HEADERS=$(curl -sI "$HEALTHCHECK_URL" 2>/dev/null || echo "")
    if echo "$HEADERS" | grep -qi "x-content-type-options"; then
        echo "   ✅ X-Content-Type-Options header present"
    else
        echo "   ⚠️  WARNING: X-Content-Type-Options header missing"
        ((WARNINGS++))
    fi
    if echo "$HEADERS" | grep -qi "x-frame-options"; then
        echo "   ✅ X-Frame-Options header present"
    else
        echo "   ⚠️  WARNING: X-Frame-Options header missing"
        ((WARNINGS++))
    fi
    echo ""
else
    echo "4. Skipping header check (set HEALTHCHECK_URL env var to enable)"
    echo ""
fi

# Summary
echo "======================================"
echo "Summary:"
echo "  Errors: $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ All checks passed!"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  Some warnings found (review recommended)"
    exit 0
else
    echo "❌ Errors found - please fix before proceeding"
    exit 1
fi

