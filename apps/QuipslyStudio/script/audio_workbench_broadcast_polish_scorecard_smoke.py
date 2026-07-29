#!/usr/bin/env python3
"""Smoke test the broadcast polish scorecard without real media."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "script" / "audio_workbench_broadcast_polish_scorecard.py"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="quipsly-broadcast-polish-smoke-") as tmp:
        base = Path(tmp)
        master = base / "master.wav"
        master.write_bytes(b"not-real-wav")
        reports = {}
        fixtures = {
            "quality.json": {"artifacts": {"masterWav": {"loudness": {"integratedLufs": -16.0, "truePeakDbfs": -1.8}}}},
            "platform.json": {"summary": {"hardGateAttentionCount": 0, "advisoryAttentionCount": 0, "podcastProfilesMachineReady": True}},
            "smooth.json": {"classificationCounts": {"hard-silence-edge-listen-check": 0, "large-level-jump-listen-check": 0}, "longSilenceSpans": []},
            "spine.json": {"passed": True},
            "preservation.json": {"itemCount": 12, "renderedSnippetCount": 24, "renderFailureCount": 0},
            "contribution.json": {"speakerSummaries": [{"speaker": "Charlie"}, {"speaker": "Homer"}]},
            "human.json": {"linkCount": 12, "missingLinkCount": 0},
            "fast.json": {"itemCount": 18},
            "queue.json": {"waitingForNotesCount": 0},
            "dx.json": {"status": "waiting-for-bounces"},
            "dxplan.json": {"status": "waiting-for-validated-dxrevive-bounces"},
            "reusable.json": {"reuseReadiness": "seed-profile"},
        }
        for filename, payload in fixtures.items():
            path = base / filename
            write_json(path, payload)
            reports[filename] = str(path)
        manifest = {
            "baselineId": "episode-4-conformed-production-baseline-smoke",
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "packageReadyForHumanListen": True,
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "outputs": {
                "masterWav": str(master),
                "qualityReport": reports["quality.json"],
                "latestAudioPlatformLoudnessAudit": reports["platform.json"],
                "latestAudioMasterSmoothnessAudit": reports["smooth.json"],
                "latestAudioSpineListenSanityCheck": reports["spine.json"],
                "latestAudioSpeakerPreservationProofPack": reports["preservation.json"],
                "latestAudioSpeakerContributionLedger": reports["contribution.json"],
                "latestHumanListenSession": reports["human.json"],
                "latestAudioFinalListenFastPass": reports["fast.json"],
                "latestAudioPostReviewActionQueue": reports["queue.json"],
                "latestDxReviveBounceValidation": reports["dx.json"],
                "latestDxReviveProofCandidatePlanner": reports["dxplan.json"],
                "latestReusableAudioProductionProfile": reports["reusable.json"],
            },
        }
        write_json(base / "manifest.json", manifest)
        subprocess.check_call(["python3", str(SCRIPT), "--baseline-dir", str(base)])
        updated = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
        outputs = updated["outputs"]
        report = json.loads(Path(outputs["latestAudioBroadcastPolishScorecard"]).read_text(encoding="utf-8"))
        assert report["publicationApproved"] is False
        assert report["approvalStateChanged"] is False
        assert report["branchStateChanged"] is False
        assert report["renderAttempted"] is False
        assert report["originalMediaMutated"] is False
        assert updated["approvalStatus"] == "machine-candidate-needs-human-listen-proof"
        assert updated["branchInheritanceReady"] is False
        assert updated["branchRenderReady"] is False
        assert report["overallScore"] >= 75, report["overallScore"]
        assert Path(outputs["latestAudioBroadcastPolishScorecardMarkdown"]).exists()
        assert Path(outputs["latestAudioBroadcastPolishScorecardHtml"]).exists()
        assert Path(outputs["latestAudioBroadcastPolishScorecardOpenCommand"]).exists()
        print("PASS broadcast polish scorecard smoke")
        print(json.dumps({"overallScore": report["overallScore"], "overallStatus": report["overallStatus"]}, sort_keys=True))


if __name__ == "__main__":
    main()
