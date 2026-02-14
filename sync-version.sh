#!/bin/bash
#
# Version Sync Script for Foundry VTT Modules
# Reads version from module.json and updates CLAUDE.md and main.js
#

set -e  # Exit on error

# Colors for output (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

# Change to script directory (allows running from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Read module.json ────────────────────────────────────────────────

if [ ! -f "module.json" ]; then
    echo -e "${RED}ERROR: module.json not found!${NC}"
    exit 1
fi

# Extract version from module.json (jq preferred, fallback to grep/sed)
if command -v jq &> /dev/null; then
    VERSION=$(jq -r '.version' module.json)
else
    VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
    echo -e "${RED}ERROR: Could not extract version from module.json${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Version Sync Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Version: ${GREEN}${VERSION}${NC}"
echo ""

# ─── Update CLAUDE.md ────────────────────────────────────────────────

echo -e "${BLUE}[1/2]${NC} Updating CLAUDE.md..."

if [ ! -f "CLAUDE.md" ]; then
    echo -e "${YELLOW}WARNING: CLAUDE.md not found, skipping${NC}"
else
    # Update version line in CLAUDE.md
    sed -i.bak "s/^\*\*Version:\*\* .*$/\*\*Version:\*\* ${VERSION}/" CLAUDE.md
    rm -f CLAUDE.md.bak
    echo -e "  ${GREEN}OK${NC}"
fi

# ─── Update scripts/main.js ──────────────────────────────────────────

echo -e "${BLUE}[2/2]${NC} Updating scripts/main.js..."

if [ ! -f "scripts/main.js" ]; then
    echo -e "${RED}ERROR: scripts/main.js not found!${NC}"
    exit 1
fi

# Update @version in JSDoc comment
sed -i.bak "s/^ \* @version .*$/ * @version ${VERSION}/" scripts/main.js

# Update console.log version string
sed -i.bak "s/Initializing Token Replacer - Forgotten Adventures v[0-9.]*\`/Initializing Token Replacer - Forgotten Adventures v${VERSION}\`/" scripts/main.js

rm -f scripts/main.js.bak
echo -e "  ${GREEN}OK${NC}"

# ─── Summary ─────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Version Sync Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Updated files:"
echo -e "    - CLAUDE.md"
echo -e "    - scripts/main.js"
echo ""
echo -e "  All files now reference version: ${GREEN}${VERSION}${NC}"
echo ""
