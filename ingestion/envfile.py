"""Read KEY=value lines from a local .env into os.environ (existing variables win)."""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: str | Path = ".env") -> int:
    """Set variables from a simple .env file. Returns how many were set. Values are never logged."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return 0
    count = 0
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name, value = name.strip(), value.strip().strip("'\"")
        if name and value and name not in os.environ:
            os.environ[name] = value
            count += 1
    return count
