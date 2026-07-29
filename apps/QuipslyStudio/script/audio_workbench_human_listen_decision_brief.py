#!/usr/bin/env python3
"""Create a concise human-listen decision brief for an audio baseline.

This is not an approval tool. It gathers the current review surfaces into one
plain-English decision packet so Charlie/Mako can decide whether v006 is good
enough to inherit into episode/short branches or needs a scoped v007 repair.
It does not render, approve, fail, upload, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    input_path = input_path.expanduser().resolve()
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path / 'manifest.json'} or {nested / 'manifest.json'}"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path") or value.get("markdownPath") or value.get("htmlPath") or value.get("playlistPath")
        if isinstance(path, str):
            return path
    if isinstance(value, list) and value:
        return output_path(value[-1])
    return None


def output_count(value: Any) -> int:
    if isinstance(value, list):
        return len(value)
    if value:
        return 1
    return 0


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def safe_rel(path: str | None, base: Path) -> str:
    if not path:
        return "not registered"
    try:
        return str(Path(path).resolve().relative_to(base))
    except Exception:
        return path


def command_for(path: str | None, missing_label: str) -> str:
    if path:
        return "open " + shell_quote(path)
    return "echo " + shell_quote(f"Missing {missing_label}; regenerate review artifacts first.")


def load_optional(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists() or p.suffix.lower() != ".json":
        return {}
    try:
        return read_json(p)
    except Exception:
        return {}


def first_existing(*values: str | None) -> str | None:
    for value in values:
        if value and Path(value).exists():
            return value
    for value in values:
        if value:
            return value
    return None


def slug_for(manifest: dict[str, Any]) -> str:
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    return "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in slug).strip("-") or "audio-baseline"


def build_brief_markdown(packet: dict[str, Any], base: Path) -> str:
    paths = packet["paths"]
    counts = packet["counts"]
    goal = packet["goalCompletion"]
    source = packet["sourceBalance"]
    truth = packet["truth"]

    lines = [
        f"# Human Listen Decision Brief: {packet['baselineId']}",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        "This is the one-page decision surface for the current Episode 4 v006 audio candidate. It is a producer clipboard, not a button that approves anything. It points to the exact audio evidence a human should hear before branch renders inherit this spine.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{truth['approvalStatus']}`",
        f"- Package ready for human listen: `{str(truth['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(truth['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(truth['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(truth['originalMediaMutated']).lower()}`",
        "",
        "Decision translation: v006 is mechanically packaged and reviewable, but it is not approved for real episode/short renders until a human listen pass is recorded.",
        "",
        "## Listen in this order",
        "",
        "1. Start with the one-play listen-priority review reel. It is the fastest way to hear the 40 highest-risk moments without scrubbing the two-hour master.",
        "",
        "```bash",
        command_for(paths.get("listenPriorityReviewReelHtml"), "listen-priority review reel HTML"),
        "```",
        "",
        "2. If you want one working surface instead of several windows, open the human listen control room. It combines the review reel, source-balance A/B snippets, and exportable notes.",
        "",
        "```bash",
        command_for(paths.get("humanListenControlRoom"), "human listen control room"),
        "```",
        "",
        "3. Then open the source-balance A/B proof playlist. These are current-v006 vs candidate proof snippets for the three source-balance repair ideas. Listen for whether the candidate actually improves the problem without killing natural overlap, laughter, or presence.",
        "",
        "```bash",
        command_for(paths.get("sourceBalanceProofPlaylist"), "source-balance proof comparison playlist"),
        "```",
        "",
        "4. Keep the source-balance proof audit beside the playlist. It lists every A/B pair and verifies the snippet files are present.",
        "",
        "```bash",
        command_for(paths.get("sourceBalanceRepairPreflightAudit"), "source-balance repair preflight audit"),
        "```",
        "",
        "5. If the review reel or A/B snippets feel suspicious, open the source-balance listen companion and repair workorder before touching the full master again.",
        "",
        "```bash",
        command_for(paths.get("sourceBalanceListenCompanion"), "source-balance listen companion"),
        command_for(paths.get("sourceBalanceRepairWorkorder"), "source-balance repair workorder"),
        "```",
        "",
        "## Pass / fail criteria",
        "",
        "Pass v006 only if:",
        "- Homer stays present when he is speaking, reacting, or overlapping naturally.",
        "- Charlie's phone-call echo under Homer is not distracting in the checked windows.",
        "- Park noise and background voices are reduced without chopping Homer's presence.",
        "- Laughter, short reactions, breaths, and human cadence still sound human.",
        "- The A/B proof snippets do not reveal an obvious v007 repair that is clearly better than v006.",
        "",
        "Fail or route to v007 if:",
        "- Any proof window makes Homer disappear or sound gated off.",
        "- Charlie-only energy dominates a place where Homer should be audible.",
        "- Suppression creates pumping, underwater artifacts, clipped words, or fake-sounding cadence.",
        "- A candidate repair clearly improves a real defect and should be promoted before branch renders.",
        "",
        "Use `needs-proof` rather than approve/fail if the problem is ambiguous. Ambiguity should create a smaller proof window, not a full rerender panic spiral. Tiny monkey compass, but with a map.",
        "",
        "## Machine evidence summary",
        "",
        f"- Goal completion audit: proved `{goal.get('proved', 'unknown')}`, partial `{goal.get('partial', 'unknown')}`, locked `{goal.get('locked', 'unknown')}`, missing `{goal.get('missing', 'unknown')}`.",
        f"- Listen-priority review reel count: `{counts['listenPriorityReviewReels']}`.",
        f"- Source-balance proof pairs: `{source.get('proofPairCount', 'unknown')}`.",
        f"- Source-balance proof audit errors: `{source.get('auditErrorCount', 'unknown')}`.",
        f"- Source-balance proof audit warnings: `{source.get('auditWarningCount', 'unknown')}`.",
        f"- Source-balance repair actions: `{source.get('repairActionCount', 'unknown')}`.",
        "",
        "## Important files",
        "",
        f"- Listening M4A: `{safe_rel(paths.get('masterM4a'), base)}`",
        f"- Handoff WAV: `{safe_rel(paths.get('masterWav'), base)}`",
        f"- Review reel HTML: `{safe_rel(paths.get('listenPriorityReviewReelHtml'), base)}`",
        f"- Human listen control room: `{safe_rel(paths.get('humanListenControlRoom'), base)}`",
        f"- Review reel M4A: `{safe_rel(paths.get('listenPriorityReviewReelM4a'), base)}`",
        f"- Source-balance proof playlist: `{safe_rel(paths.get('sourceBalanceProofPlaylist'), base)}`",
        f"- Source-balance proof audit: `{safe_rel(paths.get('sourceBalanceRepairPreflightAudit'), base)}`",
        f"- Source-balance workorder: `{safe_rel(paths.get('sourceBalanceRepairWorkorder'), base)}`",
        f"- Goal completion audit: `{safe_rel(paths.get('goalCompletionAudit'), base)}`",
        f"- Handoff index: `{safe_rel(paths.get('handoffIndex'), base)}`",
        "",
        "## After the human listen",
        "",
        "- If it passes, record approval through the existing guarded listen-decision bridge with explicit human-listen confirmation. Do not hand-edit the manifest.",
        "- If it fails, record the failed window and generate a v007 or focused proof repair. Do not overwrite v006.",
        "- If it needs proof, create the smallest new proof-window packet possible and keep the branch render gate locked.",
        "",
        "## Guardrail",
        "",
        "This packet deliberately leaves `approvalStatus`, `branchInheritanceReady`, and `branchRenderReady` unchanged. It makes the decision easier; it does not pretend the decision happened.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = slug_for(manifest)

    goal_completion_json = output_path(outputs.get("latestAudioGoalCompletionAudit"))
    source_balance_audit_json = output_path(outputs.get("latestAudioSourceBalanceRepairPreflightAudit"))
    source_balance_workorder_json = output_path(outputs.get("latestAudioSourceBalanceRepairWorkorder"))

    goal_report = load_optional(goal_completion_json)
    source_audit = load_optional(source_balance_audit_json)
    source_workorder = load_optional(source_balance_workorder_json)

    goal_summary = {
        "proved": goal_report.get("provedRequirementCount") or goal_report.get("proved"),
        "partial": goal_report.get("partialRequirementCount") or goal_report.get("partial"),
        "locked": goal_report.get("lockedRequirementCount") or goal_report.get("locked"),
        "missing": goal_report.get("missingRequirementCount") or goal_report.get("missing"),
    }
    source_summary = {
        "proofPairCount": source_audit.get("pairCount") or source_audit.get("audioSourceBalanceRepairProofPairCount"),
        "auditErrorCount": source_audit.get("errorCount") or source_audit.get("audioSourceBalanceRepairPreflightAuditErrorCount"),
        "auditWarningCount": source_audit.get("warningCount") or source_audit.get("audioSourceBalanceRepairPreflightAuditWarningCount"),
        "repairActionCount": source_workorder.get("repairActionCount") or source_workorder.get("audioSourceBalanceRepairActionCount"),
    }

    paths = {
        "masterM4a": output_path(outputs.get("masterM4a")),
        "masterWav": output_path(outputs.get("masterWav")),
        "listenPriorityReviewReelHtml": output_path(outputs.get("latestAudioListenPriorityReviewReelHtml")),
        "listenPriorityReviewReelM4a": output_path(outputs.get("latestAudioListenPriorityReviewReelM4a")),
        "humanListenControlRoom": output_path(outputs.get("latestAudioHumanListenControlRoomHtml")),
        "sourceBalanceProofPlaylist": output_path(outputs.get("latestAudioSourceBalanceRepairProofPlaylist")),
        "sourceBalanceRepairPreflightAudit": output_path(outputs.get("latestAudioSourceBalanceRepairPreflightAuditMarkdown")),
        "sourceBalanceListenCompanion": output_path(outputs.get("latestAudioSourceBalanceListenCompanionMarkdown")),
        "sourceBalanceRepairWorkorder": output_path(outputs.get("latestAudioSourceBalanceRepairWorkorderMarkdown")),
        "sourceBalanceRepairPreflight": output_path(outputs.get("latestAudioSourceBalanceRepairPreflightMarkdown")),
        "goalCompletionAudit": output_path(outputs.get("latestAudioGoalCompletionAuditMarkdown")),
        "handoffIndex": output_path(outputs.get("latestReviewHandoffIndexMarkdown")),
        "startHere": output_path(outputs.get("latestAudioReviewStartHereMarkdown")),
    }

    # Prefer existing files when a key points to a stale surface but a sibling HTML/M4A exists.
    paths["listenPriorityReviewReelHtml"] = first_existing(paths["listenPriorityReviewReelHtml"], output_path(outputs.get("latestAudioListenPriorityReviewReelOpenCommand")))

    packet = {
        "kind": "human-listen-decision-brief",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "truth": {
            "approvalStatus": manifest.get("approvalStatus"),
            "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
            "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
            "branchRenderReady": bool(manifest.get("branchRenderReady")),
            "originalMediaMutated": bool(manifest.get("originalMediaMutated")),
        },
        "counts": {
            "listenPriorityReviewReels": output_count(outputs.get("audioListenPriorityReviewReels")),
            "sourceBalanceRepairPreflightAudits": output_count(outputs.get("audioSourceBalanceRepairPreflightAudits")),
            "sourceBalanceRepairPreflights": output_count(outputs.get("audioSourceBalanceRepairPreflights")),
        },
        "goalCompletion": goal_summary,
        "sourceBalance": source_summary,
        "paths": paths,
        "mutations": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "originalMediaMutated": False,
        },
        "nextSafestAction": "Human listen the review reel and source-balance A/B proof playlist, then record pass/fail/needs-proof through the guarded notes/decision bridge.",
    }

    json_path = baseline_dir / f"audio-human-listen-decision-brief-{slug}-{generated_at}.json"
    md_path = baseline_dir / f"audio-human-listen-decision-brief-{slug}-{generated_at}.md"
    packet["path"] = str(json_path)
    packet["markdownPath"] = str(md_path)
    md_path.write_text(build_brief_markdown(packet, baseline_dir), encoding="utf-8")
    write_json(json_path, packet)

    outputs["latestAudioHumanListenDecisionBrief"] = str(json_path)
    outputs["latestAudioHumanListenDecisionBriefMarkdown"] = str(md_path)
    outputs.setdefault("audioHumanListenDecisionBriefs", []).append(str(json_path))
    outputs.setdefault("audioHumanListenDecisionBriefMarkdowns", []).append(str(md_path))
    outputs["audioHumanListenDecisionBriefCount"] = len(outputs.get("audioHumanListenDecisionBriefs") or [])
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(json.dumps({
        "brief": str(json_path),
        "markdown": str(md_path),
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
