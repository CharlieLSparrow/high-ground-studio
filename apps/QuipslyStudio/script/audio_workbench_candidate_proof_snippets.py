#!/usr/bin/env python3
"""Render proof snippets for a rendered Audio Workbench candidate baseline.

Candidate baselines may inherit raw/source diagnostic snippets from their
parent, but the source-aware and mastered listen snippets must come from the
candidate render itself. This keeps review packets honest: no v006 packet should
quietly point at v005 mastered audio.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def run_checked(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-3000:] or proc.stdout[-3000:])


def safe_slug(value: str) -> str:
    keep = []
    for char in value.lower():
        if char.isalnum():
            keep.append(char)
        elif char in (" ", "-", "_"):
            keep.append("-")
    slug = "".join(keep).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "proof"


def render_m4a(*, input_path: Path, output_path: Path, start: float, duration: float) -> None:
    if output_path.exists():
        return
    output_path.parent.mkdir(parents=True, exist_ok=True)
    run_checked(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(input_path),
            "-vn",
            "-ar",
            "48000",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(output_path),
        ]
    )


def inherited_snippet_windows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    snippets = manifest.get("outputs", {}).get("proofSnippets", [])
    return [snippet for snippet in snippets if snippet.get("sequenceStartSeconds") is not None]


def build_candidate_snippets(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    source_mix = Path(outputs.get("sourceAwareMix", {}).get("path", ""))
    master_wav = Path(outputs.get("masterWav", {}).get("path", ""))
    if not source_mix.exists():
        raise FileNotFoundError(f"Candidate source-aware mix is missing: {source_mix}")
    if not master_wav.exists():
        raise FileNotFoundError(f"Candidate mastered WAV is missing: {master_wav}")

    candidate_label = manifest.get("version") or manifest.get("baselineId") or "candidate"
    output_dir = baseline_dir / f"proof-snippets-{safe_slug(str(candidate_label))}"
    candidate_snippets: list[dict[str, Any]] = []
    for inherited in inherited_snippet_windows(manifest):
        label = inherited.get("label") or "proof-window"
        start = float(inherited["sequenceStartSeconds"])
        duration = float(inherited.get("durationSeconds") or 35.0)
        suffix = f"{int(round(start))}s-{safe_slug(label)}"
        candidate_source = output_dir / f"candidate-source-aware-mix-{suffix}.m4a"
        candidate_master = output_dir / f"candidate-master-spine-{suffix}.m4a"
        render_m4a(input_path=source_mix, output_path=candidate_source, start=start, duration=duration)
        render_m4a(input_path=master_wav, output_path=candidate_master, start=start, duration=duration)
        candidate_snippets.append(
            {
                "label": label,
                "sequenceStartSeconds": start,
                "durationSeconds": duration,
                "rawAligned": inherited.get("rawAligned"),
                "rawAlignedSource": "parent baseline proof snippet",
                "sourceAwareContributionMix": str(candidate_source),
                "sourceAwareContributionMixSource": "candidate source-aware mix",
                "conformedMasterSpine": str(candidate_master),
                "conformedMasterSpineSource": "candidate mastered spine",
                "speakerSplitCharlieLeftHomerRight": inherited.get("speakerSplitCharlieLeftHomerRight"),
                "speakerSplitSource": "parent diagnostic proof snippet",
            }
        )

    manifest["outputs"]["proofSnippets"] = candidate_snippets
    manifest["outputs"]["proofSnippetGeneration"] = {
        "schema": "quipsly.audio-workbench.candidate-proof-snippets.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "outputDir": str(output_dir),
        "candidateSourceAwareMix": str(source_mix),
        "candidateMasterWav": str(master_wav),
        "windowCount": len(candidate_snippets),
        "note": "Raw aligned and speaker-split snippets may reference parent diagnostics; source-aware and mastered snippets are cut from this candidate.",
    }
    write_json(manifest_path, manifest)
    packet = {
        "schema": "quipsly.audio-workbench.candidate-proof-snippets.v1",
        "generatedAt": manifest["outputs"]["proofSnippetGeneration"]["generatedAt"],
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "outputDir": str(output_dir),
        "snippets": candidate_snippets,
    }
    write_json(output_dir / "candidate-proof-snippets.json", packet)
    markdown = [
        "# Audio Workbench candidate proof snippets",
        "",
        f"- Baseline: `{manifest.get('baselineId')}`",
        f"- Output dir: `{output_dir}`",
        "- Raw/speaker-split diagnostics may come from the parent baseline.",
        "- Source-aware and mastered snippets are cut from this candidate render.",
        "",
    ]
    for snippet in candidate_snippets:
        markdown.extend(
            [
                f"## {snippet['label']} @ {snippet['sequenceStartSeconds']}s",
                "",
                f"- Raw aligned: `{snippet.get('rawAligned')}`",
                f"- Candidate source-aware: `{snippet.get('sourceAwareContributionMix')}`",
                f"- Candidate mastered: `{snippet.get('conformedMasterSpine')}`",
                f"- Speaker split diagnostic: `{snippet.get('speakerSplitCharlieLeftHomerRight')}`",
                "",
            ]
        )
    (output_dir / "candidate-proof-snippets.md").write_text("\n".join(markdown), encoding="utf-8")
    return packet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()
    packet = build_candidate_snippets(args.baseline_dir)
    print(json.dumps({"outputDir": packet["outputDir"], "count": len(packet["snippets"])}, indent=2))


if __name__ == "__main__":
    main()
