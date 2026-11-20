"""Load KEY=VALUE lines from the repository's .env into the environment (existing variables win)."""
import os
from pathlib import Path


def load_env(path: Path | None = None) -> None:
    path = path or Path(__file__).resolve().parents[2] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#") and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
