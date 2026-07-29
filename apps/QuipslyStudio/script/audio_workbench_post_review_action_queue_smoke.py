#!/usr/bin/env python3
"""Smoke-test the post-review action queue without touching real baselines."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SCRIPT = Path("apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py")
BASELINE_ID = "episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_queue(baseline: Path) -> dict[str, Any]:
    result = subprocess.run(
        ["python3", str(SCRIPT), "--baseline-dir", str(baseline)],
        cwd=Path(__file__).resolve().parents[3],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"queue failed\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    parsed = json.loads(result.stdout)
    return json.loads(Path(parsed["json"]).read_text(encoding="utf-8"))


def make_baseline(root: Path) -> Path:
    baseline = root / "baseline"
    baseline.mkdir()
    write_json(
        baseline / "manifest.json",
        {
            "baselineId": BASELINE_ID,
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "packageReadyForHumanListen": True,
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "outputs": {},
        },
    )
    return baseline


def add_report(baseline: Path, key: str, markdown_key: str, filename: str, payload: dict[str, Any]) -> None:
    json_path = baseline / filename
    md_path = baseline / filename.replace(".json", ".md")
    write_json(json_path, payload)
    md_path.write_text("# smoke report\n", encoding="utf-8")
    manifest_path = baseline / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    outputs = manifest.setdefault("outputs", {})
    outputs[key] = str(json_path)
    outputs[markdown_key] = str(md_path)
    write_json(manifest_path, manifest)


def scenario_no_notes() -> dict[str, Any]:
    root = Path(tempfile.mkdtemp(prefix="quipsly-post-review-queue-no-notes-"))
    try:
        baseline = make_baseline(root)
        return run_queue(baseline)
    finally:
        shutil.rmtree(root)


def scenario_mixed_notes() -> dict[str, Any]:
    root = Path(tempfile.mkdtemp(prefix="quipsly-post-review-queue-mixed-"))
    try:
        baseline = make_baseline(root)
        add_report(
            baseline,
            "latestAudioProducerGradeNotesInbox",
            "latestAudioProducerGradeNotesInboxMarkdown",
            "producer-inbox.json",
            {
                "schema": "quipsly.audio-workbench.producer-grade-notes-inbox.v1",
                "baselineId": BASELINE_ID,
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "producer-notes.json")},
                "reviewActions": [
                    {
                        "actionType": "v007-repair-required",
                        "decision": "needs-repair",
                        "label": "Homer park noise sounds pumped",
                        "timecode": "00:12:03.000",
                        "reviewerNotes": "Noise gate breathes too obviously.",
                    },
                    {
                        "actionType": "producer-pass-context",
                        "decision": "pass",
                        "label": "Charlie/Homer overlap feels natural",
                        "timecode": "00:24:00.000",
                    },
                ],
                "repairActionCount": 1,
                "focusedProofActionCount": 0,
                "passContextCount": 1,
            },
        )
        add_report(
            baseline,
            "latestAudioWorkbenchParameterSweepNotesInbox",
            "latestAudioWorkbenchParameterSweepNotesInboxMarkdown",
            "parameter-inbox.json",
            {
                "schema": "quipsly.audio-workbench.parameter-sweep-proof-snippet-notes-inbox.v1",
                "baselineId": BASELINE_ID,
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "parameter-notes.json")},
                "repairActions": [
                    {
                        "actionType": "focused-proof-needed",
                        "decision": "needs-proof",
                        "label": "Charlie echo ducking needs one more A/B",
                        "sequenceStartSeconds": 2042.5,
                    }
                ],
                "repairActionCount": 0,
                "focusedProofActionCount": 1,
            },
        )
        add_report(
            baseline,
            "latestAudioSpeakerPreservationProofNotesInbox",
            "latestAudioSpeakerPreservationProofNotesInboxMarkdown",
            "speaker-preservation-inbox.json",
            {
                "schema": "quipsly.audio.speaker-preservation-proof-notes.v1",
                "baselineId": BASELINE_ID,
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "speaker-preservation-notes.json")},
                "passContextActions": [
                    {
                        "actionType": "speaker-preservation-pass-context",
                        "decision": "pass",
                        "label": "Homer quiet reaction survives cleanup",
                        "sequenceStartSeconds": 1804.25,
                    }
                ],
                "repairActionCount": 0,
                "focusedProofActionCount": 0,
                "passContextCount": 1,
            },
        )
        add_report(
            baseline,
            "latestAudioFinalListenFastPassNotesInbox",
            "latestAudioFinalListenFastPassNotesInboxMarkdown",
            "final-fast-pass-inbox.json",
            {
                "schema": "quipsly.audio.final-listen-fast-pass-notes-inbox.v1",
                "baselineId": BASELINE_ID,
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "final-fast-pass-notes.json")},
                "focusedProofActions": [
                    {
                        "actionType": "final-listen-focused-proof-needed",
                        "decision": "needs-proof",
                        "label": "Fast-pass note wants one more proof at the echo window",
                        "sequenceStartSeconds": 2042.5,
                    }
                ],
                "repairActionCount": 0,
                "focusedProofActionCount": 1,
                "passContextCount": 0,
            },
        )
        add_report(
            baseline,
            "latestAudioHumanListenMissionReelNotesInbox",
            "latestAudioHumanListenMissionReelNotesInboxMarkdown",
            "mission-reel-inbox.json",
            {
                "schema": "quipsly.audio-workbench.human-listen-mission-reel-notes-inbox.v1",
                "baselineId": BASELINE_ID,
                "status": "notes-incomplete",
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "mission-reel-notes.json")},
                "missionReelDecision": "notes-incomplete",
                "repairActionCount": 0,
                "focusedProofActionCount": 0,
                "passContextCount": 0,
                "nextSafestAction": "Complete the Mission Reel notes packet before repair/proof/pass routing.",
            },
        )
        add_report(
            baseline,
            "latestAudioSmoothnessProofNotesInbox",
            "latestAudioSmoothnessProofNotesInboxMarkdown",
            "smoothness-inbox.json",
            {
                "schema": "quipsly.audio-workbench.smoothness-proof-notes-inbox.v1",
                "baselineId": BASELINE_ID,
                "matchingCandidateCount": 1,
                "selectedCandidate": {"path": str(baseline / "smoothness-notes.json")},
                "repairActions": [
                    {
                        "actionType": "v007-smoothness-repair-required",
                        "decision": "needs-repair",
                        "label": "Gate snap at a hard silence edge",
                        "sequenceStartSeconds": 29.5,
                    }
                ],
                "repairActionCount": 1,
                "focusedProofActionCount": 0,
                "passContextCount": 0,
            },
        )
        return run_queue(baseline)
    finally:
        shutil.rmtree(root)


def main() -> None:
    no_notes = scenario_no_notes()
    assert no_notes["repairActionCount"] == 0
    assert no_notes["focusedProofActionCount"] == 0
    assert no_notes["sourceWithNotesCandidateCount"] == 0
    assert no_notes["approvalStateChanged"] is False
    assert no_notes["branchStateChanged"] is False

    mixed = scenario_mixed_notes()
    assert mixed["repairActionCount"] == 2
    assert mixed["focusedProofActionCount"] == 2
    assert mixed["passContextCount"] == 2
    assert mixed["sourceWithNotesCandidateCount"] == 6
    assert mixed["approvalStatus"] == "machine-candidate-needs-human-listen-proof"
    assert mixed["branchInheritanceReady"] is False
    assert mixed["branchRenderReady"] is False
    assert mixed["approvalStateChanged"] is False
    assert mixed["branchStateChanged"] is False
    assert mixed["renderAttempted"] is False
    assert mixed["originalMediaMutated"] is False

    print(
        json.dumps(
            {
                "passed": True,
                "scenarios": 2,
                "noNotesNextSafestAction": no_notes["nextSafestAction"],
                "mixedRepairActionCount": mixed["repairActionCount"],
                "smoothnessSourceCovered": True,
                "mixedFocusedProofActionCount": mixed["focusedProofActionCount"],
                "mixedPassContextCount": mixed["passContextCount"],
                "speakerPreservationSourceCovered": True,
                "finalListenFastPassSourceCovered": True,
                "missionReelNotesSourceCovered": True,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
