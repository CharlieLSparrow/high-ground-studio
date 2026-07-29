#!/usr/bin/env python3
"""Smoke-test smoothness proof notes inbox routing."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

BASELINE_ID = "episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean"
INBOX = "apps/QuipslyStudio/script/audio_workbench_smoothness_proof_notes_inbox.py"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_json(args: list[str]) -> dict[str, Any]:
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise AssertionError(f"command failed: {' '.join(args)}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    return json.loads(result.stdout)


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="quipsly-smoothness-notes-inbox-smoke-"))
    try:
        baseline = root / "baseline"
        baseline.mkdir()
        pack = baseline / "smoothness-proof-pack.json"
        write_json(
            pack,
            {
                "schema": "quipsly.audio-workbench.smoothness-proof-pack.v1",
                "baselineId": BASELINE_ID,
                "json": str(pack),
                "moments": [
                    {
                        "id": "transition-hard-edge",
                        "kind": "transition",
                        "title": "Hard edge at 00:10",
                        "centerSeconds": 10.0,
                        "centerTimecode": "00:00:10.000",
                        "windowDurationSeconds": 12.0,
                        "snippetPath": str(baseline / "edge.m4a"),
                        "listenQuestions": ["Does it snap?"],
                        "evidence": {"classification": "hard-silence-edge-listen-check", "absDeltaDb": 44.0},
                    },
                    {
                        "id": "transition-proof",
                        "kind": "transition",
                        "title": "Proof check at 00:20",
                        "centerSeconds": 20.0,
                        "centerTimecode": "00:00:20.000",
                        "windowDurationSeconds": 12.0,
                    },
                    {
                        "id": "silence-pass",
                        "kind": "silence",
                        "title": "Natural pause at 00:30",
                        "centerSeconds": 30.0,
                        "centerTimecode": "00:00:30.000",
                        "windowDurationSeconds": 16.0,
                    },
                ],
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
                "outputs": {"latestAudioSmoothnessProofPack": str(pack)},
            },
        )
        notes = {
            "schema": "quipsly.audio-workbench.smoothness-proof-notes.v1",
            "baselineId": BASELINE_ID,
            "baselineDir": str(baseline),
            "sourcePack": str(pack),
            "exportedAt": "2026-07-11T03:40:00Z",
            "reviewer": "smoke",
            "overallDecision": "mixed",
            "moments": [
                {"id": "transition-hard-edge", "decision": "needs-repair", "notes": "Gate snaps here."},
                {"id": "transition-proof", "decision": "needs-proof", "notes": "Need source A/B."},
                {"id": "silence-pass", "decision": "pass", "notes": "Breath feels natural."},
            ],
        }
        notes_path = baseline / "episode-4-smoothness-proof-notes-smoke.json"
        write_json(notes_path, notes)
        result = run_json(["python3", INBOX, "--baseline-dir", str(baseline), "--search-dir", str(baseline)])
        report = json.loads(Path(result["json"]).read_text(encoding="utf-8"))
        assert report["matchingCandidateCount"] == 1
        assert report["repairActionCount"] == 1
        assert report["focusedProofActionCount"] == 1
        assert report["passContextCount"] == 1
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        updated = json.loads((baseline / "manifest.json").read_text(encoding="utf-8"))
        outputs = updated["outputs"]
        assert Path(outputs["latestAudioSmoothnessProofNotesInbox"]).exists()
        assert Path(outputs["latestAudioSmoothnessProofNotesInboxMarkdown"]).exists()
        print(
            json.dumps(
                {
                    "passed": True,
                    "matchingCandidateCount": report["matchingCandidateCount"],
                    "repairActionCount": report["repairActionCount"],
                    "focusedProofActionCount": report["focusedProofActionCount"],
                    "passContextCount": report["passContextCount"],
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
