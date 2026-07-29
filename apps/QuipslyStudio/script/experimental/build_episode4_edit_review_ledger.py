#!/usr/bin/env python3
"""Episode 4 edit-intelligence review ledger.

Builds a local review workbench and records human/agent decisions for Episode 4
edit-intelligence proposals. This is the bridge between proposal and eventual
metadata edit: proposals become keep/refine/reject/needs-source notes before any
timeline decision is written.

Safety boundary: sidecar review metadata only. This command never imports clips,
writes timeline decisions, creates shorts, renders exports, publishes, uploads,
deletes, overwrites existing proposal artifacts, or mutates source media.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
INTELLIGENCE_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-edit-intelligence-review"
LATEST_POINTER = OUT_ROOT / "latest-episode4-edit-review-ledger.json"
SCHEMA = "quipsly.episode4-edit-review-ledger.v1"
VALID_DECISIONS = {"keep", "refine", "reject", "hold", "needs-source", "needs-listen", "needs-visual-review"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-edit-review")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def proposal_groups(intelligence: dict[str, Any]) -> list[tuple[str, list[dict[str, Any]]]]:
    groups = [
        ("clipWeaveWorkorders", [p for p in intelligence.get("clipWeaveWorkorders") or [] if isinstance(p, dict)]),
        ("shortCandidates", [p for p in intelligence.get("shortCandidates") or [] if isinstance(p, dict)]),
        ("cadenceCandidates", [p for p in intelligence.get("cadenceCandidates") or [] if isinstance(p, dict)]),
        ("reactionCoverCandidates", [p for p in intelligence.get("reactionCoverCandidates") or [] if isinstance(p, dict)]),
    ]
    return groups


def flatten_proposals(intelligence: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group_name, proposals in proposal_groups(intelligence):
        for proposal in proposals:
            rows.append({**proposal, "proposalGroup": group_name})
    return rows


def proposal_id(proposal: dict[str, Any]) -> str:
    return str(proposal.get("id") or proposal.get("cueId") or "").strip()


def current_review_dir() -> Path | None:
    pointer = load_json(LATEST_POINTER)
    ledger_text = str(pointer.get("ledgerPath") or "")
    if ledger_text:
        ledger_path = Path(ledger_text)
        if ledger_path.exists():
            return ledger_path.parent
    return None


def create_ledger(intelligence_pointer: Path) -> tuple[Path, dict[str, Any]]:
    intelligence = load_pointer(intelligence_pointer)
    session_dir = OUT_ROOT / stamp()
    proposals = flatten_proposals(intelligence)
    reviews = {proposal_id(p): default_review(p) for p in proposals if proposal_id(p)}
    ledger = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "updatedAt": iso_now(),
        "status": "episode4-edit-review-ledger-ready" if proposals else "episode4-edit-review-ledger-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "intelligencePointer": str(intelligence_pointer),
        "intelligenceJson": intelligence.get("jsonPath") or "",
        "counts": counts_for(proposals, reviews, []),
        "proposals": proposals,
        "reviews": reviews,
        "events": [],
        "nextSafestAction": "Open a proposal range in Studio, then record keep/refine/reject/needs-source before applying timeline metadata.",
        "truth": truth(),
    }
    write_surfaces(session_dir, ledger)
    return session_dir, ledger


def default_review(proposal: dict[str, Any]) -> dict[str, Any]:
    return {
        "proposalId": proposal_id(proposal),
        "proposalGroup": proposal.get("proposalGroup"),
        "status": "unreviewed",
        "decision": "pending",
        "reviewer": "",
        "lastReviewedAt": "",
        "notes": "",
        "audioNote": "",
        "visualNote": "",
        "cadenceNote": "",
        "sourceNote": "",
        "hookNote": "",
        "captionNote": "",
        "platformNote": "",
        "framingNote": "",
        "nextAction": suggestion_for(proposal),
        "history": [],
    }


def suggestion_for(proposal: dict[str, Any]) -> str:
    group = proposal.get("proposalGroup")
    if group == "clipWeaveWorkorders":
        return "Find/confirm source clip, then review J/L-cut placement before timeline metadata changes."
    if group == "shortCandidates":
        return "Scrub this range visually, test 9:16 framing, then refine into a short recipe if it holds up."
    if group == "cadenceCandidates":
        return "Listen before tightening; preserve human thought pauses unless the gap is dead air."
    if group == "reactionCoverCandidates":
        return "Check whether the reaction naturally covers a jump or clip insert without feeling fake."
    return "Review before applying."


def truth() -> dict[str, Any]:
    return {
        "sidecarReviewMetadataOnly": True,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "clipsImported": False,
        "transcriptImported": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def counts_for(proposals: list[dict[str, Any]], reviews: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    decision_counts: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    short_note_lane_counts = {
        "hookNote": 0,
        "captionNote": 0,
        "platformNote": 0,
        "framingNote": 0,
        "anyTargetedShortNote": 0,
    }
    for proposal in proposals:
        group = str(proposal.get("proposalGroup") or "unknown")
        group_counts[group] = group_counts.get(group, 0) + 1
    for review in reviews.values():
        if not isinstance(review, dict):
            continue
        status = str(review.get("status") or "unknown")
        decision = str(review.get("decision") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        decision_counts[decision] = decision_counts.get(decision, 0) + 1
        if str(review.get("proposalGroup") or "") == "shortCandidates":
            has_any = False
            for key in ["hookNote", "captionNote", "platformNote", "framingNote"]:
                if str(review.get(key) or "").strip():
                    short_note_lane_counts[key] += 1
                    has_any = True
            if has_any:
                short_note_lane_counts["anyTargetedShortNote"] += 1
    return {
        "proposals": len(proposals),
        "reviews": len(reviews),
        "events": len(events),
        "unreviewed": status_counts.get("unreviewed", 0),
        "reviewed": sum(v for k, v in status_counts.items() if k != "unreviewed"),
        "statusCounts": status_counts,
        "decisionCounts": decision_counts,
        "groupCounts": group_counts,
        "shortNoteLaneCounts": short_note_lane_counts,
    }


def load_or_create_ledger(intelligence_pointer: Path, session: str = "latest") -> tuple[Path, dict[str, Any]]:
    if session and session not in {"latest", ""}:
        session_dir = Path(session).expanduser()
        ledger_path = session_dir / "episode4-edit-review-ledger.json"
        if ledger_path.exists():
            return session_dir, load_json(ledger_path)
    session_dir = current_review_dir()
    if session_dir:
        ledger_path = session_dir / "episode4-edit-review-ledger.json"
        ledger = load_json(ledger_path)
        if ledger:
            return session_dir, ledger
    return create_ledger(intelligence_pointer)


def write_surfaces(session_dir: Path, ledger: dict[str, Any]) -> None:
    ledger["updatedAt"] = iso_now()
    ledger["counts"] = counts_for(
        [p for p in ledger.get("proposals") or [] if isinstance(p, dict)],
        ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {},
        [e for e in ledger.get("events") or [] if isinstance(e, dict)],
    )
    ledger["truth"] = truth()
    ledger_path = session_dir / "episode4-edit-review-ledger.json"
    md_path = session_dir / "episode4-edit-review-ledger.md"
    html_path = session_dir / "index.html"
    ledger.update({"ledgerPath": str(ledger_path), "markdownPath": str(md_path), "htmlPath": str(html_path)})
    write_json(ledger_path, ledger)
    md_path.write_text(render_markdown(ledger), encoding="utf-8")
    html_path.write_text(render_html(ledger), encoding="utf-8")
    write_json(LATEST_POINTER, {
        "schema": "quipsly.episode4-edit-review-ledger-pointer.v1",
        "generatedAt": iso_now(),
        "status": ledger.get("status"),
        "sessionDir": str(session_dir),
        "ledgerPath": str(ledger_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": ledger.get("counts"),
        "truth": ledger.get("truth"),
    })


def record_decision(args: argparse.Namespace) -> dict[str, Any]:
    if args.decision not in VALID_DECISIONS:
        raise SystemExit(f"Decision must be one of: {', '.join(sorted(VALID_DECISIONS))}")
    session_dir, ledger = load_or_create_ledger(Path(args.intelligence_pointer), args.session)
    proposals = [p for p in ledger.get("proposals") or [] if isinstance(p, dict)]
    proposal = next((p for p in proposals if proposal_id(p) == args.proposal_id), None)
    if not proposal:
        raise SystemExit(f"Proposal not found in ledger: {args.proposal_id}")
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    review = reviews.get(args.proposal_id) if isinstance(reviews.get(args.proposal_id), dict) else default_review(proposal)
    event = {
        "eventId": f"episode4-edit-review-event-{len(ledger.get('events') or []) + 1:04d}",
        "createdAt": iso_now(),
        "proposalId": args.proposal_id,
        "proposalGroup": proposal.get("proposalGroup"),
        "decision": args.decision,
        "reviewer": args.reviewer,
        "notes": args.notes,
        "audioNote": args.audio_note,
        "visualNote": args.visual_note,
        "cadenceNote": args.cadence_note,
        "sourceNote": args.source_note,
        "hookNote": args.hook_note,
        "captionNote": args.caption_note,
        "platformNote": args.platform_note,
        "framingNote": args.framing_note,
        "nextAction": args.next_action or suggested_next_action(args.decision, proposal),
        "dryRun": bool(args.dry_run),
        "truth": truth(),
    }
    if args.dry_run:
        return {
            "schema": "quipsly.episode4-edit-review-decision-dry-run.v1",
            "generatedAt": iso_now(),
            "status": "dry-run-ready",
            "sessionDir": str(session_dir),
            "proposal": proposal,
            "wouldAppendEvent": event,
            "wouldUpdateReview": {**review, **event_to_review_fields(event)},
            "truth": {**truth(), "ledgerMutated": False},
        }
    history = review.get("history") if isinstance(review.get("history"), list) else []
    history.append(event)
    review.update(event_to_review_fields(event))
    review["history"] = history
    reviews[args.proposal_id] = review
    ledger["reviews"] = reviews
    events = ledger.get("events") if isinstance(ledger.get("events"), list) else []
    events.append(event)
    ledger["events"] = events
    ledger["status"] = "episode4-edit-review-ledger-in-progress"
    write_surfaces(session_dir, ledger)
    return {
        "schema": "quipsly.episode4-edit-review-decision.v1",
        "generatedAt": iso_now(),
        "status": "decision-recorded",
        "sessionDir": str(session_dir),
        "ledgerPath": ledger.get("ledgerPath"),
        "proposalId": args.proposal_id,
        "decision": args.decision,
        "truth": {**truth(), "ledgerMutated": True},
    }


def event_to_review_fields(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "reviewed",
        "decision": event.get("decision"),
        "reviewer": event.get("reviewer"),
        "lastReviewedAt": event.get("createdAt"),
        "notes": event.get("notes"),
        "audioNote": event.get("audioNote"),
        "visualNote": event.get("visualNote"),
        "cadenceNote": event.get("cadenceNote"),
        "sourceNote": event.get("sourceNote"),
        "hookNote": event.get("hookNote"),
        "captionNote": event.get("captionNote"),
        "platformNote": event.get("platformNote"),
        "framingNote": event.get("framingNote"),
        "nextAction": event.get("nextAction"),
    }


def suggested_next_action(decision: str, proposal: dict[str, Any]) -> str:
    if decision == "keep":
        return "Promote to an apply-preview packet, then review one more time before timeline metadata writes."
    if decision == "refine":
        return "Create a revised proposal with narrower range, better J/L timing, or clearer source framing."
    if decision == "reject":
        return "Keep rejection as training evidence; do not surface this proposal as a recommended action."
    if decision == "needs-source":
        return "Find or drop confirmed source media before applying this proposal."
    if decision in {"needs-listen", "needs-visual-review"}:
        return "Open the proposal range in Studio and review audio/video before deciding."
    return suggestion_for(proposal)


def suggestion_for(proposal: dict[str, Any]) -> str:
    group = proposal.get("proposalGroup")
    if group == "clipWeaveWorkorders":
        return "Confirm source clip and review J/L timing."
    if group == "shortCandidates":
        return "Scrub visually and refine into a 9:16 short recipe if it holds up."
    if group == "cadenceCandidates":
        return "Listen before tightening."
    if group == "reactionCoverCandidates":
        return "Check whether reaction cover feels natural."
    return "Review before applying."


def render_markdown(ledger: dict[str, Any]) -> str:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    lines = [
        "# Episode 4 edit intelligence review ledger",
        "",
        f"Generated: `{ledger.get('generatedAt')}`",
        f"Updated: `{ledger.get('updatedAt')}`",
        f"Status: `{ledger.get('status')}`",
        "",
        f"Next: {ledger.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key in ["proposals", "reviewed", "unreviewed", "events"]:
        lines.append(f"- {key}: `{counts.get(key)}`")
    short_note_counts = counts.get("shortNoteLaneCounts") if isinstance(counts.get("shortNoteLaneCounts"), dict) else {}
    if short_note_counts:
        lines.extend(["", "### Short review note lanes", ""])
        for key in ["anyTargetedShortNote", "hookNote", "captionNote", "platformNote", "framingNote"]:
            lines.append(f"- {key}: `{short_note_counts.get(key, 0)}`")
    lines.extend(["", "## Proposal review queue", ""])
    for proposal in ledger.get("proposals") or []:
        if not isinstance(proposal, dict):
            continue
        pid = proposal_id(proposal)
        review = reviews.get(pid, {}) if isinstance(reviews.get(pid), dict) else {}
        lines.append(f"### {pid} · {proposal.get('proposalGroup')} · {review.get('decision', 'pending')}")
        lines.append(f"- Time: `{proposal.get('timeLabel')}`")
        lines.append(f"- Intent: {proposal.get('intent')}")
        lines.append(f"- Explanation: {proposal.get('explanation') or proposal.get('summary') or proposal.get('context')}")
        if proposal.get("proposalGroup") == "shortCandidates":
            caption = proposal.get("captionPlan") if isinstance(proposal.get("captionPlan"), dict) else {}
            platforms = proposal.get("platformVariants") if isinstance(proposal.get("platformVariants"), list) else []
            platform_summary = "; ".join(
                f"{variant.get('platform')}: {variant.get('fit')}"
                for variant in platforms
                if isinstance(variant, dict)
            )
            lines.append(f"- Hook: `{proposal.get('hookType')}` · {proposal.get('hookDraft')}")
            lines.append(f"- Captions: `{caption.get('density')}` · {caption.get('estimatedWordsPerSecond')} w/s · {caption.get('guidance')}")
            lines.append(f"- Platforms: {platform_summary}")
            lines.append(f"- Reviewer lanes: hookNote, captionNote, platformNote, framingNote")
        lines.append(f"- Review next: {review.get('nextAction') or suggestion_for(proposal)}")
        lines.append(f"- Dry run: `./script/agentctl.sh episode4-edit-review-decision-dry-run {pid} keep Codex \"notes\"`")
        lines.append("")
    lines.extend(["## Truth boundary", ""])
    for key, value in (ledger.get("truth") or {}).items():
        lines.append(f"- {key}: `{value}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(ledger: dict[str, Any]) -> str:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    short_note_counts = counts.get("shortNoteLaneCounts") if isinstance(counts.get("shortNoteLaneCounts"), dict) else {}
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    cards = []
    for proposal in ledger.get("proposals") or []:
        if not isinstance(proposal, dict):
            continue
        pid = proposal_id(proposal)
        review = reviews.get(pid, {}) if isinstance(reviews.get(pid), dict) else {}
        cards.append(render_card(proposal, review))
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 edit review ledger</title>
<style>
:root {{ color-scheme:dark; --bg:#0d1510; --panel:#18261d; --ink:#fff0d4; --muted:#c8b997; --line:#36533c; --leaf:#79dc85; --gold:#f2c64f; --water:#6ecbd3; --clay:#db8159; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(121,220,133,.16),transparent 30%),linear-gradient(135deg,#0b130f,#251b11 72%); color:var(--ink); }}
main {{ max-width:1240px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(24,38,29,.92); padding:22px; margin:18px 0; box-shadow:0 18px 48px rgba(0,0,0,.3); }}
h1 {{ font-size:clamp(40px,6vw,78px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.counts,.cardtop {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.22); font-size:12px; font-weight:800; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(350px,1fr)); gap:16px; }}
.action {{ color:var(--leaf); }} .muted {{ color:var(--muted); }} code {{ color:var(--leaf); }}
.card.reviewed {{ border-color:rgba(121,220,133,.7); }} .card.unreviewed {{ border-color:rgba(242,198,79,.45); }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · Episode 4 review bridge</p><h1>{esc(ledger.get('status'))}</h1><p>{esc(ledger.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">proposals {esc(counts.get('proposals'))}</span><span class=\"pill\">reviewed {esc(counts.get('reviewed'))}</span><span class=\"pill\">unreviewed {esc(counts.get('unreviewed'))}</span><span class=\"pill\">events {esc(counts.get('events'))}</span><span class=\"pill\">short notes {esc(short_note_counts.get('anyTargetedShortNote', 0))}</span><span class=\"pill\">hook {esc(short_note_counts.get('hookNote', 0))}</span><span class=\"pill\">caption {esc(short_note_counts.get('captionNote', 0))}</span><span class=\"pill\">platform {esc(short_note_counts.get('platformNote', 0))}</span><span class=\"pill\">framing {esc(short_note_counts.get('framingNote', 0))}</span></div></header>
<section class=\"grid\">{''.join(cards)}</section>
</main></body></html>"""


def render_card(proposal: dict[str, Any], review: dict[str, Any]) -> str:
    pid = proposal_id(proposal)
    status = review.get("status") or "unreviewed"
    decision = review.get("decision") or "pending"
    explanation = proposal.get("explanation") or proposal.get("summary") or proposal.get("context") or proposal.get("hookDraft") or ""
    dry_run = f"./script/agentctl.sh episode4-edit-review-decision-dry-run {pid} keep Codex \"notes\""
    short_details = ""
    if proposal.get("proposalGroup") == "shortCandidates":
        caption = proposal.get("captionPlan") if isinstance(proposal.get("captionPlan"), dict) else {}
        platforms = proposal.get("platformVariants") if isinstance(proposal.get("platformVariants"), list) else []
        platform_summary = "; ".join(
            f"{variant.get('platform')}: {variant.get('fit')}"
            for variant in platforms
            if isinstance(variant, dict)
        )
        short_details = (
            f"<p><strong>Hook:</strong> {esc(proposal.get('hookType'))} · {esc(proposal.get('hookDraft'))}</p>"
            f"<p><strong>Captions:</strong> {esc(caption.get('density'))} · {esc(caption.get('estimatedWordsPerSecond'))} w/s · {esc(caption.get('guidance'))}</p>"
            f"<p><strong>Platforms:</strong> {esc(platform_summary)}</p>"
            f"<p><strong>Short review lanes:</strong> hookNote · captionNote · platformNote · framingNote</p>"
        )
    return f"""<article class=\"card {esc(status)}\"><div class=\"cardtop\"><span class=\"pill\">{esc(pid)}</span><span class=\"pill\">{esc(proposal.get('proposalGroup'))}</span><span class=\"pill\">{esc(decision)}</span></div><h2>{esc(proposal.get('timeLabel') or proposal.get('id'))}</h2><p>{esc(proposal.get('intent'))}</p><p class=\"action\">{esc(explanation)}</p>{short_details}<p class=\"muted\">{esc(proposal.get('tradeoff'))}</p><p><strong>Next:</strong> {esc(review.get('nextAction') or suggestion_for(proposal))}</p><p><code>{esc(dry_run)}</code></p></article>"""


def build_command(args: argparse.Namespace) -> dict[str, Any]:
    session_dir, ledger = load_or_create_ledger(Path(args.intelligence_pointer), args.session)
    write_surfaces(session_dir, ledger)
    return ledger


def main() -> int:
    parser = argparse.ArgumentParser(description="Episode 4 edit-intelligence review ledger.")
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("--intelligence-pointer", default=str(INTELLIGENCE_POINTER))
    build_parser.add_argument("--session", default="latest")
    build_parser.add_argument("--json", action="store_true")
    build_parser.add_argument("--markdown", action="store_true")

    record_parser = subparsers.add_parser("record")
    record_parser.add_argument("proposal_id")
    record_parser.add_argument("decision", choices=sorted(VALID_DECISIONS))
    record_parser.add_argument("reviewer")
    record_parser.add_argument("notes", nargs="?", default="")
    record_parser.add_argument("--intelligence-pointer", default=str(INTELLIGENCE_POINTER))
    record_parser.add_argument("--session", default="latest")
    record_parser.add_argument("--audio-note", default="")
    record_parser.add_argument("--visual-note", default="")
    record_parser.add_argument("--cadence-note", default="")
    record_parser.add_argument("--source-note", default="")
    record_parser.add_argument("--hook-note", default="")
    record_parser.add_argument("--caption-note", default="")
    record_parser.add_argument("--platform-note", default="")
    record_parser.add_argument("--framing-note", default="")
    record_parser.add_argument("--next-action", default="")
    record_parser.add_argument("--dry-run", action="store_true")
    record_parser.add_argument("--json", action="store_true")
    record_parser.add_argument("--markdown", action="store_true")

    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    if not args.command:
        args.command = "build"
        args.intelligence_pointer = str(INTELLIGENCE_POINTER)
        args.session = "latest"

    if args.command == "build":
        payload = build_command(args)
    elif args.command == "record":
        payload = record_decision(args)
    else:
        parser.error(f"Unknown command: {args.command}")

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown and payload.get("schema") == SCHEMA:
        print(render_markdown(payload), end="")
    else:
        if payload.get("schema") == SCHEMA:
            counts = payload.get("counts") or {}
            print(f"Episode 4 edit review ledger: {payload.get('status')}")
            print(f"  Board: {payload.get('htmlPath')}")
            print(f"  Ledger: {payload.get('ledgerPath')}")
            print(f"  Proposals: {counts.get('proposals')} reviewed={counts.get('reviewed')} unreviewed={counts.get('unreviewed')} events={counts.get('events')}")
            print(f"  Next: {payload.get('nextSafestAction')}")
        else:
            print(f"Episode 4 edit review decision: {payload.get('status')}")
            print(f"  Proposal: {payload.get('proposalId') or (payload.get('proposal') or {}).get('id')}")
            print(f"  Decision: {payload.get('decision') or (payload.get('wouldAppendEvent') or {}).get('decision')}")
            print(f"  Ledger mutated: {payload.get('truth', {}).get('ledgerMutated')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
