"""Minimal .env loader, so a server can keep its keys in backend/.env.

Format: KEY=VALUE per line, optional quotes, # comments. Variables that are
already set in the environment win, so platform secrets override the file.
"""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: str | os.PathLike[str]) -> list[str]:
    """Load variables from ``path`` if it exists. Returns the names that were set."""
    file = Path(path)
    if not file.is_file():
        return []
    loaded = []
    for raw in file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if key and value and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded
