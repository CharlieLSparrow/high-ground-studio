#!/usr/bin/env python3
"""Smoke test the stable audio review START_HERE generator.

This guards the reviewer front-door contract without touching real Episode 4
media: START_HERE and its launcher must open the Producer Command Center before
the broader stage-control surface.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "script" / "audio_workbench_review_start_here.py"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="quipsly-start-here-smoke-") as tmp:
        base = Path(tmp)
        producer_dir = base / "producer-command-center"
        stage_dir = base / "stage-control"
        producer_dir.mkdir()
        stage_dir.mkdir()
        producer_md = producer_dir / "producer-command-center.md"
        producer_html = producer_dir / "producer-command-center.html"
        producer_command = producer_dir / "open-producer-command-center.command"
        stage_md = stage_dir / "stage-control.md"
        stage_html = stage_dir / "stage-control.html"
        stage_command = stage_dir / "open-stage-control.command"

        producer_md.write_text("# Producer Command Center\n", encoding="utf-8")
        producer_html.write_text("<h1>Producer Command Center</h1>\n", encoding="utf-8")
        producer_command.write_text("#!/bin/zsh\necho producer\n", encoding="utf-8")
        stage_md.write_text("# Stage Control\n", encoding="utf-8")
        stage_html.write_text("<h1>Stage Control</h1>\n", encoding="utf-8")
        stage_command.write_text("#!/bin/zsh\necho stage\n", encoding="utf-8")

        manifest = base / "manifest.json"
        write_json(
            manifest,
            {
                "baselineId": "episode-4-conformed-production-baseline-smoke",
                "approvalStatus": "machine-candidate-needs-human-listen-proof",
                "packageReadyForHumanListen": True,
                "branchInheritanceReady": False,
                "branchRenderReady": False,
                "outputs": {
                    "latestAudioProducerCommandCenterMarkdown": str(producer_md),
                    "latestAudioProducerCommandCenterHtml": str(producer_html),
                    "latestAudioProducerCommandCenterOpenCommand": str(producer_command),
                    "latestAudioWorkbenchStageControlSurfaceMarkdown": str(stage_md),
                    "latestAudioWorkbenchStageControlSurfaceHtml": str(stage_html),
                    "latestAudioWorkbenchStageControlSurfaceOpenCommand": str(stage_command),
                },
            },
        )

        subprocess.check_call(["python3", str(SCRIPT), "--baseline-dir", str(base)])
        updated = json.loads(manifest.read_text(encoding="utf-8"))
        outputs = updated["outputs"]
        markdown_path = Path(outputs["latestAudioReviewStartHereMarkdown"])
        command_path = Path(outputs["latestAudioReviewStartHereOpenCommand"])
        report_path = Path(outputs["latestAudioReviewStartHere"])
        markdown = markdown_path.read_text(encoding="utf-8").lower()
        command_lines = command_path.read_text(encoding="utf-8").splitlines()
        open_lines = [line for line in command_lines if line.startswith("open ")]

        assert report_path.exists()
        assert "producer command center" in markdown
        assert "stage control surface" in markdown
        assert markdown.find("producer command center") < markdown.find("stage control surface")
        assert open_lines, command_path
        assert str(producer_command) in open_lines[0], open_lines[0]
        assert updated["approvalStatus"] == "machine-candidate-needs-human-listen-proof"
        assert updated["branchInheritanceReady"] is False
        assert updated["branchRenderReady"] is False

        print("PASS audio review START_HERE smoke")
        print(json.dumps({"firstOpen": open_lines[0], "producerFirst": True}, sort_keys=True))


if __name__ == "__main__":
    main()
