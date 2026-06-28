#!/usr/bin/env python3
"""Preview ready-cull decisions before any Photo Grove ledger write.

This consumes the draft JSONL from the ready cull worksheet and creates a
receipt preview. It intentionally does not update the review ledger, metadata,
original files, proof selections, exports, delivery state, or cloud state.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_WORKSHEET_POINTER = "latest-photo-grove-ready-cull-worksheet.json"
LATEST_DRAFT_POINTER = "latest-photo-grove-ready-cull-decision-draft.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-ready-cull-receipt-preview.json"
ALLOWED_DECISIONS = {"unreviewed", "keep", "reject", "review", "favorite"}
ACTIONABLE_DECISIONS = ALLOWED_DECISIONS - {"unreviewed"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


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


def latest_draft(photo_root: Path) -> dict[str, Any]:
    pointer = photo_root / LATEST_DRAFT_POINTER
    if not pointer.exists():
        return {}
    return read_json(pointer)


def normalize_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_values = value
    elif isinstance(value, str):
        raw_values = value.split(",")
    else:
        raw_values = []
    tags: list[str] = []
    for raw in raw_values:
        tag = str(raw).strip().lower().replace(" ", "-")
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def normalize_rating(value: Any) -> int | None:
    if value in (None, "", "-", "none", "null"):
        return None
    try:
        rating = int(value)
    except (TypeError, ValueError):
        return None
    if 1 <= rating <= 5:
        return rating
    return None


def load_decisions(jsonl_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    decisions: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    if not jsonl_path.exists():
        return [], [{"line": 0, "error": f"Missing decision JSONL: {jsonl_path}"}]
    with jsonl_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
            except json.JSONDecodeError as exc:
                errors.append({"line": line_number, "error": str(exc), "raw": stripped[:240]})
                continue
            if not isinstance(row, dict):
                errors.append({"line": line_number, "error": "Decision row is not an object."})
                continue
            decision = str(row.get("decision") or "unreviewed").strip().lower()
            source_path = str(row.get("sourcePath") or "")
            normalized = {
                "line": line_number,
                "worksheetId": str(row.get("worksheetId") or ""),
                "samplerId": str(row.get("samplerId") or ""),
                "sourcePath": source_path,
                "sampleHash": str(row.get("sampleHash") or ""),
                "decision": decision,
                "rating": normalize_rating(row.get("rating")),
                "tags": normalize_tags(row.get("tags")),
                "notes": str(row.get("notes") or row.get("note") or ""),
                "reviewer": str(row.get("reviewer") or ""),
                "reviewedAt": str(row.get("reviewedAt") or ""),
                "sourceExists": bool(source_path and Path(source_path).exists()),
                "status": str(row.get("status") or "draft-not-applied"),
            }
            if decision not in ALLOWED_DECISIONS:
                errors.append(
                    {
                        "line": line_number,
                        "worksheetId": normalized["worksheetId"],
                        "error": f"Invalid decision '{decision}'. Allowed: {sorted(ALLOWED_DECISIONS)}",
                    }
                )
            decisions.append(normalized)
    return decisions, errors


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "line",
                "worksheetId",
                "samplerId",
                "sourcePath",
                "decision",
                "rating",
                "tags",
                "notes",
                "reviewer",
                "reviewedAt",
                "sourceExists",
                "status",
            ],
        )
        writer.writeheader()
        for row in rows:
            output = {key: row.get(key, "") for key in writer.fieldnames or []}
            output["tags"] = ", ".join(row.get("tags") or [])
            writer.writerow(output)


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove ready cull receipt preview",
        "",
        "This previews sidecar cull decisions before any review-ledger write.",
        "",
        "## Current truth",
        "",
        f"- Status: {payload['status']}",
        f"- Decision rows: {counts['decisionRows']}",
        f"- Actionable decisions: {counts['actionableDecisionRows']}",
        f"- Unreviewed rows: {counts['unreviewedRows']}",
        f"- Invalid rows: {counts['invalidRows']}",
        f"- Missing source rows: {counts['missingSourceRows']}",
        f"- Applied decisions: {counts['appliedDecisions']}",
        "",
        "## Decision counts",
        "",
    ]
    for decision, value in sorted((payload.get("decisionCounts") or {}).items()):
        lines.append(f"- {decision}: {value}")
    lines += [
        "",
        "## Files",
        "",
        f"- HTML: `{payload['htmlPath']}`",
        f"- CSV: `{payload['csvPath']}`",
        f"- JSON: `{payload['jsonPath']}`",
        "",
        "## Safety",
        "",
        "- Originals mutated: `false`",
        "- Metadata changed: `false`",
        "- Review ledger changed: `false`",
        "- External publishing/uploading: `false`",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    rows = payload.get("actionableRows") or payload.get("previewRows") or []
    cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(str(row.get('decision') or 'unreviewed'))}</div>
          <h3>{html.escape(str(row.get('worksheetId') or 'decision'))}</h3>
          <p>{html.escape(str(row.get('notes') or 'No note yet.'))}</p>
          <code>{html.escape(str(row.get('sourcePath') or ''))}</code>
        </article>
        """
        for row in rows[:48]
    )
    if not cards:
        cards = '<article class="card"><div class="pill">empty</div><h3>No actionable decisions yet</h3><p>Edit the draft JSONL sidecar or worksheet first, then regenerate this preview.</p></article>'
    error_rows = "\n".join(
        f"<li>line {html.escape(str(error.get('line') or ''))}: {html.escape(str(error.get('error') or 'unknown error'))}</li>"
        for error in payload.get("errors") or []
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ready cull receipt preview</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f3efe4; --ink:#2c271e; --muted:#736b5d; --card:rgba(255,252,244,.9); --leaf:#2e6d4d; --honey:#d29a32; --clay:#a64e3d; }}
    body {{ margin:0; font-family: ui-rounded, "Avenir Next", system-ui, sans-serif; background: radial-gradient(circle at 15% 12%, rgba(210,154,50,.22), transparent 30rem), radial-gradient(circle at 86% 18%, rgba(46,109,77,.16), transparent 28rem), var(--bg); color:var(--ink); }}
    main {{ max-width:1180px; margin:auto; padding:42px 24px; }}
    h1 {{ font-size:clamp(2.3rem,5vw,4.8rem); line-height:.94; margin:0; letter-spacing:-.05em; }}
    .deck {{ max-width:780px; color:var(--muted); line-height:1.6; }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin-top:26px; }}
    .stat,.card {{ background:var(--card); border:1px solid rgba(44,39,30,.12); border-radius:22px; padding:18px; box-shadow:0 18px 42px rgba(44,39,30,.08); }}
    .stat strong {{ display:block; font-size:2rem; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(46,109,77,.12); color:var(--leaf); font-size:.72rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
    code {{ display:block; padding:10px; border-radius:12px; background:rgba(44,39,30,.08); overflow-wrap:anywhere; }}
    li {{ margin:.35rem 0; }}
  </style>
</head>
<body>
<main>
  <div class="pill">{html.escape(payload['status'])}</div>
  <h1>Ready cull receipt preview</h1>
  <p class="deck">Validate worksheet decisions before Photo Grove writes any review-ledger metadata. This is the checkpoint between intent and receipt truth.</p>
  <section class="stats">
    <div class="stat"><strong>{counts['decisionRows']}</strong><span>decision rows</span></div>
    <div class="stat"><strong>{counts['actionableDecisionRows']}</strong><span>actionable</span></div>
    <div class="stat"><strong>{counts['unreviewedRows']}</strong><span>unreviewed</span></div>
    <div class="stat"><strong>{counts['invalidRows']}</strong><span>invalid</span></div>
  </section>
  <h2>Actionable preview</h2>
  <section class="grid">{cards}</section>
  <h2>Validation errors</h2>
  <ul>{error_rows or '<li>None.</li>'}</ul>
</main>
</body>
</html>
"""


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    worksheet = latest_worksheet(photo_root)
    explicit_jsonl = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    draft = latest_draft(photo_root)
    jsonl_path = explicit_jsonl or Path(str(draft.get("jsonlPath") or worksheet.get("jsonlPath") or ""))
    decisions, errors = load_decisions(jsonl_path)
    decision_counts = Counter(row["decision"] for row in decisions)
    actionable_rows = [row for row in decisions if row["decision"] in ACTIONABLE_DECISIONS]
    missing_source_rows = [row for row in decisions if row["decision"] in ACTIONABLE_DECISIONS and not row["sourceExists"]]
    invalid_rows = [error for error in errors if error.get("line")]
    if invalid_rows or missing_source_rows:
        status = "photo-grove-ready-cull-receipt-preview-needs-attention"
    elif actionable_rows:
        status = "photo-grove-ready-cull-receipt-preview-ready"
    else:
        status = "photo-grove-ready-cull-receipt-preview-empty"

    stamp = utc_stamp()
    out_dir = photo_root / "ReadyCullReceiptPreviews" / f"{stamp}-ready-cull-receipt-preview"
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "decisionRows": len(decisions),
        "actionableDecisionRows": len(actionable_rows),
        "unreviewedRows": decision_counts.get("unreviewed", 0),
        "invalidRows": len(invalid_rows),
        "missingSourceRows": len(missing_source_rows),
        "appliedDecisions": 0,
        "metadataChanged": False,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    payload: dict[str, Any] = {
        "schema": "quipsly.photoGrove.readyCullReceiptPreview.v1",
        "status": status,
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "worksheetJsonPath": worksheet.get("jsonPath") or "",
        "draftJsonPath": draft.get("jsonPath") or "",
        "worksheetJsonlPath": str(jsonl_path),
        "decisionCounts": dict(sorted(decision_counts.items())),
        "counts": counts,
        "actionableRows": actionable_rows,
        "previewRows": decisions[:48],
        "errors": errors + [
            {
                "line": row["line"],
                "worksheetId": row["worksheetId"],
                "error": "Actionable decision source path is missing on disk.",
                "sourcePath": row["sourcePath"],
            }
            for row in missing_source_rows
        ],
        "truth": "Receipt preview only. It validates sidecar decisions before a ledger write; it does not mutate originals, write metadata, update the review ledger, create proof selections, export, upload, publish, schedule, delete, or approve decisions.",
        "originalsMutated": False,
        "metadataChanged": False,
        "reviewLedgerChanged": False,
        "externalPublishing": False,
    }
    json_path = out_dir / "photo-grove-ready-cull-receipt-preview.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-ready-cull-receipt-preview.md"
    csv_path = out_dir / "ready-cull-receipt-preview.csv"
    payload.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path), "csvPath": str(csv_path)})
    write_json(json_path, payload)
    html_path.write_text(write_html(html_path, payload), encoding="utf-8")
    write_markdown(markdown_path, payload)
    write_csv(csv_path, decisions)
    write_json(
        photo_root / LATEST_OUTPUT_POINTER,
        {
            "schema": "quipsly.photoGrove.readyCullReceiptPreviewPointer.v1",
            "status": status,
            "jsonPath": str(json_path),
            "htmlPath": str(html_path),
            "markdownPath": str(markdown_path),
            "csvPath": str(csv_path),
            "counts": counts,
            "originalsMutated": False,
            "metadataChanged": False,
            "reviewLedgerChanged": False,
            "externalPublishing": False,
        },
    )
    print(json.dumps({"status": status, "jsonPath": str(json_path), "htmlPath": str(html_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
