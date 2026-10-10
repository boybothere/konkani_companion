"""Start the backend from a terminal on any GPU machine (Lightning, a VM, Docker).

    cd backend
    python -m app.serve                 # http://0.0.0.0:8000
    python -m app.serve --port 8080
    python -m app.serve --ngrok         # also open an ngrok tunnel (needs NGROK_AUTHTOKEN)

Keys and settings come from the environment, or from backend/.env if present
(see .env.example). Colab keeps using colab_runner.ipynb; this is the same
server without the notebook.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from .envfile import load_env_file

BACKEND_DIR = Path(__file__).resolve().parents[1]

logger = logging.getLogger("konkani.serve")


# ngrok error codes worth explaining in plain words
_NGROK_HINTS = {
    "ERR_NGROK_334": "That ngrok domain is already in use by another running tunnel (for example Colab "
                     "cell 5, or an earlier start that is still running). Stop it, or check "
                     "https://dashboard.ngrok.com/endpoints, wait ~30 seconds and start again.",
    "ERR_NGROK_320": "That ngrok domain belongs to a different ngrok account than NGROK_AUTHTOKEN.",
    "ERR_NGROK_314": "NGROK_DOMAIN looks wrong: use the domain name (like name.ngrok-free.app), not its ID.",
    "ERR_NGROK_9034": "NGROK_DOMAIN contains extra characters: use only the bare domain, no https://.",
    "ERR_NGROK_105": "NGROK_AUTHTOKEN is not valid. Copy it again from the ngrok dashboard.",
    "ERR_NGROK_108": "This ngrok account already has an agent running elsewhere (free plans allow one). Stop the other one.",
}


def _open_ngrok(port: int) -> str:
    from pyngrok import ngrok

    token = os.environ.get("NGROK_AUTHTOKEN", "").strip()
    if not token:
        raise SystemExit("--ngrok needs NGROK_AUTHTOKEN in the environment or backend/.env")
    domain = (
        os.environ.get("NGROK_DOMAIN", "").strip().removeprefix("https://").removeprefix("http://").strip("/")
    )
    ngrok.set_auth_token(token)
    try:
        tunnel = ngrok.connect(port, **({"domain": domain} if domain else {}))
    except Exception as exc:  # noqa: BLE001 - turn pyngrok errors into one readable line
        ngrok.kill()
        detail = str(exc)
        hint = next((text for code, text in _NGROK_HINTS.items() if code in detail), None)
        raise SystemExit(f"Could not open the ngrok tunnel. {hint or detail}") from None
    return tunnel.public_url


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the Konkani Companion backend.")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    parser.add_argument("--env-file", default=str(BACKEND_DIR / ".env"))
    parser.add_argument("--ngrok", action="store_true", help="expose the server through ngrok")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s", stream=sys.stdout
    )

    loaded = load_env_file(args.env_file)
    if loaded:
        logger.info("loaded %d settings from %s", len(loaded), args.env_file)

    # Import after the env file is loaded: settings are read from the environment.
    import uvicorn

    from .config import get_settings
    from .main import create_app
    from .pipeline import build_services

    settings = get_settings()
    if not settings.groq_api_key and settings.llm_backend != "mock":
        raise SystemExit("GROQ_API_KEY is not set (environment or backend/.env).")

    # Open the tunnel first: a tunnel problem then shows up in seconds,
    # not after several minutes of model loading.
    if args.ngrok:
        logger.info("public URL (ngrok): %s", _open_ngrok(args.port))

    logger.info("loading models (model_backend=%s); this can take a few minutes", settings.model_backend)
    services = build_services(settings)
    app = create_app(services)

    logger.info("serving on http://%s:%d  (health check: /health)", args.host, args.port)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info", proxy_headers=True, forwarded_allow_ips="*")


if __name__ == "__main__":
    main()
