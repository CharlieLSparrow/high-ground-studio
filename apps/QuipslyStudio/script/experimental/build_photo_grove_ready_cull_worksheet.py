#!/usr/bin/env python3
"""Build a Photo Grove cull worksheet from the ready-folder sampler.

The worksheet is a sidecar artifact for human/agent review. It does not mark
photos keep/reject/review by itself; it creates an inspectable structure that
future decision receipts can consume.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_SAMPLER_POINTER = "latest-photo-grove-ready-folder-sampler.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-ready-cull-worksheet.json"
DECISIONS = ["unreviewed", "keep", "reject", "review", "favorite"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    if payload.get("jsonPath"):
        target = Path(str(payload["jsonPath"]))
        if target.exists() and target != path:
            target_payload = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(target_payload, dict):
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def latest_sampler(photo_root: Path) -> dict[str, Any]:
    pointer = photo_root / LATEST_SAMPLER_POINTER
    if not pointer.exists():
        raise FileNotFoundError(f"Missing ready-folder sampler pointer: {pointer}")
    return read_json(pointer)


def attention_prompts(row: dict[str, Any]) -> list[str]:
    prompts = ["focus", "expression/moment", "exposure", "composition/crop", "duplicate/near-duplicate"]
    extension = str(row.get("extension") or "").lower()
    if extension in {".cr3", ".cr2", ".dng", ".nef", ".arw"}:
        prompts.append("raw edit potential")
    width = int(row.get("pixelWidth") or 0)
    height = int(row.get("pixelHeight") or 0)
    if width and height:
        orientation = "portrait" if height > width else "landscape" if width > height else "square"
        prompts.append(f"{orientation} output fit")
    return prompts


def worksheet_rows(sampler: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(sampler.get("rows") or [], start=1):
        if not isinstance(row, dict):
            continue
        rows.append(
            {
                "worksheetId": f"ready-cull-{index:04d}",
                "samplerId": row.get("id") or f"sample-{index:04d}",
                "folder": row.get("folder") or "",
                "filename": row.get("filename") or "",
                "sourcePath": row.get("sourcePath") or "",
                "thumbnailPath": row.get("thumbnailPath") or "",
                "sampleHash": row.get("sampleHash") or "",
                "pixelWidth": row.get("pixelWidth") or 0,
                "pixelHeight": row.get("pixelHeight") or 0,
                "decision": "unreviewed",
                "rating": "",
                "tags": "",
                "clientProof": "",
                "storyUse": "",
                "notes": "",
                "reviewer": "",
                "reviewedAt": "",
                "allowedDecisions": DECISIONS,
                "attentionPrompts": attention_prompts(row),
                "safety": "sidecar-only",
            }
        )
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "worksheetId",
                "samplerId",
                "folder",
                "filename",
                "sourcePath",
                "thumbnailPath",
                "sampleHash",
                "pixelWidth",
                "pixelHeight",
                "decision",
                "rating",
                "tags",
                "clientProof",
                "storyUse",
                "notes",
                "reviewer",
                "reviewedAt",
                "attentionPrompts",
            ],
        )
        writer.writeheader()
        for row in rows:
            output = {key: row.get(key, "") for key in writer.fieldnames or []}
            output["attentionPrompts"] = "; ".join(row.get("attentionPrompts") or [])
            writer.writerow(output)


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(
                json.dumps(
                    {
                        "schema": "quipsly.photoGrove.cullDecisionDraft.v1",
                        "worksheetId": row["worksheetId"],
                        "samplerId": row["samplerId"],
                        "sourcePath": row["sourcePath"],
                        "sampleHash": row["sampleHash"],
                        "decision": "unreviewed",
                        "rating": None,
                        "tags": [],
                        "notes": "",
                        "reviewer": "",
                        "reviewedAt": "",
                        "status": "draft-not-applied",
                    },
                    sort_keys=True,
                )
                + "\n"
            )


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove Ready Cull Worksheet",
        "",
        "This worksheet turns the ready-folder sampler into a structured culling surface.",
        "",
        "It is sidecar-only. Editing this worksheet does not mutate originals or apply decisions until a later receipt/import step explicitly consumes it.",
        "",
        "## Current truth",
        "",
        f"- Worksheet rows: {counts['worksheetRows']}",
        f"- Unreviewed rows: {counts['unreviewedRows']}",
        f"- Thumbnails present: {counts['thumbnailsPresent']}",
        f"- Quarantined folders excluded: {counts['quarantinedFoldersExcluded']}",
        f"- Originals mutated: {counts['originalsMutated']}",
        f"- External publishing: {counts['externalPublishing']}",
        "",
        "## Files",
        "",
        f"- HTML worksheet: `{payload['htmlPath']}`",
        f"- CSV worksheet: `{payload['csvPath']}`",
        f"- Draft JSONL decisions: `{payload['jsonlPath']}`",
        "",
        "## Suggested decision vocabulary",
        "",
        "- `keep`: strong candidate for proof/export.",
        "- `reject`: obvious miss, not deleted.",
        "- `review`: uncertain, ask a human.",
        "- `favorite`: standout image.",
        "- `unreviewed`: default.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    cards: list[str] = []
    for row in payload.get("rows") or []:
        thumbnail = str(row.get("thumbnailPath") or "")
        image = f'<img src="file://{html.escape(thumbnail)}" alt="">' if thumbnail else '<div class="missing">No thumbnail</div>'
        prompts = "".join(f"<span>{html.escape(prompt)}</span>" for prompt in row.get("attentionPrompts") or [])
        cards.append(
            f"""
<article class="photo-card">
  {image}
  <div class="body">
    <p class="eyebrow">{html.escape(str(row.get('folder') or ''))}</p>
    <h3>{html.escape(str(row.get('filename') or ''))}</h3>
    <p>{row.get('pixelWidth', 0)} x {row.get('pixelHeight', 0)} · decision: <strong>unreviewed</strong></p>
    <div class="buttons">
      <button>Keep</button><button>Reject</button><button>Review</button><button>Favorite</button>
    </div>
    <p class="hint">Buttons are visual affordances for now. Decisions stay sidecar-only until receipt import exists.</p>
    <div class="prompts">{prompts}</div>
    <p><code>{html.escape(str(row.get('sourcePath') or ''))}</code></p>
  </div>
</article>
"""
        )
    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove Ready Cull Worksheet</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background: #efe7d6; color: #233125; }}
    main {{ max-width: 1280px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{ background: #fffaf0; border: 1px solid #d7c39d; border-radius: 30px; padding: 30px; box-shadow: 0 18px 44px rgba(55, 40, 20, .10); }}
    h1 {{ margin: 0 0 10px; font-family: Georgia, serif; font-size: 42px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 24px 0; }}
    .metric {{ font-size: 30px; font-weight: 800; }}
    .label, .eyebrow {{ color: #69745f; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }}
    .photos {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; margin-top: 24px; }}
    .photo-card {{ background: #fffaf0; border: 1px solid #d7c39d; border-radius: 22px; overflow: hidden; box-shadow: 0 12px 30px rgba(55, 40, 20, .08); }}
    .photo-card img, .missing {{ width: 100%; height: 220px; object-fit: cover; display: block; background: #d8c8a9; }}
    .body {{ padding: 16px; }}
    .buttons {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }}
    button {{ border: 0; border-radius: 999px; padding: 7px 11px; background: #31442f; color: #fff8e8; font-weight: 700; }}
    .hint {{ color: #786b58; font-size: 12px; }}
    .prompts {{ display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }}
    .prompts span {{ border-radius: 999px; padding: 4px 8px; background: #dce9d0; color: #2d4f32; font-size: 12px; }}
    code {{ font-size: 11px; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="label">Photo Grove</p>
    <h1>Ready Cull Worksheet</h1>
    <p>Review samples from completed backup folders only. No original media is changed.</p>
    <div class="grid">
      <div><div class="metric">{counts['worksheetRows']}</div><div class="label">worksheet rows</div></div>
      <div><div class="metric">{counts['thumbnailsPresent']}</div><div class="label">thumbnails</div></div>
      <div><div class="metric">{counts['quarantinedFoldersExcluded']}</div><div class="label">excluded folders</div></div>
      <div><div class="metric">0</div><div class="label">applied decisions</div></div>
    </div>
    <p><strong>Draft decision JSONL:</strong> <code>{html.escape(str(payload['jsonlPath']))}</code></p>
  </section>
  <section class="photos">
    {''.join(cards)}
  </section>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def build(photo_root: Path) -> dict[str, Any]:
    sampler = latest_sampler(photo_root)
    rows = worksheet_rows(sampler)
    stamp = utc_stamp()
    out_dir = photo_root / "ReadyCullWorksheets" / f"{stamp}-ready-cull-worksheet"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "quipsly.photoGrove.readyCullWorksheet.v1",
        "status": "photo-grove-ready-cull-worksheet-ready",
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "sourceSamplerJsonPath": str(sampler.get("jsonPath") or ""),
        "outputDir": str(out_dir),
        "jsonPath": str(out_dir / "photo-grove-ready-cull-worksheet.json"),
        "htmlPath": str(out_dir / "index.html"),
        "markdownPath": str(out_dir / "START-HERE-ready-cull-worksheet.md"),
        "csvPath": str(out_dir / "ready-cull-worksheet.csv"),
        "jsonlPath": str(out_dir / "draft-cull-decisions.jsonl"),
        "counts": {
            "worksheetRows": len(rows),
            "unreviewedRows": len(rows),
            "thumbnailsPresent": sum(1 for row in rows if row.get("thumbnailPath")),
            "quarantinedFoldersExcluded": int((sampler.get("counts") or {}).get("quarantinedFolders") or 0),
            "appliedDecisions": 0,
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
        },
        "rows": rows,
        "safety": {
            "mutatesOriginals": False,
            "writesBesideSources": False,
            "changesMetadata": False,
            "publishesExternally": False,
            "appliesDecisions": False,
        },
    }
    write_csv(Path(payload["csvPath"]), rows)
    write_jsonl(Path(payload["jsonlPath"]), rows)
    write_markdown(Path(payload["markdownPath"]), payload)
    write_html(Path(payload["htmlPath"]), payload)
    write_json(Path(payload["jsonPath"]), payload)
    write_json(
        photo_root / LATEST_OUTPUT_POINTER,
        {
            "schema": "quipsly.photoGrove.readyCullWorksheetPointer.v1",
            "status": payload["status"],
            "generatedAt": payload["generatedAt"],
            "jsonPath": payload["jsonPath"],
            "htmlPath": payload["htmlPath"],
            "markdownPath": payload["markdownPath"],
            "csvPath": payload["csvPath"],
            "jsonlPath": payload["jsonlPath"],
            "counts": payload["counts"],
        },
    )
    return payload


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    try:
        payload = build(photo_root)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "photo-grove-ready-cull-worksheet-failed", "error": str(exc)}, indent=2))
        return 1
    print(
        json.dumps(
            {
                "status": payload["status"],
                "jsonPath": payload["jsonPath"],
                "htmlPath": payload["htmlPath"],
                "markdownPath": payload["markdownPath"],
                "csvPath": payload["csvPath"],
                "jsonlPath": payload["jsonlPath"],
                "counts": payload["counts"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
