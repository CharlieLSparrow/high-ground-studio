#!/usr/bin/env python3
"""Smoke test the smoothness proof pack on synthetic audio."""

from __future__ import annotations

import json
import math
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "script" / "audio_workbench_smoothness_proof_pack.py"


def write_wav(path: Path, seconds: float = 8.0, sample_rate: int = 48000) -> None:
    frame_count = int(seconds * sample_rate)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(frame_count):
            t = index / sample_rate
            amp = 0.0 if 2.0 < t < 2.8 else 0.25
            sample = int(amp * math.sin(2 * math.pi * 440 * t) * 32767)
            wav.writeframes(struct.pack("<h", sample))


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="quipsly-smoothness-proof-smoke-") as tmp_text:
        tmp = Path(tmp_text)
        master = tmp / "master.wav"
        write_wav(master)
        smooth = tmp / "smoothness.json"
        smooth.write_text(
            json.dumps(
                {
                    "schema": "test",
                    "passed": True,
                    "classificationCounts": {
                        "hard-silence-edge-listen-check": 1,
                        "large-level-jump-listen-check": 1,
                    },
                    "largestTransitions": [
                        {
                            "classification": "hard-silence-edge-listen-check",
                            "time": "00:00:02.000",
                            "timeSec": 2.0,
                            "absDeltaDb": 38.5,
                            "fromDbfs": -60,
                            "toDbfs": -18,
                        },
                        {
                            "classification": "large-level-jump-listen-check",
                            "time": "00:00:03.000",
                            "timeSec": 3.0,
                            "absDeltaDb": 24.0,
                            "fromDbfs": -40,
                            "toDbfs": -16,
                        },
                    ],
                    "longSilenceSpans": [
                        {"start": "00:00:02.000", "startSec": 2.0, "end": "00:00:02.800", "endSec": 2.8, "durationSec": 0.8}
                    ],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        manifest = {
            "baselineId": "smoothness-smoke",
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "packageReadyForHumanListen": True,
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "outputs": {
                "masterWav": {"path": str(master), "exists": True},
                "latestAudioMasterSmoothnessAudit": str(smooth),
            },
        }
        (tmp / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        result = subprocess.run(
            [
                "python3",
                str(SCRIPT),
                "--baseline-dir",
                str(tmp),
                "--transition-limit",
                "2",
                "--silence-limit",
                "1",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr)
            raise SystemExit(result.returncode)
        updated = json.loads((tmp / "manifest.json").read_text(encoding="utf-8"))
        outputs = updated["outputs"]
        report = json.loads(Path(outputs["latestAudioSmoothnessProofPack"]).read_text(encoding="utf-8"))
        assert report["snippetCount"] >= 2
        assert report["renderFailureCount"] == 0
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["branchRenderAttempted"] is False
        assert report["derivedReviewSnippetsRendered"] is True
        assert report["originalMediaMutated"] is False
        for key in [
            "latestAudioSmoothnessProofPackMarkdown",
            "latestAudioSmoothnessProofPackHtml",
            "latestAudioSmoothnessProofPackPlaylist",
            "latestAudioSmoothnessProofPackNotesTemplate",
            "latestAudioSmoothnessProofPackOpenCommand",
        ]:
            assert Path(outputs[key]).exists(), key
        print("PASS smoothness proof pack smoke")
        print(result.stdout.strip())


if __name__ == "__main__":
    main()
