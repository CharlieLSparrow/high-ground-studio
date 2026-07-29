#!/usr/bin/env python3
"""Build a read-only quality/readiness board for every queued short.

This is a queue-level editor cockpit, not an approval engine. It reads live
/state and /shorts_queue evidence, ranks the safest next review moves, and can
write a local sidecar report. It does not select shorts, edit recipes, export,
upload, publish, create receipts, or mutate source media.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/ShortsQualityBoards")
SCHEMA = "quipsly.studio.shorts-queue-quality-board.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(value: str, fallback: str = "shorts-quality-board") -> str:
    text = (value or fallback).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def fetch_json(base_url: str, path: str, timeout: float = 8.0) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    with urllib.request.urlopen(url, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {path}")
    return data


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def intish(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return fallback


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def queue_items(queue: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("clips", "shorts", "items"):
        value = queue.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return []


def nested(row: dict[str, Any], *keys: str) -> Any:
    current: Any = row
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_text(row: dict[str, Any], paths: list[tuple[str, ...]]) -> str:
    for path in paths:
        value = text(nested(row, *path))
        if value:
            return value
    return ""


def export_path(row: dict[str, Any]) -> str:
    return first_text(row, [
        ("reviewEvidence", "exportPath"),
        ("reviewEvidence", "expectedExportPath"),
        ("exportPath",),
        ("expectedExportPath",),
    ])


def file_exists(path: str) -> bool:
    if not path:
        return False
    try:
        return Path(path).exists()
    except Exception:
        return False


def platform_variant_count(row: dict[str, Any]) -> int:
    variants = row.get("platformVariants")
    if isinstance(variants, list):
        return len(variants)
    packet = as_dict(nested(row, "creatorQuality", "platformPackPayload"))
    drafts = packet.get("destinationPresetDrafts")
    if isinstance(drafts, list):
        return len(drafts)
    return len(as_list(nested(row, "publicationPassport", "platformVariants")))


def readiness_score(row: dict[str, Any]) -> int:
    quality = as_dict(row.get("creatorQuality"))
    creative = as_dict(quality.get("creativeReadiness"))
    score = 0
    score += min(25, max(0, intish(creative.get("score")) // 4))
    score += min(20, max(0, intish(quality.get("attentionScore")) // 5))
    if has_export_proof(row):
        score += 20
    if hook_text(row):
        score += 10
    if caption_or_overlay(row):
        score += 10
    if platform_variant_count(row) >= 4:
        score += 10
    review_status = text(row.get("reviewStatus")).lower()
    if review_status in {"keep", "kept", "approved"}:
        score += 10
    elif review_status in {"reject", "rejected"}:
        score -= 25
    elif "refine" in review_status:
        score -= 5
    duration = short_duration(row)
    if duration <= 0:
        score -= 15
    elif duration < 10:
        score -= 7
    elif duration > 70:
        score -= 8
    if cut_risk_count(row) > 0:
        score -= min(12, cut_risk_count(row) * 4)
    return max(0, min(100, score))


def short_duration(row: dict[str, Any]) -> float:
    return number(row.get("recipeDuration") or row.get("duration") or row.get("sourceRange", {}).get("duration"), 0)


def hook_text(row: dict[str, Any]) -> str:
    return first_text(row, [
        ("hookText",),
        ("hook",),
        ("creatorQuality", "platformPackPayload", "hook"),
        ("primaryOverlayText",),
        ("overlayText",),
        ("title",),
    ])


def caption_or_overlay(row: dict[str, Any]) -> str:
    return first_text(row, [
        ("captionDraft",),
        ("caption",),
        ("primaryOverlayText",),
        ("overlayText",),
    ])


def has_export_proof(row: dict[str, Any]) -> bool:
    evidence = as_dict(row.get("reviewEvidence"))
    if evidence.get("exportExists") is True:
        return True
    status = text(row.get("exportStatus") or evidence.get("exportStatus")).lower()
    if status in {"exported", "proof-exported", "has_status"}:
        return True
    return file_exists(export_path(row))


def transcript_status(row: dict[str, Any]) -> str:
    context = transcript_context(row)
    status = text(context.get("status"))
    if status:
        return status
    if text(context.get("excerpt")):
        return "available"
    return "missing"


def transcript_context(row: dict[str, Any]) -> dict[str, Any]:
    return as_dict(row.get("transcriptContext") or nested(row, "reviewEvidence", "transcriptContext"))


def transcript_excerpt(row: dict[str, Any], max_chars: int = 360) -> str:
    excerpt = text(transcript_context(row).get("excerpt"))
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[: max_chars - 1].rstrip() + "..."


def transcript_speakers(row: dict[str, Any]) -> str:
    return text(transcript_context(row).get("speakers"), "unknown")


def transcript_segment_count(row: dict[str, Any]) -> int:
    return intish(transcript_context(row).get("segmentCount"), 0)


def cut_risk_count(row: dict[str, Any]) -> int:
    evidence = as_dict(nested(row, "creatorQuality", "cutIntelligenceEvidence") or row.get("cutIntelligenceEvidence"))
    return (
        intish(evidence.get("jumpCutRiskCount"))
        + intish(evidence.get("cadenceWarningCount"))
        + intish(evidence.get("highSeverityCount"))
    )


def segment_count(row: dict[str, Any]) -> int:
    segments = as_list(row.get("segments"))
    if segments:
        return len(segments)
    return intish(row.get("segmentCount") or nested(row, "reviewEvidence", "segmentCount"), 1)


def blockers(row: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    duration = short_duration(row)
    if duration <= 0:
        issues.append("duration missing")
    elif duration < 10:
        issues.append("very short, payoff may not land")
    elif duration > 70:
        issues.append("long for shorts feeds")
    if not has_export_proof(row):
        issues.append("no export proof")
    if not hook_text(row):
        issues.append("missing hook")
    if not caption_or_overlay(row):
        issues.append("missing caption/overlay metadata")
    if platform_variant_count(row) == 0:
        issues.append("missing platform variants")
    if transcript_status(row) == "missing":
        issues.append("missing transcript context")
    if cut_risk_count(row) > 0:
        issues.append(f"{cut_risk_count(row)} cut/cadence risk signals")
    review_status = text(row.get("reviewStatus")).lower()
    if not review_status or review_status in {"needs-captions", "needs-review", "queued", "draft"}:
        issues.append("needs keep/refine/reject decision")
    return issues


def next_action(row: dict[str, Any]) -> str:
    issues = blockers(row)
    if not issues:
        return "Watch once as a viewer, then decide whether this can move to Tower/manual publishing prep."
    first = issues[0]
    if "export proof" in first:
        return "Export a versioned proof or locate the proof file before judging publication readiness."
    if "hook" in first:
        return "Draft a concrete first-second promise, tension, mistake, or question."
    if "caption" in first:
        return "Add editable caption/overlay metadata, then check 9:16 face-safe framing."
    if "long" in first:
        return "Decide whether to tighten, split into multiple shorts, or keep as a longer platform-native clip."
    if "short" in first:
        return "Confirm the payoff is understandable without surrounding episode context."
    if "cut/cadence" in first:
        return "Proof-listen around the risky join and consider a reaction cover, J-cut/L-cut, or boundary nudge."
    if "decision" in first:
        return "Watch the exported proof and mark Keep, Refine, or Reject with a short note."
    return "Resolve the first listed blocker, then rerun the board."


def classify(row: dict[str, Any]) -> str:
    score = readiness_score(row)
    issues = blockers(row)
    review_status = text(row.get("reviewStatus")).lower()
    if review_status in {"reject", "rejected"}:
        return "rejected"
    if score >= 80 and len(issues) <= 1:
        return "strong-review-candidate"
    if has_export_proof(row) and score >= 60:
        return "proof-ready-needs-review"
    if not has_export_proof(row):
        return "needs-export-proof"
    return "needs-refinement"


def item_payload(row: dict[str, Any], index: int) -> dict[str, Any]:
    short_id = text(row.get("id")) or f"queue-index-{index}"
    title = text(row.get("title")) or f"Short {index}"
    export = export_path(row)
    transcript = transcript_context(row)
    return {
        "index": index,
        "id": short_id,
        "title": title,
        "durationSeconds": round(short_duration(row), 3),
        "hook": hook_text(row),
        "captionOrOverlay": caption_or_overlay(row),
        "score": readiness_score(row),
        "class": classify(row),
        "reviewStatus": text(row.get("reviewStatus")),
        "exportStatus": text(row.get("exportStatus") or nested(row, "reviewEvidence", "exportStatus")),
        "exportProofReady": has_export_proof(row),
        "exportPath": export,
        "segmentCount": segment_count(row),
        "transcriptStatus": transcript_status(row),
        "transcript": {
            "status": transcript_status(row),
            "speakers": transcript_speakers(row),
            "excerpt": transcript_excerpt(row),
            "segmentCount": transcript_segment_count(row),
            "truth": text(transcript.get("truth"), "Read-only transcript projection over the short recipe."),
        },
        "platformVariantCount": platform_variant_count(row),
        "cutRiskCount": cut_risk_count(row),
        "blockers": blockers(row),
        "nextSafeAction": next_action(row),
        "safeCommands": {
            "selectWithProof": f"script/agentctl.sh shorts-select-wait id {short_id} 10",
            "selectedQuality": "script/agentctl.sh selected-short-quality",
            "selectedBrief": "script/agentctl.sh shorts-review-brief --markdown",
            "selectedPlatformPacket": "script/agentctl.sh selected-short-platform-packet --all",
        },
        "truth": "Read-only queue projection. This item is still a metadata recipe over whole synced sources, not a copied or chopped media file.",
    }


def build_board(args: argparse.Namespace) -> dict[str, Any]:
    state = fetch_json(args.base_url, "/state")
    queue = fetch_json(args.base_url, "/shorts_queue")
    rows = queue_items(queue)
    items = [item_payload(row, index) for index, row in enumerate(rows, start=1)]
    ranked = sorted(items, key=lambda item: (-int(item["score"]), item["index"]))
    limit = args.limit if args.limit and args.limit > 0 else len(ranked)
    visible = ranked[:limit]
    summary = {
        "total": len(items),
        "exportProofReady": sum(1 for item in items if item["exportProofReady"]),
        "needsExportProof": sum(1 for item in items if item["class"] == "needs-export-proof"),
        "strongReviewCandidates": sum(1 for item in items if item["class"] == "strong-review-candidate"),
        "needsRefinement": sum(1 for item in items if item["class"] == "needs-refinement"),
        "withCutRisk": sum(1 for item in items if int(item["cutRiskCount"]) > 0),
        "withTranscript": sum(1 for item in items if item["transcriptStatus"] != "missing"),
    }
    board = {
        "schema": SCHEMA,
        "status": "shorts_queue_quality_board",
        "generatedAt": iso_now(),
        "baseUrl": args.base_url,
        "activeSessionName": text(state.get("activeSessionName")),
        "shortQueueCount": len(items),
        "summary": summary,
        "topItems": visible,
        "nextSafeAction": visible[0]["nextSafeAction"] if visible else "Open a session with queued shorts, then rerun this board.",
        "safeCommands": {
            "markdown": "script/agentctl.sh shorts-queue-quality-board --markdown",
            "json": "script/agentctl.sh shorts-queue-quality-board --json",
            "save": "script/agentctl.sh shorts-queue-quality-board --save --markdown",
            "batchPlatformPackets": "script/agentctl.sh shorts-platform-packet-batch --limit 5",
        },
        "truth": (
            "Read-only queue-level shorts quality/readiness board. It ranks evidence from the live /shorts_queue and /state. "
            "It does not select shorts, edit recipes, export, approve, upload, publish, create receipts, or mutate source media."
        ),
    }
    if args.save:
        folder = args.output_root / slug(board["activeSessionName"], "unknown-session") / f"{stamp()}-shorts-quality-board"
        folder.mkdir(parents=True, exist_ok=False)
        json_path = folder / "shorts-quality-board.json"
        markdown_path = folder / "shorts-quality-board.md"
        json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        markdown_path.write_text(markdown(board) + "\n", encoding="utf-8")
        board["artifact"] = {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}
    return board


def markdown(board: dict[str, Any]) -> str:
    summary = board["summary"]
    lines = [
        "# Shorts Queue Quality Board",
        "",
        f"- Session: `{board['activeSessionName'] or 'unknown'}`",
        f"- Queue count: `{board['shortQueueCount']}`",
        f"- Export proof ready: `{summary['exportProofReady']}`",
        f"- Strong review candidates: `{summary['strongReviewCandidates']}`",
        f"- Needs export proof: `{summary['needsExportProof']}`",
        f"- Needs refinement: `{summary['needsRefinement']}`",
        f"- Transcript context present: `{summary['withTranscript']}`",
        "",
        "## Ranked next shorts",
        "",
    ]
    for item in board["topItems"]:
        blockers_text = "; ".join(item["blockers"]) if item["blockers"] else "none reported"
        lines.extend([
            f"### {item['index']:02d}. {item['title']}",
            "",
            f"- Score: `{item['score']}`",
            f"- Class: `{item['class']}`",
            f"- Duration: `{item['durationSeconds']}s`",
            f"- Hook: {item['hook'] or 'missing'}",
            f"- Export proof: `{item['exportProofReady']}`",
            f"- Review: `{item['reviewStatus'] or 'unknown'}`",
            f"- Segments: `{item['segmentCount']}`",
            f"- Transcript: `{item['transcriptStatus']}` / speakers `{item.get('transcript', {}).get('speakers') or 'unknown'}` / segments `{item.get('transcript', {}).get('segmentCount') or 0}`",
            f"- Transcript excerpt: {item.get('transcript', {}).get('excerpt') or 'missing'}",
            f"- Platform variants: `{item['platformVariantCount']}`",
            f"- Cut risk signals: `{item['cutRiskCount']}`",
            f"- Blockers: {blockers_text}",
            f"- Next safest action: {item['nextSafeAction']}",
            f"- Select with proof: `{item['safeCommands']['selectWithProof']}`",
            "",
        ])
    lines.extend([
        "## Safe commands",
        "",
    ])
    for label, command in board["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    if board.get("artifact"):
        lines.extend([
            "",
            "## Saved artifact",
            "",
            f"- JSON: `{board['artifact']['jsonPath']}`",
            f"- Markdown: `{board['artifact']['markdownPath']}`",
        ])
    lines.extend(["", f"Truth: {board['truth']}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    board = build_board(args)
    if args.markdown and not args.json:
        print(markdown(board))
    else:
        print(json.dumps(board, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
