#!/usr/bin/env python3
"""Build a watch/listen brief for the next local Studio short.

This sits one step after the ranked next-short handoff. The handoff answers
"which local short should be reviewed next?" This brief answers "what should a
human or agent check while watching it?"

It is intentionally local and read-only. A brief is not a Keep decision, not an
approval, not an upload, and not publication receipt truth.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_handoff_module() -> Any:
    module_path = Path(__file__).with_name("build_studio_next_short_review_handoff.py")
    spec = importlib.util.spec_from_file_location("build_studio_next_short_review_handoff", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load next-short handoff module at {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def default_output_dir(root: Path) -> Path:
    if root.exists():
        return root / "review-board" / "short-watch-listen-briefs"
    return Path.home() / "Desktop" / "Quipsly_Short_Watch_Listen_Briefs"


def watch_listen_checklist(short: dict[str, Any]) -> list[dict[str, str]]:
    duration = short.get("durationLabel") or short.get("durationSeconds") or "unknown"
    shape = f"{short.get('aspect', '')} {short.get('width', '')}x{short.get('height', '')}".strip()
    return [
        {
            "id": "hook",
            "label": "Hook clarity",
            "question": "Do the first 1-3 seconds make a clear promise, question, tension, or curiosity gap?",
            "keepSignal": "The viewer can understand why this matters without knowing the full episode.",
            "refineSignal": "It starts mid-thought, needs a cold-open caption, or takes too long to earn attention.",
        },
        {
            "id": "meaning",
            "label": "Standalone meaning",
            "question": "Can this clip stand alone as a useful idea, funny moment, story beat, or invitation?",
            "keepSignal": "A new viewer gets enough context from the clip itself.",
            "refineSignal": "It depends on missing setup, unexplained names, or a previous segment.",
        },
        {
            "id": "audio",
            "label": "Audio intelligibility",
            "question": "Is the dialogue clear on laptop speakers and headphones with no harsh jump at the boundaries?",
            "keepSignal": "Speech is understandable, levels feel even, and the cut does not chop words.",
            "refineSignal": "A word is clipped, a breath is unnaturally removed, or the level changes abruptly.",
        },
        {
            "id": "cadence",
            "label": "Human cadence",
            "question": "Does the pacing feel alive rather than machine-tight?",
            "keepSignal": "The clip keeps useful pauses, reactions, and emotional beats.",
            "refineSignal": "It feels over-chopped, removes the air, or creates an unnatural rhythm.",
        },
        {
            "id": "cut-craft",
            "label": "Cut craft",
            "question": "Do cuts preserve thought flow and avoid awkward single-speaker jump cuts?",
            "keepSignal": "Camera/source changes support meaning or hide necessary edits cleanly.",
            "refineSignal": "A reaction cover, J/L cut, or softer boundary would make the moment feel more human.",
        },
        {
            "id": "framing",
            "label": "Framing and crop",
            "question": f"Does the {shape or 'current'} frame keep faces, hands, and key source material safe?",
            "keepSignal": "The subject is centered intentionally and not trapped under caption or platform UI areas.",
            "refineSignal": "A face, mouth, eyes, gesture, or source detail is cropped or hidden.",
        },
        {
            "id": "caption-safety",
            "label": "Caption safety",
            "question": "Is there enough room for subtitles or hook text without covering the point of the image?",
            "keepSignal": "Text can live in a safe area and reinforce the moment.",
            "refineSignal": "Text lands on faces, mouths, important source visuals, or platform chrome.",
        },
        {
            "id": "ending",
            "label": "Ending strength",
            "question": f"Does the short end cleanly for a {duration} social clip?",
            "keepSignal": "It resolves, lands a beat, or creates a good reason to watch more.",
            "refineSignal": "It trails into dead air, cuts before payoff, or needs a tighter exit.",
        },
    ]


def decision_rubric() -> list[dict[str, str]]:
    return [
        {
            "decision": "keep",
            "useWhen": "The clip is locally promising and only needs normal platform packaging.",
            "doNotUseWhen": "You have not watched/listened yet, or there is a known crop/audio/cadence issue.",
        },
        {
            "decision": "refine",
            "useWhen": "The idea is strong but crop, audio, caption, pacing, or cut craft needs another pass.",
            "doNotUseWhen": "The issue is missing media, uncertain sync, or no one has reviewed the file.",
        },
        {
            "decision": "hold",
            "useWhen": "The clip might work, but a human/content decision or missing context is needed.",
            "doNotUseWhen": "The clip is clearly good enough to keep or clearly not worth pursuing.",
        },
        {
            "decision": "reject",
            "useWhen": "The moment is not useful enough, cannot stand alone, or would hurt trust if published.",
            "doNotUseWhen": "The only problem is a fixable crop, caption, or boundary.",
        },
        {
            "decision": "needs-more-evidence",
            "useWhen": "The file cannot be opened, played with sound, inspected, or tied back to episode truth.",
            "doNotUseWhen": "The evidence exists and the real question is creative judgment.",
        },
    ]


def build_payload(root: Path, batch_path: Path | None, refresh: bool, limit: int, include_warnings: bool) -> dict[str, Any]:
    handoff_module = load_handoff_module()
    handoff = handoff_module.build_payload(
        root=root,
        batch_path=batch_path,
        refresh=refresh,
        limit=limit,
        include_warnings=include_warnings,
    )
    truth = handoff.get("truth") if isinstance(handoff.get("truth"), dict) else {}
    base_truth = {
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "reviewDecisionCreated": False,
        "description": "Watch/listen brief over the next local short handoff. It tells a reviewer what to inspect, but it does not watch, listen, approve, publish, upload, schedule, mutate media, overwrite, delete, mutate accounts, or create receipt truth.",
    }
    base_truth.update({key: bool(value) for key, value in truth.items() if key in base_truth})
    base_truth["reviewDecisionCreated"] = False
    base_truth["description"] = "Watch/listen brief over the next local short handoff. It tells a reviewer what to inspect, but it does not watch, listen, approve, publish, upload, schedule, mutate media, overwrite, delete, mutate accounts, or create receipt truth."

    if handoff.get("status") != "studio-next-short-review-handoff-ready":
        return {
            "schema": "quipsly.studio.next-short-watch-listen-brief.v1",
            "status": "studio-next-short-watch-listen-brief-needs-handoff",
            "generatedAt": utc_now(),
            "root": str(root),
            "handoffStatus": handoff.get("status", ""),
            "plainEnglish": "No ranked local short is ready for a watch/listen brief yet.",
            "nextSafestAction": handoff.get("nextSafestAction", "Build the shorts batch and decision ledger, then rerun this brief."),
            "sourceHandoff": handoff,
            "truth": base_truth,
        }

    short = handoff.get("short") if isinstance(handoff.get("short"), dict) else {}
    commands = handoff.get("commands") if isinstance(handoff.get("commands"), dict) else {}
    review_prompt = short.get("reviewPrompt") or "Watch the local short with sound on. Decide keep, refine, hold, reject, or needs-more-evidence."
    return {
        "schema": "quipsly.studio.next-short-watch-listen-brief.v1",
        "status": "studio-next-short-watch-listen-brief-ready",
        "generatedAt": utc_now(),
        "root": str(root),
        "sourceHandoffStatus": handoff.get("status", ""),
        "sourceBatchPath": handoff.get("sourceBatchPath", ""),
        "sourceLedgerPath": handoff.get("sourceLedgerPath", ""),
        "sourceKind": short.get("sourceKind", ""),
        "plainEnglish": "This is the next local short to watch with sound on. Use the checklist to decide local review intent only.",
        "short": short,
        "reviewPrompt": review_prompt,
        "watchListenChecklist": watch_listen_checklist(short),
        "decisionRubric": decision_rubric(),
        "recommendedDecisionDraft": {
            "decision": "needs-more-evidence",
            "reason": "Default until a human or agent actually opens the file, watches it, listens to audio, and records local intent.",
        },
        "platformReviewNotes": [
            "YouTube Shorts and Reels need fast orientation in the first seconds, but not at the cost of sounding chopped.",
            "LinkedIn can tolerate a slightly slower explanatory hook if the idea is clear and useful.",
            "Patreon teaser copy can invite the audience into the broader episode without pretending the short is the full story.",
        ],
        "safeCommands": {
            "openShort": commands.get("openShort", ""),
            "revealShort": commands.get("revealShort", ""),
            "openBatchHtml": commands.get("openBatchHtml", ""),
            "dryRunKeep": commands.get("dryRunKeep", ""),
            "dryRunRefine": commands.get("dryRunRefine", ""),
            "dryRunHold": commands.get("dryRunHold", ""),
            "dryRunReject": commands.get("dryRunReject", ""),
            "recordKeep": commands.get("recordKeep", ""),
            "recordRefine": commands.get("recordRefine", ""),
            "recordHold": commands.get("recordHold", ""),
            "recordReject": commands.get("recordReject", ""),
            "recordNeedsMoreEvidence": commands.get("recordNeedsMoreEvidence", ""),
        },
        "sourceHandoff": handoff,
        "truth": base_truth,
    }


def render_markdown(payload: dict[str, Any]) -> str:
    short = payload.get("short") if isinstance(payload.get("short"), dict) else {}
    commands = payload.get("safeCommands") if isinstance(payload.get("safeCommands"), dict) else {}
    lines = [
        "# Studio next short watch/listen brief",
        "",
        payload.get("plainEnglish", ""),
        "",
        f"- Generated: `{payload.get('generatedAt', '')}`",
        f"- Status: `{payload.get('status', '')}`",
        f"- Truth: {payload.get('truth', {}).get('description', '') if isinstance(payload.get('truth'), dict) else ''}",
        "",
    ]
    if payload.get("status") != "studio-next-short-watch-listen-brief-ready":
        lines.extend([
            "## Next safest action",
            "",
            payload.get("nextSafestAction", ""),
            "",
        ])
        return "\n".join(lines)

    lines.extend([
        "## Short to review",
        "",
        f"- ID: `{short.get('id', '')}`",
        f"- Title: {short.get('humanTitle') or short.get('title', '')}",
        f"- Episode/version: `{short.get('episode', '')}` / `{short.get('version', '')}`",
        f"- File: `{short.get('path', '')}`",
        f"- Duration: `{short.get('durationLabel') or short.get('durationSeconds', '')}`",
        f"- Shape: `{short.get('aspect', '')}` `{short.get('width', '')}x{short.get('height', '')}`",
        f"- Audio/video: `{short.get('hasAudio')}` / `{short.get('hasVideo')}`",
        f"- Review priority: `{short.get('reviewPriority', '')}` {short.get('reviewPriorityReason', '')}",
        f"- Review source: `{short.get('reviewSource', '')}`",
        f"- Source kind: `{short.get('sourceKind', '')}`",
        f"- Platform fit: {', '.join(short.get('platformFit') or []) or 'not listed'}",
        "",
        "## Watch/listen checklist",
        "",
    ])
    for item in payload.get("watchListenChecklist", []):
        if not isinstance(item, dict):
            continue
        lines.extend([
            f"### {item.get('label', '')}",
            "",
            f"- Question: {item.get('question', '')}",
            f"- Keep signal: {item.get('keepSignal', '')}",
            f"- Refine signal: {item.get('refineSignal', '')}",
            "",
        ])

    lines.extend(["## Decision rubric", ""])
    for item in payload.get("decisionRubric", []):
        if not isinstance(item, dict):
            continue
        lines.extend([
            f"- `{item.get('decision', '')}`: {item.get('useWhen', '')}",
            f"  Do not use when: {item.get('doNotUseWhen', '')}",
        ])

    draft = payload.get("recommendedDecisionDraft") if isinstance(payload.get("recommendedDecisionDraft"), dict) else {}
    lines.extend([
        "",
        "## Starting decision",
        "",
        f"- Draft: `{draft.get('decision', '')}`",
        f"- Reason: {draft.get('reason', '')}",
        "",
        "## Safe commands",
        "",
    ])
    for key, value in commands.items():
        if value:
            lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Review prompt", "", payload.get("reviewPrompt", ""), ""])
    return "\n".join(lines)


def save_payload(payload: dict[str, Any], output_dir: Path, basename: str | None) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = basename or f"{stamp()}-next-short-watch-listen-brief"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a watch/listen brief for the next local Studio short.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--batch", default="", help="Path to a shorts-review-batch.json file.")
    parser.add_argument("--refresh-batch", action="store_true", help="Create a new local batch first if no latest pointer exists.")
    parser.add_argument("--limit", type=int, default=12, help="Batch limit when --refresh-batch is used.")
    parser.add_argument("--include-warnings", action="store_true", help="Include warning episodes when refreshing a batch.")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--basename", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    batch_path = Path(args.batch) if args.batch else None
    payload = build_payload(
        root=root,
        batch_path=batch_path,
        refresh=args.refresh_batch,
        limit=args.limit,
        include_warnings=args.include_warnings,
    )

    if args.save:
        output_dir = Path(args.output_dir) if args.output_dir else default_output_dir(root)
        paths = save_payload(payload, output_dir=output_dir, basename=args.basename or None)
        print(json.dumps({"status": payload.get("status"), **paths}, indent=2, sort_keys=True))
        return 0

    if args.json and not args.markdown:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
