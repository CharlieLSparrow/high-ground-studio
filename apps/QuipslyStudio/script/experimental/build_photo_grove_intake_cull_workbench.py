#!/usr/bin/env python3
"""Build a calm Photo Grove cull workbench from an intake review ledger.

The workbench is a static local review packet. It shows pending/review/keep/etc.
rows, thumbnails, source reveal commands, and dry-run decision commands. It does
not execute decisions, mutate ledgers, mutate originals, export client files,
upload, publish, schedule, or create receipt truth.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_INTAKE_LEDGER_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-intake-review-ledger.json"
LATEST_WORKBENCH_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-intake-cull-workbench.json"
SCHEMA = "quipsly.photo-grove.intake-cull-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-photo-intake-cull-workbench")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_command(parts: list[str]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_ledger(value: str) -> tuple[dict[str, Any], Path, Path]:
    if value == "latest":
        pointer = load_json(LATEST_INTAKE_LEDGER_POINTER)
        ledger_path = Path(str(pointer.get("ledgerPath") or ""))
        if not ledger_path.exists():
            raise SystemExit(f"Latest intake review ledger not found from {LATEST_INTAKE_LEDGER_POINTER}")
        return load_json(ledger_path), ledger_path, ledger_path.parent
    path = Path(value).expanduser()
    if path.is_dir():
        path = path / "review-ledger.json"
    if not path.exists():
        raise SystemExit(f"Review ledger not found: {path}")
    return load_json(path), path, path.parent


def prepare_output_dir(session_dir: Path) -> Path:
    root = session_dir / "cull-workbenches"
    root.mkdir(parents=True, exist_ok=True)
    out_dir = root / stamp()
    counter = 2
    base = out_dir
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def decision_sort_key(decision: dict[str, Any]) -> tuple[int, int, str]:
    status_order = {
        "pending": 0,
        "review": 1,
        "favorite": 2,
        "keep": 3,
        "reject": 4,
    }
    status = str(decision.get("status") or "pending")
    flags = decision.get("flags") if isinstance(decision.get("flags"), list) else []
    return (status_order.get(status, 9), -len(flags), str(decision.get("filename") or ""))


def command_set(decision: dict[str, Any], session_dir: Path) -> dict[str, str]:
    photo_id = str(decision.get("id") or decision.get("photoId") or decision.get("filename") or "")
    dry_run_base = [
        "apps/QuipslyStudio/script/agentctl.sh",
        "photo-grove-intake-cull-decision-dry-run",
        str(session_dir),
        photo_id,
    ]
    live_base = ["python3", "apps/QuipslyStudio/script/photo_grove_review_decision.py", photo_id]
    session = ["--session", str(session_dir)]
    return {
        "revealSource": f"open -R {shlex.quote(str(decision.get('sourcePath') or ''))}" if decision.get("sourcePath") else "",
        "dryRunReview": shell_command([*dry_run_base, "review", "-", "needs-human-cull", "reviewer", "Needs visual/source review before culling."]),
        "dryRunKeep": shell_command([*dry_run_base, "keep", "4", "intake-keeper", "reviewer", "Keeper after visual/source review."]),
        "dryRunFavorite": shell_command([*dry_run_base, "favorite", "5", "hero-candidate,intake-keeper", "reviewer", "Hero candidate after visual/source review."]),
        "dryRunReject": shell_command([*dry_run_base, "reject", "-", "reject-after-review", "reviewer", "Reject metadata only after visual/source review."]),
        "liveReviewTemplate": shell_command([*live_base, "review", "-", "needs-human-cull", "reviewer", "<why review is needed>", *session]),
    }


def row_from_decision(decision: dict[str, Any], index: int, session_dir: Path) -> dict[str, Any]:
    status = str(decision.get("status") or "pending")
    flags = [str(flag) for flag in (decision.get("flags") or [])]
    tags = [str(tag) for tag in (decision.get("tags") or [])]
    commands = command_set(decision, session_dir)
    return {
        "rank": index,
        "id": str(decision.get("id") or decision.get("photoId") or ""),
        "filename": str(decision.get("filename") or ""),
        "status": status,
        "rating": decision.get("rating"),
        "tags": tags,
        "flags": flags,
        "note": str(decision.get("note") or ""),
        "updatedAt": str(decision.get("updatedAt") or ""),
        "updatedBy": str(decision.get("updatedBy") or ""),
        "reviewGroupId": str(decision.get("reviewGroupId") or ""),
        "reviewGroupPosition": decision.get("reviewGroupPosition"),
        "reviewGroupSize": decision.get("reviewGroupSize"),
        "sourcePath": str(decision.get("sourcePath") or ""),
        "thumbnailUri": str(decision.get("thumbnailUri") or ""),
        "thumbnailPath": str(decision.get("thumbnailPath") or ""),
        "relativePath": str(decision.get("relativePath") or ""),
        "commands": commands,
        "humanQuestion": "Is this photo worth keeping, favoriting, reviewing later, or metadata-rejecting after visual/source review?",
        "nextSafestAction": "Open/reveal the source if needed, run a dry-run decision first, then stop unless a human approves the exact live sidecar write.",
    }


def select_rows(ledger: dict[str, Any], session_dir: Path, statuses: set[str], limit: int) -> list[dict[str, Any]]:
    decisions = ledger.get("decisions") if isinstance(ledger.get("decisions"), list) else []
    sorted_decisions = sorted(decisions, key=decision_sort_key)
    rows: list[dict[str, Any]] = []
    for decision in sorted_decisions:
        status = str(decision.get("status") or "pending")
        if statuses and status not in statuses:
            continue
        rows.append(row_from_decision(decision, len(rows) + 1, session_dir))
        if len(rows) >= limit:
            break
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["rank", "id", "filename", "status", "rating", "tags", "flags", "reviewGroupId", "sourcePath", "dryRunReview", "dryRunKeep", "dryRunFavorite", "dryRunReject"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
            writer.writerow({
                "rank": row.get("rank"),
                "id": row.get("id"),
                "filename": row.get("filename"),
                "status": row.get("status"),
                "rating": row.get("rating") if row.get("rating") is not None else "",
                "tags": ",".join(row.get("tags") or []),
                "flags": ",".join(row.get("flags") or []),
                "reviewGroupId": row.get("reviewGroupId"),
                "sourcePath": row.get("sourcePath"),
                "dryRunReview": commands.get("dryRunReview", ""),
                "dryRunKeep": commands.get("dryRunKeep", ""),
                "dryRunFavorite": commands.get("dryRunFavorite", ""),
                "dryRunReject": commands.get("dryRunReject", ""),
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove intake cull workbench",
        "",
        f"Generated: `{payload['generatedAt']}`",
        f"Ledger: `{payload['ledgerPath']}`",
        f"HTML: `{payload['htmlPath']}`",
        "",
        "This workbench prepares reversible culling decisions. It does not execute them.",
        "",
        "## Truth",
        "",
        "- Originals mutated: `false`",
        "- Ledger mutated: `false`",
        "- Client delivery created: `false`",
        "- External publishing: `false`",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## First decision rows", "", "| File | Status | Dry-run review |", "| --- | --- | --- |"])
    for row in payload.get("rows") or []:
        command = (row.get("commands") or {}).get("dryRunReview", "")
        lines.append(f"| `{row.get('filename')}` | {row.get('status')} | `{command}` |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def card_html(row: dict[str, Any]) -> str:
    commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
    flags = "".join(f"<span>{esc(flag)}</span>" for flag in row.get("flags") or [])
    tags = "".join(f"<span>{esc(tag)}</span>" for tag in row.get("tags") or [])
    image = f"<img src='{esc(row.get('thumbnailUri'))}' alt='{esc(row.get('filename'))}'>" if row.get("thumbnailUri") else "<div class='missing'>No thumbnail</div>"
    return f"""
    <article class="photo-card status-{esc(row.get('status'))}">
      {image}
      <div class="body">
        <div class="topline"><strong>{esc(row.get('status'))}</strong><span>#{esc(row.get('rank'))}</span></div>
        <h2>{esc(row.get('filename'))}</h2>
        <p>{esc(row.get('relativePath'))}</p>
        <p class="question">{esc(row.get('humanQuestion'))}</p>
        <div class="pills">{flags or '<span>no flags</span>'}</div>
        <div class="pills tags">{tags}</div>
        <details open><summary>Safe commands</summary>
          <p><b>Reveal source</b><code>{esc(commands.get('revealSource'))}</code></p>
          <p><b>Dry-run review</b><code>{esc(commands.get('dryRunReview'))}</code></p>
          <p><b>Dry-run keep</b><code>{esc(commands.get('dryRunKeep'))}</code></p>
          <p><b>Dry-run favorite</b><code>{esc(commands.get('dryRunFavorite'))}</code></p>
          <p><b>Dry-run reject</b><code>{esc(commands.get('dryRunReject'))}</code></p>
        </details>
        <p class="next">{esc(row.get('nextSafestAction'))}</p>
      </div>
    </article>
    """


def write_html(path: Path, payload: dict[str, Any]) -> None:
    rows = payload.get("rows") or []
    cards = "".join(card_html(row) for row in rows)
    counts = payload.get("counts") or {}
    status_counts = payload.get("statusCounts") or {}
    status_filters = "".join(f"<span>{esc(key)} {esc(value)}</span>" for key, value in status_counts.items())
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Photo Grove intake cull workbench</title>
<style>
:root {{ color-scheme: dark; --bg:#101811; --panel:#1b281e; --card:#243323; --ink:#f9efd8; --muted:#bfb18d; --line:#46583e; --leaf:#91d478; --honey:#edca60; --clay:#dc8665; --water:#7dd7df; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:radial-gradient(circle at 12% -8%, rgba(145,212,120,.22), transparent 34rem), linear-gradient(135deg,#101811,#19150f 70%); color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }}
main {{ max-width:1600px; margin:0 auto; padding:34px 24px 80px; }}
.hero {{ border:1px solid var(--line); border-radius:32px; padding:30px; background:rgba(27,40,30,.92); box-shadow:0 28px 100px rgba(0,0,0,.34); }}
.kicker {{ margin:0 0 10px; color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-weight:900; font-size:.75rem; }}
h1 {{ margin:0; font-size:clamp(2.2rem,5vw,5.2rem); line-height:.9; letter-spacing:-.07em; }}
.hero p {{ color:var(--muted); max-width:900px; line-height:1.65; }}
.stats,.filters {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
.stats span,.filters span {{ border:1px solid var(--line); background:#121a14; border-radius:999px; padding:8px 12px; color:var(--muted); font-weight:800; }}
.stats strong {{ color:var(--leaf); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:18px; margin-top:24px; }}
.photo-card {{ border:1px solid var(--line); border-radius:24px; overflow:hidden; background:rgba(36,51,35,.96); box-shadow:0 16px 42px rgba(0,0,0,.24); }}
.photo-card img,.missing {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:flex; align-items:center; justify-content:center; background:#0b100c; color:var(--muted); }}
.body {{ padding:15px; }}
.topline {{ display:flex; justify-content:space-between; gap:10px; align-items:center; }}
.topline strong {{ border-radius:999px; padding:5px 9px; color:#101811; background:var(--honey); text-transform:uppercase; letter-spacing:.1em; font-size:.7rem; }}
h2 {{ margin:12px 0 6px; font-size:1.1rem; overflow-wrap:anywhere; }}
p {{ color:var(--muted); overflow-wrap:anywhere; }}
.question {{ color:var(--ink); }}
.pills {{ display:flex; flex-wrap:wrap; gap:6px; min-height:22px; margin:8px 0; }}
.pills span {{ border:1px solid var(--line); border-radius:999px; padding:4px 7px; color:var(--muted); background:#111711; font-size:.72rem; }}
.tags span {{ color:var(--water); }}
details {{ margin-top:12px; border:1px solid var(--line); border-radius:16px; padding:11px; background:#111711; }}
summary {{ color:var(--honey); font-weight:900; cursor:pointer; }}
code {{ display:block; color:var(--water); margin-top:4px; font-size:.7rem; overflow-wrap:anywhere; }}
.next {{ border-top:1px solid rgba(255,255,255,.08); padding-top:10px; }}
</style>
</head>
<body><main>
<section class="hero">
  <p class="kicker">Photo Grove · cull workbench</p>
  <h1>One reversible decision at a time.</h1>
  <p>Use this packet to review intake photos, run dry-run decisions, and only later write sidecar metadata after a human/source-aware choice. This page does not execute any cull decision.</p>
  <div class="stats"><span><strong>{esc(counts.get('rows'))}</strong> rows shown</span><span><strong>{esc(counts.get('totalLedgerRows'))}</strong> ledger rows</span><span><strong>{esc(counts.get('flaggedRows'))}</strong> flagged</span></div>
  <div class="filters">{status_filters}</div>
</section>
<section class="grid">{cards}</section>
</main></body></html>
"""
    path.write_text(html_doc, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", nargs="?", default="latest", help="latest, review-ledger.json, or ledger session folder.")
    parser.add_argument("--limit", type=int, default=36)
    parser.add_argument("--statuses", default="pending,review", help="Comma-separated statuses to show. Empty means all.")
    args = parser.parse_args()

    ledger, ledger_path, session_dir = resolve_ledger(args.ledger)
    out_dir = prepare_output_dir(session_dir)
    statuses = {part.strip() for part in args.statuses.split(",") if part.strip()}
    rows = select_rows(ledger, session_dir, statuses, max(1, args.limit))
    all_decisions = ledger.get("decisions") if isinstance(ledger.get("decisions"), list) else []
    status_counts = Counter(str(decision.get("status") or "pending") for decision in all_decisions)

    json_path = out_dir / "photo-grove-intake-cull-workbench.json"
    csv_path = out_dir / "photo-grove-intake-cull-workbench.csv"
    markdown_path = out_dir / "START-HERE-photo-grove-intake-cull-workbench.md"
    html_path = out_dir / "index.html"
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-grove-intake-cull-workbench-ready",
        "ledgerPath": str(ledger_path),
        "sessionDir": str(session_dir),
        "workbenchDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "selection": {
            "statuses": sorted(statuses),
            "limit": args.limit,
        },
        "counts": {
            "rows": len(rows),
            "totalLedgerRows": len(all_decisions),
            "flaggedRows": sum(1 for row in rows if row.get("flags")),
            "dryRunCommands": sum(1 for row in rows for key, value in (row.get("commands") or {}).items() if key.startswith("dryRun") and value),
            "ledgerMutated": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "versionsOverwritten": False,
        },
        "statusCounts": dict(sorted(status_counts.items())),
        "rows": rows,
        "firstSafeAction": {
            "label": "Open Photo Grove intake cull workbench",
            "command": shell_command(["open", str(html_path)]),
            "path": str(html_path),
            "safety": "Opens local cull workbench only. No metadata decisions or original files are changed.",
        },
        "firstDryRunCommand": (rows[0].get("commands") or {}).get("dryRunReview", "") if rows else "",
        "nextSafestAction": "Open the first row, reveal source if needed, run a dry-run decision, and stop before live sidecar writes unless explicitly approved.",
        "truth": {
            "ledgerMutated": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "versionsOverwritten": False,
            "description": "Intake cull workbench only. It prepares review commands and evidence without executing cull decisions.",
        },
    }
    write_json(json_path, payload)
    write_csv(csv_path, rows)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    pointer = {key: payload[key] for key in ["schema", "generatedAt", "status", "ledgerPath", "workbenchDir", "jsonPath", "csvPath", "markdownPath", "htmlPath", "counts", "statusCounts", "firstSafeAction", "firstDryRunCommand", "nextSafestAction", "truth"]}
    write_json(LATEST_WORKBENCH_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
