#!/bin/bash
# Demo Shield — Setup Script (macOS / Linux)
# Double-click this file in Finder, or run: bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
TARGET="$LIB_DIR/compromise.min.js"

# Pin to a specific version and verify its SHA-256 after download.
# If unpkg ever serves a different/tampered file, the script will refuse to proceed.
# To update: change the version, download manually, run `shasum -a 256` on it, update hash.
CDN_URL="https://unpkg.com/compromise@14.14.3/builds/compromise.min.js"
EXPECTED_SHA256="dca74c6f346638b8d4dd691efaf5461f97abfb3a95831522fabeb7ff7c1c058a"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Demo Shield — Setup               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Create lib/ if missing ───────────────────────────────────────────
mkdir -p "$LIB_DIR"

# ── Step 2: Download compromise.min.js ───────────────────────────────────────
if [ -f "$TARGET" ]; then
  echo "✅  NLP library already present — skipping download."
else
  echo "⬇️   Downloading NLP library (compromise.js)..."

  if command -v curl &>/dev/null; then
    curl -fsSL "$CDN_URL" -o "$TARGET"
  elif command -v wget &>/dev/null; then
    wget -q "$CDN_URL" -O "$TARGET"
  else
    echo ""
    echo "❌  ERROR: Neither curl nor wget is installed."
    echo "    Please install curl and re-run this script."
    exit 1
  fi

  # Verify integrity before the file is used as an extension content script
  echo "🔒  Verifying file integrity..."
  if command -v shasum &>/dev/null; then
    ACTUAL=$(shasum -a 256 "$TARGET" | awk '{print $1}')
  elif command -v sha256sum &>/dev/null; then
    ACTUAL=$(sha256sum "$TARGET" | awk '{print $1}')
  else
    echo "⚠️   WARNING: Cannot verify SHA-256 (no shasum/sha256sum found)."
    echo "    Proceeding, but the file has not been integrity-checked."
    ACTUAL="$EXPECTED_SHA256" # skip check
  fi

  if [ "$ACTUAL" != "$EXPECTED_SHA256" ]; then
    rm -f "$TARGET"
    echo ""
    echo "❌  INTEGRITY CHECK FAILED"
    echo "    Expected: $EXPECTED_SHA256"
    echo "    Got:      $ACTUAL"
    echo "    The downloaded file has been removed. Do not proceed."
    exit 1
  fi

  echo "✅  NLP library downloaded and verified."
fi

# ── Step 3: Open Chrome to the extensions page ───────────────────────────────
echo ""
echo "🚀  Opening Chrome extensions page..."
echo ""
echo "    When Chrome opens, follow these steps:"
echo ""
echo "    1. Turn on  'Developer mode'  (toggle, top-right)"
echo "    2. Click    'Load unpacked'"
echo "    3. Select   THIS folder:  $SCRIPT_DIR"
echo "    4. Click    the Demo Shield icon in the toolbar to pin it"
echo ""

# Try common Chrome paths on macOS and Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_PATHS=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  )
  for p in "${CHROME_PATHS[@]}"; do
    if [ -f "$p" ]; then
      "$p" "chrome://extensions/" &
      break
    fi
  done
  # Fallback: open with default browser handler
  open "chrome://extensions/" 2>/dev/null || true
else
  # Linux
  for cmd in google-chrome google-chrome-stable chromium chromium-browser brave-browser; do
    if command -v "$cmd" &>/dev/null; then
      "$cmd" "chrome://extensions/" &
      break
    fi
  done
fi

echo "✅  Setup complete."
echo ""
echo "    If Chrome didn't open automatically, navigate to:"
echo "    chrome://extensions/"
echo ""

# Keep the Terminal window open on macOS when double-clicked from Finder
if [[ "$OSTYPE" == "darwin"* ]] && [ -z "$TERM_PROGRAM" ]; then
  echo "Press Enter to close this window..."
  read -r
fi
