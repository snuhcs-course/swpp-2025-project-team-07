#!/bin/bash

# Script to generate macOS icon files from logo
# Usage: ./scripts/generate-icons.sh

set -e  # Exit on error

# Change to project root directory
cd "$(dirname "$0")/.."

# Configuration
LOGO_SOURCE="src/assets/logo_icon.png"
ICONSET_DIR="build/icon.iconset"
OUTPUT_ICON="build/icon.icns"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Generating macOS icons from ${LOGO_SOURCE}${NC}"

# Clean and create iconset directory
echo "Cleaning old iconset..."
rm -rf "${ICONSET_DIR}"
mkdir -p "${ICONSET_DIR}"

# Generate all required icon sizes
echo "Generating icon sizes..."

# 16x16
sips -z 16 16 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_16x16.png" > /dev/null
echo "  ✓ 16x16"

# 16x16@2x (32x32)
sips -z 32 32 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_16x16@2x.png" > /dev/null
echo "  ✓ 16x16@2x"

# 32x32
sips -z 32 32 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_32x32.png" > /dev/null
echo "  ✓ 32x32"

# 32x32@2x (64x64)
sips -z 64 64 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_32x32@2x.png" > /dev/null
echo "  ✓ 32x32@2x"

# 128x128
sips -z 128 128 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_128x128.png" > /dev/null
echo "  ✓ 128x128"

# 128x128@2x (256x256)
sips -z 256 256 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_128x128@2x.png" > /dev/null
echo "  ✓ 128x128@2x"

# 256x256
sips -z 256 256 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_256x256.png" > /dev/null
echo "  ✓ 256x256"

# 256x256@2x (512x512)
sips -z 512 512 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_256x256@2x.png" > /dev/null
echo "  ✓ 256x256@2x"

# 512x512
sips -z 512 512 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_512x512.png" > /dev/null
echo "  ✓ 512x512"

# 512x512@2x (1024x1024)
sips -z 1024 1024 "${LOGO_SOURCE}" --out "${ICONSET_DIR}/icon_512x512@2x.png" > /dev/null
echo "  ✓ 512x512@2x"

# Convert iconset to .icns
echo "Converting to .icns format..."
iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICON}"

# Get file size
FILE_SIZE=$(ls -lh "${OUTPUT_ICON}" | awk '{print $5}')

echo -e "${GREEN}✓ Icon generation complete!${NC}"
echo "  Output: ${OUTPUT_ICON}"
echo "  Size: ${FILE_SIZE}"
echo ""
echo "To rebuild the app with the new icon, run: npm run make"
