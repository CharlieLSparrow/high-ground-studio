#!/usr/bin/env python3
"""Smoke test for speaker preservation proof pack."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "script" / "audio_workbench_speaker_preservation_proof_pack.py"
FFMPEG = "/opt/homebrew/bin/ffmpeg"


def make_tone(path: Path, freq: int, duration: float = 18.0) -> None:
    subprocess.run(
        [
            FFMPEG,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={freq}:duration={duration}:sample_rate=48000",
            "-ac",
            "2",
            str(path),
        ],
        check=True,
    )


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        master = base / "master.m4a"
        charlie = base / "charlie.wav"
        homer = base / "homer.wav"
        make_tone(master, 440)
        make_tone(charlie, 660)
        make_tone(homer, 880)
        ledger = {
            "baselineId": "episode-4-conformed-production-baseline-smoke",
            "reviewMarkers": [
                {
                    "start": 4.0,
                    "end": 6.0,
                    "timecode": "00:04",
                    "priority": 4,
                    "flags": ["charlie_loss_or_overgate_risk"],
                    "charlieDeltaDb": 22.0,
                    "homerDeltaDb": 0.0,
                },
                {
                    "start": 10.0,
                    "end": 12.0,
                    "timecode": "00:10",
                    "priority": 4,
                    "flags": ["homer_loss_or_overgate_risk"],
                    "charlieDeltaDb": 0.0,
                    "homerDeltaDb": 24.0,
                },
            ],
        }
        ledger_path = base / "ledger.json"
        ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
        manifest = {
            "baselineId": "episode-4-conformed-production-baseline-smoke",
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "packageReadyForHumanListen": True,
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "rawSources": [
                {"id": "charlie", "label": "Charlie", "path": str(charlie), "role": "charlie_audio", "seq_start": 0.0, "volume": 0.8},
                {"id": "homer", "label": "Homer", "path": str(homer), "role": "homer_audio", "seq_start": 0.0, "volume": 1.2},
            ],
            "outputs": {
                "masterM4a": {"path": str(master), "exists": True},
                "latestAudioSpeakerContributionLedger": str(ledger_path),
            },
        }
        (base / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        subprocess.run(
            [
                "python3",
                str(SCRIPT),
                "--baseline-dir",
                str(base),
                "--max-per-speaker",
                "1",
                "--pre-roll",
                "1",
                "--post-roll",
                "1",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        updated = json.loads((base / "manifest.json").read_text())
        out = updated["outputs"]
        report = json.loads(Path(out["latestAudioSpeakerPreservationProofPack"]).read_text())
        assert report["itemCount"] == 2, report
        assert report["renderedSnippetCount"] == 4, report
        assert report["renderFailureCount"] == 0, report
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["branchRenderAttempted"] is False
        assert report["originalMediaMutated"] is False
        assert Path(out["latestAudioSpeakerPreservationProofPackMarkdown"]).exists()
        assert Path(out["latestAudioSpeakerPreservationProofPackHtml"]).exists()
        assert Path(out["latestAudioSpeakerPreservationProofPackPlaylist"]).exists()
        assert Path(out["latestAudioSpeakerPreservationProofPackNotesTemplate"]).exists()
        print(json.dumps({
            "passed": True,
            "itemCount": report["itemCount"],
            "renderedSnippetCount": report["renderedSnippetCount"],
            "renderFailureCount": report["renderFailureCount"],
            "approvalStateChanged": report["approvalStateChanged"],
            "branchStateChanged": report["branchStateChanged"],
            "branchRenderAttempted": report["branchRenderAttempted"],
            "originalMediaMutated": report["originalMediaMutated"],
        }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
