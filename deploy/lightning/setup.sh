#!/usr/bin/env bash
# One-time setup of the Konkani Companion backend in a Lightning AI Studio.
# Safe to re-run. Run it on the free CPU machine to save GPU hours.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

echo "==> System packages: Tesseract OCR (Hindi + Marathi = Devanagari) and ffmpeg"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq tesseract-ocr tesseract-ocr-hin tesseract-ocr-mar ffmpeg > /dev/null

echo "==> Python packages (a few minutes the first time)"
python -m pip install -q --upgrade pip
python -m pip install -q unsloth
python -m pip install -q -r "$REPO_DIR/backend/requirements.txt" -r "$REPO_DIR/backend/requirements-gpu.txt" pyngrok

echo "==> Checks"
echo -n "Tesseract languages: "; tesseract --list-langs 2>/dev/null | tail -n +2 | tr '\n' ' '; echo
python -c "import torch; print('torch', torch.__version__, '| GPU available:', torch.cuda.is_available())"

if [ ! -f "$REPO_DIR/backend/.env" ]; then
  cp "$REPO_DIR/backend/.env.example" "$REPO_DIR/backend/.env"
  echo "Created backend/.env from the template. Fill in your keys before starting."
fi

echo
echo "Setup done. Next:"
echo "  1. Put your keys in backend/.env"
echo "  2. Switch the Studio to a GPU machine (T4 is enough)"
echo "  3. Run: bash deploy/lightning/start.sh"
