#!/usr/bin/env python3
"""Generate a disposable human-flow review demo packet.

This creates a tiny fake board and runs the sidecar-only review workflow against
it. It is for validating the human-flow review machinery without requiring the
Quipsly Studio app agent server or touching real media/timeline data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_ROOT = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review/demo")


def sample_board(output_dir: Path) -> dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")
    return {
        "model": "quipsly-human-flow-cut-review-board-demo",
        "version": "2026-06-30.demo-fixture.v1",
        "generatedAt": now,
        "sourceUrl": "demo://human-flow-review",
        "sourceStatus": "demo_fixture",
        "mode": "demo",
        "returnedCount": 2,
        "totalRecipeCount": 2,
        "reviewProtocol": [
            "Cue the boundary.",
            "Listen at normal speed.",
            "Watch Program Output and source wall together.",
            "Leave sidecar review evidence before any metadata apply step.",
        ],
        "outcomeTruth": "Demo review outcomes are sample labels only.",
        "learningTruth": "Demo learning events are disposable smoke evidence.",
        "recipes": [
            {
                "index": 1,
                "id": "demo-preserve-air-001",
                "label": "Awkward warmth before the reply",
                "sequenceTime": 142.5,
                "timeLabel": "02:22.5",
                "targetLaneName": "Charlie camera",
                "technique": "preserve-air-audit",
                "reviewClass": "cadence",
                "reviewClassExplanation": "A pause may be doing social or comic work before the next thought lands.",
                "reviewPriority": 9,
                "risk": "medium",
                "confidence": 0.72,
                "confidencePercent": 72,
                "cutStyle": "cadence-sensitive",
                "coverStrategy": "none",
                "nextReviewAction": "Listen at normal speed before tightening.",
                "reviewQuestion": "Is this dead air, or is the pause doing social, comic, emotional, or thinking work?",
                "doNotOptimizeAway": "Breath, hesitation, comic timing, awkward warmth, and meaning-bearing pauses.",
                "evidenceChecklist": [
                    "Cue the boundary and listen at normal speed from a few seconds before to a few seconds after.",
                    "Decide whether the pause is dead air or meaning-bearing air before tightening it.",
                ],
                "reviewOutcomes": [
                    {"label": "Keep the cadence", "whenToUse": "The timing feels human.", "metadataHint": "Mark preserve-cadence."},
                    {"label": "Tighten gently", "whenToUse": "The pause is only dead air.", "metadataHint": "Mark gentle tighten."},
                ],
                "learningEventTemplate": {
                    "eventType": "human_flow_cut_review",
                    "boundaryId": "demo-preserve-air-001",
                    "sequenceTime": 142.5,
                    "timeLabel": "02:22.5",
                    "targetLaneName": "Charlie camera",
                    "recommendedTechnique": "preserve-air-audit",
                    "reviewQuestion": "Is this dead air, or is the pause doing useful work?",
                    "doNotOptimizeAway": "Human cadence.",
                    "availableOutcomeLabels": ["Keep the cadence", "Tighten gently"],
                },
                "truth": "Demo card only. No real edit data.",
            },
            {
                "index": 2,
                "id": "demo-reaction-cover-002",
                "label": "Same-face jump needs a human cover",
                "sequenceTime": 318.2,
                "timeLabel": "05:18.2",
                "targetLaneName": "Homer camera",
                "technique": "reaction-cover",
                "reviewClass": "jump",
                "reviewClassExplanation": "A same-face jump may need a real listener reaction or should stay honestly visible.",
                "reviewPriority": 8,
                "risk": "medium",
                "confidence": 0.68,
                "confidencePercent": 68,
                "cutStyle": "jump-cut",
                "coverStrategy": "reaction",
                "nextReviewAction": "Try a reaction cover, but only if it adds story value.",
                "reviewQuestion": "Does this boundary need a reaction/clip cover, or is the jump honest enough to leave visible?",
                "doNotOptimizeAway": "Honest energy; not every visible jump needs to be hidden.",
                "evidenceChecklist": [
                    "Cue the boundary and listen at normal speed from a few seconds before to a few seconds after.",
                    "Confirm the reaction changes the story beat; do not use it only as wallpaper over a cut.",
                ],
                "reviewOutcomes": [
                    {"label": "Cover the jump", "whenToUse": "The cut calls attention to itself.", "metadataHint": "Mark reaction-cover."},
                    {"label": "Needs human listen", "whenToUse": "The boundary is ambiguous.", "metadataHint": "Hold for listen."},
                ],
                "learningEventTemplate": {
                    "eventType": "human_flow_cut_review",
                    "boundaryId": "demo-reaction-cover-002",
                    "sequenceTime": 318.2,
                    "timeLabel": "05:18.2",
                    "targetLaneName": "Homer camera",
                    "recommendedTechnique": "reaction-cover",
                    "reviewQuestion": "Does this need a reaction cover?",
                    "doNotOptimizeAway": "Honest energy.",
                    "availableOutcomeLabels": ["Cover the jump", "Needs human listen"],
                },
                "truth": "Demo card only. No real edit data.",
            },
        ],
        "outputs": {
            "json": str(output_dir / "demo-human-flow-board.json"),
        },
        "safeUse": "Disposable demo board. No real media, timeline, export, or publication truth.",
        "truth": "Demo fixture for sidecar review tooling only.",
    }


def run(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        payload = {"stdout": result.stdout}
    return {"command": command, "payload": payload}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    args = parser.parse_args()

    stamp = dt.datetime.now(dt.timezone.utc).astimezone().strftime("%Y%m%d-%H%M%S")
    output_dir = Path(args.output_root).expanduser() / f"{stamp}-demo"
    output_dir.mkdir(parents=True, exist_ok=False)
    board_path = output_dir / "demo-human-flow-board.json"
    with board_path.open("w", encoding="utf-8") as handle:
        json.dump(sample_board(output_dir), handle, indent=2, sort_keys=True)
        handle.write("\n")

    steps = []
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_session.py"),
        "--board",
        str(board_path),
        "--output-dir",
        str(output_dir / "sessions"),
        "--name",
        "demo-human-flow-review",
    ]))
    session_dir = Path(steps[-1]["payload"]["outputs"]["session"]).parent
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_decision.py"),
        "--session",
        str(session_dir),
        "--boundary-id",
        "demo-preserve-air-001",
        "--outcome",
        "Keep the cadence",
        "--reviewer",
        "CodexDemo",
        "--notes",
        "Demo reviewer preserves the pause because it carries human timing.",
        "--cadence-judgment",
        "meaning-bearing pause",
        "--action-taken",
        "preserve cadence in proposed metadata",
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_decision.py"),
        "--session",
        str(session_dir),
        "--boundary-id",
        "demo-reaction-cover-002",
        "--outcome",
        "Cover the jump",
        "--reviewer",
        "CodexDemo",
        "--notes",
        "Demo reviewer wants a reaction cover if it adds story value.",
        "--visual-continuity",
        "same-face jump visible",
        "--action-taken",
        "propose reaction cover",
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_promotion_plan.py"),
        "--session",
        str(session_dir),
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_approval.py"),
        "--session",
        str(session_dir),
        "--action-ref",
        "demo-preserve-air-001",
        "--decision",
        "approve",
        "--reviewer",
        "CodexDemo",
        "--notes",
        "Demo approval for preserve-cadence patch packet.",
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_approved_patch_packet.py"),
        "--session",
        str(session_dir),
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_status.py"),
        "--sessions-dir",
        str(output_dir / "sessions"),
        "--limit",
        "4",
    ]))
    steps.append(run([
        sys.executable,
        str(SCRIPT_DIR / "human_flow_review_start_here.py"),
        "--root",
        str(output_dir),
        "--session",
        str(session_dir),
        "--basename",
        "demo-human-flow-start-here",
    ]))

    summary = {
        "model": "quipsly-human-flow-demo-fixture",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "outputDir": str(output_dir),
        "board": str(board_path),
        "sessionDir": str(session_dir),
        "steps": steps,
        "truth": "Disposable sidecar demo. No real media, timeline metadata, exports, or publication state touched.",
    }
    summary_path = output_dir / "demo-summary.json"
    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({"summary": str(summary_path), "outputDir": str(output_dir), "sessionDir": str(session_dir)}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
