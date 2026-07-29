#!/usr/bin/env python3
"""Compare proof-window ASR between source-aware/raw windows and the mastered spine.

This is a semantic drift detector, not an audio approval system. It uses local
Whisper JSON artifacts produced by audio_workbench_asr_evidence_adapter.py to
flag windows where the mastered spine may have lost speech relative to a source
or source-aware proof window.
"""

from __future__ import annotations

import argparse
import difflib
import html
import json
import re
import shlex
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORD_RE = re.compile(r"[a-z0-9']+")
WINDOW_RE = re.compile(r"(\d{3,5})s")


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


def load_transcript(path: str | None) -> dict[str, Any]:
    if not path:
        return {"text": "", "segments": [], "words": []}
    p = Path(path)
    if not p.exists():
        return {"text": "", "segments": [], "words": []}
    payload = read_json(p)
    text = str(payload.get("text") or "")
    segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
    words: list[str] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        segment_words = segment.get("words")
        if isinstance(segment_words, list):
            for word in segment_words:
                if isinstance(word, dict):
                    token = str(word.get("word") or "").strip()
                    if token:
                        words.append(token)
        else:
            words.extend(str(segment.get("text") or "").split())
    if not words:
        words = text.split()
    return {"text": text, "segments": segments, "words": words}


def normalized_words(text_or_words: str | list[str]) -> list[str]:
    if isinstance(text_or_words, list):
        text = " ".join(text_or_words)
    else:
        text = text_or_words
    return WORD_RE.findall(text.lower())


def window_id_for(result: dict[str, Any]) -> str:
    haystack = " ".join(str(result.get(k) or "") for k in ("targetId", "sourcePath", "transcriptJson"))
    match = WINDOW_RE.search(haystack)
    return match.group(1) if match else "unknown"


def compare_words(master_words: list[str], other_words: list[str]) -> dict[str, Any]:
    master_set = set(master_words)
    other_set = set(other_words)
    union = master_set | other_set
    intersection = master_set & other_set
    jaccard = round(len(intersection) / len(union), 3) if union else 1.0
    sequence_ratio = round(difflib.SequenceMatcher(a=" ".join(master_words), b=" ".join(other_words)).ratio(), 3) if (master_words or other_words) else 1.0
    ratio = round((len(master_words) / len(other_words)), 3) if other_words else (1.0 if not master_words else 999.0)
    missing_from_master = sorted(other_set - master_set)[:30]
    extra_in_master = sorted(master_set - other_set)[:30]
    return {
        "masterWordCount": len(master_words),
        "comparisonWordCount": len(other_words),
        "masterToComparisonWordRatio": ratio,
        "tokenJaccard": jaccard,
        "sequenceSimilarity": sequence_ratio,
        "missingFromMasterSample": missing_from_master,
        "extraInMasterSample": extra_in_master,
    }


def classify(comparison: dict[str, Any]) -> tuple[str, str]:
    other_words = comparison["comparisonWordCount"]
    master_words = comparison["masterWordCount"]
    ratio = comparison["masterToComparisonWordRatio"]
    similarity = comparison["sequenceSimilarity"]
    jaccard = comparison["tokenJaccard"]
    if other_words >= 20 and master_words == 0:
        return "hard-stop", "comparison transcript has speech but master transcript is empty"
    if other_words >= 30 and ratio < 0.55:
        return "hard-stop", "master transcript has far fewer words than comparison window"
    if other_words >= 20 and jaccard < 0.25:
        return "review-risk", "token overlap is low enough to listen/check this window"
    if other_words >= 20 and ratio < 0.75 and (similarity < 0.45 or jaccard < 0.55):
        return "review-risk", "master transcript is shorter and semantically different enough to check"
    if other_words >= 20 and similarity < 0.25 and jaccard < 0.5:
        return "review-risk", "order/phrase similarity and token overlap are both weak"
    return "pass", "no obvious ASR-level speech loss detected"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# ASR Source/Master Comparison",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Status: `{report['status']}`",
        f"Windows compared: `{report['windowComparisonCount']}`",
        f"Pair comparisons: `{report['pairComparisonCount']}`",
        f"Hard stops: `{report['hardStopCount']}`",
        f"Review risks: `{report['reviewRiskCount']}`",
        "",
        "This is a semantic drift detector. It does not approve audio, unlock branches, render final episodes, upload, publish, or mutate original media.",
        "",
        "| Window | Comparison | Severity | Master words | Other words | Ratio | Jaccard | Similarity | Reason |",
        "|---|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for row in report["comparisons"]:
        lines.append(
            f"| `{row['windowId']}s` | `{row['comparisonRole']}` | `{row['severity']}` | `{row['masterWordCount']}` | `{row['comparisonWordCount']}` | `{row['masterToComparisonWordRatio']}` | `{row['tokenJaccard']}` | `{row['sequenceSimilarity']}` | {row['reason']} |"
        )
    lines.extend(["", "## Missing-master token samples", ""])
    for row in report["comparisons"]:
        if row["severity"] != "pass":
            lines.append(f"- `{row['windowId']}s` vs `{row['comparisonRole']}`: `{', '.join(row['missingFromMasterSample'][:18])}`")
    if not any(row["severity"] != "pass" for row in report["comparisons"]):
        lines.append("- None flagged by this heuristic.")
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown_path: Path) -> str:
    rows = "\n".join(
        f"<tr><td><code>{html.escape(row['windowId'])}s</code></td><td>{html.escape(row['comparisonRole'])}</td><td>{html.escape(row['severity'])}</td><td>{row['masterWordCount']}</td><td>{row['comparisonWordCount']}</td><td>{row['masterToComparisonWordRatio']}</td><td>{row['tokenJaccard']}</td><td>{row['sequenceSimilarity']}</td><td>{html.escape(row['reason'])}</td></tr>"
        for row in report["comparisons"]
    ) or "<tr><td colspan='9'>No comparable ASR pairs yet.</td></tr>"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>ASR Source/Master Comparison</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; background:#f5efe2; color:#2d241a; margin:32px; }}
main {{ max-width:1200px; margin:auto; background:#fff9ec; border:1px solid #dac6a3; border-radius:22px; padding:28px; box-shadow:0 18px 54px rgba(64,42,18,.12); }}
table {{ width:100%; border-collapse:collapse; }} th,td {{ border-bottom:1px solid #e4d4ba; padding:8px; text-align:left; vertical-align:top; }}
.pill {{ display:inline-block; padding:7px 11px; border-radius:999px; background:#173f35; color:#f7e7bb; font-weight:700; margin-right:6px; }} code {{ background:#eee1c9; padding:2px 5px; border-radius:6px; }}
</style></head><body><main>
<p><span class="pill">{html.escape(report['status'])}</span><span class="pill">Hard stops {report['hardStopCount']}</span><span class="pill">Review risks {report['reviewRiskCount']}</span></p>
<h1>ASR Source/Master Comparison</h1>
<p>Semantic drift detector for proof windows. It helps catch missing speech; it does not replace listening.</p>
<table><tr><th>Window</th><th>Comparison</th><th>Severity</th><th>Master words</th><th>Other words</th><th>Ratio</th><th>Jaccard</th><th>Similarity</th><th>Reason</th></tr>{rows}</table>
<p><a href="{html.escape(markdown_path.name)}">Open Markdown companion</a></p>
</main></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = stamp()

    asr_adapter_path, asr_adapter = load_output_report(outputs_before, "latestAudioAsrEvidenceAdapter")
    results: list[dict[str, Any]] = []
    if isinstance(asr_adapter.get("asrResults"), list):
        results = [r for r in asr_adapter.get("asrResults") if isinstance(r, dict) and r.get("ok")]

    by_window: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for result in results:
        role = str(result.get("role") or "unknown")
        window_id = window_id_for(result)
        transcript = load_transcript(result.get("transcriptJson"))
        result = dict(result)
        result["normalizedWords"] = normalized_words(transcript["words"])
        result["textSample"] = str(transcript.get("text") or "")[:500]
        if role == "master-proof-window":
            by_window[window_id]["master"] = result
        elif role == "source-aware-proof-window":
            by_window[window_id]["source-aware"] = result
        elif role == "raw-aligned-proof-window":
            by_window[window_id]["raw-aligned"] = result
        elif role == "speaker-split-proof-window":
            by_window[window_id]["speaker-split"] = result

    comparisons: list[dict[str, Any]] = []
    for window_id, roles in sorted(by_window.items(), key=lambda item: item[0]):
        master = roles.get("master")
        if not master:
            continue
        for comparison_role in ("source-aware", "raw-aligned", "speaker-split"):
            other = roles.get(comparison_role)
            if not other:
                continue
            metrics = compare_words(master["normalizedWords"], other["normalizedWords"])
            severity, reason = classify(metrics)
            comparisons.append(
                {
                    "windowId": window_id,
                    "comparisonRole": comparison_role,
                    "severity": severity,
                    "reason": reason,
                    "masterTargetId": master.get("targetId"),
                    "comparisonTargetId": other.get("targetId"),
                    "masterTranscriptJson": master.get("transcriptJson"),
                    "comparisonTranscriptJson": other.get("transcriptJson"),
                    **metrics,
                }
            )

    hard_stop_count = sum(1 for row in comparisons if row["severity"] == "hard-stop")
    review_risk_count = sum(1 for row in comparisons if row["severity"] == "review-risk")
    if hard_stop_count:
        status = "asr-source-master-comparison-hard-stops"
    elif review_risk_count:
        status = "asr-source-master-comparison-ready-with-review-risks"
    elif comparisons:
        status = "asr-source-master-comparison-ready"
    else:
        status = "asr-source-master-comparison-needs-paired-transcripts"

    work_dir = baseline_dir / f"audio-asr-source-master-comparison-{slug}-{generated_at}"
    work_dir.mkdir(parents=True, exist_ok=True)
    json_path = work_dir / "audio-asr-source-master-comparison.json"
    markdown_path = work_dir / "audio-asr-source-master-comparison.md"
    html_path = work_dir / "audio-asr-source-master-comparison.html"
    open_command = work_dir / "OPEN_AUDIO_ASR_SOURCE_MASTER_COMPARISON.command"

    report = {
        "schema": "quipsly.audio-workbench.asr-source-master-comparison.v1",
        "generatedAt": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "asrEvidenceAdapter": str(asr_adapter_path) if asr_adapter_path else None,
        "asrTranscriptCount": len(results),
        "windowComparisonCount": len(by_window),
        "pairComparisonCount": len(comparisons),
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": review_risk_count,
        "comparisons": comparisons,
        "currentGateEffect": "semantic drift evidence only; does-not-unlock-rendering; does-not-approve-audio",
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
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
        "openCommand": str(open_command),
    }
    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report, markdown_path), encoding="utf-8")
    open_command.write_text("#!/usr/bin/env bash\nset -euo pipefail\nopen " + shlex.quote(str(html_path)) + "\n", encoding="utf-8")
    open_command.chmod(0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioAsrSourceMasterComparison"] = str(json_path)
    outputs["latestAudioAsrSourceMasterComparisonMarkdown"] = str(markdown_path)
    outputs["latestAudioAsrSourceMasterComparisonHtml"] = str(html_path)
    outputs["latestAudioAsrSourceMasterComparisonOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioAsrSourceMasterComparisons", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioAsrSourceMasterComparisonCount"] = len(history)
    manifest["audioAsrSourceMasterComparisonLatestStatus"] = status
    manifest["audioAsrSourceMasterComparisonTranscriptCount"] = len(results)
    manifest["audioAsrSourceMasterComparisonWindowCount"] = len(by_window)
    manifest["audioAsrSourceMasterComparisonPairCount"] = len(comparisons)
    manifest["audioAsrSourceMasterComparisonHardStopCount"] = hard_stop_count
    manifest["audioAsrSourceMasterComparisonReviewRiskCount"] = review_risk_count
    manifest["audioAsrSourceMasterComparisonHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioAsrSourceMasterComparisonApprovalStateChanged"] = False
    manifest["audioAsrSourceMasterComparisonBranchStateChanged"] = False
    manifest["audioAsrSourceMasterComparisonRenderAttempted"] = False
    manifest["audioAsrSourceMasterComparisonBranchRenderAttempted"] = False
    manifest["audioAsrSourceMasterComparisonUploadAttempted"] = False
    manifest["audioAsrSourceMasterComparisonPublicationAttempted"] = False
    manifest["audioAsrSourceMasterComparisonOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "status": status,
        "asrTranscriptCount": len(results),
        "windowComparisonCount": len(by_window),
        "pairComparisonCount": len(comparisons),
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": review_risk_count,
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
