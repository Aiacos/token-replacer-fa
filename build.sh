#!/bin/bash
#
# Build script for Token Replacer - Forgotten Adventures
# Creates a clean ZIP archive for FoundryVTT / The Forge distribution
#

set -e  # Exit on error

# Configuration
MODULE_ID="token-replacer-fa"
OUTPUT_ZIP="${MODULE_ID}.zip"

# Colors for output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored status messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Change to script directory (allows running from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

info "Building ${MODULE_ID}..."

# Check if module.json exists
if [ ! -f "module.json" ]; then
    error "module.json not found! Are you in the correct directory?"
fi

# Extract version from module.json
# Try jq first (faster and more reliable), fallback to grep/sed
if command -v jq &> /dev/null; then
    VERSION=$(jq -r '.version' module.json)
else
    VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | sed 's/.*"\([^"]*\)"$/\1/')
fi

if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
    error "Could not extract version from module.json"
fi

info "Version: ${VERSION}"

# Remove existing ZIP if present
if [ -f "$OUTPUT_ZIP" ]; then
    warn "Removing existing ${OUTPUT_ZIP}"
    rm "$OUTPUT_ZIP"
fi

# Create ZIP with only required module files
# -r: recursive
# -q: quiet (suppress normal output)
# Files to include: module.json, scripts/, lang/, styles/, README.md
info "Creating ${OUTPUT_ZIP}..."

zip -r -q "$OUTPUT_ZIP" \
    module.json \
    scripts/ \
    lang/ \
    styles/ \
    README.md

# Verify ZIP was created
if [ ! -f "$OUTPUT_ZIP" ]; then
    error "Failed to create ${OUTPUT_ZIP}"
fi

# Get ZIP file size
ZIP_SIZE=$(du -h "$OUTPUT_ZIP" | cut -f1)

# Show success message
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build successful!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Module:  ${MODULE_ID}"
echo "  Version: ${VERSION}"
echo "  Output:  ${OUTPUT_ZIP}"
echo "  Size:    ${ZIP_SIZE}"
echo ""
info "ZIP contents:"
unzip -l "$OUTPUT_ZIP" | tail -n +4 | head -n -2

echo ""
info "Ready for upload to GitHub releases or The Forge!"
echo ""
echo "  GitHub release example:"
echo "    gh release create v${VERSION} ${OUTPUT_ZIP} module.json --title \"v${VERSION}\""
echo ""
