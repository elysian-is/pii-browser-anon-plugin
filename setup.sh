#!/bin/bash
# Demo Shield — Setup Script (macOS / Linux)
# Double-click this file in Finder, or run: bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
TARGET="$LIB_DIR/compromise.min.js"
CDN_URL="https://unpkg.com/compromise/builds/compromise.min.js"

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

  echo "✅  NLP library downloaded."
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
