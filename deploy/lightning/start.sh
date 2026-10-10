#!/usr/bin/env bash
# Start the backend in a Lightning AI Studio.
#   bash deploy/lightning/start.sh            # serve on port 8000
#   bash deploy/lightning/start.sh --ngrok    # also open an ngrok tunnel
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR/backend"

if [ ! -f .env ]; then
  echo "backend/.env is missing. Run deploy/lightning/setup.sh first, then add your keys."
  exit 1
fi

if ! python -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
  if grep -qE '^\s*MODEL_BACKEND\s*=\s*mock' .env; then
    echo "No GPU, but MODEL_BACKEND=mock is set: starting without the models."
  else
    echo "No GPU detected. Switch the Studio to a GPU machine first."
    echo "(To test the API without models, set MODEL_BACKEND=mock in backend/.env.)"
    exit 1
  fi
fi

exec python -m app.serve "$@"
