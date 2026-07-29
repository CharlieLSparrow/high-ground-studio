#!/usr/bin/env python3
"""Create a compact ASR review focus packet for the active audio spine.

This packet turns proof-window ASR source/master comparison risks into a
reviewer-friendly surface. It does not approve audio, unlock branches, render
media, upload, publish, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[Path | None, dict[str, Any]]:
    path = output_path(outputs.get(key))
    if not path or not path.exists() or path.suffix.lower() != ".json":
        return path, {}
    try:
        return path, read_json(path)
    except json.JSONDecodeError:
        return path, {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def int_value(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def seconds_to_timecode(value: Any) -> str:
    seconds = int_value(value)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def load_transcript_text(path_value: Any, limit: int = 420) -> str:
    if not isinstance(path_value, str) or not path_value:
        return ""
    path = Path(path_value)
    if not path.exists():
        return ""
    try:
        payload = read_json(path)
    except (json.JSONDecodeError, OSError):
        return ""
    text = str(payload.get("text") or "").strip()
    if not text:
        segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
        text = " ".join(str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)).strip()
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "..."
    return text


def risk_rows(comparison: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in comparison.get("comparisons") if isinstance(comparison.get("comparisons"), list) else []:
        if not isinstance(row, dict) or row.get("severity") == "pass":
            continue
        window_id = str(row.get("windowId") or "unknown")
        rows.append(
            {
                "windowId": window_id,
                "timecode": seconds_to_timecode(window_id if window_id.isdigit() else 0),
                "severity": row.get("severity"),
                "comparisonRole": row.get("comparisonRole"),
                "reason": row.get("reason"),
                "masterWordCount": int_value(row.get("masterWordCount")),
                "comparisonWordCount": int_value(row.get("comparisonWordCount")),
                "masterToComparisonWordRatio": row.get("masterToComparisonWordRatio"),
                "tokenJaccard": row.get("tokenJaccard"),
                "sequenceSimilarity": row.get("sequenceSimilarity"),
                "missingFromMasterSample": row.get("missingFromMasterSample") if isinstance(row.get("missingFromMasterSample"), list) else [],
                "extraInMasterSample": row.get("extraInMasterSample") if isinstance(row.get("extraInMasterSample"), list) else [],
                "masterTranscriptJson": row.get("masterTranscriptJson"),
                "comparisonTranscriptJson": row.get("comparisonTranscriptJson"),
                "masterTranscriptSample": load_transcript_text(row.get("masterTranscriptJson")),
                "comparisonTranscriptSample": load_transcript_text(row.get("comparisonTranscriptJson")),
                "safeActionIfFails": "Keep v006 locked. Record the exact audible symptom and route a scoped v007 repair/proof window instead of retuning the full chain.",
            }
        )
    return sorted(rows, key=lambda row: int_value(row.get("windowId")))


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# ASR Review Focus Packet",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Status: `{report['status']}`",
        "",
        "This packet exists to make the ASR review risk easy to check during the morning listen. It is evidence routing only: it does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Summary",
        "",
        f"- ASR comparison status: `{report['asrSourceMasterComparisonStatus']}`",
        f"- Pair comparisons: `{report['pairComparisonCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        "",
        "## Listen targets",
        "",
    ]
    if not report["focusWindows"]:
        lines.append("- No ASR source/master focus windows are currently flagged.")
    for row in report["focusWindows"]:
        missing = ", ".join(str(item) for item in row.get("missingFromMasterSample", [])[:18]) or "none"
        lines.extend(
            [
                f"### {row['timecode']} - {row['severity']} vs {row['comparisonRole']}",
                "",
                f"- Reason: {row['reason']}",
                f"- Master words: `{row['masterWordCount']}`",
                f"- Comparison words: `{row['comparisonWordCount']}`",
                f"- Token Jaccard: `{row['tokenJaccard']}`",
                f"- Sequence similarity: `{row['sequenceSimilarity']}`",
                f"- Missing-from-master sample: `{missing}`",
                f"- Safe action if it really sounds wrong: {row['safeActionIfFails']}",
                "",
                "Master ASR sample:",
                "",
                f"> {row.get('masterTranscriptSample') or '(empty)'}",
                "",
                "Comparison ASR sample:",
                "",
                f"> {row.get('comparisonTranscriptSample') or '(empty)'}",
                "",
            ]
        )
    lines.extend(
        [
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        ]
    )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any], markdown_path: Path) -> str:
    rows = []
    for row in report["focusWindows"]:
        missing = ", ".join(str(item) for item in row.get("missingFromMasterSample", [])[:18]) or "none"
        rows.append(
            f"""
            <article class="focus {html.escape(str(row.get('severity')))}">
              <h2>{html.escape(row['timecode'])} - {html.escape(str(row.get('severity')))} vs {html.escape(str(row.get('comparisonRole')))}</h2>
              <p><strong>Reason:</strong> {html.escape(str(row.get('reason')))}</p>
              <p><strong>Words:</strong> master {row.get('masterWordCount')} / comparison {row.get('comparisonWordCount')} | <strong>Jaccard:</strong> {row.get('tokenJaccard')} | <strong>Similarity:</strong> {row.get('sequenceSimilarity')}</p>
              <p><strong>Missing-from-master sample:</strong> <code>{html.escape(missing)}</code></p>
              <p><strong>Safe action if it really sounds wrong:</strong> {html.escape(str(row.get('safeActionIfFails')))}</p>
              <div class="grid">
                <section><h3>Master ASR sample</h3><p>{html.escape(row.get('masterTranscriptSample') or '(empty)')}</p></section>
                <section><h3>Comparison ASR sample</h3><p>{html.escape(row.get('comparisonTranscriptSample') or '(empty)')}</p></section>
              </div>
            </article>
            """
        )
    focus_html = "\n".join(rows) or "<p>No ASR source/master focus windows are currently flagged.</p>"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>ASR Review Focus Packet</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; background:#f8f1e3; color:#2b2318; margin:32px; }}
main {{ max-width:1180px; margin:auto; }}
.hero,.focus {{ background:#fffaf0; border:1px solid #dec9a3; border-radius:22px; padding:22px; margin:18px 0; box-shadow:0 16px 48px rgba(56,42,18,.10); }}
.pill {{ display:inline-block; padding:8px 12px; border-radius:999px; background:#173f35; color:#f7e7bb; font-weight:800; margin-right:8px; }}
.review-risk {{ border-color:#b98228; }} .hard-stop {{ border-color:#a83232; }} code {{ background:#eee1c9; padding:2px 5px; border-radius:6px; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }} section {{ background:#f6ecd8; border-radius:16px; padding:14px; }}
@media (max-width: 760px) {{ .grid {{ grid-template-columns:1fr; }} body {{ margin:16px; }} }}
</style></head><body><main>
<section class="hero">
<p><span class="pill">{html.escape(report['status'])}</span><span class="pill">Hard stops {report['hardStopCount']}</span><span class="pill">Review risks {report['reviewRiskCount']}</span></p>
<h1>ASR Review Focus Packet</h1>
<p>This is the ASR semantic drift check for the v006 audio spine. It routes listen targets. It does not approve audio or unlock rendering.</p>
<p><a href="{html.escape(markdown_path.name)}">Open Markdown companion</a></p>
</section>
{focus_html}
</main></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") if isinstance(manifest_before.get("outputs"), dict) else {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = stamp()

    comparison_path, comparison = load_output_report(outputs_before, "latestAudioAsrSourceMasterComparison")
    focus_windows = risk_rows(comparison)
    hard_stop_count = int_value(comparison.get("hardStopCount"))
    review_risk_count = int_value(comparison.get("reviewRiskCount"))
    if hard_stop_count:
        status = "asr-review-focus-hard-stops"
    elif review_risk_count:
        status = "asr-review-focus-ready-with-review-risks"
    elif comparison:
        status = "asr-review-focus-ready"
    else:
        status = "asr-review-focus-needs-comparison"

    versioned_dir = baseline_dir / f"audio-asr-review-focus-packet-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "AUDIO_ASR_REVIEW_FOCUS_PACKET.json"
    stable_md = baseline_dir / "AUDIO_ASR_REVIEW_FOCUS_PACKET.md"
    stable_html = baseline_dir / "AUDIO_ASR_REVIEW_FOCUS_PACKET.html"
    stable_open = baseline_dir / "OPEN_AUDIO_ASR_REVIEW_FOCUS_PACKET.command"
    versioned_json = versioned_dir / "asr-review-focus-packet.json"
    versioned_md = versioned_dir / "asr-review-focus-packet.md"
    versioned_html = versioned_dir / "asr-review-focus-packet.html"
    versioned_open = versioned_dir / "open-asr-review-focus-packet.command"

    report = {
        "schema": "quipsly.audio-workbench.asr-review-focus-packet.v1",
        "generatedAt": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "asrSourceMasterComparison": str(comparison_path) if comparison_path else None,
        "asrSourceMasterComparisonStatus": comparison.get("status"),
        "pairComparisonCount": int_value(comparison.get("pairComparisonCount")),
        "focusWindowCount": len(focus_windows),
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": review_risk_count,
        "focusWindows": focus_windows,
        "currentGateEffect": "listen-target routing only; does-not-unlock-rendering; does-not-approve-audio",
        "approvalStatus": manifest_before.get("approvalStatus"),
        "humanListenStillRequired": manifest_before.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJson": str(versioned_json),
        "versionedMarkdown": str(versioned_md),
        "versionedHtml": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
    }

    for path in (stable_json, versioned_json):
        write_json(path, report)
    markdown = render_markdown(report)
    stable_md.write_text(markdown, encoding="utf-8")
    versioned_md.write_text(markdown, encoding="utf-8")
    html_text = render_html(report, stable_md)
    stable_html.write_text(html_text, encoding="utf-8")
    versioned_html.write_text(render_html(report, versioned_md), encoding="utf-8")
    for open_path, target in ((stable_open, stable_html), (versioned_open, versioned_html)):
        open_path.write_text("#!/usr/bin/env bash\nset -euo pipefail\nopen " + shlex.quote(str(target)) + "\n", encoding="utf-8")
        open_path.chmod(0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
    }
    outputs["latestAudioAsrReviewFocusPacket"] = entry
    outputs["latestAudioAsrReviewFocusPacketMarkdown"] = str(stable_md)
    outputs["latestAudioAsrReviewFocusPacketHtml"] = str(stable_html)
    outputs["latestAudioAsrReviewFocusPacketOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioAsrReviewFocusPackets", [])
    if str(versioned_json) not in history:
        history.append(str(versioned_json))
    manifest["audioAsrReviewFocusPacketCount"] = len(history)
    manifest["audioAsrReviewFocusPacketLatestStatus"] = status
    manifest["audioAsrReviewFocusPacketFocusWindowCount"] = len(focus_windows)
    manifest["audioAsrReviewFocusPacketHardStopCount"] = hard_stop_count
    manifest["audioAsrReviewFocusPacketReviewRiskCount"] = review_risk_count
    manifest["audioAsrReviewFocusPacketHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioAsrReviewFocusPacketApprovalStateChanged"] = False
    manifest["audioAsrReviewFocusPacketBranchStateChanged"] = False
    manifest["audioAsrReviewFocusPacketRenderAttempted"] = False
    manifest["audioAsrReviewFocusPacketBranchRenderAttempted"] = False
    manifest["audioAsrReviewFocusPacketUploadAttempted"] = False
    manifest["audioAsrReviewFocusPacketPublicationAttempted"] = False
    manifest["audioAsrReviewFocusPacketOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "status": status,
        "focusWindowCount": len(focus_windows),
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": review_risk_count,
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
