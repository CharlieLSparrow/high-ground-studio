#!/usr/bin/env python3
"""Smoke-test the speaker contribution ledger without touching real baselines."""

from __future__ import annotations

import csv
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SCRIPT = Path("apps/QuipslyStudio/script/audio_workbench_speaker_contribution_ledger.py")
BASELINE_ID = "episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_source_csv(path: Path) -> None:
    fields = [
        "start",
        "end",
        "timecode",
        "priority",
        "charlieAlignedDbfs",
        "charlieContributionDbfs",
        "homerAlignedDbfs",
        "homerContributionDbfs",
        "referenceAlignedDbfs",
        "referenceContributionDbfs",
        "flags",
    ]
    rows = [
        [0, 2, "0:00", 2, "-24", "-25", "-80", "-96", "", "", ""],
        [2, 4, "0:02", 4, "-23", "-70", "-82", "-96", "", "", "charlie_loss_or_overgate_risk"],
        [4, 6, "0:04", 2, "-26", "-27", "-38", "-40", "", "", "charlie_homer_overlap_present"],
        [6, 8, "0:06", 4, "-84", "-96", "-36", "-58", "", "", "homer_loss_or_overgate_risk"],
        [8, 10, "0:08", 3, "-30", "-31", "-37", "-39", "", "", "homer_noise_bleed_may_remain_under_charlie"],
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(fields)
        writer.writerows(rows)


def make_baseline(root: Path) -> Path:
    baseline = root / "baseline"
    baseline.mkdir()
    source_json = baseline / "source-activity.json"
    source_csv = baseline / "source-activity.csv"
    write_source_csv(source_csv)
    write_json(
        source_json,
        {
            "schema": "quipsly.audio-workbench.source-activity.v1",
            "baselineId": BASELINE_ID,
            "windowSeconds": 2.0,
            "thresholds": {"activeDbfs": -42.0, "deadAirDbfs": -50.0, "lossDeltaDb": 18.0},
            "outputs": {"csv": str(source_csv), "json": str(source_json)},
            "reviewWindows": [
                {
                    "start": 2.0,
                    "end": 4.0,
                    "timecode": "0:02",
                    "priority": 4,
                    "charlieAlignedDbfs": -23,
                    "charlieContributionDbfs": -70,
                    "homerAlignedDbfs": -82,
                    "homerContributionDbfs": -96,
                    "flags": ["charlie_loss_or_overgate_risk"],
                }
            ],
        },
    )
    write_json(
        baseline / "source-balance.json",
        {"focusRows": [], "speakerSummaries": [], "flagCounts": {}},
    )
    write_json(
        baseline / "speaker-activity.json",
        {"focusRows": [], "flagCounts": {}},
    )
    write_json(
        baseline / "bleed-gap.json",
        {"focusWindows": [], "flagCounts": {}},
    )
    write_json(
        baseline / "spine-sanity.json",
        {"passed": True},
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
                "sourceActivity": str(source_json),
                "sourceActivityCsv": str(source_csv),
                "latestAudioMasterSourceBalanceAudit": str(baseline / "source-balance.json"),
                "latestAudioSpeakerActivityReviewBoard": str(baseline / "speaker-activity.json"),
                "latestSpeakerBleedGapProofAudit": str(baseline / "bleed-gap.json"),
                "latestAudioSpineListenSanityCheck": str(baseline / "spine-sanity.json"),
            },
        },
    )
    return baseline


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="quipsly-speaker-contribution-ledger-smoke-"))
    try:
        baseline = make_baseline(root)
        result = subprocess.run(
            ["python3", str(SCRIPT), "--baseline-dir", str(baseline)],
            cwd=Path(__file__).resolve().parents[3],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise AssertionError(f"ledger failed\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
        parsed = json.loads(result.stdout)
        report = json.loads(Path(parsed["json"]).read_text(encoding="utf-8"))
        manifest = json.loads((baseline / "manifest.json").read_text(encoding="utf-8"))
        summaries = {row["speaker"]: row for row in report["speakerSummaries"]}
        assert parsed["reviewMarkerCount"] >= 1
        assert summaries["charlie"]["activeWindowCount"] == 4
        assert summaries["charlie"]["lossRiskWindowCount"] == 1
        assert summaries["homer"]["activeWindowCount"] == 3
        assert summaries["homer"]["lossRiskWindowCount"] == 1
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        assert Path(report["markdown"]).exists()
        assert Path(report["html"]).exists()
        assert Path(report["reviewMarkerCsv"]).exists()
        assert manifest["outputs"]["latestAudioSpeakerContributionLedger"] == report["json"]
        print(json.dumps({
            "passed": True,
            "reviewMarkerCount": parsed["reviewMarkerCount"],
            "charlieLossRiskWindowCount": summaries["charlie"]["lossRiskWindowCount"],
            "homerLossRiskWindowCount": summaries["homer"]["lossRiskWindowCount"],
            "approvalStateChanged": report["approvalStateChanged"],
            "branchStateChanged": report["branchStateChanged"],
            "renderAttempted": report["renderAttempted"],
            "originalMediaMutated": report["originalMediaMutated"],
        }, indent=2, sort_keys=True))
    finally:
        shutil.rmtree(root)


if __name__ == "__main__":
    main()
