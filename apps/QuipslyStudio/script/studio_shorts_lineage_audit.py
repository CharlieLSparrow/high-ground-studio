#!/usr/bin/env python3
"""Audit whether exported shorts can be traced back to whole-source edit truth.

Playable local shorts are useful, but they are not enough for Quipsly's editor
model. A real short should be traceable back to a source episode, sequence
range, source range, and recipe identity so humans and agents can repair it
without treating the rendered file as the new source of truth.

This audit is read-only. It does not infer hidden ranges, mutate timeline
metadata, overwrite exports, publish anything, or create receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_THEATER_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-theater"
    / "quipsly-studio-recommended-shorts-review-theater.json"
)
DEFAULT_RECIPE_REPAIR_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recipe-repair-queue"
    / "quipsly-studio-shorts-recipe-repair-queue.json"
)
DEFAULT_COMMAND_ROOM_JSON = DEFAULT_ROOT / "shorts-command-room" / "quipsly-studio-shorts-command-room.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "lineage-audit"
DEFAULT_BASENAME = "quipsly-studio-shorts-lineage-audit"
SCHEMA = "quipsly.studio.shorts-lineage-audit.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def as_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out and out not in {float("inf"), float("-inf")} else None


def nested_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_value(source: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in source and source[key] not in (None, ""):
            return source[key]
    return None


def range_from(source: dict[str, Any]) -> dict[str, Any]:
    """Normalize the most common sequence/source range shapes into one object."""
    source_range = nested_dict(source.get("sourceRange"))
    timeline_range = nested_dict(source.get("timelineRange"))
    sequence_range = nested_dict(source.get("sequenceRange"))
    recipe = nested_dict(source.get("recipe"))
    short_recipe = nested_dict(source.get("shortRecipe"))

    sequence_start = first_value(source, ("sequenceStart", "sequenceStartSeconds", "sequenceStartTime", "startTime"))
    sequence_end = first_value(source, ("sequenceEnd", "sequenceEndSeconds", "sequenceEndTime", "endTime"))
    source_start = first_value(source, ("sourceStart", "sourceStartSeconds", "sourceStartTime", "mediaStart"))
    source_end = first_value(source, ("sourceEnd", "sourceEndSeconds", "sourceEndTime", "mediaEnd"))

    if sequence_start is None:
        sequence_start = first_value(timeline_range, ("start", "startSeconds", "sequenceStart", "sequenceStartSeconds"))
    if sequence_end is None:
        sequence_end = first_value(timeline_range, ("end", "endSeconds", "sequenceEnd", "sequenceEndSeconds"))
    if sequence_start is None:
        sequence_start = first_value(sequence_range, ("start", "startSeconds"))
    if sequence_end is None:
        sequence_end = first_value(sequence_range, ("end", "endSeconds"))
    if source_start is None:
        source_start = first_value(source_range, ("start", "startSeconds", "sourceStart", "sourceStartSeconds"))
    if source_end is None:
        source_end = first_value(source_range, ("end", "endSeconds", "sourceEnd", "sourceEndSeconds"))

    for candidate in (recipe, short_recipe):
        if sequence_start is None:
            sequence_start = first_value(candidate, ("sequenceStart", "sequenceStartSeconds", "start", "startSeconds"))
        if sequence_end is None:
            sequence_end = first_value(candidate, ("sequenceEnd", "sequenceEndSeconds", "end", "endSeconds"))
        if source_start is None:
            source_start = first_value(candidate, ("sourceStart", "sourceStartSeconds"))
        if source_end is None:
            source_end = first_value(candidate, ("sourceEnd", "sourceEndSeconds"))

    normalized = {
        "sequenceStart": as_number(sequence_start),
        "sequenceEnd": as_number(sequence_end),
        "sourceStart": as_number(source_start),
        "sourceEnd": as_number(source_end),
        "sourceLaneId": first_value(source, ("sourceLaneId", "laneId", "sourceId", "videoLaneId")),
        "sourceAssetId": first_value(source, ("sourceAssetId", "assetId", "mediaId")),
        "recipeId": first_value(source, ("recipeId", "shortRecipeId", "decisionRecipeId")),
    }
    if normalized["sequenceStart"] is not None and normalized["sequenceEnd"] is not None:
        normalized["sequenceDuration"] = max(0.0, normalized["sequenceEnd"] - normalized["sequenceStart"])
    if normalized["sourceStart"] is not None and normalized["sourceEnd"] is not None:
        normalized["sourceDuration"] = max(0.0, normalized["sourceEnd"] - normalized["sourceStart"])
    return normalized


def iter_dicts(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        found.append(value)
        for child in value.values():
            found.extend(iter_dicts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(iter_dicts(child))
    return found


def manifest_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*manifest*.json") if path.is_file())


def manifest_matches(root: Path, item: dict[str, Any]) -> list[dict[str, Any]]:
    short_id = str(item.get("shortId") or "")
    relative = str(item.get("relativePath") or "")
    path = str(item.get("path") or item.get("mediaPath") or "")
    basename = Path(relative or path).name
    matches: list[dict[str, Any]] = []
    for manifest_path in manifest_files(root):
        manifest = read_json(manifest_path)
        if not manifest:
            continue
        for row in iter_dicts(manifest):
            row_text = json.dumps(row, sort_keys=True, default=str)
            row_paths = " ".join(
                str(row.get(key) or "")
                for key in ("path", "relativePath", "file", "filename", "outputPath", "mediaPath", "uri")
            )
            if short_id and short_id in row_text:
                matched = True
            elif relative and relative in row_text:
                matched = True
            elif basename and basename in row_paths:
                matched = True
            else:
                matched = False
            if not matched:
                continue
            ranges = range_from(row)
            matches.append(
                {
                    "manifestPath": str(manifest_path),
                    "range": ranges,
                    "keys": sorted(row.keys()),
                    "hasUsableRange": bool(
                        (ranges.get("sequenceStart") is not None and ranges.get("sequenceEnd") is not None)
                        or (ranges.get("sourceStart") is not None and ranges.get("sourceEnd") is not None)
                    ),
                }
            )
    return matches[:8]


def rows_by_short(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in data.get("items", []) if isinstance(data.get("items"), list) else []:
        if isinstance(row, dict) and row.get("shortId"):
            out[str(row["shortId"])] = row
    return out


def lineage_status(ranges: dict[str, Any], manifest_rows: list[dict[str, Any]], repair: dict[str, Any]) -> tuple[str, list[str]]:
    missing: list[str] = []
    if ranges.get("sequenceStart") is None:
        missing.append("sequenceStart")
    if ranges.get("sequenceEnd") is None:
        missing.append("sequenceEnd")
    if ranges.get("sourceStart") is None:
        missing.append("sourceStart")
    if ranges.get("sourceEnd") is None:
        missing.append("sourceEnd")
    if not ranges.get("sourceLaneId"):
        missing.append("sourceLaneId")
    if not ranges.get("recipeId"):
        missing.append("recipeId")
    if not manifest_rows:
        missing.append("manifestMatch")

    direct_trace = ranges.get("sequenceStart") is not None and ranges.get("sequenceEnd") is not None
    source_trace = ranges.get("sourceStart") is not None and ranges.get("sourceEnd") is not None
    manifest_trace = any(row.get("hasUsableRange") for row in manifest_rows)
    if direct_trace and (source_trace or manifest_trace):
        return "traceable", missing
    if direct_trace or source_trace or manifest_trace:
        return "partial-lineage", missing
    if repair.get("missingSourceRange"):
        return "needs-backfill", missing
    return "missing-lineage", missing


def build_item(root: Path, theater: dict[str, Any], repair: dict[str, Any]) -> dict[str, Any]:
    media_path = str(theater.get("path") or repair.get("mediaPath") or "")
    ranges = range_from({**repair, **theater})
    manifest_rows = manifest_matches(root, theater)
    status, missing = lineage_status(ranges, manifest_rows, repair)
    short_id = str(theater.get("shortId") or repair.get("shortId") or "")
    safe_commands = {
        "openShort": f"open {shell_quote(media_path)}" if media_path else "",
        "revealShort": f"open -R {shell_quote(media_path)}" if media_path else "",
        "openRepairQueue": "open "
        + shell_quote(
            str(
                DEFAULT_ROOT
                / "shorts-command-room"
                / "recipe-repair-queue"
                / "quipsly-studio-shorts-recipe-repair-queue.html"
            )
        ),
    }
    if short_id:
        safe_commands["recordLineageNote"] = (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field riskTradeoff --kind system-check "
            "--reviewer Codex-Lineage-Audit --note "
            + shell_quote(f"Lineage status {status}; missing {', '.join(missing) or 'nothing obvious'}.")
        )

    if status == "traceable":
        next_action = "Review and repair this short using its source lineage instead of treating the rendered file as source truth."
    elif status == "partial-lineage":
        next_action = "Backfill missing lineage fields from session/timeline metadata before production repair."
    elif status == "needs-backfill":
        next_action = "Backfill source lineage from session/timeline metadata before trusting this as a Quipsly repairable short."
    else:
        next_action = "Regenerate or relink this short recipe from whole synced source decisions."

    return {
        "shortId": short_id,
        "episode": theater.get("episode") or repair.get("episode"),
        "version": theater.get("version") or repair.get("version"),
        "rank": theater.get("rank") or repair.get("rank"),
        "title": theater.get("title") or repair.get("title"),
        "relativePath": theater.get("relativePath"),
        "mediaPath": media_path,
        "mediaUri": theater.get("uri") or repair.get("mediaUri") or file_uri(media_path),
        "exists": Path(media_path).exists() if media_path else False,
        "durationSeconds": theater.get("durationSeconds") or repair.get("durationSeconds"),
        "lineageStatus": status,
        "lineageRange": ranges,
        "missingFields": missing,
        "needsBackfill": status in {"partial-lineage", "needs-backfill", "missing-lineage"},
        "repairStatus": repair.get("repairStatus"),
        "repairNextAction": repair.get("nextSafestAction"),
        "manifestMatches": manifest_rows,
        "safeCommands": safe_commands,
        "nextSafestAction": f"{short_id}: {next_action}" if short_id else next_action,
        "truth": "Lineage audit item only. It does not approve, export, publish, infer hidden timing, mutate timelines, mutate media, or create receipt truth.",
    }


def build_audit(root: Path, theater_path: Path, repair_path: Path, command_room_path: Path, limit: int) -> dict[str, Any]:
    theater = read_json(theater_path)
    repair = read_json(repair_path)
    command_room = read_json(command_room_path)
    repair_by_short = rows_by_short(repair)
    rows = [row for row in theater.get("items", []) if isinstance(row, dict)]
    items = [build_item(root, row, repair_by_short.get(str(row.get("shortId") or ""), {})) for row in rows]
    items.sort(key=lambda row: (str(row.get("lineageStatus") == "traceable"), int(row.get("rank") or 9999)))
    if limit > 0:
        items = items[:limit]
    statuses = Counter(str(item.get("lineageStatus")) for item in items)
    counts = {
        "items": len(items),
        "playableShorts": sum(1 for item in items if item.get("exists")),
        "traceableShorts": statuses.get("traceable", 0),
        "partialLineage": statuses.get("partial-lineage", 0),
        "missingLineage": statuses.get("missing-lineage", 0),
        "needsBackfill": sum(1 for item in items if item.get("needsBackfill")),
        "missingSourceRange": sum(
            1
            for item in items
            if "sourceStart" in item.get("missingFields", []) or "sourceEnd" in item.get("missingFields", [])
        ),
        "missingSequenceRange": sum(
            1
            for item in items
            if "sequenceStart" in item.get("missingFields", []) or "sequenceEnd" in item.get("missingFields", [])
        ),
        "missingRecipeIdentity": sum(1 for item in items if "recipeId" in item.get("missingFields", [])),
        "manifestMatches": sum(1 for item in items if item.get("manifestMatches")),
        "publishingExportsCreated": 0,
        "timelineMutations": 0,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "root": str(root),
        "sourceTheaterJson": str(theater_path),
        "sourceRepairQueueJson": str(repair_path),
        "sourceCommandRoomJson": str(command_room_path),
        "commandRoomGeneratedAt": command_room.get("generatedAt"),
        "counts": counts,
        "items": items,
        "nextSafestAction": next((item.get("nextSafestAction") for item in items if item.get("needsBackfill")), "Review traceable shorts normally."),
        "activeSourceMapPrinciple": "Active paths and surfaces may change, but changes should be deliberate, documented, and proven. This audit records traceability gaps rather than enforcing a permanent folder law.",
        "truth": "Read-only lineage audit. It does not infer hidden ranges, mutate timelines, mutate media, export, publish, schedule, approve, or create receipt truth.",
    }


def render_markdown(audit: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Studio shorts lineage audit",
        "",
        f"Generated: `{audit.get('generatedAt')}`",
        f"Root: `{audit.get('root')}`",
        "",
        audit.get("truth", ""),
        "",
        f"Next safest action: {audit.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in audit.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Items", ""])
    for item in audit.get("items", []):
        missing = ", ".join(item.get("missingFields") or []) or "none obvious"
        lines.extend(
            [
                f"### {item.get('shortId') or item.get('title')}",
                "",
                f"- Status: `{item.get('lineageStatus')}`",
                f"- Episode/version: `{item.get('episode')}` / `{item.get('version')}`",
                f"- Path: `{item.get('relativePath') or item.get('mediaPath')}`",
                f"- Missing: `{missing}`",
                f"- Manifest matches: `{len(item.get('manifestMatches') or [])}`",
                f"- Next: {item.get('nextSafestAction')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(audit: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in audit.get("counts", {}).items()
    )
    rows = "".join(render_item_html(item) for item in audit.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Shorts Lineage Audit</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17130e; --moss:#17281d; --cream:#fff1d4; --honey:#f5cd4e; --leaf:#82df91; --clay:#e4775f; --water:#7cd6e5; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 15% -12%,rgba(130,223,145,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.card,.truth {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.25); }}
    header {{ padding:32px; margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; }}
    h1 {{ margin:6px 0 12px; font-size:clamp(2.4rem,7vw,5.4rem); line-height:.9; }}
    p {{ color:#dfd0b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:1.9rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.08em; font-size:.7rem; font-weight:900; }}
    .truth {{ padding:20px 24px; margin-bottom:16px; border-color:rgba(245,205,78,.35); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .status {{ display:inline-block; border-radius:999px; padding:6px 10px; font-weight:950; font-size:.76rem; text-transform:uppercase; letter-spacing:.08em; }}
    .traceable {{ background:rgba(130,223,145,.18); color:var(--leaf); border:1px solid rgba(130,223,145,.38); }}
    .partial-lineage,.needs-backfill,.missing-lineage {{ background:rgba(228,119,95,.18); color:#ffb0a1; border:1px solid rgba(228,119,95,.38); }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .pills {{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.22); color:var(--cream); font-weight:800; font-size:.82rem; }}
    .commands {{ display:flex; flex-wrap:wrap; gap:8px; }}
    button {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(0,0,0,.28); color:var(--cream); cursor:pointer; font-weight:900; }}
    button:hover {{ color:var(--honey); }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(23,40,29,.96); border:1px solid rgba(130,223,145,.42); color:var(--leaf); opacity:0; transform:translateY(8px); transition:.2s; }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · lineage audit</p>
    <h1>Playable is not the same as traceable.</h1>
    <p>This board checks whether each current recommended short can be traced back to whole-source edit decisions before we trust it as repairable production truth.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(audit.get('truth'))}</p><p><strong>Next safest action:</strong> {esc(audit.get('nextSafestAction'))}</p><p>{esc(audit.get('activeSourceMapPrinciple'))}</p></section>
  <section class="grid">{rows}</section>
</main>
<div class="toast" id="toast">Copied</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    try {{
      await navigator.clipboard.writeText(button.getAttribute('data-copy') || '');
      toast.textContent = 'Copied command';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }} catch (error) {{
      toast.textContent = 'Copy failed';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }}
  }});
}});
</script>
</body>
</html>
"""


def render_item_html(item: dict[str, Any]) -> str:
    status = str(item.get("lineageStatus") or "")
    missing = ", ".join(item.get("missingFields") or []) or "none obvious"
    commands = "".join(
        f"<button data-copy=\"{esc(command)}\">{esc(label)}</button>"
        for label, command in (item.get("safeCommands") or {}).items()
        if command
    )
    return f"""
    <article class="card">
      <p class="eyebrow">{esc(item.get('shortId') or 'short')}</p>
      <h2>{esc(item.get('title') or item.get('relativePath') or item.get('mediaPath'))}</h2>
      <span class="status {esc(status)}">{esc(status)}</span>
      <div class="pills">
        <span class="pill">episode {esc(item.get('episode'))}</span>
        <span class="pill">{esc(item.get('version'))}</span>
        <span class="pill">{esc(item.get('durationSeconds'))}s</span>
        <span class="pill">{len(item.get('manifestMatches') or [])} manifest matches</span>
      </div>
      <p><strong>Missing:</strong> <code>{esc(missing)}</code></p>
      <p>{esc(item.get('nextSafestAction'))}</p>
      <p><code>{esc(item.get('relativePath') or item.get('mediaPath'))}</code></p>
      <div class="commands">{commands}</div>
    </article>
    """


def write_outputs(audit: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        paths["json"].write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(audit), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(audit), encoding="utf-8")
    return {key: str(path) for key, path in paths.items() if path.exists()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit current shorts review items for source lineage.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON))
    parser.add_argument("--repair-queue", default=str(DEFAULT_RECIPE_REPAIR_JSON))
    parser.add_argument("--command-room", default=str(DEFAULT_COMMAND_ROOM_JSON))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default=DEFAULT_BASENAME)
    parser.add_argument("--limit", type=int, default=0, help="Limit output items. 0 means all.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    audit = build_audit(
        Path(args.root).expanduser(),
        Path(args.theater).expanduser(),
        Path(args.repair_queue).expanduser(),
        Path(args.command_room).expanduser(),
        args.limit,
    )
    paths = write_outputs(audit, Path(args.output_dir).expanduser(), args.basename, args.format)
    print(
        json.dumps(
            {
                "ok": True,
                "artifactPaths": {"folder": str(Path(args.output_dir).expanduser()), **paths},
                "counts": audit.get("counts"),
                "nextSafestAction": audit.get("nextSafestAction"),
                "truth": audit.get("truth"),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
