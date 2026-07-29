#!/usr/bin/env python3
"""Smoke-test Episode 4 source-match unlock without touching real Episode 4 state.

This creates a tiny cue-named fixture file in a smoke-only folder, runs source
clip intake against that folder, then builds an apply-preview packet against the
smoke intake pointer. The real watched-clip dropbox and real latest pointers
must remain unchanged.
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
REAL_INTAKE_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
REAL_APPLY_POINTER = RELEASE_ROOT / "review-board/episode4-apply-preview/latest-episode4-apply-preview.json"
SMOKE_ROOT = RELEASE_ROOT / "review-board/episode4-apply-preview-source-unlock-smoke"
INTAKE_SCRIPT = ROOT / "script/experimental/build_episode4_source_clip_intake.py"
APPLY_SCRIPT = ROOT / "script/experimental/build_episode4_apply_preview_packet.py"


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-apply-source-unlock-smoke")


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


def run_json(command: list[str], timeout: int = 90) -> tuple[int, dict[str, Any], str]:
    result = subprocess.run(command, check=False, text=True, capture_output=True, cwd=str(ROOT), timeout=timeout)
    try:
        payload = json.loads(result.stdout or "{}")
    except Exception:
        payload = {}
    stderr = result.stderr[-2000:]
    if result.returncode != 0 and result.stdout:
        stderr = (stderr + "\nSTDOUT:\n" + result.stdout[-2000:]).strip()
    return result.returncode, payload, stderr


def first_clip_weave_operation(packet: dict[str, Any]) -> dict[str, Any]:
    for operation in packet.get("operations") or []:
        if isinstance(operation, dict) and str(operation.get("proposalGroup")) == "clipWeaveWorkorders":
            return operation
    return {}


def main() -> int:
    run_root = SMOKE_ROOT / stamp()
    fixture_root = run_root / "fixture-scan-root"
    intake_out = run_root / "generated-source-intake"
    apply_out = run_root / "generated-apply-preview"
    smoke_intake_pointer = run_root / "latest-smoke-source-clip-intake.json"
    smoke_apply_pointer = run_root / "latest-smoke-apply-preview.json"
    fixture_root.mkdir(parents=True, exist_ok=True)

    fixture_file = fixture_root / "ep4-cue-013-smoke-source.mp4"
    fixture_file.write_text(
        "Quipsly Episode 4 apply-preview source-unlock smoke fixture. Not real media.\n",
        encoding="utf-8",
    )

    before_dropbox = dropbox_listing(REAL_DROPBOX)
    before_intake_pointer = read_text(REAL_INTAKE_POINTER)
    before_apply_pointer = read_text(REAL_APPLY_POINTER)

    intake_code, intake_manifest, intake_stderr = run_json([
        sys.executable,
        str(INTAKE_SCRIPT),
        "--scan-root",
        str(fixture_root),
        "--no-probe",
        "--json",
        "--out-root",
        str(intake_out),
        "--latest-pointer",
        str(smoke_intake_pointer),
    ])

    apply_code, apply_packet, apply_stderr = run_json([
        sys.executable,
        str(APPLY_SCRIPT),
        "--json",
        "--intake-pointer",
        str(smoke_intake_pointer),
        "--out-root",
        str(apply_out),
        "--latest-pointer",
        str(smoke_apply_pointer),
    ])

    after_dropbox = dropbox_listing(REAL_DROPBOX)
    after_intake_pointer = read_text(REAL_INTAKE_POINTER)
    after_apply_pointer = read_text(REAL_APPLY_POINTER)

    intake_counts = intake_manifest.get("counts") if isinstance(intake_manifest.get("counts"), dict) else {}
    apply_counts = apply_packet.get("counts") if isinstance(apply_packet.get("counts"), dict) else {}
    operation = first_clip_weave_operation(apply_packet)
    source_matches = operation.get("sourceMatches") if isinstance(operation.get("sourceMatches"), list) else []

    checks = {
        "intakeCommandExitedZero": intake_code == 0,
        "applyCommandExitedZero": apply_code == 0,
        "intakeSawOneFixture": int_value(intake_counts.get("files")) == 1,
        "intakeMatchedCue": int_value(intake_counts.get("cueMatched")) == 1,
        "applyReadyOperationExists": int_value(apply_counts.get("readyForApplyPreviewReview")) >= 1,
        "clipWeaveUnlocked": operation.get("operationStatus") == "ready-for-apply-preview-review" and operation.get("operationKind") == "clip-weave-branch",
        "sourceMatchAttached": any(str(match.get("path") or "").endswith("ep4-cue-013-smoke-source.mp4") for match in source_matches if isinstance(match, dict)),
        "smokePointersWritten": smoke_intake_pointer.exists() and smoke_apply_pointer.exists(),
        "realDropboxUnchanged": before_dropbox == after_dropbox,
        "realIntakePointerUnchanged": before_intake_pointer == after_intake_pointer,
        "realApplyPointerUnchanged": before_apply_pointer == after_apply_pointer,
    }

    payload = {
        "schema": "quipsly.episode4-apply-preview-source-unlock-smoke.v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "ok": all(checks.values()),
        "checks": checks,
        "fixtureFile": str(fixture_file),
        "smokeIntakePointer": str(smoke_intake_pointer),
        "smokeApplyPointer": str(smoke_apply_pointer),
        "realDropboxFileCount": len(after_dropbox),
        "realIntakePointer": str(REAL_INTAKE_POINTER),
        "realApplyPointer": str(REAL_APPLY_POINTER),
        "intake": {
            "status": intake_manifest.get("status"),
            "counts": intake_counts,
            "board": intake_manifest.get("htmlPath"),
            "recoveryBoard": intake_manifest.get("recoveryHtmlPath"),
        },
        "applyPreview": {
            "status": apply_packet.get("status"),
            "counts": apply_counts,
            "board": apply_packet.get("htmlPath"),
            "firstClipWeaveOperation": {
                "proposalId": operation.get("proposalId"),
                "operationStatus": operation.get("operationStatus"),
                "operationKind": operation.get("operationKind"),
                "reason": operation.get("reason"),
                "sourceMatchCount": len(source_matches),
            },
        },
        "stderr": {
            "intake": intake_stderr,
            "apply": apply_stderr,
        },
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
