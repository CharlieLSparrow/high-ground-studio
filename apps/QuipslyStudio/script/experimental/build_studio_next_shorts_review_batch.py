#!/usr/bin/env python3
"""Build a compact Studio shorts review batch.

This reads the canonical local release review board and creates a small,
human-scale packet of shorts to watch next. It is deliberately local and
receipt-honest: it never posts, uploads, schedules, approves, mutates media, or
creates publication receipt truth.
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

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_REVIEW_BOARD = "review-board/review-board.json"
LATEST_POINTER = "review-board/shorts-review-batches/latest-shorts-review-batch.json"
SCHEMA = "quipsly.studio.next-shorts-review-batch.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-shorts-review-batch")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(str(value or ""))


def open_command(path: str) -> str:
    return f"open {shell_quote(path)}" if path else ""


def local_review_commands(short_id: str) -> dict[str, str]:
    dry = "./script/agentctl.sh studio-short-review-decision-dry-run"
    live = "./script/agentctl.sh studio-short-review-decision"
    return {
        "dryRunKeep": f"{dry} {shell_quote(short_id)} keep '<reviewer>' '<why this short is locally promising>'",
        "dryRunRefine": f"{dry} {shell_quote(short_id)} refine '<reviewer>' '<crop/pacing/caption/audio issue>'",
        "dryRunHold": f"{dry} {shell_quote(short_id)} hold '<reviewer>' '<what must be checked before deciding>'",
        "dryRunReject": f"{dry} {shell_quote(short_id)} reject '<reviewer>' '<why this should not move forward>'",
        "recordIntent": f"{live} {shell_quote(short_id)} keep|refine|hold|reject|needs-more-evidence '<reviewer>' '<notes>'",
    }


def human_title(raw: str) -> str:
    name = Path(raw or "").stem
    for token in ["full-release", "release-proof", "9x16-short", "v001", "v002", "v003", "v004"]:
        name = name.replace(token, "")
    name = name.replace("episode-", "Episode ").replace("_", " ").replace("-", " ")
    words = [word for word in name.split() if word]
    return " ".join(words) if words else raw


def duration_label(short: dict[str, Any]) -> str:
    label = str(short.get("durationLabel") or "")
    if label:
        return label
    seconds = float(short.get("durationSeconds") or 0)
    if seconds <= 0:
        return "unknown"
    mins = int(seconds // 60)
    secs = int(round(seconds % 60))
    return f"{mins}:{secs:02d}"


def episode_number(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 999


def review_board_path(root: Path) -> Path:
    return root / DEFAULT_REVIEW_BOARD


def collect_rows(board: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    warning_episodes = {
        episode_number(item)
        for item in board.get("episodesWithWarnings", [])
        if str(item).strip()
    }
    for episode in board.get("episodes", []):
        if not isinstance(episode, dict):
            continue
        ep_num = episode_number(episode.get("episode"))
        version = str(episode.get("version") or "")
        episode_warning = ep_num in warning_episodes or bool(episode.get("warnings"))
        duration_ready = bool(episode.get("longFormDurationAlignmentReady"))
        for short in episode.get("shorts", []):
            if not isinstance(short, dict):
                continue
            path = str(short.get("path") or "")
            title = str(short.get("title") or Path(path).stem or f"Episode {ep_num} short")
            exists = bool(short.get("exists")) and bool(path) and Path(path).exists()
            seconds = float(short.get("durationSeconds") or 0)
            status = str(short.get("status") or ("ready" if exists else "missing"))
            short_index = int(short.get("index") or 0)
            target_id = f"episode-{ep_num}-short-{short_index:02d}"
            review_commands = local_review_commands(target_id)
            note = (
                f"Local shorts batch dry-run for Episode {ep_num} short {short_index:02d}: "
                "watch/listen only; no approval, upload, publication, schedule, account mutation, overwrite, delete, or receipt truth."
            )
            rows.append({
                "id": target_id,
                "episode": ep_num,
                "version": version,
                "shortIndex": short_index,
                "title": title,
                "humanTitle": human_title(title),
                "path": path,
                "fileUri": str(short.get("fileUri") or Path(path).as_uri() if exists else ""),
                "exists": exists,
                "status": status,
                "durationSeconds": seconds,
                "durationLabel": duration_label(short),
                "bytes": int(short.get("bytes") or 0),
                "hasAudio": bool(short.get("hasAudio")),
                "hasVideo": bool(short.get("hasVideo")),
                "codecSummary": short.get("codecSummary") if isinstance(short.get("codecSummary"), list) else [],
                "episodeWarning": episode_warning,
                "episodeDurationAligned": duration_ready,
                "reviewRisk": "episode-warning-review-first" if episode_warning else "normal-watch-listen-review",
                "reviewPrompt": "Would you post this short as-is, refine crop/pacing/caption, hold it, or reject it?",
                "nextSafestAction": "Open the local short with sound on, then record only local review intent.",
                "openCommand": open_command(path),
                "revealCommand": f"open -R {shell_quote(path)}" if path else "",
                "dryRunCommand": (
                    "./script/agentctl.sh tower-review-decision-dry-run "
                    f"{ep_num} short-{short_index:02d} pending Codex {shell_quote(note)}"
                ),
                "localReviewCommands": review_commands,
                "localReviewCommandSafety": "Local shorts intent only. These commands never publish, upload, schedule, approve external action, mutate media, overwrite, delete, mutate accounts, or create receipt truth.",
                "keepNoteTemplate": f"KEEP Episode {ep_num} short {short_index:02d}: reason=",
                "refineNoteTemplate": f"REFINE Episode {ep_num} short {short_index:02d}: crop/pacing/caption/audio issue=",
                "holdNoteTemplate": f"HOLD Episode {ep_num} short {short_index:02d}: waiting_for=",
                "rejectNoteTemplate": f"REJECT Episode {ep_num} short {short_index:02d}: reason=",
                "truth": "Local shorts review row only. It does not approve, publish, upload, schedule, mutate media, or create receipt truth.",
            })
    return rows


def pick_batch(rows: list[dict[str, Any]], limit: int, include_warnings: bool) -> list[dict[str, Any]]:
    def score(row: dict[str, Any]) -> tuple[int, int, int, int]:
        exists_rank = 0 if row.get("exists") else 5
        warning_rank = 20 if row.get("episodeWarning") and not include_warnings else 0
        duration_rank = 2 if float(row.get("durationSeconds") or 0) <= 0 else 0
        return (exists_rank + warning_rank + duration_rank, int(row.get("episode") or 999), int(row.get("shortIndex") or 999), len(str(row.get("title") or "")))

    picked = sorted(rows, key=score)[:max(limit, 1)]
    return picked


def build_payload(root: Path, limit: int, include_warnings: bool) -> dict[str, Any]:
    board_path = review_board_path(root)
    board = load_json(board_path)
    source_rows = collect_rows(board)
    rows = pick_batch(source_rows, limit=limit, include_warnings=include_warnings)
    first = rows[0] if rows else {}
    warning_episodes = sorted({row["episode"] for row in source_rows if row.get("episodeWarning")})
    counts = {
        "sourceShortRows": len(source_rows),
        "batchRows": len(rows),
        "playableRows": sum(1 for row in rows if row.get("exists") and row.get("hasVideo")),
        "audioRows": sum(1 for row in rows if row.get("hasAudio")),
        "warningEpisodeRows": sum(1 for row in rows if row.get("episodeWarning")),
        "dryRunRows": sum(1 for row in rows if row.get("dryRunCommand")),
        "receiptSlots": len(rows),
        "capturedReceipts": 0,
        "externalPublishing": 0,
        "versionsOverwritten": 0,
        "sourceFilesMutated": 0,
        "localReviewCommandRows": sum(1 for row in rows if row.get("localReviewCommands")),
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio-next-shorts-review-batch-ready" if rows else "studio-next-shorts-review-batch-needs-review-board",
        "root": str(root),
        "sourceReviewBoardPath": str(board_path),
        "sourceReviewBoardGeneratedAt": str(board.get("generatedAt") or ""),
        "title": "Studio next shorts review batch",
        "plainEnglish": "A compact watch/listen queue for the next shorts to review locally before any platform approval or posting.",
        "nextSafestAction": "Watch the shorts top-down, mark only local intent, and leave all external receipt slots empty.",
        "warningEpisodes": warning_episodes,
        "counts": counts,
        "rows": rows,
        "firstSafeAction": {
            "label": "Open Studio next shorts review batch",
            "path": "",
            "command": "",
            "safety": "Opens local shorts batch only. No approval, upload, publication, schedule, account mutation, source mutation, overwrite, delete, or receipt truth.",
        },
        "firstOpenCommand": str(first.get("openCommand") or ""),
        "firstDryRunCommand": str(first.get("dryRunCommand") or ""),
        "firstDryRunDecision": "pending" if first else "",
        "firstDryRunSafety": "Dry-run only. It previews local review intent and does not approve, publish, upload, schedule, mutate media, overwrite, delete, mutate accounts, or create receipt truth." if first else "",
        "truth": {
            "description": "Studio shorts review batch only. It reads local release-board evidence and writes local review runway artifacts.",
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio next shorts review batch",
        "",
        payload.get("plainEnglish", ""),
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines += [
        "",
        "## Start here",
        "",
        "1. Open the HTML batch and watch/listen with sound on.",
        "2. Decide keep/refine/hold/reject as local review intent only.",
        "3. Do not infer approval, publishing, scheduling, upload, or receipt truth.",
        "4. If a row comes from Episode 1 or 4, treat the episode warning as context before posting.",
        "",
        "## Shorts",
        "",
    ]
    for row in payload.get("rows", []):
        lines += [
            f"### {row.get('episode')}.{row.get('shortIndex')} - {row.get('humanTitle')}",
            "",
            f"- File: `{row.get('path')}`",
            f"- Duration: `{row.get('durationLabel')}`",
            f"- Status: `{row.get('status')}`",
            f"- Review risk: `{row.get('reviewRisk')}`",
            f"- Open: `{row.get('openCommand')}`",
            f"- Dry-run: `{row.get('dryRunCommand')}`",
            f"- Local keep dry-run: `{(row.get('localReviewCommands') or {}).get('dryRunKeep', '')}`",
            f"- Local refine dry-run: `{(row.get('localReviewCommands') or {}).get('dryRunRefine', '')}`",
            f"- Local hold dry-run: `{(row.get('localReviewCommands') or {}).get('dryRunHold', '')}`",
            f"- Local reject dry-run: `{(row.get('localReviewCommands') or {}).get('dryRunReject', '')}`",
            f"- Record local intent: `{(row.get('localReviewCommands') or {}).get('recordIntent', '')}`",
            f"- Prompt: {row.get('reviewPrompt')}",
            "",
        ]
    lines += [
        "## Safety boundary",
        "",
        "- No external publishing.",
        "- No upload.",
        "- No schedule.",
        "- No approval.",
        "- No account mutation.",
        "- No source mutation.",
        "- No overwrite/delete.",
        "- No receipt truth without a real platform URL or provider id.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def render_csv(path: Path, payload: dict[str, Any]) -> None:
    fieldnames = [
        "id", "episode", "version", "shortIndex", "humanTitle", "path", "exists",
        "durationLabel", "durationSeconds", "status", "reviewRisk", "openCommand",
        "dryRunCommand", "dryRunKeep", "dryRunRefine", "dryRunHold", "dryRunReject",
        "recordIntent", "reviewPrompt",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in payload.get("rows", []):
            commands = row.get("localReviewCommands") if isinstance(row.get("localReviewCommands"), dict) else {}
            writer.writerow({
                **{key: row.get(key, "") for key in fieldnames},
                "dryRunKeep": commands.get("dryRunKeep", ""),
                "dryRunRefine": commands.get("dryRunRefine", ""),
                "dryRunHold": commands.get("dryRunHold", ""),
                "dryRunReject": commands.get("dryRunReject", ""),
                "recordIntent": commands.get("recordIntent", ""),
            })


def render_html(path: Path, payload: dict[str, Any]) -> None:
    count_cards = "".join(
        f"<div><span>{esc(value)}</span><small>{esc(key)}</small></div>"
        for key, value in payload.get("counts", {}).items()
    )
    cards = []
    for row in payload.get("rows", []):
        video = ""
        if row.get("fileUri") and row.get("exists"):
            video = f"<video src=\"{esc(row.get('fileUri'))}\" controls preload=\"metadata\"></video>"
        else:
            video = "<div class=\"missing\">Missing or not playable locally</div>"
        warning = "<span class=\"warn\">episode warning</span>" if row.get("episodeWarning") else "<span class=\"ok\">normal review</span>"
        review_commands = row.get("localReviewCommands") if isinstance(row.get("localReviewCommands"), dict) else {}
        cards.append(f"""
        <article class="card">
          <div class="meta"><span>Episode {esc(row.get('episode'))}</span><span>Short {esc(row.get('shortIndex'))}</span>{warning}<span>{esc(row.get('durationLabel'))}</span></div>
          <h2>{esc(row.get('humanTitle'))}</h2>
          {video}
          <p>{esc(row.get('reviewPrompt'))}</p>
          <details><summary>Commands and notes</summary>
            <p><b>Open</b></p><pre>{esc(row.get('openCommand'))}</pre>
            <p><b>Reveal</b></p><pre>{esc(row.get('revealCommand'))}</pre>
            <p><b>Safe dry-run</b></p><pre>{esc(row.get('dryRunCommand'))}</pre>
            <p><b>Local shorts decision commands</b></p>
            <pre>{esc(review_commands.get('dryRunKeep'))}
{esc(review_commands.get('dryRunRefine'))}
{esc(review_commands.get('dryRunHold'))}
{esc(review_commands.get('dryRunReject'))}
{esc(review_commands.get('recordIntent'))}</pre>
            <p>{esc(row.get('localReviewCommandSafety'))}</p>
            <p><b>Review note templates</b></p>
            <pre>{esc(row.get('keepNoteTemplate'))}
{esc(row.get('refineNoteTemplate'))}
{esc(row.get('holdNoteTemplate'))}
{esc(row.get('rejectNoteTemplate'))}</pre>
          </details>
        </article>
        """)
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Studio next shorts review batch</title>
<style>
:root {{ color-scheme: dark; --bg:#101811; --panel:#1b261b; --panel2:#243321; --ink:#fff4d8; --muted:#c3b894; --gold:#f2cb48; --leaf:#79db8d; --water:#79cce0; --clay:#d57660; --line:#405234; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(121,219,141,.16),transparent 30%),radial-gradient(circle at 88% 8%,rgba(242,203,72,.13),transparent 28%),var(--bg); }}
main {{ max-width:1320px; margin:0 auto; padding:34px 24px 80px; }}
header,.card,.boundary {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(27,38,27,.96),rgba(36,51,33,.9)); border-radius:28px; padding:24px; box-shadow:0 22px 70px rgba(0,0,0,.28); }}
.eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
h1 {{ font-size:clamp(38px,7vw,76px); line-height:.92; margin:0 0 12px; }}
h2 {{ margin:10px 0 14px; font-size:22px; }}
p,li,small {{ color:var(--muted); line-height:1.45; }}
code,pre {{ color:#ffe89a; overflow-wrap:anywhere; white-space:pre-wrap; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:18px 0; }}
.counts div {{ border:1px solid var(--line); background:rgba(0,0,0,.2); border-radius:16px; padding:12px; }}
.counts span {{ display:block; font-size:26px; color:var(--ink); font-weight:900; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:18px; margin-top:18px; }}
.card video {{ width:100%; border-radius:18px; background:#050805; border:1px solid rgba(255,255,255,.1); aspect-ratio:9/16; max-height:520px; object-fit:contain; }}
.meta {{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }}
.meta span {{ background:rgba(0,0,0,.24); border:1px solid var(--line); border-radius:999px; padding:7px 10px; font-size:12px; font-weight:800; }}
.meta .warn {{ color:#ffd0c7; border-color:rgba(213,118,96,.7); }}
.meta .ok {{ color:#c9ffd2; border-color:rgba(121,219,141,.6); }}
details {{ margin-top:12px; }}
summary {{ cursor:pointer; color:var(--water); font-weight:900; }}
.missing {{ min-height:240px; display:grid; place-items:center; color:var(--clay); border:1px solid rgba(213,118,96,.45); border-radius:18px; background:rgba(0,0,0,.25); }}
.boundary {{ margin-top:18px; border-color:rgba(213,118,96,.5); }}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Studio · shorts review</p><h1>Watch the next useful batch, not the whole haystack.</h1><p>{esc(payload.get('plainEnglish'))}</p><p><b>Next safest action:</b> {esc(payload.get('nextSafestAction'))}</p><p><b>Generated:</b> <code>{esc(payload.get('generatedAt'))}</code></p></header>
<section class="counts">{count_cards}</section>
<section class="grid">{''.join(cards)}</section>
<section class="boundary"><p class="eyebrow">Safety boundary</p><ul><li>No external publishing.</li><li>No upload.</li><li>No schedule.</li><li>No external approval.</li><li>No account mutation.</li><li>No source mutation.</li><li>No overwrite/delete.</li><li>No receipt truth without a real platform URL or provider id.</li></ul></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_outputs(root: Path, payload: dict[str, Any]) -> dict[str, str]:
    out_dir = root / "review-board" / "shorts-review-batches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "shorts-review-batch.json"
    md_path = out_dir / "START-HERE-shorts-review-batch.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "shorts-review-batch.csv"
    payload.update({
        "outputPath": str(md_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"].update({"path": str(html_path), "command": open_command(str(html_path))})
    write_json(json_path, payload)
    render_markdown(md_path, payload)
    render_csv(csv_path, payload)
    render_html(html_path, payload)
    pointer = {
        "schema": "quipsly.latest-studio-next-shorts-review-batch.v1",
        "generatedAt": payload["generatedAt"],
        "status": payload["status"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "outputPath": str(md_path),
        "counts": payload["counts"],
        "warningEpisodes": payload.get("warningEpisodes", []),
        "firstSafeAction": payload["firstSafeAction"],
        "firstOpenCommand": payload.get("firstOpenCommand", ""),
        "firstDryRunCommand": payload.get("firstDryRunCommand", ""),
        "firstDryRunDecision": payload.get("firstDryRunDecision", ""),
        "firstDryRunSafety": payload.get("firstDryRunSafety", ""),
        "nextSafestAction": payload.get("nextSafestAction", ""),
        "truth": payload["truth"],
    }
    latest_path = root / LATEST_POINTER
    write_json(latest_path, pointer)
    return {
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "latestPointerPath": str(latest_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Studio shorts review batch.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--include-warnings", action="store_true")
    args = parser.parse_args()
    root = Path(args.root)
    payload = build_payload(root, limit=args.limit, include_warnings=args.include_warnings)
    paths = write_outputs(root, payload)
    print(json.dumps({"status": payload["status"], "counts": payload["counts"], **paths}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
