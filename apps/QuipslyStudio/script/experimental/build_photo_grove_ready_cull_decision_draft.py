#!/usr/bin/env python3
"""Create a sidecar Photo Grove cull decision draft overlay.

This is the safe "I think this is keep/reject/review/favorite" layer. It reads
the current ready cull worksheet and writes a new draft JSONL without editing
the worksheet, review ledger, metadata, originals, proofs, exports, or cloud.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_WORKSHEET_POINTER = "latest-photo-grove-ready-cull-worksheet.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-ready-cull-decision-draft.json"
ALLOWED_DECISIONS = {"unreviewed", "keep", "reject", "review", "favorite"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower() or "draft"


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    target = payload.get("jsonPath")
    if target:
        target_path = Path(str(target))
        if target_path.exists() and target_path != path:
            target_payload = json.loads(target_path.read_text(encoding="utf-8"))
            if isinstance(target_payload, dict):
                return {**payload, **target_payload}
    latest = payload.get("latest")
    if latest:
        latest_path = Path(str(latest))
        if latest_path.exists():
            latest_payload = json.loads(latest_path.read_text(encoding="utf-8"))
            if isinstance(latest_payload, dict):
                return latest_payload
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def latest_worksheet(photo_root: Path) -> dict[str, Any]:
    pointer = photo_root / LATEST_WORKSHEET_POINTER
    if not pointer.exists():
        raise FileNotFoundError(f"Missing ready cull worksheet pointer: {pointer}")
    return read_json(pointer)


def normalize_tags(value: str) -> list[str]:
    tags: list[str] = []
    for raw in value.split(","):
        tag = raw.strip().lower().replace(" ", "-")
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def parse_set(values: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"--set must look like worksheetId=decision, got: {value}")
        worksheet_id, decision = value.split("=", 1)
        worksheet_id = worksheet_id.strip()
        decision = decision.strip().lower()
        if decision not in ALLOWED_DECISIONS:
            raise SystemExit(f"Invalid decision '{decision}'. Allowed: {sorted(ALLOWED_DECISIONS)}")
        if not worksheet_id:
            raise SystemExit(f"Missing worksheet id in --set {value}")
        parsed[worksheet_id] = decision
    return parsed


def parse_notes(values: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"--note must look like worksheetId=note, got: {value}")
        worksheet_id, note = value.split("=", 1)
        if not worksheet_id.strip():
            raise SystemExit(f"Missing worksheet id in --note {value}")
        parsed[worksheet_id.strip()] = note.strip()
    return parsed


def parse_ratings(values: list[str]) -> dict[str, int | None]:
    parsed: dict[str, int | None] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"--rating must look like worksheetId=1-5, got: {value}")
        worksheet_id, rating_raw = value.split("=", 1)
        worksheet_id = worksheet_id.strip()
        rating_raw = rating_raw.strip()
        if rating_raw in {"", "-", "none", "null"}:
            parsed[worksheet_id] = None
            continue
        try:
            rating = int(rating_raw)
        except ValueError as exc:
            raise SystemExit(f"Rating must be 1-5, got: {value}") from exc
        if rating < 1 or rating > 5:
            raise SystemExit(f"Rating must be 1-5, got: {value}")
        parsed[worksheet_id] = rating
    return parsed


def parse_tags(values: list[str]) -> dict[str, list[str]]:
    parsed: dict[str, list[str]] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"--tags must look like worksheetId=tag-a,tag-b, got: {value}")
        worksheet_id, tags = value.split("=", 1)
        parsed[worksheet_id.strip()] = normalize_tags(tags)
    return parsed


def draft_rows(worksheet: dict[str, Any], args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[str]]:
    sets = parse_set(args.set or [])
    notes = parse_notes(args.note or [])
    ratings = parse_ratings(args.rating or [])
    tags = parse_tags(args.tags or [])
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for row in worksheet.get("rows") or []:
        if not isinstance(row, dict):
            continue
        worksheet_id = str(row.get("worksheetId") or "")
        seen_ids.add(worksheet_id)
        decision = sets.get(worksheet_id, str(row.get("decision") or "unreviewed").lower())
        if decision not in ALLOWED_DECISIONS:
            decision = "unreviewed"
        rows.append(
            {
                "schema": "quipsly.photoGrove.cullDecisionDraft.v1",
                "worksheetId": worksheet_id,
                "samplerId": str(row.get("samplerId") or ""),
                "sourcePath": str(row.get("sourcePath") or ""),
                "sampleHash": str(row.get("sampleHash") or ""),
                "decision": decision,
                "rating": ratings.get(worksheet_id),
                "tags": tags.get(worksheet_id, []),
                "notes": notes.get(worksheet_id, ""),
                "reviewer": args.reviewer,
                "reviewedAt": utc_now() if decision != "unreviewed" or notes.get(worksheet_id) else "",
                "status": "draft-not-applied",
            }
        )
    unknown = sorted((set(sets) | set(notes) | set(ratings) | set(tags)) - seen_ids)
    return rows, unknown


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    cards = []
    for row in payload.get("actionableRows") or []:
        cards.append(
            f"""
            <article class="card">
              <div class="pill">{html.escape(str(row.get('decision') or ''))}</div>
              <h3>{html.escape(str(row.get('worksheetId') or ''))}</h3>
              <p>{html.escape(str(row.get('notes') or 'No note.'))}</p>
              <code>{html.escape(str(row.get('sourcePath') or ''))}</code>
            </article>
            """
        )
    if not cards:
        cards.append(
            """
            <article class="card">
              <div class="pill">empty</div>
              <h3>No actionable cull intent yet</h3>
              <p>This draft preserves the worksheet state and is ready for explicit keep/reject/review/favorite choices.</p>
            </article>
            """
        )
    unknown = "".join(f"<li>{html.escape(value)}</li>" for value in payload.get("unknownWorksheetIds") or [])
    path.write_text(
        f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ready cull decision draft</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f4efe3; --ink:#2b261d; --muted:#766c5c; --card:rgba(255,252,244,.9); --leaf:#2d6d4d; --honey:#d49c34; }}
    body {{ margin:0; font-family: ui-rounded, "Avenir Next", system-ui, sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 10%, rgba(212,156,52,.2), transparent 30rem), radial-gradient(circle at 88% 16%, rgba(45,109,77,.16), transparent 28rem), var(--bg); }}
    main {{ max-width:1120px; margin:auto; padding:42px 24px; }}
    h1 {{ font-size:clamp(2.3rem,5vw,4.7rem); line-height:.94; letter-spacing:-.05em; margin:0; }}
    .deck {{ max-width:760px; color:var(--muted); line-height:1.6; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; margin-top:26px; }}
    .stat,.card {{ background:var(--card); border:1px solid rgba(43,38,29,.12); border-radius:22px; padding:18px; box-shadow:0 18px 42px rgba(43,38,29,.08); }}
    .stat strong {{ display:block; font-size:2rem; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(45,109,77,.12); color:var(--leaf); text-transform:uppercase; font-weight:900; font-size:.72rem; letter-spacing:.08em; }}
    code {{ display:block; padding:10px; border-radius:12px; background:rgba(43,38,29,.08); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <div class="pill">{html.escape(payload['status'])}</div>
  <h1>Ready cull decision draft</h1>
  <p class="deck">A sidecar overlay for cull intent. It can be previewed before any review-ledger write, metadata change, proof selection, export, or cloud action.</p>
  <section class="grid">
    <div class="stat"><strong>{counts['draftRows']}</strong><span>draft rows</span></div>
    <div class="stat"><strong>{counts['actionableDecisionRows']}</strong><span>actionable</span></div>
    <div class="stat"><strong>{counts['unreviewedRows']}</strong><span>unreviewed</span></div>
    <div class="stat"><strong>{counts['unknownWorksheetIds']}</strong><span>unknown ids</span></div>
  </section>
  <h2>Actionable intent</h2>
  <section class="grid">{''.join(cards)}</section>
  <h2>Unknown worksheet IDs</h2>
  <ul>{unknown or '<li>None.</li>'}</ul>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove ready cull decision draft",
        "",
        f"Status: {payload['status']}",
        "",
        "This is a sidecar draft. It does not apply cull truth.",
        "",
        "## Counts",
        f"- Draft rows: {counts['draftRows']}",
        f"- Actionable decisions: {counts['actionableDecisionRows']}",
        f"- Unreviewed rows: {counts['unreviewedRows']}",
        f"- Unknown worksheet IDs: {counts['unknownWorksheetIds']}",
        "",
        "## Files",
        f"- Draft JSONL: `{payload['jsonlPath']}`",
        f"- Preview command: `./script/agentctl.sh photo-grove-ready-cull-receipt-preview {payload['photoRoot']} {payload['jsonlPath']}`",
        "",
        "## Safety",
        "- Originals mutated: false",
        "- Metadata changed: false",
        "- Review ledger changed: false",
        "- External publishing/uploading: false",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--set", action="append", default=[], help="Set cull intent: worksheetId=keep|reject|review|favorite|unreviewed")
    parser.add_argument("--note", action="append", default=[], help="Add draft note: worksheetId=note")
    parser.add_argument("--rating", action="append", default=[], help="Add draft rating: worksheetId=1-5")
    parser.add_argument("--tags", action="append", default=[], help="Add draft tags: worksheetId=tag-a,tag-b")
    parser.add_argument("--reviewer", default="agent", help="Reviewer label for draft intent.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    photo_root = Path(args.photo_root)
    worksheet = latest_worksheet(photo_root)
    rows, unknown_ids = draft_rows(worksheet, args)
    decision_counts = Counter(row["decision"] for row in rows)
    actionable_rows = [row for row in rows if row["decision"] != "unreviewed"]
    status = "photo-grove-ready-cull-decision-draft-ready" if actionable_rows and not unknown_ids else "photo-grove-ready-cull-decision-draft-empty"
    if unknown_ids:
        status = "photo-grove-ready-cull-decision-draft-needs-attention"
    stamp = utc_stamp()
    out_dir = photo_root / "ReadyCullDecisionDrafts" / f"{stamp}-{safe_slug(args.reviewer)}-decision-draft"
    out_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = out_dir / "ready-cull-decision-draft.jsonl"
    json_path = out_dir / "photo-grove-ready-cull-decision-draft.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-ready-cull-decision-draft.md"
    write_jsonl(jsonl_path, rows)
    counts = {
        "draftRows": len(rows),
        "actionableDecisionRows": len(actionable_rows),
        "unreviewedRows": decision_counts.get("unreviewed", 0),
        "unknownWorksheetIds": len(unknown_ids),
        "appliedDecisions": 0,
        "metadataChanged": False,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    payload = {
        "schema": "quipsly.photoGrove.readyCullDecisionDraft.v1",
        "status": status,
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "worksheetJsonPath": worksheet.get("jsonPath") or "",
        "jsonlPath": str(jsonl_path),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "reviewer": args.reviewer,
        "decisionCounts": dict(sorted(decision_counts.items())),
        "counts": counts,
        "actionableRows": actionable_rows,
        "unknownWorksheetIds": unknown_ids,
        "truth": "Sidecar draft only. It does not mutate originals, write metadata, update the review ledger, select proofs, export, upload, publish, schedule, delete, or approve decisions.",
        "originalsMutated": False,
        "metadataChanged": False,
        "reviewLedgerChanged": False,
        "externalPublishing": False,
    }
    write_json(json_path, payload)
    write_html(html_path, payload)
    write_markdown(markdown_path, payload)
    write_json(
        photo_root / LATEST_OUTPUT_POINTER,
        {
            "schema": "quipsly.photoGrove.readyCullDecisionDraftPointer.v1",
            "status": status,
            "jsonPath": str(json_path),
            "htmlPath": str(html_path),
            "markdownPath": str(markdown_path),
            "jsonlPath": str(jsonl_path),
            "counts": counts,
            "originalsMutated": False,
            "metadataChanged": False,
            "reviewLedgerChanged": False,
            "externalPublishing": False,
        },
    )
    print(json.dumps({"status": status, "jsonPath": str(json_path), "htmlPath": str(html_path), "jsonlPath": str(jsonl_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
