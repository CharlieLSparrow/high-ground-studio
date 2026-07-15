#!/usr/bin/env python3
"""Render paired current-speaker/listener frames for Episode 4 reaction decisions."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decision-map", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=8)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_new_directory(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty output directory: {path}")
    path.mkdir(parents=True, exist_ok=True)


def source_at(sources: list[dict[str, Any]], family: str, time_seconds: float) -> dict[str, Any] | None:
    candidates = [
        source for source in sources
        if source.get("family") == family
        and float(source.get("start", 0)) <= time_seconds < float(source.get("end", 0))
    ]
    return max(candidates, key=lambda source: float(source.get("start", 0))) if candidates else None


def extract_frame(proxy_path: Path, source_time: float, output_path: Path) -> None:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{max(source_time, 0):.3f}", "-i", str(proxy_path),
        "-frames:v", "1",
        "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black",
        "-q:v", "2", str(output_path),
    ]
    subprocess.run(command, check=True)


def make_sheet(frame_paths: list[Path], output_path: Path) -> None:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for path in frame_paths:
        command.extend(["-i", str(path)])
    rows = len(frame_paths) // 2
    layout: list[str] = []
    for row in range(rows):
        y = "0" if row == 0 else "+".join(f"h{index * 2}" for index in range(row))
        layout.extend([f"0_{y}", f"w0_{y}"])
    command.extend([
        "-filter_complex", f"xstack=inputs={len(frame_paths)}:layout={'|'.join(layout)}:fill=black",
        "-frames:v", "1", "-q:v", "2", str(output_path),
    ])
    subprocess.run(command, check=True)


def candidate_times(item: dict[str, Any], sources: list[dict[str, Any]]) -> list[float]:
    start = float(item["startSeconds"])
    end = float(item["endSeconds"])
    alternative = str(item["alternativeFamily"])
    duration = end - start
    fractions = [0.18, 0.38, 0.62, 0.82]
    candidates: list[float] = []
    for fraction in fractions:
        target = start + duration * fraction
        if source_at(sources, alternative, target) is not None:
            candidates.append(target)
            continue
        radius = 1.0
        while radius <= min(duration / 2.0, 15.0):
            nearby = [target - radius, target + radius]
            replacement = next(
                (time for time in nearby if start < time < end and source_at(sources, alternative, time) is not None),
                None,
            )
            if replacement is not None:
                candidates.append(replacement)
                break
            radius += 1.0
    return sorted(set(round(value, 3) for value in candidates))


def main() -> int:
    args = parse_args()
    if not args.decision_map.is_file():
        raise SystemExit(f"Decision map missing: {args.decision_map}")
    ensure_new_directory(args.output_dir)
    payload = load_json(args.decision_map)
    sources = payload.get("activeSequence", {}).get("videoSources", [])
    queue = payload.get("visualReactionReviewQueue", [])[: max(args.limit, 0)]
    review_items: list[dict[str, Any]] = []

    for rank, item in enumerate(queue, start=1):
        item_dir = args.output_dir / f"{rank:02d}-{item['decisionId']}"
        item_dir.mkdir(parents=True, exist_ok=True)
        current_family = str(item["currentFamily"])
        alternative_family = str(item["alternativeFamily"])
        rows: list[dict[str, Any]] = []
        frame_paths: list[Path] = []
        for row_index, sequence_time in enumerate(candidate_times(item, sources), start=1):
            current_source = source_at(sources, current_family, sequence_time)
            alternative_source = source_at(sources, alternative_family, sequence_time)
            if current_source is None or alternative_source is None:
                continue
            current_path = Path(str(current_source.get("proxy_path") or current_source.get("proxyPath") or ""))
            alternative_path = Path(str(alternative_source.get("proxy_path") or alternative_source.get("proxyPath") or ""))
            if not current_path.is_file() or not alternative_path.is_file():
                continue
            current_frame = item_dir / f"row-{row_index:02d}-current-{current_family}.jpg"
            alternative_frame = item_dir / f"row-{row_index:02d}-alternate-{alternative_family}.jpg"
            extract_frame(current_path, sequence_time - float(current_source["start"]), current_frame)
            extract_frame(alternative_path, sequence_time - float(alternative_source["start"]), alternative_frame)
            frame_paths.extend([current_frame, alternative_frame])
            rows.append({
                "row": row_index,
                "sequenceTimeSeconds": sequence_time,
                "currentFamily": current_family,
                "currentSource": current_source.get("name"),
                "currentFramePath": str(current_frame),
                "alternativeFamily": alternative_family,
                "alternativeSource": alternative_source.get("name"),
                "alternativeFramePath": str(alternative_frame),
            })
        if not frame_paths:
            continue
        sheet_path = item_dir / "paired-reaction-contact-sheet.jpg"
        make_sheet(frame_paths, sheet_path)
        review_items.append({
            **item,
            "rank": rank,
            "contactSheetPath": str(sheet_path),
            "rows": rows,
        })

    manifest = {
        "schema": "quipsly.reaction-contact-sheet-set.v1",
        "episode": "episode-4",
        "decisionMapPath": str(args.decision_map),
        "originalMediaMutated": False,
        "proxyOnly": True,
        "sheetConvention": "Each row shows current program source on the left and alternate listener source on the right at the same sequence time.",
        "reviewItems": review_items,
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Episode 4 visual reaction review",
        "",
        "Each contact-sheet row shows the current program source on the left and the alternate listener camera on the right at the identical sequence time.",
        "",
    ]
    for item in review_items:
        lines.extend([
            f"## {item['rank']:02d}. {item['decisionId']}",
            "",
            f"- Range: {item['startSeconds']:.3f}s to {item['endSeconds']:.3f}s",
            f"- Current: {item['currentFamily']}",
            f"- Alternate: {item['alternativeFamily']}",
            f"- Contact sheet: `{item['contactSheetPath']}`",
            "",
        ])
    (args.output_dir / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "reaction-contact-sheets-ready",
        "outputDir": str(args.output_dir),
        "reviewItemCount": len(review_items),
        "contactSheets": [item["contactSheetPath"] for item in review_items],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
