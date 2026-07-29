#!/usr/bin/env python3
"""Smoke-test final-listen fast-pass generation and notes routing."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

BASELINE_ID = "episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean"
GENERATOR = "apps/QuipslyStudio/script/audio_workbench_final_listen_fast_pass.py"
INBOX = "apps/QuipslyStudio/script/audio_workbench_final_listen_fast_pass_notes_inbox.py"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_json(args: list[str]) -> dict[str, Any]:
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise AssertionError(f"command failed: {' '.join(args)}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    return json.loads(result.stdout)


def make_baseline(root: Path) -> Path:
    baseline = root / "baseline"
    baseline.mkdir()
    master = baseline / "master.m4a"
    master.write_bytes(b"fake audio for smoke")
    listen_queue = baseline / "listen-queue.json"
    producer = baseline / "producer.json"
    cleanup = baseline / "cleanup.json"
    preservation = baseline / "preservation.json"
    write_json(
        listen_queue,
        {
            "queue": [
                {
                    "timeSec": 10,
                    "time": "00:10.000",
                    "title": "Long silence check",
                    "reasons": ["Smoke long low-level span"],
                    "listenQuestions": ["Did speech vanish?"],
                    "riskPriority": 1,
                    "classifications": ["critical-listen"],
                    "safeActionsIfFails": ["Route to scoped repair."],
                }
            ]
        },
    )
    write_json(
        producer,
        {
            "producerListenMoments": [
                {"timeSec": 40, "time": "00:40.000", "label": "Producer naturalness check", "severity": "high", "reason": "Smoke producer reason"}
            ]
        },
    )
    write_json(
        cleanup,
        {
            "rows": [
                {"start": 80, "timecode": "01:20", "family": "over-gate", "reason": "Smoke cleanup", "questions": ["Chopped?"], "flags": ["charlie-risk"]}
            ]
        },
    )
    write_json(
        preservation,
        {
            "items": [
                {"windowStart": 120, "timecode": "02:00", "title": "Homer preservation", "speaker": "homer", "guidance": "Smoke preservation", "flags": ["homer-risk"]}
            ]
        },
    )
    write_json(
        baseline / "manifest.json",
        {
            "baselineId": BASELINE_ID,
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "packageReadyForHumanListen": True,
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "outputs": {
                "masterM4a": {"path": str(master)},
                "latestAudioListenPriorityQueue": str(listen_queue),
                "latestAudioProducerGradeAudit": str(producer),
                "latestSpeakerCleanupListenMap": str(cleanup),
                "latestAudioSpeakerPreservationProofPack": str(preservation),
            },
        },
    )
    return baseline


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="quipsly-final-listen-fast-pass-smoke-"))
    try:
        baseline = make_baseline(root)
        generated = run_json(["python3", GENERATOR, "--baseline-dir", str(baseline), "--limit", "6"])
        report = json.loads(Path(generated["json"]).read_text(encoding="utf-8"))
        assert report["itemCount"] >= 4
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        notes = json.loads(Path(report["notesTemplate"]).read_text(encoding="utf-8"))
        notes["exportedAt"] = "2026-07-11T00:00:00Z"
        notes["notes"][0]["decision"] = "pass"
        notes["notes"][1]["decision"] = "needs-proof"
        notes["notes"][2]["decision"] = "needs-repair"
        notes_path = baseline / "episode-4-final-listen-fast-pass-notes-smoke.json"
        write_json(notes_path, notes)
        inbox = run_json(["python3", INBOX, "--baseline-dir", str(baseline), "--search-dir", str(baseline)])
        inbox_report = json.loads(Path(inbox["json"]).read_text(encoding="utf-8"))
        assert inbox_report["matchingCandidateCount"] == 1
        assert inbox_report["repairActionCount"] == 1
        assert inbox_report["focusedProofActionCount"] == 1
        assert inbox_report["passContextCount"] == 1
        assert inbox_report["approvalStateChanged"] is False
        assert inbox_report["branchStateChanged"] is False
        assert inbox_report["renderAttempted"] is False
        assert inbox_report["originalMediaMutated"] is False
        print(
            json.dumps(
                {
                    "passed": True,
                    "generatedItemCount": report["itemCount"],
                    "repairActionCount": inbox_report["repairActionCount"],
                    "focusedProofActionCount": inbox_report["focusedProofActionCount"],
                    "passContextCount": inbox_report["passContextCount"],
                    "approvalStateChanged": False,
                    "branchStateChanged": False,
                    "renderAttempted": False,
                    "originalMediaMutated": False,
                },
                indent=2,
                sort_keys=True,
            )
        )
    finally:
        shutil.rmtree(root)


if __name__ == "__main__":
    main()
