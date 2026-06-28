#!/usr/bin/env python3
"""Build a Photo Grove sample cull rehearsal.

This is a training/proof artifact for the cull workflow. It marks a tiny set of
worksheet rows as `review` in a separate rehearsal sidecar so humans and agents
can see the complete shape of cull intent without judging image quality or
writing production cull truth.
"""

from __future__ import annotations

import html
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_WORKSHEET_POINTER = "latest-photo-grove-ready-cull-worksheet.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-sample-cull-rehearsal.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {}
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


def safe_limit(value: str | None, default: int = 6) -> int:
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(1, min(parsed, 24))


def rehearsal_rows(worksheet: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in (worksheet.get("rows") or [])[:limit]:
        if not isinstance(row, dict):
            continue
        rows.append(
            {
                "schema": "quipsly.photoGrove.cullDecisionDraft.v1",
                "worksheetId": str(row.get("worksheetId") or ""),
                "samplerId": str(row.get("samplerId") or ""),
                "sourcePath": str(row.get("sourcePath") or ""),
                "thumbnailPath": str(row.get("thumbnailPath") or ""),
                "sampleHash": str(row.get("sampleHash") or ""),
                "decision": "review",
                "rating": None,
                "tags": ["sample-rehearsal"],
                "notes": "Sample rehearsal only. Not a real quality judgment.",
                "reviewer": "quipsly-sample-rehearsal",
                "reviewedAt": utc_now(),
                "status": "draft-rehearsal-not-applied",
                "rehearsalOnly": True,
                "shouldApply": False,
            }
        )
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    cards = "\n".join(
        f"""
        <article class="card">
          {f'<img src="file://{html.escape(str(row.get("thumbnailPath") or ""))}" alt="">' if row.get("thumbnailPath") else '<div class="missing">No thumbnail</div>'}
          <div class="body">
            <div class="pill">review rehearsal</div>
            <h3>{html.escape(str(row.get('worksheetId') or 'sample'))}</h3>
            <p>Decision: <strong>review</strong>. This is only a workflow rehearsal, not a quality judgment.</p>
            <code>{html.escape(str(row.get('sourcePath') or ''))}</code>
          </div>
        </article>
        """
        for row in payload.get("rows") or []
    )
    path.write_text(
        f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove sample cull rehearsal</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f5efdf; --ink:#2d281f; --muted:#756b5a; --card:rgba(255,252,242,.9); --leaf:#2e6f4d; --honey:#d29a31; }}
    body {{ margin:0; color:var(--ink); font-family: ui-rounded, "Avenir Next", system-ui, sans-serif; background: radial-gradient(circle at 14% 10%, rgba(210,154,49,.22), transparent 30rem), radial-gradient(circle at 88% 16%, rgba(46,111,77,.16), transparent 28rem), var(--bg); }}
    main {{ max-width:1160px; margin:auto; padding:44px 24px; }}
    h1 {{ font-size:clamp(2.4rem,5vw,5rem); line-height:.94; margin:0; letter-spacing:-.05em; }}
    .deck {{ max-width:820px; color:var(--muted); line-height:1.65; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:28px; }}
    .card,.stat {{ background:var(--card); border:1px solid rgba(45,40,31,.12); border-radius:24px; padding:18px; box-shadow:0 18px 44px rgba(45,40,31,.08); }}
    img {{ display:block; width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:18px; background:#222; }}
    .stat strong {{ display:block; font-size:2.1rem; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; color:var(--leaf); background:rgba(46,111,77,.12); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    code {{ display:block; padding:10px; border-radius:12px; background:rgba(45,40,31,.08); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <div class="pill">{html.escape(payload['status'])}</div>
  <h1>Sample cull rehearsal</h1>
  <p class="deck">This proves the cull-intent path without making real photo judgments. Every sampled row is marked <strong>review</strong> as rehearsal-only sidecar data. Nothing is applied.</p>
  <section class="grid">
    <div class="stat"><strong>{counts['rehearsalRows']}</strong><span>rehearsal rows</span></div>
    <div class="stat"><strong>{counts['actionableDecisionRows']}</strong><span>actionable draft rows</span></div>
    <div class="stat"><strong>{counts['appliedDecisions']}</strong><span>applied decisions</span></div>
  </section>
  <section class="grid">{cards}</section>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove sample cull rehearsal",
        "",
        "This is a rehearsal-only sidecar. It proves the decision pipeline shape without judging photo quality.",
        "",
        f"- Rehearsal rows: {counts['rehearsalRows']}",
        f"- Actionable decision rows: {counts['actionableDecisionRows']}",
        f"- Applied decisions: {counts['appliedDecisions']}",
        "",
        f"- Rehearsal JSONL: `{payload['jsonlPath']}`",
        f"- Receipt preview command: `./script/agentctl.sh photo-grove-ready-cull-receipt-preview {payload['photoRoot']} {payload['jsonlPath']}`",
        "",
        "Safety: no originals, metadata, review ledger, proof selections, exports, uploads, publication state, approval, delete, or account state changed.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    limit = safe_limit(sys.argv[2] if len(sys.argv) > 2 else None)
    worksheet = latest_worksheet(photo_root)
    rows = rehearsal_rows(worksheet, limit)
    decision_counts = Counter(row["decision"] for row in rows)
    stamp = utc_stamp()
    out_dir = photo_root / "SampleCullRehearsals" / f"{stamp}-sample-cull-rehearsal"
    out_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = out_dir / "sample-cull-rehearsal-draft.jsonl"
    json_path = out_dir / "photo-grove-sample-cull-rehearsal.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-sample-cull-rehearsal.md"
    write_jsonl(jsonl_path, rows)
    counts = {
        "rehearsalRows": len(rows),
        "actionableDecisionRows": sum(1 for row in rows if row["decision"] != "unreviewed"),
        "reviewRows": decision_counts.get("review", 0),
        "appliedDecisions": 0,
        "metadataChanged": False,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    payload = {
        "schema": "quipsly.photoGrove.sampleCullRehearsal.v1",
        "status": "photo-grove-sample-cull-rehearsal-ready" if rows else "photo-grove-sample-cull-rehearsal-empty",
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "worksheetJsonPath": worksheet.get("jsonPath") or "",
        "jsonlPath": str(jsonl_path),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": counts,
        "rows": rows,
        "truth": "Sample rehearsal only. It does not mutate originals, write metadata, update the review ledger, select proofs, export, upload, publish, schedule, delete, or approve decisions.",
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
            "schema": "quipsly.photoGrove.sampleCullRehearsalPointer.v1",
            "status": payload["status"],
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
    print(json.dumps({"status": payload["status"], "jsonPath": str(json_path), "htmlPath": str(html_path), "jsonlPath": str(jsonl_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
