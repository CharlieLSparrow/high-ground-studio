#!/usr/bin/env python3
"""Batch-prepare polish cockpits for ranked shorts.

This is a local review conveyor, not an approval or publishing system. It reads
the cut-quality refinement queue, creates missing polish workorders, worksheets,
note-preview bridges, one-short polish cockpits, and refreshes the cockpit
index so humans and agents can open review surfaces without folder archaeology.
"""
from __future__ import annotations

import argparse
import html
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_REFINEMENT_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-refinement-queue"
    / "quipsly-studio-shorts-cut-quality-refinement-queue.json"
)
DEFAULT_COCKPIT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-polish-cockpits"
    / "index"
    / "quipsly-studio-shorts-cut-quality-polish-cockpit-index.json"
)
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-batches"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-polish-batch"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-batch.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "polish-batch")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "polish-batch"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def queue_items(path: Path) -> list[dict[str, Any]]:
    board = read_json(path)
    return [item for item in board.get("items", []) if isinstance(item, dict)]


def latest_short_ids(index: dict[str, Any]) -> set[str]:
    return {
        str(row.get("shortId") or "")
        for row in index.get("latestByShort", [])
        if isinstance(row, dict) and row.get("shortId")
    }


def choose_items(
    items: list[dict[str, Any]],
    short_ids: list[str],
    limit: int,
    covered_short_ids: set[str],
    include_covered: bool,
) -> list[dict[str, Any]]:
    if short_ids:
        lookup = {str(item.get("shortId") or ""): item for item in items}
        selected: list[dict[str, Any]] = []
        missing: list[str] = []
        for short_id in short_ids:
            item = lookup.get(short_id)
            if item:
                selected.append(item)
            else:
                missing.append(short_id)
        if missing:
            raise SystemExit(f"Short id(s) not found in refinement queue: {', '.join(missing)}")
        return selected
    selected = sorted(items, key=lambda item: (-int(item.get("score") or 0), int(item.get("episode") or 999), str(item.get("shortId") or "")))
    if not include_covered:
        selected = [
            item
            for item in selected
            if str(item.get("shortId") or "") not in covered_short_ids
        ]
    return selected[: max(1, limit)]


def agentctl_path() -> Path:
    return Path(__file__).resolve().with_name("agentctl.sh")


def run_agentctl(args: list[str], timeout: int = 360) -> dict[str, Any]:
    command = [str(agentctl_path()), *args]
    started = iso_now()
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        output = ((completed.stdout or "") + (completed.stderr or "")).strip()
        return {
            "command": " ".join(shell_quote(part) if " " in part else part for part in command),
            "status": "ok" if completed.returncode == 0 else "failed",
            "returnCode": completed.returncode,
            "startedAt": started,
            "completedAt": iso_now(),
            "outputTail": output[-1800:],
        }
    except subprocess.TimeoutExpired as error:
        return {
            "command": " ".join(shell_quote(part) if " " in part else part for part in command),
            "status": "timeout",
            "returnCode": 124,
            "startedAt": started,
            "completedAt": iso_now(),
            "outputTail": str(error)[-1800:],
        }


def parse_output_json(result: dict[str, Any]) -> dict[str, Any]:
    if result.get("status") != "ok":
        return {}
    text = str(result.get("outputTail") or "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def build_batch(
    queue_path: Path,
    cockpit_index_path: Path,
    output_root: Path,
    short_ids: list[str],
    limit: int,
    reviewer: str,
    include_covered: bool,
    refresh: bool,
) -> tuple[dict[str, Any], Path]:
    commands: list[dict[str, Any]] = []
    commands.append(run_agentctl(["studio-shorts-cut-quality-polish-cockpit-index", "--json"], timeout=120))
    cockpit_done = latest_short_ids(read_json(cockpit_index_path))
    items = choose_items(queue_items(queue_path), short_ids, limit, cockpit_done, include_covered)
    if not items:
        raise SystemExit(
            f"No uncovered refinement-queue items found at {queue_path}. "
            "Use --include-covered to rebuild/recheck existing cockpit surfaces."
        )

    folder = output_root / f"{stamp()}-{safe_slug(DEFAULT_BASENAME)}"
    folder.mkdir(parents=True, exist_ok=False)
    rows: list[dict[str, Any]] = []
    for item in items:
        short_id = str(item.get("shortId") or "")
        row: dict[str, Any] = {
            "shortId": short_id,
            "episode": item.get("episode"),
            "episodeVersion": item.get("episodeVersion"),
            "title": item.get("title"),
            "lane": item.get("lane"),
            "score": item.get("score"),
            "cadenceLabel": item.get("cadenceLabel"),
            "alreadyHadCockpit": short_id in cockpit_done,
            "actions": [],
            "cockpitAvailable": False,
            "cockpitHtml": "",
        }
        if short_id in cockpit_done and not refresh:
            row["actions"].append({"type": "polish-surfaces", "status": "already-current"})
            row["cockpitAvailable"] = True
            rows.append(row)
            continue

        workorder = run_agentctl(["studio-shorts-cut-quality-polish-workorder", "--short-id", short_id, "--json"])
        commands.append(workorder)
        row["actions"].append({"type": "polish-workorder", "status": workorder["status"]})

        worksheet = run_agentctl(["studio-shorts-cut-quality-worksheet", "--short-id", short_id, "--reviewer", reviewer])
        commands.append(worksheet)
        row["actions"].append({"type": "worksheet", "status": worksheet["status"]})

        note_preview = run_agentctl(["studio-shorts-cut-quality-polish-note-preview", "--short-id", short_id, "--json"])
        commands.append(note_preview)
        row["actions"].append({"type": "note-preview", "status": note_preview["status"]})

        cockpit = run_agentctl(["studio-shorts-cut-quality-polish-cockpit", "--short-id", short_id, "--json"])
        commands.append(cockpit)
        cockpit_json = parse_output_json(cockpit)
        paths = cockpit_json.get("artifactPaths") if isinstance(cockpit_json.get("artifactPaths"), dict) else {}
        row["actions"].append({"type": "polish-cockpit", "status": cockpit["status"]})
        row["cockpitAvailable"] = cockpit.get("status") == "ok"
        row["cockpitHtml"] = str(paths.get("html") or "")
        row["taskCount"] = len(cockpit_json.get("tasks") or [])
        row["previewRowCount"] = len(cockpit_json.get("previewRows") or [])
        counts = cockpit_json.get("counts") if isinstance(cockpit_json.get("counts"), dict) else {}
        row["notesRecorded"] = counts.get("notesRecorded", 0)
        row["decisionsRecorded"] = counts.get("decisionsRecorded", 0)
        rows.append(row)

    commands.append(run_agentctl(["studio-shorts-cut-quality-polish-cockpit-index", "--json"], timeout=120))
    index = read_json(cockpit_index_path)
    cockpit_done_after = latest_short_ids(index)
    for row in rows:
        short_id = str(row.get("shortId") or "")
        if short_id in cockpit_done_after:
            row["cockpitAvailable"] = True
            if not row.get("cockpitHtml"):
                for index_row in index.get("latestByShort", []):
                    if isinstance(index_row, dict) and str(index_row.get("shortId") or "") == short_id:
                        paths = index_row.get("artifactPaths") if isinstance(index_row.get("artifactPaths"), dict) else {}
                        row["cockpitHtml"] = str(paths.get("html") or "")
                        if not row.get("taskCount"):
                            row["taskCount"] = index_row.get("taskCount")
                        if not row.get("previewRowCount"):
                            row["previewRowCount"] = index_row.get("previewRowCount")
                        if not row.get("notesRecorded"):
                            row["notesRecorded"] = index_row.get("notesRecorded", 0)
                        if not row.get("decisionsRecorded"):
                            row["decisionsRecorded"] = index_row.get("decisionsRecorded", 0)
                        break

    failed = [command for command in commands if command.get("status") != "ok"]
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceRefinementQueueJson": str(queue_path),
        "outputDir": str(folder),
        "selection": {
            "shortIds": short_ids,
            "limit": limit,
            "reviewer": reviewer,
            "includeCovered": include_covered,
            "refresh": refresh,
        },
        "counts": {
            "selected": len(rows),
            "cockpitsAvailable": sum(1 for row in rows if row.get("cockpitAvailable")),
            "alreadyCovered": sum(1 for row in rows if row.get("alreadyHadCockpit")),
            "commandsRun": len(commands),
            "commandsFailed": len(failed),
            "notesRecorded": sum(int(row.get("notesRecorded") or 0) for row in rows),
            "decisionsRecorded": sum(int(row.get("decisionsRecorded") or 0) for row in rows),
            "externalPublishing": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
        },
        "items": rows,
        "indexArtifacts": {
            "polishCockpitIndexJson": str(cockpit_index_path),
            "polishCockpitIndexHtml": str(cockpit_index_path.with_suffix(".html")),
        },
        "commands": commands,
        "nextSafestAction": "Open the polish-cockpit index, then watch/listen in a cockpit before recording any worksheet note or local review intent.",
        "truth": (
            "Polish batch only. It creates local review surfaces and indexes. It records no notes, records no review "
            "decision, edits no timeline, exports no media, publishes nothing, uploads nothing, mutates no source media, "
            "overwrites no prior cockpits, deletes nothing, and creates no approval or receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts polish batch",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Selected shorts: `{counts.get('selected', 0)}`",
        f"- Cockpits available: `{counts.get('cockpitsAvailable', 0)}`",
        f"- Already covered: `{counts.get('alreadyCovered', 0)}`",
        f"- Commands run: `{counts.get('commandsRun', 0)}`",
        f"- Commands failed: `{counts.get('commandsFailed', 0)}`",
        f"- Notes recorded: `{counts.get('notesRecorded', 0)}`",
        f"- Decisions recorded: `{counts.get('decisionsRecorded', 0)}`",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Selected shorts",
        "",
    ]
    for row in payload.get("items", []):
        actions = ", ".join(f"{action.get('type')}={action.get('status')}" for action in row.get("actions", []))
        lines.extend([
            f"### {row.get('shortId')}",
            "",
            f"- Episode/lane/score: `Episode {row.get('episode')}` / `{row.get('lane')}` / `{row.get('score')}`",
            f"- Title: {row.get('title')}",
            f"- Cockpit available: `{row.get('cockpitAvailable')}`",
            f"- Tasks/preview rows: `{row.get('taskCount', '')}` / `{row.get('previewRowCount', '')}`",
            f"- Notes/decisions recorded: `{row.get('notesRecorded', 0)}` / `{row.get('decisionsRecorded', 0)}`",
            f"- Actions: {actions}",
            f"- Cockpit: `{row.get('cockpitHtml')}`",
            "",
        ])
    lines.extend([
        "## Artifact doors",
        "",
        f"- Polish cockpit index: `{(payload.get('indexArtifacts') or {}).get('polishCockpitIndexHtml')}`",
        f"- Batch JSON: `{(payload.get('artifactPaths') or {}).get('json')}`",
    ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    cards = []
    for row in payload.get("items", []):
        actions = "".join(
            f"<span>{esc(action.get('type'))}: {esc(action.get('status'))}</span>"
            for action in row.get("actions", [])
        )
        cockpit = str(row.get("cockpitHtml") or "")
        cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">Episode {esc(row.get('episode'))} · {esc(row.get('lane'))} · score {esc(row.get('score'))}</p>
              <h2>{esc(row.get('shortId'))}</h2>
              <p>{esc(row.get('title'))}</p>
              <div class="pills">{actions}</div>
              <p>Cockpit available: <strong>{esc(row.get('cockpitAvailable'))}</strong></p>
              <p>Notes/decisions recorded: <strong>{esc(row.get('notesRecorded', 0))}</strong> / <strong>{esc(row.get('decisionsRecorded', 0))}</strong></p>
              <a class="button" href="{esc(file_uri(cockpit))}">Open cockpit</a>
              <code>{esc(cockpit)}</code>
            </article>
            """
        )
    cockpit_index = ((payload.get("indexArtifacts") or {}).get("polishCockpitIndexHtml") or "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts polish batch</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#203522; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -8%,rgba(142,220,137,.25),transparent 32rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,7vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 14px; }}
    .pills span {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.24); font-weight:900; }}
    .button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); text-decoration:none; font-weight:950; margin:10px 0; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · polish batch</p>
    <h1>Open the next review door without spelunking.</h1>
    <p>{esc(payload.get('truth'))}</p>
    <a class="button" href="{esc(file_uri(cockpit_index))}">Open polish-cockpit index</a>
    <div class="metrics">
      <div><strong>{esc(counts.get('selected', 0))}</strong><span>selected</span></div>
      <div><strong>{esc(counts.get('cockpitsAvailable', 0))}</strong><span>cockpits ready</span></div>
      <div><strong>{esc(counts.get('alreadyCovered', 0))}</strong><span>already covered</span></div>
      <div><strong>{esc(counts.get('commandsFailed', 0))}</strong><span>failed</span></div>
      <div><strong>{esc(counts.get('notesRecorded', 0))}</strong><span>notes</span></div>
      <div><strong>{esc(counts.get('decisionsRecorded', 0))}</strong><span>decisions</span></div>
    </div>
  </header>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], folder: Path, basename: str) -> dict[str, str]:
    paths = {
        "json": folder / f"{basename}.json",
        "markdown": folder / f"{basename}.md",
        "html": folder / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch-generate local polish cockpits for ranked shorts.")
    parser.add_argument("--queue", default=str(DEFAULT_REFINEMENT_QUEUE_JSON), help="Cut-quality refinement queue JSON.")
    parser.add_argument("--cockpit-index", default=str(DEFAULT_COCKPIT_INDEX_JSON), help="Polish cockpit index JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Root folder for batch reports.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--short-id", action="append", default=[], help="Specific short id to process. Repeatable.")
    parser.add_argument("--limit", type=int, default=4, help="How many ranked queue shorts to process when --short-id is omitted.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer label for generated blank worksheets.")
    parser.add_argument("--include-covered", action="store_true", help="Allow selecting shorts that already have polish cockpits.")
    parser.add_argument("--refresh", action="store_true", help="Regenerate polish surfaces even if a cockpit already exists.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload, folder = build_batch(
        queue_path=Path(args.queue).expanduser(),
        cockpit_index_path=Path(args.cockpit_index).expanduser(),
        output_root=Path(args.output_root).expanduser(),
        short_ids=args.short_id,
        limit=args.limit,
        reviewer=args.reviewer,
        include_covered=args.include_covered,
        refresh=args.refresh,
    )
    artifact_paths = write_outputs(payload, folder, args.basename)
    payload["artifactPaths"] = artifact_paths
    Path(artifact_paths["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(artifact_paths["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
