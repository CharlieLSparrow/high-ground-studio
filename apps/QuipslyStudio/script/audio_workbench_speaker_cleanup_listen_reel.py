#!/usr/bin/env python3
"""Render a compact speaker-cleanup listen reel for the current audio baseline.

This turns the 15 speaker-cleanup focus windows into one derived review reel so
humans can check naturalness, echo, over-gating, laughter, breaths, and reaction
preservation without hunting through the full proof pack.

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
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "m4aPath",
            "playlistPath",
            "versionedPath",
        ):
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
    p = Path(path)
    text = label or p.name
    return f"[{text}]({p.as_uri()})" if p.exists() else f"`{path}`"


def html_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "<span class='missing'>missing</span>"
    p = Path(path)
    text = html.escape(label or p.name)
    if p.exists():
        return f"<a href='{html.escape(p.as_uri())}'>{text}</a>"
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


def pick_master_snippet(window: dict[str, Any]) -> dict[str, Any] | None:
    snippets = window.get("snippets") if isinstance(window.get("snippets"), list) else []
    for snippet in snippets:
        if not isinstance(snippet, dict):
            continue
        role = str(snippet.get("role") or "").lower()
        label = str(snippet.get("label") or "").lower()
        if role == "master" or "master" in label:
            return snippet
    return snippets[0] if snippets and isinstance(snippets[0], dict) else None


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str, output_dir: Path) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    acceptance, acceptance_path = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    proof_pack, proof_pack_path = load_output_report(outputs, "latestSpeakerCleanupProofPack")
    decision_matrix, decision_matrix_path = load_output_report(outputs, "latestSpeakerCleanupDecisionMatrix")
    triage_board, triage_board_path = load_output_report(outputs, "latestSpeakerCleanupTriageBoard")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not acceptance:
        raise FileNotFoundError("Speaker Cleanup Acceptance Board is required before rendering the speaker cleanup listen reel.")
    if not proof_pack:
        raise FileNotFoundError("Speaker Cleanup Proof Pack is required before rendering the speaker cleanup listen reel.")
    if not ffmpeg:
        raise FileNotFoundError("ffmpeg is required to render the Speaker Cleanup Listen Reel.")

    proof_windows = [row for row in proof_pack.get("windows") or [] if isinstance(row, dict)]
    acceptance_windows = {
        int(row.get("index") or 0): row
        for row in acceptance.get("focusWindows") or []
        if isinstance(row, dict)
    }
    minimum_path = triage_board.get("minimumListenPath") if isinstance(triage_board.get("minimumListenPath"), list) else []
    order_map = {int(idx): pos for pos, idx in enumerate(minimum_path)}
    proof_windows.sort(key=lambda row: order_map.get(int(row.get("index") or 0), int(row.get("index") or 0) + 1000))

    items: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    cursor = 0.0
    for reel_index, window in enumerate(proof_windows, start=1):
        window_index = int(window.get("index") or reel_index)
        accept = acceptance_windows.get(window_index, {})
        snippet = pick_master_snippet(window)
        snippet_path = Path(str(snippet.get("path"))) if isinstance(snippet, dict) and snippet.get("path") else None
        exists = bool(snippet_path and snippet_path.exists())
        duration = run_ffprobe_duration(snippet_path, ffprobe) if exists and snippet_path else None
        source_start = window.get("start") or accept.get("start") or window.get("clipStart")
        source_end = window.get("end") or accept.get("end")
        reason = window.get("reason") or accept.get("reason") or "speaker cleanup focus window"
        flags = window.get("flags") or accept.get("flags") or []
        item = {
            "index": reel_index,
            "windowIndex": window_index,
            "timecode": accept.get("timecode") or seconds_label(float(source_start or 0.0)),
            "sourceStartSeconds": source_start,
            "sourceEndSeconds": source_end,
            "durationSeconds": window.get("durationSeconds") or accept.get("durationSeconds"),
            "reason": reason,
            "symptom": accept.get("symptom") or "speaker-cleanup",
            "flags": flags,
            "reviewerPrompt": accept.get("reviewerPrompt") or "Does this sound like a whole human conversation, with natural words, breaths, laughs, starts, and reactions intact?",
            "failurePrompt": accept.get("failurePrompt") or "Fail if words, breath, laughter, or emotional reaction sounds clipped, gated, echo-heavy, or unnaturally flattened.",
            "safeActionIfFails": accept.get("safeActionIfFails") or "Create a scoped v007 proof-window repair candidate instead of editing v006 in place.",
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

    concat_list = output_dir / "speaker-cleanup-listen-reel-concat.txt"
    concat_lines = [f"file {shell_quote(str(item['snippetPath']))}" for item in items if item.get("snippetExists")]
    concat_list.write_text("\n".join(concat_lines) + ("\n" if concat_lines else ""), encoding="utf-8")
    output_m4a = output_dir / "speaker-cleanup-listen-reel.m4a"
    render_result = None
    render_ok = False
    if concat_lines:
        render_result = render_reel(ffmpeg, concat_list, output_m4a)
        render_ok = render_result.returncode == 0 and output_m4a.exists() and output_m4a.stat().st_size > 0
    duration = run_ffprobe_duration(output_m4a, ffprobe) if render_ok else None

    m3u_path = output_dir / "speaker-cleanup-listen-reel.m3u"
    m3u_path.write_text("#EXTM3U\n" + str(output_m4a) + "\n", encoding="utf-8")
    chapter_csv = output_dir / "speaker-cleanup-listen-reel-chapters.csv"
    with chapter_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "index",
                "windowIndex",
                "reelStartSeconds",
                "reelEndSeconds",
                "sourceTimecode",
                "reason",
                "flags",
                "snippetPath",
            ],
        )
        writer.writeheader()
        for item in items:
            writer.writerow(
                {
                    "index": item["index"],
                    "windowIndex": item["windowIndex"],
                    "reelStartSeconds": item["reelStartSeconds"],
                    "reelEndSeconds": item["reelEndSeconds"],
                    "sourceTimecode": item.get("timecode") or "",
                    "reason": item.get("reason") or "",
                    "flags": ",".join(str(flag) for flag in item.get("flags") or []),
                    "snippetPath": item.get("snippetPath") or "",
                }
            )

    return {
        "schema": "quipsly.audio-workbench.speaker-cleanup-listen-reel.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": "ready-for-speaker-cleanup-human-listen" if render_ok and not missing else "needs-speaker-cleanup-snippet-repair",
        "sourceAcceptanceBoardPath": acceptance_path,
        "sourceProofPackPath": proof_pack_path,
        "sourceDecisionMatrixPath": decision_matrix_path,
        "sourceTriageBoardPath": triage_board_path,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "itemCount": len(items),
        "renderedItemCount": sum(1 for item in items if item["snippetExists"]),
        "missingSnippetCount": len(missing),
        "mustListenCount": int(acceptance.get("mustListenCount") or 0),
        "durationSeconds": round(duration, 3) if duration is not None else None,
        "m4aPath": str(output_m4a),
        "m3uPath": str(m3u_path),
        "chapterCsvPath": str(chapter_csv),
        "concatListPath": str(concat_list),
        "items": items,
        "missingSnippets": missing,
        "ffmpegReturnCode": render_result.returncode if render_result else None,
        "ffmpegStderrTail": (render_result.stderr[-4000:] if render_result else ""),
        "derivedReviewRenderAttempted": bool(concat_lines),
        "branchRenderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafeAction": "Listen to this reel for chopped, echo-heavy, over-gated, or flattened human moments. Route exact failures to a scoped v007 repair candidate; do not edit v006 in place.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Listen Reel: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Status: `{report['status']}`",
        "",
        "This is derived review media. It does not approve audio, unlock branch inheritance, render edit branches, upload, publish, or mutate original media.",
        "",
        "## Listen target",
        "",
        f"- Reel: {local_link(report.get('m4aPath'), 'speaker-cleanup-listen-reel.m4a')}",
        f"- Playlist: {local_link(report.get('m3uPath'), 'speaker-cleanup-listen-reel.m3u')}",
        f"- Chapters CSV: {local_link(report.get('chapterCsvPath'), 'speaker-cleanup-listen-reel-chapters.csv')}",
        f"- Items: `{report['itemCount']}`",
        f"- Rendered items: `{report['renderedItemCount']}`",
        f"- Missing snippets: `{report['missingSnippetCount']}`",
        f"- Duration: `{report.get('durationSeconds')}` seconds",
        "",
        "## What to listen for",
        "",
        "Fail a window if words, breath, laughter, emotional reaction, or conversational cadence sounds clipped, gated, echo-heavy, or unnaturally flattened. Passing this reel is not full approval; it only clears the speaker-cleanup naturalness concern.",
        "",
        "## Reel chapters",
        "",
        "| # | Reel time | Source time | Reason | Flags | Prompt |",
        "|---:|---|---|---|---|---|",
    ]
    for item in report["items"]:
        flags = ", ".join(str(flag) for flag in item.get("flags") or [])
        lines.append(
            f"| {item['index']} | `{item['reelTimecode']}` | `{item.get('timecode')}` | {item.get('reason')} | {flags or 'none'} | {item.get('reviewerPrompt')} |"
        )
    lines.extend([
        "",
        "## Next safe action",
        "",
        report["nextSafeAction"],
        "",
    ])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for item in report["items"]:
        flags = ", ".join(str(flag) for flag in item.get("flags") or [])
        rows.append(
            "<tr>"
            f"<td>{item['index']}</td>"
            f"<td><b>{html.escape(item['reelTimecode'])}</b></td>"
            f"<td>{html.escape(str(item.get('timecode') or ''))}</td>"
            f"<td>{html.escape(str(item.get('reason') or ''))}</td>"
            f"<td>{html.escape(flags or 'none')}</td>"
            f"<td>{html.escape(str(item.get('reviewerPrompt') or ''))}</td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<title>Speaker Cleanup Listen Reel</title>
<style>
:root {{ color-scheme: dark; --bg:#111711; --panel:#1d271f; --ink:#f3ecd8; --muted:#c9bfa8; --gold:#d8b64c; --green:#77d489; --line:#43513f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 20% 0%, #293725, var(--bg)); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:36px; }}
header,.card {{ border:1px solid var(--line); background:rgba(29,39,31,.9); border-radius:24px; padding:24px; box-shadow:0 18px 50px rgba(0,0,0,.25); margin-bottom:18px; }}
h1 {{ margin:0 0 8px; }} p {{ color:var(--muted); line-height:1.5; }}
.badge {{ display:inline-block; padding:7px 11px; border-radius:999px; background:#2a3428; color:var(--gold); margin:5px 6px 0 0; font-weight:800; }}
a {{ color:#ffe08a; }} audio {{ width:100%; margin:18px 0; }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }} th,td {{ border-bottom:1px solid var(--line); padding:10px; vertical-align:top; }} th {{ text-align:left; color:var(--gold); }}
</style>
</head>
<body><main>
<header>
<p class='badge'>Speaker Cleanup</p><p class='badge'>Derived Review Reel</p>
<h1>Speaker cleanup listen reel</h1>
<p>One compact pass over the 15 speaker-cleanup windows. Listen for chopped words, gate snap, echo bleed, flattened laughs, and unnatural cadence.</p>
<div><span class='badge'>status: {html.escape(report['status'])}</span><span class='badge'>items: {report['itemCount']}</span><span class='badge'>missing: {report['missingSnippetCount']}</span><span class='badge'>duration: {report.get('durationSeconds')}s</span></div>
<audio controls src='{html.escape(Path(report['m4aPath']).as_uri())}'></audio>
<p>{html_link(report.get('m4aPath'), 'Open M4A')} · {html_link(report.get('m3uPath'), 'Open playlist')} · {html_link(report.get('chapterCsvPath'), 'Open chapters CSV')}</p>
</header>
<section class='card'><h2>What to listen for</h2><p>Fail a window if words, breath, laughter, emotional reaction, or conversational cadence sounds clipped, gated, echo-heavy, or unnaturally flattened. Passing this reel does not approve the episode; it only clears the speaker-cleanup naturalness concern.</p></section>
<section class='card'><h2>Chapters</h2><table><thead><tr><th>#</th><th>Reel time</th><th>Source</th><th>Reason</th><th>Flags</th><th>Prompt</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>
<section class='card'><h2>Next safe action</h2><p>{html.escape(report['nextSafeAction'])}</p></section>
</main></body></html>"""


def write_open_command(path: Path, html_path: Path, m4a_path: Path) -> None:
    path.write_text(
        "\n".join([
            "#!/bin/sh",
            "set -e",
            "open " + shell_quote(str(html_path)),
            "open " + shell_quote(str(m4a_path)),
            "",
        ]),
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"speaker-cleanup-listen-reel-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    report = build_report(manifest, baseline_dir, generated_at, output_dir)
    markdown = render_markdown(report)
    html_doc = render_html(report)

    stable_json = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL.md"
    stable_html = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL.html"
    stable_m4a = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL.m4a"
    stable_m3u = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL.m3u"
    stable_csv = baseline_dir / "SPEAKER_CLEANUP_LISTEN_REEL_CHAPTERS.csv"
    stable_open = baseline_dir / "OPEN_SPEAKER_CLEANUP_LISTEN_REEL.command"

    versioned_json = output_dir / "speaker-cleanup-listen-reel.json"
    versioned_md = output_dir / "speaker-cleanup-listen-reel.md"
    versioned_html = output_dir / "speaker-cleanup-listen-reel.html"
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")

    shutil.copy2(report["m4aPath"], stable_m4a)
    shutil.copy2(report["m3uPath"], stable_m3u)
    shutil.copy2(report["chapterCsvPath"], stable_csv)
    report["stableM4aPath"] = str(stable_m4a)
    report["stableM3uPath"] = str(stable_m3u)
    report["stableChapterCsvPath"] = str(stable_csv)
    report["jsonPath"] = str(stable_json)
    report["markdownPath"] = str(stable_md)
    report["htmlPath"] = str(stable_html)
    report["openCommand"] = str(stable_open)
    report["versionedJsonPath"] = str(versioned_json)
    report["versionedMarkdownPath"] = str(versioned_md)
    report["versionedHtmlPath"] = str(versioned_html)
    write_json(stable_json, report)
    stable_md.write_text(render_markdown(report), encoding="utf-8")
    stable_html.write_text(render_html(report), encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_m4a)

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
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "itemCount": report["itemCount"],
        "renderedItemCount": report["renderedItemCount"],
        "missingSnippetCount": report["missingSnippetCount"],
        "mustListenCount": report["mustListenCount"],
        "durationSeconds": report["durationSeconds"],
        "derivedReviewRenderAttempted": report["derivedReviewRenderAttempted"],
        "branchRenderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("speakerCleanupListenReels", [])
    history.append(entry)
    outputs["latestSpeakerCleanupListenReel"] = entry
    outputs["latestSpeakerCleanupListenReelMarkdown"] = str(stable_md)
    outputs["latestSpeakerCleanupListenReelHtml"] = str(stable_html)
    outputs["latestSpeakerCleanupListenReelM4a"] = str(stable_m4a)
    outputs["latestSpeakerCleanupListenReelM3u"] = str(stable_m3u)
    outputs["latestSpeakerCleanupListenReelChapterCsv"] = str(stable_csv)
    outputs["latestSpeakerCleanupListenReelOpenCommand"] = str(stable_open)
    manifest_after["speakerCleanupListenReelCount"] = len(history)
    manifest_after["speakerCleanupListenReelLatestStatus"] = report["status"]
    manifest_after["speakerCleanupListenReelItemCount"] = report["itemCount"]
    manifest_after["speakerCleanupListenReelRenderedItemCount"] = report["renderedItemCount"]
    manifest_after["speakerCleanupListenReelMissingSnippetCount"] = report["missingSnippetCount"]
    manifest_after["speakerCleanupListenReelMustListenCount"] = report["mustListenCount"]
    manifest_after["speakerCleanupListenReelDurationSeconds"] = report["durationSeconds"]
    manifest_after["speakerCleanupListenReelLatestGeneratedAt"] = generated_at
    manifest_after["speakerCleanupListenReelDerivedReviewRenderAttempted"] = report["derivedReviewRenderAttempted"]
    manifest_after["speakerCleanupListenReelBranchRenderAttempted"] = False
    manifest_after["speakerCleanupListenReelApprovalStateChanged"] = False
    manifest_after["speakerCleanupListenReelBranchStateChanged"] = False
    manifest_after["speakerCleanupListenReelRenderAttempted"] = False
    manifest_after["speakerCleanupListenReelUploadAttempted"] = False
    manifest_after["speakerCleanupListenReelPublicationAttempted"] = False
    manifest_after["speakerCleanupListenReelOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
