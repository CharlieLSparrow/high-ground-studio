#!/usr/bin/env python3
"""Render a short mission-review reel from the Human Listen Mission Board.

The Mission Board gives reviewers the path. This script creates the smallest
derived audio reel that covers its focus windows, with chapters and traceability
back to the source proof snippets.

It renders derived review media only. It does not approve audio, unlock branch
inheritance, render edit branches, upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NOTES_SCHEMA = "quipsly.audio-workbench.human-listen-mission-reel-notes.v1"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "m4aPath", "markdownPath", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def seconds_label(value: float) -> str:
    total = int(round(max(0.0, float(value))))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def local_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "`missing`"
    text = label or Path(path).name
    return f"[{text}]({Path(path).as_uri()})" if Path(path).exists() else f"`{path}`"


def html_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "<span class='missing'>missing</span>"
    text = html.escape(label or Path(path).name)
    if Path(path).exists():
        return f"<a href='{html.escape(Path(path).as_uri())}'>{text}</a>"
    return f"<code>{html.escape(path)}</code>"


def run_ffprobe_duration(path: Path, ffprobe: str | None) -> float | None:
    if not ffprobe or not path.exists():
        return None
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return None


def render_reel(ffmpeg: str, concat_list: Path, output_m4a: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_m4a),
        ],
        text=True,
        capture_output=True,
        check=False,
    )


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str, output_dir: Path) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    mission_board, mission_board_path = load_output_report(outputs, "latestAudioHumanListenMissionBoard")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not mission_board:
        raise FileNotFoundError("Human Listen Mission Board report is required before rendering a mission reel.")
    if not ffmpeg:
        raise FileNotFoundError("ffmpeg is required to render the Human Listen Mission Reel.")

    focus_windows = [row for row in mission_board.get("focusWindows") or [] if isinstance(row, dict)]
    items: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    cursor = 0.0
    for index, window in enumerate(focus_windows, start=1):
        snippet = window.get("snippetPath")
        snippet_path = Path(snippet) if isinstance(snippet, str) else None
        exists = bool(snippet_path and snippet_path.exists())
        duration = run_ffprobe_duration(snippet_path, ffprobe) if exists and snippet_path else None
        item = {
            "index": index,
            "windowIndex": window.get("index"),
            "label": window.get("label"),
            "source": window.get("source"),
            "sourceTimecode": window.get("timecode"),
            "sourceStartSeconds": window.get("startSeconds"),
            "sourceEndSeconds": window.get("endSeconds"),
            "reason": window.get("reason"),
            "riskFlags": window.get("riskFlags") or [],
            "snippetPath": str(snippet_path) if snippet_path else None,
            "snippetExists": exists,
            "snippetDurationSeconds": round(duration, 3) if duration is not None else None,
            "reelStartSeconds": round(cursor, 3),
            "reelEndSeconds": round(cursor + (duration or 0.0), 3),
            "reelTimecode": f"{seconds_label(cursor)} - {seconds_label(cursor + (duration or 0.0))}",
        }
        if exists and duration:
            cursor += duration
        else:
            missing.append(item)
        items.append(item)

    concat_list = output_dir / "mission-reel-concat.txt"
    concat_lines = []
    for item in items:
        if item["snippetExists"]:
            concat_lines.append(f"file {shell_quote(str(item['snippetPath']))}")
    concat_list.write_text("\n".join(concat_lines) + ("\n" if concat_lines else ""), encoding="utf-8")
    output_m4a = output_dir / "human-listen-mission-reel.m4a"
    render_result = None
    render_ok = False
    if concat_lines:
        render_result = render_reel(ffmpeg, concat_list, output_m4a)
        render_ok = render_result.returncode == 0 and output_m4a.exists() and output_m4a.stat().st_size > 0
    duration = run_ffprobe_duration(output_m4a, ffprobe) if render_ok else None

    m3u_path = output_dir / "human-listen-mission-reel.m3u"
    m3u_path.write_text("#EXTM3U\n" + str(output_m4a) + "\n", encoding="utf-8")
    chapter_csv = output_dir / "human-listen-mission-reel-chapters.csv"
    with chapter_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "index",
                "label",
                "reelStartSeconds",
                "reelEndSeconds",
                "sourceTimecode",
                "riskFlags",
                "snippetPath",
            ],
        )
        writer.writeheader()
        for item in items:
            writer.writerow(
                {
                    "index": item["index"],
                    "label": item.get("label") or "",
                    "reelStartSeconds": item["reelStartSeconds"],
                    "reelEndSeconds": item["reelEndSeconds"],
                    "sourceTimecode": item.get("sourceTimecode") or "",
                    "riskFlags": ",".join(str(flag) for flag in item.get("riskFlags") or []),
                    "snippetPath": item.get("snippetPath") or "",
                }
            )

    return {
        "schema": "quipsly.audio-workbench.human-listen-mission-reel.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": "ready-for-focused-human-listen" if render_ok and not missing else "needs-snippet-repair",
        "sourceMissionBoardPath": mission_board_path,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "itemCount": len(items),
        "renderedItemCount": sum(1 for item in items if item["snippetExists"]),
        "missingSnippetCount": len(missing),
        "durationSeconds": round(duration, 3) if duration is not None else None,
        "m4aPath": str(output_m4a),
        "m3uPath": str(m3u_path),
        "chapterCsvPath": str(chapter_csv),
        "concatListPath": str(concat_list),
        "items": items,
        "missingSnippets": missing,
        "render": {
            "ok": render_ok,
            "returncode": render_result.returncode if render_result else None,
            "stderr": (render_result.stderr[-4000:] if render_result else ""),
        },
        "nextSafeAction": "Listen to this focused reel as a quick pass, then listen to the full spine before using the guarded human decision route.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "derivedReviewRenderAttempted": bool(concat_lines),
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    notes_template = report.get("notesTemplatePath")
    lines = [
        "# Human Listen Mission Reel",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This derived review reel concatenates the Human Listen Mission Board's focus windows. It is a quick review aid, not full-spine approval.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Items: `{report['itemCount']}`",
        f"- Rendered items: `{report['renderedItemCount']}`",
        f"- Missing snippets: `{report['missingSnippetCount']}`",
        f"- Duration: `{seconds_label(float(report['durationSeconds'] or 0.0))}`",
        f"- M4A: {local_link(report.get('m4aPath'))}",
        f"- Playlist: {local_link(report.get('m3uPath'))}",
        f"- Chapters CSV: {local_link(report.get('chapterCsvPath'))}",
        f"- Notes template: {local_link(notes_template)}",
        f"- Source mission board: {local_link(report.get('sourceMissionBoardPath'))}",
        "",
        "## Chapters",
        "",
        "| # | Reel time | Source time | Flags | Window | Snippet |",
        "|---:|---|---|---|---|---|",
    ]
    for item in report["items"]:
        flags = ", ".join(item.get("riskFlags") or []) or "none"
        lines.append(
            f"| {item['index']} | `{item['reelTimecode']}` | `{item.get('sourceTimecode')}` | `{flags}` | {item.get('label')} | {local_link(item.get('snippetPath'), 'snippet')} |"
        )
    lines.extend(
        [
            "",
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Derived review render attempted: `{str(report['derivedReviewRenderAttempted']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def build_notes_template(report: dict[str, Any], generated_at: str) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for item in report.get("items") or []:
        rows.append(
            {
                "index": item.get("index"),
                "windowIndex": item.get("windowIndex"),
                "label": item.get("label"),
                "reelTimecode": item.get("reelTimecode"),
                "reelStartSeconds": item.get("reelStartSeconds"),
                "reelEndSeconds": item.get("reelEndSeconds"),
                "sourceTimecode": item.get("sourceTimecode"),
                "sourceStartSeconds": item.get("sourceStartSeconds"),
                "sourceEndSeconds": item.get("sourceEndSeconds"),
                "riskFlags": item.get("riskFlags") or [],
                "snippetPath": item.get("snippetPath"),
                "decision": "pending",
                "reviewerNotes": "",
                "repairHint": "",
                "followUpOwner": "",
            }
        )
    return {
        "schema": NOTES_SCHEMA,
        "createdAt": generated_at,
        "exportedAt": generated_at,
        "baselineId": report.get("baselineId"),
        "baselineDir": report.get("baselineDir"),
        "sourceMissionReelPath": report.get("path") or report.get("jsonPath"),
        "sourceMissionReelM4aPath": report.get("m4aPath"),
        "sourceMissionReelHtmlPath": report.get("htmlPath"),
        "sourceMissionBoardPath": report.get("sourceMissionBoardPath"),
        "reviewerName": "",
        "reviewerEmail": "",
        "overallDecision": "pending",
        "decisionOptions": [
            "pending",
            "pass",
            "needs-focused-proof",
            "needs-scoped-repair",
            "fail",
        ],
        "notesInstructions": "Fill one row per Mission Reel chapter. This is focused review evidence, not full-spine approval.",
        "rows": rows,
        "approvalDecisionAllowed": False,
        "branchInheritanceDecisionAllowed": False,
    }


def render_notes_template_markdown(template: dict[str, Any]) -> str:
    lines = [
        "# Human Listen Mission Reel Notes Template",
        "",
        f"Created: `{template['createdAt']}`",
        f"Baseline: `{template['baselineId']}`",
        "",
        "Use this packet to return focused Mission Reel notes. These notes can request scoped repair, focused proof, or record pass context. They do not approve the full audio spine.",
        "",
        "## Reviewer fields",
        "",
        "- `reviewerName`: fill this in the JSON when returning notes.",
        "- `reviewerEmail`: optional.",
        "- `overallDecision`: `pending`, `pass`, `needs-focused-proof`, `needs-scoped-repair`, or `fail`.",
        "",
        "## Rows",
        "",
        "| # | Reel time | Source time | Window | Decision | Notes fields |",
        "|---:|---|---|---|---|---|",
    ]
    for row in template.get("rows") or []:
        lines.append(
            f"| {row.get('index')} | `{row.get('reelTimecode')}` | `{row.get('sourceTimecode')}` | {row.get('label')} | `{row.get('decision')}` | `reviewerNotes`, `repairHint`, `followUpOwner` |"
        )
    lines.extend(
        [
            "",
            "## Safety",
            "",
            f"- Approval decision allowed: `{str(template['approvalDecisionAllowed']).lower()}`",
            f"- Branch inheritance decision allowed: `{str(template['branchInheritanceDecisionAllowed']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for item in report["items"]:
        flags = ", ".join(item.get("riskFlags") or []) or "none"
        cls = "risk" if item.get("riskFlags") else "ok"
        rows.append(
            f"<tr class='{cls}'><td>{item['index']}</td><td><code>{html.escape(item['reelTimecode'])}</code></td><td><code>{html.escape(str(item.get('sourceTimecode')))}</code></td><td>{html.escape(flags)}</td><td>{html.escape(str(item.get('label')))}</td><td>{html_link(item.get('snippetPath'), 'snippet')}</td></tr>"
        )
    audio = ""
    if Path(str(report.get("m4aPath"))).exists():
        audio = f"<audio controls preload='metadata' src='{html.escape(Path(str(report['m4aPath'])).as_uri())}'></audio>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Human Listen Mission Reel</title>
<style>
body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #121812; color: #f5eddc; }}
main {{ max-width: 1120px; margin: 0 auto; padding: 34px; }}
.hero, .card {{ border: 1px solid rgba(245, 237, 220, .16); border-radius: 22px; background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.025)); box-shadow: 0 18px 60px rgba(0,0,0,.28); }}
.hero {{ padding: 28px; margin-bottom: 18px; }}
.card {{ padding: 18px; margin-bottom: 18px; }}
.eyebrow {{ color: #ffd86b; text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 800; }}
h1 {{ font-size: 42px; margin: 0 0 8px; }}
audio {{ width: 100%; margin: 14px 0; }}
.metric {{ display: inline-block; padding: 8px 11px; border-radius: 999px; background: rgba(255,255,255,.08); margin: 4px 6px 4px 0; font-weight: 700; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }}
th, td {{ text-align: left; vertical-align: top; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.11); }}
a {{ color: #8ee7ff; font-weight: 700; text-decoration: none; }}
code {{ color: #ffe08a; }}
.risk td:first-child {{ color: #ff8b8b; font-weight: 900; }}
.missing {{ color: #ff8b8b; font-weight: 800; }}
</style>
</head>
<body>
<main>
<section class="hero">
<p class="eyebrow">Quipsly Studio Sound</p>
<h1>Human Listen Mission Reel</h1>
<p>A short derived reel for the Mission Board focus windows. Listen to this first, then the full spine before approval.</p>
<p>
<span class="metric">status: {html.escape(str(report['status']))}</span>
<span class="metric">items: {report['itemCount']}</span>
<span class="metric">duration: {seconds_label(float(report['durationSeconds'] or 0.0))}</span>
<span class="metric">missing snippets: {report['missingSnippetCount']}</span>
</p>
{audio}
<p>{html_link(report.get('m4aPath'), 'Open M4A')} · {html_link(report.get('m3uPath'), 'Open playlist')} · {html_link(report.get('chapterCsvPath'), 'Open chapter CSV')}</p>
</section>
<section class="card"><h2>Chapters</h2><table><thead><tr><th>#</th><th>Reel time</th><th>Source time</th><th>Flags</th><th>Window</th><th>Snippet</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>
<section class="card"><h2>Safety</h2><p>Approval changed: {str(report['approvalStateChanged']).lower()} · Branch changed: {str(report['branchStateChanged']).lower()} · Derived review render: {str(report['derivedReviewRenderAttempted']).lower()} · Branch render: {str(report['branchRenderAttempted']).lower()} · Original media mutated: {str(report['originalMediaMutated']).lower()}</p></section>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, m4a_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(m4a_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"audio-human-listen-mission-reel-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    report = build_report(manifest_before, baseline_dir, generated_at, output_dir)
    versioned_json = output_dir / "human-listen-mission-reel.json"
    versioned_md = output_dir / "human-listen-mission-reel.md"
    versioned_html = output_dir / "human-listen-mission-reel.html"
    versioned_open = output_dir / "open-human-listen-mission-reel.command"
    stable_json = baseline_dir / "HUMAN_LISTEN_MISSION_REEL.json"
    stable_md = baseline_dir / "HUMAN_LISTEN_MISSION_REEL.md"
    stable_html = baseline_dir / "HUMAN_LISTEN_MISSION_REEL.html"
    stable_m4a = baseline_dir / "HUMAN_LISTEN_MISSION_REEL.m4a"
    stable_m3u = baseline_dir / "HUMAN_LISTEN_MISSION_REEL.m3u"
    stable_csv = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_CHAPTERS.csv"
    stable_open = baseline_dir / "OPEN_HUMAN_LISTEN_MISSION_REEL.command"
    stable_notes_template = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_TEMPLATE.json"
    stable_notes_template_md = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_TEMPLATE.md"
    versioned_notes_template = output_dir / "human-listen-mission-reel-notes-template.json"
    versioned_notes_template_md = output_dir / "human-listen-mission-reel-notes-template.md"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html, Path(report["m4aPath"]), versioned_md)

    versioned_m4a_path = report["m4aPath"]
    versioned_m3u_path = report["m3uPath"]
    versioned_chapter_csv_path = report["chapterCsvPath"]
    shutil.copy2(report["m4aPath"], stable_m4a)
    shutil.copy2(report["m3uPath"], stable_m3u)
    shutil.copy2(report["chapterCsvPath"], stable_csv)
    report["versionedM4aPath"] = versioned_m4a_path
    report["versionedM3uPath"] = versioned_m3u_path
    report["versionedChapterCsvPath"] = versioned_chapter_csv_path
    report["m4aPath"] = str(stable_m4a)
    report["m3uPath"] = str(stable_m3u)
    report["chapterCsvPath"] = str(stable_csv)
    report["path"] = str(stable_json)
    report["jsonPath"] = str(stable_json)
    report["markdownPath"] = str(stable_md)
    report["htmlPath"] = str(stable_html)
    report["stableM4aPath"] = str(stable_m4a)
    report["stableM3uPath"] = str(stable_m3u)
    report["stableChapterCsvPath"] = str(stable_csv)
    report["notesTemplatePath"] = str(stable_notes_template)
    report["notesTemplateMarkdownPath"] = str(stable_notes_template_md)
    notes_template = build_notes_template(report, generated_at)
    write_json(stable_notes_template, notes_template)
    write_json(versioned_notes_template, notes_template)
    notes_template_markdown = render_notes_template_markdown(notes_template)
    stable_notes_template_md.write_text(notes_template_markdown, encoding="utf-8")
    versioned_notes_template_md.write_text(notes_template_markdown, encoding="utf-8")
    stable_markdown = render_markdown(report)
    stable_html_doc = render_html(report)
    write_json(stable_json, report)
    stable_md.write_text(stable_markdown, encoding="utf-8")
    stable_html.write_text(stable_html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_m4a, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "m4aPath": str(stable_m4a),
        "m3uPath": str(stable_m3u),
        "chapterCsvPath": str(stable_csv),
        "openCommand": str(stable_open),
        "notesTemplatePath": str(stable_notes_template),
        "notesTemplateMarkdownPath": str(stable_notes_template_md),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedM4aPath": versioned_m4a_path,
        "versionedM3uPath": versioned_m3u_path,
        "versionedChapterCsvPath": versioned_chapter_csv_path,
        "versionedOpenCommand": str(versioned_open),
        "versionedNotesTemplatePath": str(versioned_notes_template),
        "versionedNotesTemplateMarkdownPath": str(versioned_notes_template_md),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "itemCount": report["itemCount"],
        "renderedItemCount": report["renderedItemCount"],
        "missingSnippetCount": report["missingSnippetCount"],
        "durationSeconds": report["durationSeconds"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "derivedReviewRenderAttempted": report["derivedReviewRenderAttempted"],
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioHumanListenMissionReels", [])
    history.append(entry)
    outputs["latestAudioHumanListenMissionReel"] = entry
    outputs["latestAudioHumanListenMissionReelMarkdown"] = str(stable_md)
    outputs["latestAudioHumanListenMissionReelHtml"] = str(stable_html)
    outputs["latestAudioHumanListenMissionReelM4a"] = str(stable_m4a)
    outputs["latestAudioHumanListenMissionReelM3u"] = str(stable_m3u)
    outputs["latestAudioHumanListenMissionReelChapterCsv"] = str(stable_csv)
    outputs["latestAudioHumanListenMissionReelOpenCommand"] = str(stable_open)
    outputs["latestAudioHumanListenMissionReelNotesTemplate"] = str(stable_notes_template)
    outputs["latestAudioHumanListenMissionReelNotesTemplateMarkdown"] = str(stable_notes_template_md)
    manifest_after["audioHumanListenMissionReelCount"] = len(history)
    manifest_after["audioHumanListenMissionReelLatestStatus"] = report["status"]
    manifest_after["audioHumanListenMissionReelItemCount"] = report["itemCount"]
    manifest_after["audioHumanListenMissionReelRenderedItemCount"] = report["renderedItemCount"]
    manifest_after["audioHumanListenMissionReelMissingSnippetCount"] = report["missingSnippetCount"]
    manifest_after["audioHumanListenMissionReelDurationSeconds"] = report["durationSeconds"]
    manifest_after["audioHumanListenMissionReelLatestGeneratedAt"] = generated_at
    manifest_after["audioHumanListenMissionReelNotesTemplateLatestGeneratedAt"] = generated_at
    manifest_after["audioHumanListenMissionReelApprovalStateChanged"] = False
    manifest_after["audioHumanListenMissionReelBranchStateChanged"] = False
    manifest_after["audioHumanListenMissionReelDerivedReviewRenderAttempted"] = report["derivedReviewRenderAttempted"]
    manifest_after["audioHumanListenMissionReelBranchRenderAttempted"] = False
    manifest_after["audioHumanListenMissionReelUploadAttempted"] = False
    manifest_after["audioHumanListenMissionReelPublicationAttempted"] = False
    manifest_after["audioHumanListenMissionReelOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
