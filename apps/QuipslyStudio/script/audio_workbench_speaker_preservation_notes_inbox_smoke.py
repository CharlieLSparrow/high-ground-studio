#!/usr/bin/env python3
"""Smoke test for speaker preservation notes inbox."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "audio_workbench_speaker_preservation_notes_inbox.py"
SCHEMA = "quipsly.audio.speaker-preservation-proof-notes.v1"


def write_packet(path: Path, baseline_id: str, decisions: list[str]) -> None:
    notes = []
    for index, decision in enumerate(decisions, start=1):
        notes.append({
            "index": index,
            "speaker": "homer" if index % 2 else "charlie",
            "timecode": f"00:0{index}",
            "windowStart": float(index),
            "windowEnd": float(index + 2),
            "flags": ["homer_loss_or_overgate_risk"],
            "title": f"Preservation {index}",
            "decision": decision,
            "note": f"note {decision}",
        })
    path.write_text(json.dumps({
        "schema": SCHEMA,
        "baselineId": baseline_id,
        "exportedAt": "2026-07-11T00:00:00Z",
        "notes": notes,
    }), encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        baseline_id = "episode-4-conformed-production-baseline-smoke"
        (base / "manifest.json").write_text(json.dumps({"baselineId": baseline_id, "outputs": {}}), encoding="utf-8")
        notes = base / "speaker-preservation-proof-notes.json"
        write_packet(notes, baseline_id, ["pass", "needs-proof", "needs-repair"])
        subprocess.run(["python3", str(SCRIPT), "--baseline-dir", str(base), "--search-dir", str(base)], check=True, capture_output=True, text=True)
        manifest = json.loads((base / "manifest.json").read_text())
        out = manifest["outputs"]
        report = json.loads(Path(out["latestAudioSpeakerPreservationProofNotesInbox"]).read_text())
        assert report["matchingCandidateCount"] == 1, report
        assert report["repairActionCount"] == 1, report
        assert report["focusedProofActionCount"] == 1, report
        assert report["passContextCount"] == 1, report
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        print(json.dumps({
            "passed": True,
            "matchingCandidateCount": report["matchingCandidateCount"],
            "repairActionCount": report["repairActionCount"],
            "focusedProofActionCount": report["focusedProofActionCount"],
            "passContextCount": report["passContextCount"],
            "approvalStateChanged": report["approvalStateChanged"],
            "branchStateChanged": report["branchStateChanged"],
            "renderAttempted": report["renderAttempted"],
            "originalMediaMutated": report["originalMediaMutated"],
        }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
