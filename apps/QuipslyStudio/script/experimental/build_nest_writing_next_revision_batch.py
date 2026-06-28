#!/usr/bin/env python3
"""Build a compact Nest writing next-revision batch.

This is the small operator surface between one writing card and the full review
runway. It reads the latest Nest writing review/runway evidence, chooses a
short set of source-backed drafts that need human/agent attention, and writes a
local packet with open commands only.

It never mutates source files, replaces canon, publishes, uploads, schedules,
approves, overwrites old versions, or creates receipt truth.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_POINTER = "latest-nest-writing-next-revision-batch.json"
SCHEMA = "quipsly.nest-writing.next-revision-batch.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-nest-writing-next-revision-batch")


def shell_quote(value: str) -> str:
    return shlex.quote(str(value))


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists():
        target = load_json(target_path)
        if target:
            merged = dict(target)
            merged.update({k: v for k, v in pointer.items() if k not in {"rows", "reviewRows", "drafts"}})
            for rich_key in ["rows", "reviewRows", "revisionQueue", "sourceCheckQueue", "drafts", "sourceTasks"]:
                if rich_key in target and rich_key not in merged:
                    merged[rich_key] = target[rich_key]
            return merged
    return pointer


def file_uri(path: str) -> str:
    return "file://" + quote(path)


def first_existing_path(row: dict[str, Any]) -> str:
    for key in ["htmlPath", "markdownPath", "jsonPath", "path"]:
        value = str(row.get(key) or "")
        if value:
            return value
    return ""


def normalize_title(row: dict[str, Any], fallback: str) -> str:
    return str(row.get("title") or row.get("label") or row.get("id") or fallback or "Untitled writing task")


def path_exists(value: str) -> bool:
    return bool(value and Path(value).exists())


def row_key(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("title") or row.get("htmlPath") or row.get("markdownPath") or row.get("jsonPath") or "")


def runway_by_title(runway: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = runway.get("drafts") if isinstance(runway.get("drafts"), list) else []
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = normalize_title(row, "")
        if title:
            out[title] = row
    return out


def score_row(row: dict[str, Any], queue: str, runway_match: dict[str, Any] | None = None) -> float:
    status = str(row.get("reviewStatus") or row.get("draftStatus") or "").lower()
    source_count = int(row.get("sourceCount") or 0)
    score = 0.0
    if queue == "source-check":
        score += 50
    if queue == "revision":
        score += 40
    if "needs-human-review" in status:
        score += 20
    if "revise" in status:
        score += 12
    if "source" in status:
        score += 10
    score += min(source_count, 5) * 3
    if path_exists(first_existing_path(row)):
        score += 10
    if runway_match:
        score += 4
        if runway_match.get("receiptSlots"):
            score += 1
    return score


def collect_candidates(review: dict[str, Any], runway: dict[str, Any], limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    title_index = runway_by_title(runway)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    source_queues = [
        ("source-check", review.get("sourceCheckQueue") if isinstance(review.get("sourceCheckQueue"), list) else []),
        ("revision", review.get("revisionQueue") if isinstance(review.get("revisionQueue"), list) else []),
        ("review", review.get("reviewRows") if isinstance(review.get("reviewRows"), list) else []),
        ("review", review.get("rows") if isinstance(review.get("rows"), list) else []),
    ]
    for queue, rows in source_queues:
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            key = row_key(raw)
            if not key or key in seen:
                continue
            seen.add(key)
            title = normalize_title(raw, key)
            match = title_index.get(title) or {}
            candidates.append({
                "queue": queue,
                "row": raw,
                "runway": match,
                "score": score_row(raw, queue, match),
            })
    candidates.sort(key=lambda item: (-float(item.get("score") or 0), str(item.get("queue") or ""), normalize_title(item.get("row") or {}, "")))
    selected = candidates[:limit]
    diagnostics = {
        "candidateRows": len(candidates),
        "selectedRows": len(selected),
        "sourceCheckCandidates": sum(1 for item in candidates if item.get("queue") == "source-check"),
        "revisionCandidates": sum(1 for item in candidates if item.get("queue") == "revision"),
        "reviewCandidates": sum(1 for item in candidates if item.get("queue") == "review"),
    }
    return selected, diagnostics


def normalize_item(candidate: dict[str, Any], rank: int) -> dict[str, Any]:
    row = candidate.get("row") if isinstance(candidate.get("row"), dict) else {}
    runway = candidate.get("runway") if isinstance(candidate.get("runway"), dict) else {}
    title = normalize_title(row, f"writing-task-{rank}")
    path = first_existing_path(row) or first_existing_path(runway)
    source_count = int(row.get("sourceCount") or runway.get("sourceCount") or 0)
    review_status = str(row.get("reviewStatus") or runway.get("draftStatus") or "needs-human-review")
    platform_rows = runway.get("platformRows") if isinstance(runway.get("platformRows"), list) else []
    receipt_slots = runway.get("receiptSlots") if isinstance(runway.get("receiptSlots"), list) else []
    queue = str(candidate.get("queue") or "review")
    if queue == "source-check":
        next_step = "Rebuild or verify the source trail before treating this draft as useful."
        human_prompt = "Can the visible source trail support this draft, or should this be held until sources are rebuilt?"
    elif queue == "revision":
        next_step = "Compare draft against source trail, then prepare revision notes or a better draft preview without replacing canon."
        human_prompt = "What should change before this draft becomes a publishable candidate?"
    else:
        next_step = "Review draft against sources, then classify as revise, approve-for-human-use, hold, or split."
        human_prompt = "Is this draft useful enough to keep shaping, or should it be split/held/reworked?"
    open_command = f"open {shell_quote(path)}" if path else ""
    return {
        "rank": rank,
        "queue": queue,
        "title": title,
        "reviewStatus": review_status,
        "sourceCount": source_count,
        "platformDraftItems": len(platform_rows),
        "receiptSlots": len(receipt_slots),
        "path": path,
        "pathExists": path_exists(path),
        "pathUri": file_uri(path) if path else "",
        "openCommand": open_command,
        "htmlPath": str(row.get("htmlPath") or runway.get("htmlPath") or ""),
        "markdownPath": str(row.get("markdownPath") or runway.get("markdownPath") or ""),
        "jsonPath": str(row.get("jsonPath") or runway.get("jsonPath") or ""),
        "nextSafestAction": str(row.get("nextSafestAction") or runway.get("nextSafestAction") or next_step),
        "humanPrompt": human_prompt,
        "agentSafeWork": "Prepare source comparison notes, revision suggestions, title/platform-copy alternatives, or a draft preview. Do not mutate source, replace canon, publish, schedule, upload, approve, overwrite, or create receipts.",
        "truth": "Revision-batch row only. This is local review guidance, not approval or publication truth.",
        "score": round(float(candidate.get("score") or 0), 3),
    }


def counts_for(items: list[dict[str, Any]], diagnostics: dict[str, Any]) -> dict[str, Any]:
    return {
        "batchRows": len(items),
        "sourceCheckRows": sum(1 for row in items if row.get("queue") == "source-check"),
        "revisionRows": sum(1 for row in items if row.get("queue") == "revision"),
        "reviewRows": sum(1 for row in items if row.get("queue") == "review"),
        "sourceLinkedRows": sum(1 for row in items if int(row.get("sourceCount") or 0) > 0),
        "openableRows": sum(1 for row in items if row.get("pathExists")),
        "platformDraftItems": sum(int(row.get("platformDraftItems") or 0) for row in items),
        "receiptSlots": sum(int(row.get("receiptSlots") or 0) for row in items),
        "candidateRows": int(diagnostics.get("candidateRows") or 0),
        "externalPublishing": False,
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "versionsOverwritten": False,
        "receiptTruthCreated": False,
    }


def write_csv(path: Path, items: list[dict[str, Any]]) -> None:
    fields = [
        "rank", "queue", "title", "reviewStatus", "sourceCount", "platformDraftItems",
        "receiptSlots", "path", "pathExists", "openCommand", "nextSafestAction", "humanPrompt",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in items:
            writer.writerow({field: item.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Nest writing next revision batch",
        "",
        payload["truth"],
        "",
        f"Generated: {payload['generatedAt']}",
        f"Status: {payload['status']}",
        "",
        "## Next safest action",
        payload["nextSafestAction"],
        "",
        "## Safety",
        payload["safety"],
        "",
        "## Batch",
    ]
    for item in payload["items"]:
        lines.extend([
            "",
            f"### {item['rank']}. {item['title']}",
            f"- Queue: {item['queue']}",
            f"- Review status: {item['reviewStatus']}",
            f"- Sources visible: {item['sourceCount']}",
            f"- Platform draft items: {item['platformDraftItems']}",
            f"- Receipt slots: {item['receiptSlots']}",
            f"- Open: `{item['openCommand']}`",
            f"- Human prompt: {item['humanPrompt']}",
            f"- Next: {item['nextSafestAction']}",
        ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards = []
    for item in payload["items"]:
        queue_class = html.escape(str(item["queue"]))
        cards.append(f"""
        <section class="card {queue_class}">
          <div class="rank">{item['rank']}</div>
          <div class="body">
            <p class="queue">{html.escape(str(item['queue']).replace('-', ' '))}</p>
            <h2>{html.escape(str(item['title']))}</h2>
            <p class="status">{html.escape(str(item['reviewStatus']))}</p>
            <p>{html.escape(str(item['humanPrompt']))}</p>
            <div class="facts">
              <span>{item['sourceCount']} sources</span>
              <span>{item['platformDraftItems']} platform drafts</span>
              <span>{item['receiptSlots']} receipt slots</span>
              <span>{'openable' if item['pathExists'] else 'path missing'}</span>
            </div>
            <p class="next"><b>Next:</b> {html.escape(str(item['nextSafestAction']))}</p>
            {'<a class="button" href="' + html.escape(item['pathUri']) + '">Open evidence</a>' if item.get('pathUri') else '<span class="button disabled">No path</span>'}
            <code>{html.escape(str(item['openCommand']))}</code>
          </div>
        </section>
        """)
    c = payload["counts"]
    html_text = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Nest writing next revision batch</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f5efe3; --ink:#34291f; --leaf:#315d45; --gold:#b5822f; --clay:#985744; --cream:#fffaf0; --line:#d9c7a9; }}
    body {{ margin:0; font:16px/1.5 ui-serif, Georgia, serif; background:radial-gradient(circle at top left, #fff7df, var(--bg)); color:var(--ink); }}
    header {{ padding:42px 48px 22px; }}
    .eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-weight:800; font-size:12px; }}
    h1 {{ font-size:44px; margin:.15em 0; line-height:1.02; }}
    .truth {{ max-width:900px; color:#6b5b47; }}
    .stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }}
    .stat {{ background:rgba(255,255,255,.72); border:1px solid var(--line); border-radius:18px; padding:10px 14px; min-width:120px; }}
    .stat b {{ display:block; color:var(--leaf); font-size:24px; }}
    main {{ padding:0 48px 48px; display:grid; gap:16px; max-width:1180px; }}
    .card {{ display:grid; grid-template-columns:56px 1fr; gap:18px; background:rgba(255,250,240,.86); border:1px solid var(--line); border-left:9px solid var(--leaf); border-radius:24px; padding:20px; box-shadow:0 16px 34px rgba(63,45,24,.08); }}
    .card.source-check {{ border-left-color:var(--clay); }}
    .card.revision {{ border-left-color:var(--gold); }}
    .rank {{ width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:#e5d4b6; color:#3c2d20; font-weight:900; }}
    .queue {{ margin:0; color:var(--gold); letter-spacing:.15em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h2 {{ margin:.1em 0 .2em; font-size:24px; }}
    .status {{ color:#725f4d; margin:0 0 10px; }}
    .facts {{ display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }}
    .facts span {{ border:1px solid var(--line); border-radius:999px; padding:5px 9px; background:#fff7e8; font-size:13px; }}
    .next {{ background:#f0e3c7; padding:12px; border-radius:14px; }}
    .button {{ display:inline-block; background:var(--leaf); color:white; text-decoration:none; border-radius:999px; padding:9px 14px; font-weight:800; margin-right:10px; }}
    .button.disabled {{ background:#8b8175; }}
    code {{ display:block; margin-top:10px; white-space:pre-wrap; color:#65513d; font-size:13px; }}
    @media (prefers-color-scheme: dark) {{
      :root {{ --bg:#1f251d; --ink:#f8efd8; --cream:#2b3128; --line:#53604a; }}
      body {{ background:radial-gradient(circle at top left, #313b2d, var(--bg)); }}
      .truth,.status,code {{ color:#d8c9ad; }}
      .stat,.card {{ background:rgba(34,41,31,.88); }}
      .facts span {{ background:#2a3326; }}
      .next {{ background:#323822; }}
    }}
  </style>
</head>
<body>
<header>
  <p class="eyebrow">Quipsly Nest</p>
  <h1>Next writing revision batch</h1>
  <p class="truth">{html.escape(payload['truth'])}</p>
  <p><b>Next safest action:</b> {html.escape(payload['nextSafestAction'])}</p>
  <div class="stats">
    <div class="stat"><b>{c['batchRows']}</b><span>Batch rows</span></div>
    <div class="stat"><b>{c['sourceCheckRows']}</b><span>Source checks</span></div>
    <div class="stat"><b>{c['revisionRows']}</b><span>Revisions</span></div>
    <div class="stat"><b>{c['sourceLinkedRows']}</b><span>Source-linked</span></div>
    <div class="stat"><b>{c['platformDraftItems']}</b><span>Platform drafts</span></div>
    <div class="stat"><b>{c['receiptSlots']}</b><span>Receipt slots</span></div>
  </div>
</header>
<main>
{''.join(cards) if cards else '<p>No revision rows found. Regenerate the writing review desk and publication runway.</p>'}
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def build_batch(root: Path, limit: int) -> dict[str, Any]:
    root.mkdir(parents=True, exist_ok=True)
    out_dir = root / "NextRevisionBatches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=False)
    review = load_pointer_target(root / "latest-nest-writing-review-desk.json")
    runway = load_pointer_target(root / "latest-writing-publication-runway.json")
    candidates, diagnostics = collect_candidates(review, runway, limit)
    items = [normalize_item(candidate, idx + 1) for idx, candidate in enumerate(candidates)]
    counts = counts_for(items, diagnostics)
    json_path = out_dir / "nest-writing-next-revision-batch.json"
    md_path = out_dir / "START-HERE-nest-writing-next-revision-batch.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "nest-writing-next-revision-batch.csv"
    first = items[0] if items else {}
    next_action = (
        "Open the first writing revision card, compare draft against visible source trail, and prepare one reversible revision/source-check note without replacing canon."
        if items else
        "Regenerate Nest writing review surfaces, then choose one source-backed draft to review."
    )
    first_safe_action = {
        "label": f"Open writing revision batch ({len(items)} drafts)",
        "path": str(html_path),
        "command": f"open {shell_quote(str(html_path))}",
        "openCommand": f"open {shell_quote(str(html_path))}",
        "firstDraftTitle": first.get("title") or "",
        "firstDraftPath": first.get("path") or "",
        "safety": "Opens local Nest writing revision evidence only. No source mutation, canon replacement, publication, upload, schedule, approval, overwrite, account mutation, delete, or receipt truth.",
    }
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "nest-writing-next-revision-batch-ready" if items else "nest-writing-next-revision-batch-needs-review-desk",
        "root": str(root),
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "truth": "Local source-backed writing revision batch only. Draft usefulness, human approval, canonical manuscript state, external publication, and receipts remain separate.",
        "safety": "No originals, source files, manuscripts, accounts, schedules, uploads, publications, approvals, previous versions, or receipt truth are mutated.",
        "humanAsk": "Review the first few source-backed draft cards. Classify each as source-check, revise, hold, split, or human-ready; do not treat this packet as approval.",
        "agentSafeParallelWork": "Prepare comparison notes, revision suggestions, platform-copy alternatives, and source-gap notes. Do not write over canon or claim publication.",
        "nextSafestAction": next_action,
        "firstSafeAction": first_safe_action,
        "counts": counts,
        "diagnostics": diagnostics,
        "items": items,
        "externalPublishing": False,
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "versionsOverwritten": False,
        "receiptTruthCreated": False,
    }
    write_csv(csv_path, items)
    write_json(json_path, payload)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": "quipsly.nest-writing.latest-next-revision-batch.v1",
        "updatedAt": iso_now(),
        "status": payload["status"],
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "counts": counts,
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": first_safe_action,
        "truth": {
            "description": payload["truth"],
            "externalPublishing": False,
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "versionsOverwritten": False,
            "receiptTruthCreated": False,
            "approvalCreated": False,
            "accountMutation": False,
        },
        "itemsPreview": [
            {k: item.get(k) for k in ["rank", "queue", "title", "reviewStatus", "sourceCount", "path", "nextSafestAction"]}
            for item in items[:5]
        ],
    }
    write_json(root / LATEST_POINTER, pointer)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Nest writing next-revision batch.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    payload = build_batch(Path(args.root).expanduser(), max(1, args.limit))
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "counts": payload["counts"],
        "nextSafestAction": payload["nextSafestAction"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
