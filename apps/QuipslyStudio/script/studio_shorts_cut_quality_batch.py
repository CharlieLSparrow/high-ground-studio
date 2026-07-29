#!/usr/bin/env python3
"""Batch-build cut-quality evidence for recommended Studio shorts.

This is a local review runway, not an approval or publishing system. It turns
the current cut-quality workbench queue into visual contact sheets, audio
probes, merged review packets, and indexes so Charlie, Mako, Homer, and Codex
can start from evidence instead of folder archaeology.
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
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_CONTACT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-contact-sheets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-contact-sheet-index.json"
)
DEFAULT_AUDIO_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-audio-probes"
    / "index"
    / "quipsly-studio-shorts-cut-quality-audio-probe-index.json"
)
DEFAULT_PACKET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-review-packets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-review-packet-index.json"
)
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-batches"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-batch"
SCHEMA = "quipsly.studio.shorts-cut-quality-batch.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "batch")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "batch"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
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


def workbench_items(path: Path) -> list[dict[str, Any]]:
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
            raise SystemExit(f"Short id(s) not found in cut-quality workbench: {', '.join(missing)}")
        return selected
    selected = sorted(items, key=lambda item: int(item.get("rank") or 9999))
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
        status = "ok" if completed.returncode == 0 else "failed"
        output = ((completed.stdout or "") + (completed.stderr or "")).strip()
        return {
            "command": " ".join(shell_quote(part) if " " in part else part for part in command),
            "status": status,
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


def refresh_indexes() -> list[dict[str, Any]]:
    return [
        run_agentctl(["studio-shorts-cut-quality-contact-sheet-index", "--json"], timeout=120),
        run_agentctl(["studio-shorts-cut-quality-audio-probe-index", "--json"], timeout=120),
        run_agentctl(["studio-shorts-cut-quality-review-packet-index", "--json"], timeout=120),
    ]


def build_batch(
    workbench_path: Path,
    output_root: Path,
    short_ids: list[str],
    limit: int,
    frames: int,
    noise: str,
    minimum_silence: float,
    refresh: bool,
    include_covered: bool,
) -> tuple[dict[str, Any], Path]:
    commands: list[dict[str, Any]] = []
    commands.extend(refresh_indexes())
    packet_done = latest_short_ids(read_json(DEFAULT_PACKET_INDEX_JSON))
    items = choose_items(workbench_items(workbench_path), short_ids, limit, packet_done, include_covered)
    if not items:
        raise SystemExit(
            f"No uncovered cut-quality workbench items found at {workbench_path}. "
            "Use --include-covered to rebuild or inspect already-covered shorts."
        )

    folder = output_root / f"{stamp()}-{safe_slug(DEFAULT_BASENAME)}"
    folder.mkdir(parents=True, exist_ok=False)
    contact_done = latest_short_ids(read_json(DEFAULT_CONTACT_INDEX_JSON))
    audio_done = latest_short_ids(read_json(DEFAULT_AUDIO_INDEX_JSON))

    rows: list[dict[str, Any]] = []
    for item in items:
        short_id = str(item.get("shortId") or "")
        row = {
            "shortId": short_id,
            "episode": item.get("episode"),
            "rank": item.get("rank"),
            "title": item.get("title"),
            "readinessLevel": item.get("readinessLevel"),
            "mediaPath": item.get("mediaPath"),
            "actions": [],
        }
        if refresh or short_id not in contact_done:
            result = run_agentctl([
                "studio-shorts-cut-quality-contact-sheet",
                "--short-id",
                short_id,
                "--frames",
                str(frames),
                "--json",
            ])
            commands.append(result)
            row["actions"].append({"type": "contact-sheet", "status": result["status"]})
        else:
            row["actions"].append({"type": "contact-sheet", "status": "already-current"})

        if refresh or short_id not in audio_done:
            result = run_agentctl([
                "studio-shorts-cut-quality-audio-probe",
                "--short-id",
                short_id,
                f"--noise={noise}",
                "--minimum-silence",
                str(minimum_silence),
                "--json",
            ])
            commands.append(result)
            row["actions"].append({"type": "audio-probe", "status": result["status"]})
        else:
            row["actions"].append({"type": "audio-probe", "status": "already-current"})
        rows.append(row)

    commands.extend(refresh_indexes()[:2])
    contact_done = latest_short_ids(read_json(DEFAULT_CONTACT_INDEX_JSON))
    audio_done = latest_short_ids(read_json(DEFAULT_AUDIO_INDEX_JSON))

    for row in rows:
        short_id = str(row.get("shortId") or "")
        missing = []
        if short_id not in contact_done:
            missing.append("contact-sheet")
        if short_id not in audio_done:
            missing.append("audio-probe")
        if missing:
            row["actions"].append({"type": "review-packet", "status": "blocked-missing-evidence", "missing": missing})
            continue
        if refresh or short_id not in packet_done:
            result = run_agentctl(["studio-shorts-cut-quality-review-packet", "--short-id", short_id, "--json"])
            commands.append(result)
            row["actions"].append({"type": "review-packet", "status": result["status"]})
        else:
            row["actions"].append({"type": "review-packet", "status": "already-current"})

    commands.extend(refresh_indexes())
    packet_index = read_json(DEFAULT_PACKET_INDEX_JSON)
    packet_done = latest_short_ids(packet_index)
    for row in rows:
        row["reviewPacketAvailable"] = str(row.get("shortId") or "") in packet_done

    failed = [
        command
        for command in commands
        if command.get("status") not in {"ok"}
    ]
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkbenchJson": str(workbench_path),
        "outputDir": str(folder),
        "selection": {
            "shortIds": short_ids,
            "limit": limit,
            "frames": frames,
            "noise": noise,
            "minimumSilence": minimum_silence,
            "refresh": refresh,
            "includeCovered": include_covered,
        },
        "counts": {
            "selected": len(rows),
            "reviewPacketsAvailable": sum(1 for row in rows if row.get("reviewPacketAvailable")),
            "commandsRun": len(commands),
            "commandsFailed": len(failed),
            "externalPublishing": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
        },
        "items": rows,
        "indexArtifacts": {
            "contactSheetIndexJson": str(DEFAULT_CONTACT_INDEX_JSON),
            "audioProbeIndexJson": str(DEFAULT_AUDIO_INDEX_JSON),
            "reviewPacketIndexJson": str(DEFAULT_PACKET_INDEX_JSON),
            "reviewPacketIndexHtml": str(DEFAULT_PACKET_INDEX_JSON.with_suffix(".html")),
        },
        "commands": commands,
        "nextSafestAction": (
            "Open the review-packet index, then review the newest cockpit for each selected short. "
            "Record specific worksheet notes before recording keep/refine/hold intent."
        ),
        "truth": (
            "Cut-quality batch only. It generates local review evidence and indexes. It records no review decision, "
            "edits no timeline, exports no media, publishes nothing, uploads nothing, transcribes nothing, mutates no "
            "source media, overwrites no prior packets, deletes nothing, and creates no approval or receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts cut-quality batch",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Selected shorts: `{counts.get('selected', 0)}`",
        f"- Review packets available: `{counts.get('reviewPacketsAvailable', 0)}`",
        f"- Commands run: `{counts.get('commandsRun', 0)}`",
        f"- Commands failed: `{counts.get('commandsFailed', 0)}`",
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
            f"- Episode/rank: `Episode {row.get('episode')}` / `{row.get('rank')}`",
            f"- Title: {row.get('title')}",
            f"- Readiness: `{row.get('readinessLevel')}`",
            f"- Review packet available: `{row.get('reviewPacketAvailable')}`",
            f"- Actions: {actions}",
            f"- Media: `{row.get('mediaPath')}`",
            "",
        ])
    lines.extend([
        "## Artifact doors",
        "",
        f"- Review-packet index: `{(payload.get('indexArtifacts') or {}).get('reviewPacketIndexHtml')}`",
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
        cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">Episode {esc(row.get('episode'))} · rank {esc(row.get('rank'))}</p>
              <h2>{esc(row.get('shortId'))}</h2>
              <p>{esc(row.get('title'))}</p>
              <div class="pills">{actions}</div>
              <p>Review packet available: <strong>{esc(row.get('reviewPacketAvailable'))}</strong></p>
              <code>{esc(row.get('mediaPath'))}</code>
            </article>
            """
        )
    review_index = ((payload.get("indexArtifacts") or {}).get("reviewPacketIndexHtml") or "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts cut-quality batch</title>
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
    <p class="eyebrow">Quipsly Studio · cut-quality batch</p>
    <h1>Evidence queue, not guesswork.</h1>
    <p>{esc(payload.get('truth'))}</p>
    <a class="button" href="{esc(file_uri(review_index))}">Open review-packet index</a>
    <div class="metrics">
      <div><strong>{esc(counts.get('selected', 0))}</strong><span>selected</span></div>
      <div><strong>{esc(counts.get('reviewPacketsAvailable', 0))}</strong><span>packets ready</span></div>
      <div><strong>{esc(counts.get('commandsRun', 0))}</strong><span>commands run</span></div>
      <div><strong>{esc(counts.get('commandsFailed', 0))}</strong><span>failed</span></div>
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
    parser = argparse.ArgumentParser(description="Batch-generate local cut-quality evidence for recommended shorts.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Root folder for batch reports.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--short-id", action="append", default=[], help="Specific short id to process. Repeatable.")
    parser.add_argument("--limit", type=int, default=4, help="How many ranked workbench shorts to process when --short-id is omitted.")
    parser.add_argument("--frames", type=int, default=8, help="Visual frames per contact sheet.")
    parser.add_argument("--noise", default="-42dB", help="Silencedetect noise threshold.")
    parser.add_argument("--minimum-silence", type=float, default=0.35, help="Minimum silence length for cadence probe.")
    parser.add_argument("--refresh", action="store_true", help="Regenerate evidence even if latest evidence already exists.")
    parser.add_argument("--include-covered", action="store_true", help="Allow selecting shorts that already have review packets.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload, folder = build_batch(
        Path(args.workbench).expanduser(),
        Path(args.output_root).expanduser(),
        args.short_id,
        args.limit,
        args.frames,
        args.noise,
        args.minimum_silence,
        args.refresh,
        args.include_covered,
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
