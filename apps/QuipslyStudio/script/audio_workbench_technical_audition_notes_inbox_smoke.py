#!/usr/bin/env python3
"""Smoke-test the technical audition notes inbox and queue integration."""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)


def main() -> None:
    repo = Path(__file__).resolve().parents[3]
    with tempfile.TemporaryDirectory(prefix="quipsly-technical-audition-inbox-smoke-") as temp:
        root = Path(temp)
        baseline = root / "baseline"
        search = root / "exports"
        baseline.mkdir()
        search.mkdir()
        baseline_id = "episode-4-conformed-production-baseline-v006-smoke"
        pack_path = baseline / "technical-audition-snippet-pack.json"
        write_json(
            pack_path,
            {
                "schema": "quipsly.audio-workbench.technical-audition-snippet-pack.v1",
                "baselineId": baseline_id,
                "items": [
                    {
                        "id": "clip-pass",
                        "title": "0:00-1:00",
                        "sectionStartSeconds": 0,
                        "sectionEndSeconds": 60,
                        "durationSeconds": 45,
                        "snippetPath": str(baseline / "clip-pass.m4a"),
                        "listenQuestions": ["Does it sound natural?"],
                        "reasons": ["active speech may be underpowered"],
                        "riskScore": 12,
                    },
                    {
                        "id": "clip-proof",
                        "title": "1:00-2:00",
                        "sectionStartSeconds": 60,
                        "sectionEndSeconds": 120,
                        "durationSeconds": 45,
                        "snippetPath": str(baseline / "clip-proof.m4a"),
                        "listenQuestions": ["Need more proof?"],
                        "reasons": ["long quiet or muted stretch"],
                        "riskScore": 12,
                    },
                    {
                        "id": "clip-repair",
                        "title": "2:00-3:00",
                        "sectionStartSeconds": 120,
                        "sectionEndSeconds": 180,
                        "durationSeconds": 45,
                        "snippetPath": str(baseline / "clip-repair.m4a"),
                        "listenQuestions": ["Need repair?"],
                        "reasons": ["fatigue check"],
                        "riskScore": 18,
                    },
                ],
            },
        )
        write_json(
            baseline / "manifest.json",
            {
                "baselineId": baseline_id,
                "approvalStatus": "machine-candidate-needs-human-listen-proof",
                "packageReadyForHumanListen": True,
                "branchInheritanceReady": False,
                "branchRenderReady": False,
                "outputs": {
                    "latestAudioTechnicalAuditionSnippetPack": str(pack_path),
                    "latestAudioTechnicalAuditionSnippetPackMarkdown": str(baseline / "pack.md"),
                },
            },
        )
        write_json(
            search / "technical-audition-notes-smoke.json",
            {
                "schema": "quipsly.audio-workbench.technical-audition-snippet-notes.v1",
                "baselineId": baseline_id,
                "createdFrom": str(pack_path),
                "exportedAt": "2026-07-11T00:00:00Z",
                "items": [
                    {"id": "clip-pass", "decision": "pass", "notes": "Sounds natural."},
                    {"id": "clip-proof", "decision": "needs-proof", "notes": "Check source-vs-master."},
                    {"id": "clip-repair", "decision": "needs-repair", "notes": "Gating feels too hard."},
                ],
            },
        )

        inbox = run(
            [
                "python3",
                "apps/QuipslyStudio/script/audio_workbench_technical_audition_notes_inbox.py",
                "--baseline-dir",
                str(baseline),
                "--search-dir",
                str(search),
            ],
            repo,
        )
        if inbox.returncode != 0:
            raise SystemExit(inbox.stderr or inbox.stdout)
        manifest = json.loads((baseline / "manifest.json").read_text())
        report = json.loads(Path(manifest["outputs"]["latestAudioTechnicalAuditionNotesInbox"]).read_text())
        assert report["repairActionCount"] == 1, report
        assert report["focusedProofActionCount"] == 1, report
        assert report["passContextCount"] == 1, report
        assert report["approvalStateChanged"] is False, report
        assert report["branchStateChanged"] is False, report

        queue = run(
            [
                "python3",
                "apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py",
                "--baseline-dir",
                str(baseline),
            ],
            repo,
        )
        if queue.returncode != 0:
            raise SystemExit(queue.stderr or queue.stdout)
        manifest = json.loads((baseline / "manifest.json").read_text())
        queue_report = json.loads(Path(manifest["outputs"]["latestAudioPostReviewActionQueue"]).read_text())
        assert queue_report["repairActionCount"] == 1, queue_report
        assert queue_report["focusedProofActionCount"] == 1, queue_report
        assert queue_report["passContextCount"] == 1, queue_report
        assert any(source["label"] == "Technical audition notes" for source in queue_report["sources"]), queue_report

    print(json.dumps({"passed": True, "technicalAuditionSourceCovered": True}, indent=2))


if __name__ == "__main__":
    main()
