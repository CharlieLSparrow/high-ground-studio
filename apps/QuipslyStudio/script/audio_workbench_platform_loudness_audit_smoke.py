#!/usr/bin/env python3
"""Smoke test the platform loudness audit without touching real media."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "script" / "audio_workbench_platform_loudness_audit.py"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="quipsly-loudness-audit-smoke-") as tmp:
        base = Path(tmp)
        wav = base / "master.wav"
        m4a = base / "master.m4a"
        wav.write_bytes(b"not-real-audio")
        m4a.write_bytes(b"not-real-audio")
        qc = base / "qc.json"
        manifest = base / "manifest.json"
        write_json(
            qc,
            {
                "artifacts": {
                    "masterWav": {
                        "loudness": {"integratedLufs": -16.0, "loudnessRangeLu": 8.5, "truePeakDbfs": -1.8},
                        "volume": {"maxVolumeDb": -1.8, "meanVolumeDb": -21.0},
                        "warnings": [],
                    },
                    "masterM4a": {
                        "loudness": {"integratedLufs": -16.0, "loudnessRangeLu": 8.5, "truePeakDbfs": -1.1},
                        "volume": {"maxVolumeDb": -1.2, "meanVolumeDb": -21.0},
                        "warnings": [],
                    },
                }
            },
        )
        write_json(
            manifest,
            {
                "baselineId": "episode-4-conformed-production-baseline-smoke",
                "approvalStatus": "machine-candidate-needs-human-listen-proof",
                "packageReadyForHumanListen": True,
                "branchInheritanceReady": False,
                "branchRenderReady": False,
                "outputs": {
                    "masterWav": str(wav),
                    "masterM4a": str(m4a),
                    "qualityReport": str(qc),
                },
            },
        )
        subprocess.check_call(["python3", str(SCRIPT), "--baseline-dir", str(base)])
        updated = json.loads(manifest.read_text(encoding="utf-8"))
        outputs = updated["outputs"]
        report_path = Path(outputs["latestAudioPlatformLoudnessAudit"])
        report = json.loads(report_path.read_text(encoding="utf-8"))
        assert report["summary"]["hardGateAttentionCount"] == 0, report["summary"]
        assert report["summary"]["podcastProfilesMachineReady"] is True, report["summary"]
        assert report["publicationApproved"] is False
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        assert updated["approvalStatus"] == "machine-candidate-needs-human-listen-proof"
        assert updated["branchInheritanceReady"] is False
        assert updated["branchRenderReady"] is False
        assert Path(outputs["latestAudioPlatformLoudnessAuditMarkdown"]).exists()
        assert Path(outputs["latestAudioPlatformLoudnessAuditHtml"]).exists()
        assert Path(outputs["latestAudioPlatformLoudnessAuditOpenCommand"]).exists()
        print("PASS platform loudness audit smoke")
        print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
