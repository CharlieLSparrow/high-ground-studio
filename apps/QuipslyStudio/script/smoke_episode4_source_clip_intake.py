#!/usr/bin/env python3
"""Smoke-test Episode 4 source-clip intake without touching real intake state.

Creates a tiny smoke-only cue-named fixture file, scans it with probe disabled,
and writes all generated artifacts under a smoke folder with a smoke pointer.
The real Episode 4 dropbox and latest intake pointer must remain unchanged.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
REAL_DROPBOX = RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"
REAL_LATEST_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
SMOKE_ROOT = RELEASE_ROOT / "review-board/episode4-source-clip-intake-smoke"
INTAKE_SCRIPT = ROOT / "script/experimental/build_episode4_source_clip_intake.py"


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-intake-smoke")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def dropbox_listing(path: Path) -> list[str]:
    try:
        return sorted(item.name for item in path.iterdir() if item.is_file() and not item.name.startswith("."))
    except Exception:
        return []


def int_value(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def main() -> int:
    run_root = SMOKE_ROOT / stamp()
    fixture_root = run_root / "fixture-scan-root"
    output_root = run_root / "generated-intake"
    smoke_pointer = run_root / "latest-smoke-source-clip-intake.json"
    fixture_root.mkdir(parents=True, exist_ok=True)

    fixture_file = fixture_root / "ep4-cue-013-smoke-source.mp4"
    fixture_file.write_text(
        "Quipsly Episode 4 source-clip intake smoke fixture. Not real media.\n",
        encoding="utf-8",
    )

    before_dropbox = dropbox_listing(REAL_DROPBOX)
    before_pointer = read_text(REAL_LATEST_POINTER)

    command = [
        sys.executable,
        str(INTAKE_SCRIPT),
        "--scan-root",
        str(fixture_root),
        "--no-probe",
        "--json",
        "--out-root",
        str(output_root),
        "--latest-pointer",
        str(smoke_pointer),
    ]
    result = subprocess.run(command, check=False, text=True, capture_output=True, cwd=str(ROOT), timeout=60)

    try:
        manifest = json.loads(result.stdout or "{}")
    except Exception:
        manifest = {}

    after_dropbox = dropbox_listing(REAL_DROPBOX)
    after_pointer = read_text(REAL_LATEST_POINTER)
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    clips = manifest.get("clips") if isinstance(manifest.get("clips"), list) else []
    first_clip = clips[0] if clips and isinstance(clips[0], dict) else {}
    cue_ids = first_clip.get("cueIds") if isinstance(first_clip.get("cueIds"), list) else []

    checks = {
        "commandExitedZero": result.returncode == 0,
        "statusReady": manifest.get("status") == "episode4-source-clip-intake-ready",
        "sawOneFixtureFile": int_value(counts.get("files")) == 1,
        "matchedCueId": "ep4-cue-013" in cue_ids,
        "cueMatchedCount": int_value(counts.get("cueMatched")) == 1,
        "smokePointerWritten": smoke_pointer.exists(),
        "realDropboxUnchanged": before_dropbox == after_dropbox,
        "realLatestPointerUnchanged": before_pointer == after_pointer,
    }

    payload = {
        "schema": "quipsly.episode4-source-clip-intake-smoke.v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "ok": all(checks.values()),
        "checks": checks,
        "fixtureFile": str(fixture_file),
        "smokePointer": str(smoke_pointer),
        "smokeBoard": manifest.get("htmlPath"),
        "smokeRecoveryBoard": manifest.get("recoveryHtmlPath"),
        "realDropboxFileCount": len(after_dropbox),
        "realLatestPointer": str(REAL_LATEST_POINTER),
        "manifestStatus": manifest.get("status"),
        "counts": counts,
        "firstClip": {
            "fileName": first_clip.get("fileName"),
            "cueIds": cue_ids,
            "matchStatus": first_clip.get("matchStatus"),
            "confirmationStatus": first_clip.get("confirmationStatus"),
        },
        "stderr": result.stderr[-2000:],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
