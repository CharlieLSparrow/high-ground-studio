#!/usr/bin/env python3
"""Shared media-tool resolution for Quipsly Studio scripts.

Quipsly runs from shells, app launchers, agents, and future packaged builds.
Those contexts do not always inherit the same PATH, so media scripts should not
assume `ffmpeg` or `ffprobe` are discoverable by name alone.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def resolve_media_tool(name: str, configured: str | None = None, *, required: bool = True) -> str:
    """Resolve a local media binary without depending on interactive shell PATH.

    Args:
        name: Binary name, normally "ffmpeg" or "ffprobe".
        configured: Optional explicit binary path.
        required: Raise RuntimeError when not found. If false, return "".
    """

    env_name = f"QUIPSLY_{name.upper()}_PATH"
    candidates: list[str] = []

    if configured:
        candidates.append(configured)
    if os.environ.get(env_name):
        candidates.append(str(os.environ[env_name]))

    found = shutil.which(name)
    if found:
        candidates.append(found)

    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if entry:
            candidates.append(str(Path(entry) / name))

    candidates.extend(
        [
            f"/opt/homebrew/bin/{name}",
            f"/usr/local/bin/{name}",
            f"/usr/bin/{name}",
            f"/bin/{name}",
        ]
    )

    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        path = Path(candidate).expanduser()
        if path.exists() and path.is_file() and os.access(path, os.X_OK):
            return str(path)

    if required:
        raise RuntimeError(
            f"{name} not found. Install ffmpeg/ffprobe or set {env_name}; "
            "Quipsly will not guess silently for production media work."
        )
    return ""
