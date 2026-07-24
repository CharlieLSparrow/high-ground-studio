#!/usr/bin/env python3
"""Build a compact Photo Grove next-cull batch.

This is the small, calm operator surface between a one-photo card and the full
cull theater. It reads the latest theater evidence, chooses one coherent group
of source-safe candidates, and writes a local review packet with dry-run
commands only.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-next-cull-batch.json"
SCHEMA = "quipsly.photo-grove.next-cull-batch.v1"
SUSPECT_FLAGS = {
    "blank-preview-candidate",
    "preview-all-white",
    "thumbnail-analysis-suspect",
    "preview-very-dark",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-grove-next-cull-batch")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists():
        target = load_json(target_path)
        if target:
            return {**pointer, **target}
    return pointer


def file_uri(path: str) -> str:
    return "file://" + quote(path)


def row_flags(row: dict[str, Any]) -> list[str]:
    return [str(flag) for flag in row.get("qualityFlags") or [] if str(flag)]


def row_is_suspect(row: dict[str, Any]) -> bool:
    return any(flag in SUSPECT_FLAGS for flag in row_flags(row))


def group_score(rows: list[dict[str, Any]]) -> float:
    score = 0.0
    for row in rows:
        if row.get("sourcePathExists"):
            score += 6
        if row.get("thumbnailExists"):
            score += 5
        if row_is_suspect(row):
            score -= 5
        else:
            score += 7
        if "sharpness-review-candidate" in row_flags(row):
            score += 3
        if str(row.get("route") or "").startswith("proof"):
            score += 2
    return score + min(len(rows), 12)


def choose_rows(theater_rows: list[dict[str, Any]], limit: int) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in theater_rows:
        if not isinstance(row, dict):
            continue
        group_id = str(row.get("reviewGroupId") or "ungrouped")
        groups[group_id].append(row)
    if not groups:
        return "", [], {}
    ranked = sorted(groups.items(), key=lambda item: group_score(item[1]), reverse=True)
    group_id, rows = ranked[0]
    rows = sorted(
        rows,
        key=lambda row: (
            0 if row.get("sourcePathExists") else 1,
            0 if row.get("thumbnailExists") else 1,
            1 if row_is_suspect(row) else 0,
            int(row.get("rank") or 9999),
        ),
    )[:limit]
    diagnostics = {
        "candidateGroups": len(groups),
        "selectedGroupId": group_id,
        "selectedGroupScore": round(group_score(ranked[0][1]), 3),
        "selectedGroupRows": len(ranked[0][1]),
        "topGroups": [
            {
                "groupId": gid,
                "score": round(group_score(group_rows), 3),
                "rows": len(group_rows),
                "suspectRows": sum(1 for row in group_rows if row_is_suspect(row)),
                "sourceRows": sum(1 for row in group_rows if row.get("sourcePathExists")),
                "thumbnailRows": sum(1 for row in group_rows if row.get("thumbnailExists")),
            }
            for gid, group_rows in ranked[:6]
        ],
    }
    return group_id, rows, diagnostics


def normalize_row(row: dict[str, Any], batch_rank: int) -> dict[str, Any]:
    commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
    source_path = str(row.get("sourcePath") or "")
    thumbnail_uri = str(row.get("thumbnailUri") or "")
    item = {
        "batchRank": batch_rank,
        "theaterRank": row.get("rank"),
        "photoId": row.get("photoId"),
        "filename": row.get("filename"),
        "reviewGroupId": row.get("reviewGroupId"),
        "route": row.get("route"),
        "confidence": row.get("confidence"),
        "recommendedFirstDecision": row.get("recommendedFirstDecision"),
        "reviewPrompt": row.get("reviewPrompt"),
        "safeNextAction": row.get("safeNextAction"),
        "qualityFlags": row_flags(row),
        "qualityNote": row.get("qualityNote") or "",
        "proofFit": row.get("proofFit") or "",
        "proofRoute": row.get("proofRoute") or "",
        "sourcePath": source_path,
        "sourcePathExists": bool(row.get("sourcePathExists")),
        "thumbnailUri": thumbnail_uri,
        "thumbnailExists": bool(row.get("thumbnailExists")),
        "thumbnailSuspect": row_is_suspect(row),
        "sourceCommand": str(row.get("sourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else "")),
        "dryRunCommands": {
            "recommended": str(commands.get("recommended") or commands.get("review") or ""),
            "review": str(commands.get("review") or ""),
            "keep": str(commands.get("keep") or ""),
            "favorite": str(commands.get("favorite") or ""),
            "reject": str(commands.get("reject") or ""),
        },
        "truth": "Next cull batch row only. Dry-run commands preview metadata intent without writing sidecars or changing originals.",
    }
    item["firstDryRunCommand"] = item["dryRunCommands"]["recommended"]
    return item


def build(root: Path, limit: int) -> dict[str, Any]:
    theater = load_pointer_target(root / "latest-photo-grove-cull-theater.json")
    theater_rows = theater.get("theaterRows") if isinstance(theater.get("theaterRows"), list) else []
    group_id, selected_rows, diagnostics = choose_rows(theater_rows, max(1, limit))
    rows = [normalize_row(row, index) for index, row in enumerate(selected_rows, 1)]
    suspect_rows = sum(1 for row in rows if row.get("thumbnailSuspect"))
    if suspect_rows and suspect_rows >= max(1, len(rows) // 2):
        batch_mode = "source-check"
    elif suspect_rows:
        batch_mode = "mixed-source-check"
    else:
        batch_mode = "keeper-cull"
    first_row = rows[0] if rows else {}
    truth = {
        "description": "Photo Grove next cull batch only. It reads existing cull theater evidence and writes a local review packet.",
        "originalsMutated": False,
        "metadataChanged": False,
        "sidecarDecisionsWritten": False,
        "proofSelectionChanged": False,
        "filesCopied": False,
        "filesDeleted": False,
        "externalUpload": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "versionsOverwritten": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-grove-next-cull-batch-ready" if rows else "photo-grove-next-cull-batch-needs-theater",
        "photoRoot": str(root),
        "sourceCullTheaterJson": str(theater.get("jsonPath") or ""),
        "sourceCullTheaterHtml": str(theater.get("htmlPath") or ""),
        "groupId": group_id,
        "batchMode": batch_mode,
        "humanAsk": "Review this small batch as a group. Compare thumbnails, reveal source files when needed, run dry-run commands only, and save real metadata writes for explicit approval.",
        "nextSafestAction": "Open the next cull batch, inspect the first row and group context, run a dry-run review command if useful, then stop before any live sidecar metadata write.",
        "rows": rows,
        "counts": {
            "batchRows": len(rows),
            "sourceRows": sum(1 for row in rows if row.get("sourcePathExists")),
            "thumbnailRows": sum(1 for row in rows if row.get("thumbnailExists")),
            "thumbnailSuspectRows": suspect_rows,
            "dryRunCommandRows": sum(1 for row in rows if row.get("firstDryRunCommand")),
            "originalsMutated": False,
            "metadataChanged": False,
        },
        "selectionDiagnostics": diagnostics,
        "firstDryRunCommand": str(first_row.get("firstDryRunCommand") or ""),
        "firstDryRunDecision": "review",
        "firstDryRunSafety": "Dry-run only. It previews intended metadata routing and does not write sidecars, mutate originals, copy/export/deliver/upload/publish, approve, schedule, overwrite, delete, mutate accounts, or create receipt truth.",
        "truth": truth,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove next cull batch",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Group: `{payload.get('groupId')}`",
        f"- Mode: `{payload.get('batchMode')}`",
        f"- Batch rows: `{(payload.get('counts') or {}).get('batchRows')}`",
        f"- First dry-run command: `{payload.get('firstDryRunCommand') or 'none'}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Review rhythm",
        "1. Compare this small group visually.",
        "2. Reveal source only when the thumbnail looks suspect.",
        "3. Copy or run dry-run commands to rehearse intent.",
        "4. Do not apply metadata until the human explicitly approves live writes.",
        "",
        "## Safety",
        "Dry-run review only. No originals, sidecars, metadata, proof selections, exports, deliveries, uploads, publications, schedules, overwrites, deletes, accounts, approvals, or receipts are changed.",
        "",
    ]
    for row in payload.get("rows") or []:
        lines.extend([
            f"## {row.get('batchRank')}. {row.get('filename')}",
            "",
            f"- Photo ID: `{row.get('photoId')}`",
            f"- Route: `{row.get('route')}`",
            f"- Confidence: `{row.get('confidence')}`",
            f"- Quality flags: `{', '.join(row.get('qualityFlags') or [])}`",
            f"- Prompt: {row.get('reviewPrompt') or ''}",
            f"- Reveal source: `{row.get('sourceCommand') or ''}`",
            f"- Dry-run recommended: `{row.get('firstDryRunCommand') or ''}`",
            "",
        ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    cards: list[str] = []
    for row in payload.get("rows") or []:
        thumb = str(row.get("thumbnailUri") or "")
        source_path = str(row.get("sourcePath") or "")
        source_link = file_uri(source_path) if source_path else ""
        flags = " ".join(f"<span>{html.escape(str(flag))}</span>" for flag in row.get("qualityFlags") or [])
        dry_run_commands = row.get("dryRunCommands") if isinstance(row.get("dryRunCommands"), dict) else {}
        command_buttons = "\n".join(
            f"""<button type="button" data-copy="{html.escape(str(command), quote=True)}">{html.escape(label.title())}</button>"""
            for label, command in dry_run_commands.items()
            if command
        )
        commands = html.escape(json.dumps(dry_run_commands, indent=2))
        suspect = bool(row.get("thumbnailSuspect"))
        cards.append(f"""
        <article class="card {'suspect' if suspect else 'viewable'}">
          <div class="rank">{html.escape(str(row.get('batchRank')))}</div>
          <figure>{f'<img src="{html.escape(thumb)}" alt="thumbnail">' if thumb else '<div class="missing">No thumbnail</div>'}</figure>
          <section>
            <div class="rowtop"><span class="decision">{html.escape(str(row.get('recommendedFirstDecision') or 'review')).upper()}</span><span>{'source check suggested' if suspect else 'thumbnail reviewable'}</span></div>
            <h2>{html.escape(str(row.get('filename') or 'Untitled photo'))}</h2>
            <p class="meta">Group {html.escape(str(row.get('reviewGroupId') or ''))} · {html.escape(str(row.get('route') or ''))} · {html.escape(str(row.get('confidence') or ''))}</p>
            <p>{html.escape(str(row.get('reviewPrompt') or 'Review this image.'))}</p>
            <div class="flags">{flags}</div>
            <div class="actions">
              <a href="{html.escape(source_link)}">Open source file</a>
              {command_buttons or '<span class="muted">No dry-run commands</span>'}
            </div>
            <details><summary>Dry-run commands</summary><pre>{commands}</pre></details>
          </section>
        </article>
        """)
    first_command = str(payload.get("firstDryRunCommand") or "")
    diagnostics = payload.get("selectionDiagnostics") if isinstance(payload.get("selectionDiagnostics"), dict) else {}
    top_groups = diagnostics.get("topGroups") if isinstance(diagnostics.get("topGroups"), list) else []
    top_group_cards = "\n".join(
        f"""
        <div class="group">
          <strong>{html.escape(str(group.get('groupId') or 'group'))}</strong>
          <span>{html.escape(str(group.get('rows') or 0))} rows</span>
          <span>{html.escape(str(group.get('sourceRows') or 0))} source</span>
          <span>{html.escape(str(group.get('thumbnailRows') or 0))} thumbs</span>
          <span>{html.escape(str(group.get('suspectRows') or 0))} suspect</span>
        </div>
        """
        for group in top_groups[:4]
        if isinstance(group, dict)
    )
    text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove next cull batch</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111813; --panel:#1c271f; --ink:#f7eed7; --muted:#c7b996; --leaf:#5ed087; --gold:#e7c85b; --clay:#c67b59; --line:rgba(247,238,215,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(94,208,135,.16), transparent 34%), var(--bg); color:var(--ink); }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--leaf); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,6vw,68px); line-height:.94; }}
    p {{ color:var(--muted); line-height:1.5; }}
    main {{ padding:24px clamp(14px,4vw,52px) 70px; display:grid; gap:16px; }}
    .facts {{ display:flex; flex-wrap:wrap; gap:10px; }}
    .facts span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.05); color:var(--ink); font-weight:800; }}
    .rhythm {{ display:grid; gap:12px; margin-top:18px; max-width:980px; }}
    .command {{ border:1px solid rgba(231,200,91,.22); border-radius:18px; padding:13px; background:rgba(231,200,91,.08); }}
    .command button,.actions button {{ appearance:none; border:0; border-radius:999px; padding:8px 11px; color:#07100a; background:var(--leaf); font-weight:900; cursor:pointer; }}
    .steps {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px; }}
    .steps span,.group {{ border:1px solid var(--line); border-radius:14px; padding:10px; background:rgba(255,255,255,.04); color:var(--muted); }}
    .groups {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .card {{ display:grid; grid-template-columns:50px minmax(180px,300px) 1fr; gap:16px; align-items:start; border:1px solid var(--line); border-radius:24px; padding:16px; background:rgba(28,39,31,.9); }}
    .card.suspect {{ border-color:rgba(198,123,89,.55); }}
    .rank {{ width:38px; height:38px; display:grid; place-items:center; border-radius:50%; background:rgba(94,208,135,.16); color:var(--leaf); font-weight:900; }}
    figure {{ margin:0; min-height:180px; display:grid; place-items:center; background:#080b09; border-radius:18px; overflow:hidden; border:1px solid var(--line); }}
    img {{ width:100%; height:100%; max-height:260px; object-fit:contain; }}
    h2 {{ margin:0 0 6px; }}
    .rowtop,.actions {{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }}
    .decision {{ border-radius:999px; padding:5px 8px; background:rgba(94,208,135,.14); color:var(--leaf); font-size:12px; font-weight:900; letter-spacing:.08em; }}
    .meta {{ color:var(--gold); font-weight:800; }}
    .flags {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0; }}
    .flags span {{ font-size:12px; border-radius:999px; padding:5px 8px; color:var(--ink); background:rgba(231,200,91,.12); border:1px solid rgba(231,200,91,.22); }}
    a {{ color:var(--leaf); font-weight:900; }}
    .muted {{ color:var(--muted); }}
    summary {{ cursor:pointer; color:var(--gold); font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); }}
    @media (max-width: 800px) {{ .card {{ grid-template-columns:1fr; }} .rank {{ position:absolute; }} }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove</div>
    <h1>Next cull batch: {html.escape(str(payload.get('groupId') or 'ungrouped'))}</h1>
    <p>{html.escape(str(payload.get('humanAsk') or ''))}</p>
    <div class="facts">
      <span>{html.escape(str((payload.get('counts') or {}).get('batchRows')))} photos</span>
      <span>{html.escape(str(payload.get('batchMode')))}</span>
      <span>{html.escape(str((payload.get('counts') or {}).get('thumbnailSuspectRows')))} suspect previews</span>
      <span>dry-run only</span>
    </div>
    <div class="rhythm">
      <div class="command">
        <strong>First safe rehearsal command</strong>
        <p>{html.escape(first_command or 'No dry-run command available yet.')}</p>
        {f'<button type="button" data-copy="{html.escape(first_command, quote=True)}">Copy first command</button>' if first_command else ''}
      </div>
      <div class="steps">
        <span>1. Compare this small group.</span>
        <span>2. Reveal originals only when needed.</span>
        <span>3. Copy dry-run commands to rehearse intent.</span>
        <span>4. Stop before live metadata writes.</span>
      </div>
      <div class="groups">{top_group_cards}</div>
    </div>
  </header>
  <main>{''.join(cards) or '<p>No batch rows found. Rebuild the cull theater first.</p>'}</main>
  <script>
    document.querySelectorAll('[data-copy]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        const value = button.getAttribute('data-copy') || '';
        try {{
          await navigator.clipboard.writeText(value);
          const old = button.textContent;
          button.textContent = 'Copied';
          setTimeout(() => {{ button.textContent = old; }}, 1200);
        }} catch (_error) {{
          window.prompt('Copy this dry-run command', value);
        }}
      }});
    }});
  </script>
</body>
</html>
"""
    path.write_text(text, encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    fields = ["batchRank", "photoId", "filename", "reviewGroupId", "route", "confidence", "thumbnailSuspect", "sourcePathExists", "thumbnailExists", "firstDryRunCommand", "sourceCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Photo Grove next-cull batch.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build(root, args.limit)
    out_dir = root / "NextCullBatches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "photo-grove-next-cull-batch.json"
    markdown_path = out_dir / "START-HERE-photo-grove-next-cull-batch.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "photo-grove-next-cull-batch.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Photo Grove next cull batch",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens a local batch cull packet. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, source mutation, delete, overwrite, approval, account mutation, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_csv(csv_path, payload)
    pointer_payload = {
        "schema": "quipsly.photo-grove.latest-next-cull-batch.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "groupId": payload["groupId"],
        "batchMode": payload["batchMode"],
        "selectionDiagnostics": payload["selectionDiagnostics"],
        "humanAsk": payload["humanAsk"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstDryRunCommand": payload["firstDryRunCommand"],
        "firstDryRunDecision": payload["firstDryRunDecision"],
        "firstDryRunSafety": payload["firstDryRunSafety"],
        "truth": payload["truth"],
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    print(json.dumps({
        "ok": payload["status"] == "photo-grove-next-cull-batch-ready",
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "counts": payload["counts"],
        "groupId": payload["groupId"],
        "batchMode": payload["batchMode"],
        "firstDryRunCommand": payload["firstDryRunCommand"],
    }, indent=2, sort_keys=True))
    return 0 if payload["status"] == "photo-grove-next-cull-batch-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
