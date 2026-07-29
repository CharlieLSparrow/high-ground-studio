#!/usr/bin/env python3
"""Build an Episode 4 apply-preview packet from reviewed edit proposals.

The apply-preview packet is the safety seam between "reviewed proposal" and
"timeline metadata write." It translates reviewed Episode 4 edit-intelligence
items into proposed operations, blocked operations, and no-ops with explicit
reasons and tradeoffs.

Safety boundary: preview only. This command never writes timeline/session state,
imports clips, creates shorts, renders exports, publishes, uploads, deletes,
overwrites previous versions, or mutates source media.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LEDGER_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence-review/latest-episode4-edit-review-ledger.json"
INTAKE_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-apply-preview"
LATEST_POINTER = OUT_ROOT / "latest-episode4-apply-preview.json"
SCHEMA = "quipsly.episode4-apply-preview.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-apply-preview")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: Any) -> str:
    try:
        value = max(0.0, float(seconds or 0.0))
    except Exception:
        value = 0.0
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path, target_keys: tuple[str, ...] = ("jsonPath", "ledgerPath")) -> dict[str, Any]:
    pointer = load_json(path)
    merged = dict(pointer)
    for key in target_keys:
        target_text = str(pointer.get(key) or "")
        if not target_text:
            continue
        target = Path(target_text)
        if target.exists() and target != path:
            target_payload = load_json(target)
            if target_payload:
                merged = {**pointer, **target_payload}
                break
    merged["pointerPath"] = str(path)
    merged["pointerExists"] = path.exists()
    return merged


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def truth() -> dict[str, Any]:
    return {
        "previewOnly": True,
        "timelineDecisionsWritten": False,
        "clipsImported": False,
        "shortsCreated": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def proposal_by_id(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for proposal in ledger.get("proposals") or []:
        if isinstance(proposal, dict) and proposal.get("id"):
            lookup[str(proposal["id"])] = proposal
    return lookup


def source_matches_by_cue(intake: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    matches: dict[str, list[dict[str, Any]]] = {}
    for clip in intake.get("clips") or []:
        if not isinstance(clip, dict):
            continue
        for cue_id in clip.get("cueIds") or []:
            matches.setdefault(str(cue_id), []).append(clip)
    return matches


def source_placeholder_operation(base: dict[str, Any], proposal: dict[str, Any], review: dict[str, Any], cue_id: str) -> dict[str, Any]:
    suggested_filename = f"{cue_id}-short-description.mp4" if cue_id else "ep4-cue-###-short-description.mp4"
    return {
        **base,
        "operationStatus": "source-placeholder",
        "operationKind": "clip-weave-source-placeholder",
        "reason": (
            "The episode can keep its edit intent as a visible source-required placeholder, "
            "but no real clip-weave timeline media should be written until a cue-matched watched/source file exists."
        ),
        "requiredBeforeRealClipApply": ["drop-file-named-with-cue-id", "rerun-source-clip-intake", "review-cue-match"],
        "canContinueMainEpisodeEdit": True,
        "canWriteRealClipInsert": False,
        "sourceRecovery": {
            "cueId": cue_id,
            "suggestedFilename": suggested_filename,
            "dropbox": str(RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"),
            "humanInstruction": (
                f"Find the watched/source clip for {cue_id or 'this cue'}, rename or copy it as "
                f"{suggested_filename}, then rerun source intake and apply preview."
            ),
        },
        "previewOperation": {
            "type": "clip-weave-source-placeholder",
            "cueId": cue_id,
            "placeholderLabel": f"Source clip needed: {cue_id}" if cue_id else "Source clip needed",
            "sequenceStartSeconds": proposal.get("startSeconds"),
            "sequenceEndSeconds": proposal.get("endSeconds"),
            "jCutHint": proposal.get("jCutHint"),
            "lCutHint": proposal.get("lCutHint"),
            "metadata": {
                **metadata_for(proposal, review),
                "sourceMissing": True,
                "placeholderOnly": True,
                "timelineWriteAllowed": False,
            },
        },
    }


def operation_for_review(proposal: dict[str, Any], review: dict[str, Any], source_by_cue: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    decision = str(review.get("decision") or "pending")
    group = str(proposal.get("proposalGroup") or "")
    proposal_id = str(proposal.get("id") or review.get("proposalId") or "")
    cue_id = str(proposal.get("cueId") or "")
    source_matches = source_by_cue.get(cue_id, []) if cue_id else []
    base = {
        "proposalId": proposal_id,
        "proposalGroup": group,
        "decision": decision,
        "reviewStatus": review.get("status"),
        "reviewer": review.get("reviewer"),
        "timeLabel": proposal.get("timeLabel"),
        "startSeconds": proposal.get("startSeconds"),
        "endSeconds": proposal.get("endSeconds"),
        "intent": proposal.get("intent"),
        "explanation": proposal.get("explanation") or proposal.get("summary") or proposal.get("context") or proposal.get("hookDraft") or "",
        "tradeoff": proposal.get("tradeoff"),
        "reviewNotes": review.get("notes"),
        "reviewNextAction": review.get("nextAction"),
        "sourceMatches": source_matches,
        "truth": truth(),
    }

    if decision in {"reject", "hold"}:
        return {
            **base,
            "operationStatus": "noop",
            "operationKind": "do-not-apply",
            "reason": "Reviewed decision says not to apply this proposal now.",
        }
    if decision in {"pending", ""}:
        return {
            **base,
            "operationStatus": "blocked",
            "operationKind": "review-required",
            "reason": "Proposal is not reviewed yet.",
            "requiredBeforeApply": ["human-or-agent-review-decision"],
        }
    if decision == "needs-source" and not source_matches and group == "clipWeaveWorkorders":
        return source_placeholder_operation(base, proposal, review, cue_id)
    if decision == "needs-source" and not source_matches:
        return {
            **base,
            "operationStatus": "blocked",
            "operationKind": "source-required",
            "reason": "Reviewed proposal requires confirmed watched/source media before any clip-weave timeline metadata can be written.",
            "requiredBeforeApply": ["drop-or-confirm-source-clip", "rerun-source-clip-intake", "review-cue-match"],
        }
    if decision in {"needs-listen", "needs-visual-review"}:
        return {
            **base,
            "operationStatus": "blocked",
            "operationKind": "sensory-review-required",
            "reason": "Audio/visual review is required before this proposal can become an edit operation.",
            "requiredBeforeApply": ["open-range-in-studio", "listen-or-visual-review", "record-keep-refine-reject"],
        }
    if group == "clipWeaveWorkorders":
        if not source_matches:
            return source_placeholder_operation(base, proposal, review, cue_id)
        return {
            **base,
            "operationStatus": "ready-for-apply-preview-review",
            "operationKind": "clip-weave-branch",
            "reason": "Reviewed proposal has source matches. A human/agent should inspect the matched media before timeline metadata write.",
            "previewOperation": {
                "type": "clip-weave-branch",
                "cueId": cue_id,
                "sourceClipPaths": [clip.get("path") for clip in source_matches],
                "sequenceStartSeconds": proposal.get("startSeconds"),
                "sequenceEndSeconds": proposal.get("endSeconds"),
                "jCutHint": proposal.get("jCutHint"),
                "lCutHint": proposal.get("lCutHint"),
                "metadata": metadata_for(proposal, review),
            },
        }
    if group == "shortCandidates":
        return {
            **base,
            "operationStatus": "ready-for-apply-preview-review",
            "operationKind": "short-recipe-draft",
            "reason": "Reviewed short candidate can become a draft short recipe after visual framing review.",
            "previewOperation": {
                "type": "short-recipe-draft",
                "format": "9:16",
                "sequenceStartSeconds": proposal.get("startSeconds"),
                "sequenceEndSeconds": proposal.get("endSeconds"),
                "hookDraft": proposal.get("hookDraft"),
                "captionAwareness": "requires transcript cleanup before publication captions",
                "metadata": metadata_for(proposal, review),
            },
        }
    if group == "cadenceCandidates":
        return {
            **base,
            "operationStatus": "ready-for-apply-preview-review",
            "operationKind": "cadence-tighten-draft",
            "reason": "Reviewed cadence candidate can become a draft tighten/keep decision, but human pacing must be preserved.",
            "previewOperation": {
                "type": "cadence-tighten-draft",
                "sequenceStartSeconds": proposal.get("startSeconds"),
                "sequenceEndSeconds": proposal.get("endSeconds"),
                "preserveSignals": proposal.get("preserveSignals") or [],
                "metadata": metadata_for(proposal, review),
            },
        }
    if group == "reactionCoverCandidates":
        return {
            **base,
            "operationStatus": "ready-for-apply-preview-review",
            "operationKind": "reaction-cover-draft",
            "reason": "Reviewed reaction cover can become an optional cover decision for a nearby jump or clip insert.",
            "previewOperation": {
                "type": "reaction-cover-draft",
                "sequenceStartSeconds": proposal.get("startSeconds"),
                "sequenceEndSeconds": proposal.get("endSeconds"),
                "metadata": metadata_for(proposal, review),
            },
        }
    return {
        **base,
        "operationStatus": "blocked",
        "operationKind": "unknown-proposal-group",
        "reason": "No apply-preview translator exists for this proposal group yet.",
        "requiredBeforeApply": ["implement-translator"],
    }


def metadata_for(proposal: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    return {
        "createdBy": "Codex",
        "createdAt": iso_now(),
        "source": "episode4-edit-review-ledger",
        "proposalId": proposal.get("id"),
        "proposalGroup": proposal.get("proposalGroup"),
        "editIntent": proposal.get("intent"),
        "confidence": proposal.get("confidence"),
        "explanation": proposal.get("explanation") or proposal.get("summary") or proposal.get("context"),
        "tradeoff": proposal.get("tradeoff"),
        "reviewDecision": review.get("decision"),
        "reviewer": review.get("reviewer"),
        "reviewNotes": review.get("notes"),
        "revisionHistory": [
            {
                "at": review.get("lastReviewedAt"),
                "actor": review.get("reviewer"),
                "event": "review-decision",
                "decision": review.get("decision"),
                "notes": review.get("notes"),
            }
        ],
    }


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    ledger_pointer = Path(args.ledger_pointer)
    intake_pointer = Path(args.intake_pointer)
    ledger = load_pointer(ledger_pointer, ("ledgerPath", "jsonPath"))
    intake = load_pointer(intake_pointer, ("jsonPath",))
    proposals = proposal_by_id(ledger)
    source_by_cue = source_matches_by_cue(intake)
    operations: list[dict[str, Any]] = []
    for proposal_id, review in sorted((ledger.get("reviews") or {}).items()):
        if not isinstance(review, dict) or review.get("status") != "reviewed":
            continue
        proposal = proposals.get(proposal_id)
        if not proposal:
            continue
        operations.append(operation_for_review(proposal, review, source_by_cue))
    status_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    for operation in operations:
        status = str(operation.get("operationStatus") or "unknown")
        kind = str(operation.get("operationKind") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
    session_dir = Path(args.out_root) / stamp()
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-apply-preview-ready" if operations else "episode4-apply-preview-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "ledgerPointer": str(ledger_pointer),
        "sourceClipIntakePointer": str(intake_pointer),
        "counts": {
            "reviewedOperations": len(operations),
            "readyForApplyPreviewReview": status_counts.get("ready-for-apply-preview-review", 0),
            "sourcePlaceholders": status_counts.get("source-placeholder", 0),
            "blocked": status_counts.get("blocked", 0),
            "noop": status_counts.get("noop", 0),
            "statusCounts": status_counts,
            "kindCounts": kind_counts,
        },
        "operations": operations,
        "nextSafestAction": next_safest_action(operations),
        "truth": truth(),
    }
    write_surfaces(session_dir, packet, Path(args.latest_pointer))
    return packet


def next_safest_action(operations: list[dict[str, Any]]) -> str:
    if not operations:
        return "Review at least one edit-intelligence proposal before building apply-preview operations."
    if any(operation.get("operationKind") == "clip-weave-source-placeholder" for operation in operations):
        return (
            "Keep shaping the main Episode 4 edit with visible source placeholders, and recover/drop the watched clip "
            "when available before any real clip-weave apply."
        )
    if any(operation.get("operationKind") in {"source-required", "clip-weave-source-missing"} for operation in operations):
        return "Drop or confirm cue-matched source clips, rerun source intake, then rebuild this apply-preview packet."
    if any(operation.get("operationStatus") == "blocked" for operation in operations):
        return "Resolve blocked operations with listen/visual/source review before timeline metadata writes."
    return "Review ready preview operations in Studio before any explicit apply command is created."


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 apply-preview packet",
        "",
        f"Status: `{packet.get('status')}`",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        "This is a preview, not an apply. It does not write timeline/session state.",
        "",
        f"Next: {packet.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in (packet.get("counts") or {}).items():
        if isinstance(value, dict):
            lines.append(f"- {key}: `{json.dumps(value, sort_keys=True)}`")
        else:
            lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Operations", ""])
    for operation in packet.get("operations") or []:
        lines.extend([
            f"### {operation.get('proposalId')} · {operation.get('operationKind')} · {operation.get('operationStatus')}",
            "",
            f"- Time: `{operation.get('timeLabel')}`",
            f"- Decision: `{operation.get('decision')}`",
            f"- Reason: {operation.get('reason')}",
            f"- Intent: {operation.get('intent')}",
            f"- Tradeoff: {operation.get('tradeoff')}",
        ])
        recovery = operation.get("sourceRecovery")
        if isinstance(recovery, dict) and recovery:
            lines.extend([
                f"- Source recovery cue: `{recovery.get('cueId')}`",
                f"- Suggested filename: `{recovery.get('suggestedFilename')}`",
                f"- Drop folder: `{recovery.get('dropbox')}`",
                f"- Human action: {recovery.get('humanInstruction')}",
            ])
        lines.extend([
            f"- Can continue main episode edit: `{operation.get('canContinueMainEpisodeEdit', False)}`",
            f"- Can write real clip insert: `{operation.get('canWriteRealClipInsert', True)}`",
            "",
        ])
    if not packet.get("operations"):
        lines.extend(["No reviewed operations are available yet.", ""])
    return "\n".join(lines).rstrip() + "\n"


def source_recovery_html(operation: dict[str, Any]) -> str:
    recovery = operation.get("sourceRecovery")
    if not isinstance(recovery, dict) or not recovery:
        return ""
    return f"""
              <section class="recovery">
                <p class="eyebrow">Source recovery</p>
                <p><strong>{esc(recovery.get('cueId'))}</strong> needs a watched/source clip before real media can be woven into the timeline.</p>
                <dl>
                  <div><dt>Suggested file</dt><dd>{esc(recovery.get('suggestedFilename'))}</dd></div>
                  <div><dt>Continue edit</dt><dd>{esc(operation.get('canContinueMainEpisodeEdit', False))}</dd></div>
                  <div><dt>Real clip apply</dt><dd>{esc(operation.get('canWriteRealClipInsert', True))}</dd></div>
                  <div><dt>Matches</dt><dd>{esc(len(operation.get('sourceMatches') or []))}</dd></div>
                </dl>
                <p>{esc(recovery.get('humanInstruction'))}</p>
                <p><code>{esc(recovery.get('dropbox'))}</code></p>
              </section>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") or {}
    operation_html = []
    for operation in packet.get("operations") or []:
        status = str(operation.get("operationStatus") or "")
        operation_html.append(
            f"""
            <article class="op {esc(status)}">
              <p class="eyebrow">{esc(operation.get('proposalId'))} · {esc(operation.get('proposalGroup'))}</p>
              <h2>{esc(operation.get('operationKind'))}</h2>
              <p class="status">{esc(status)}</p>
              <p>{esc(operation.get('reason'))}</p>
              <dl>
                <div><dt>Time</dt><dd>{esc(operation.get('timeLabel'))}</dd></div>
                <div><dt>Decision</dt><dd>{esc(operation.get('decision'))}</dd></div>
                <div><dt>Reviewer</dt><dd>{esc(operation.get('reviewer'))}</dd></div>
                <div><dt>Source matches</dt><dd>{esc(len(operation.get('sourceMatches') or []))}</dd></div>
              </dl>
              {source_recovery_html(operation)}
              <p class="tradeoff">{esc(operation.get('tradeoff'))}</p>
            </article>
            """
        )
    if not operation_html:
        operation_html.append("<article class=\"op blocked\"><h2>No reviewed operations yet</h2><p>Review proposals first, then rebuild this packet.</p></article>")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Apply Preview</title>
  <style>
    body {{ margin:0; background:#131913; color:#f5ecd2; font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:42px 24px 72px; }}
    header,.op {{ border:1px solid rgba(240,189,79,.25); border-radius:24px; padding:24px; background:linear-gradient(135deg,rgba(42,58,39,.94),rgba(29,34,29,.96)); margin:16px 0; box-shadow:0 20px 58px rgba(0,0,0,.28); }}
    h1 {{ margin:0; font-family:Georgia,serif; font-size:clamp(42px,6vw,74px); line-height:.92; }}
    h2 {{ margin:.1em 0; }}
    p {{ color:#cfc6aa; line-height:1.5; }}
    .eyebrow {{ color:#f0bd4f; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
    .metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
    .pill {{ border-radius:999px; background:rgba(255,255,255,.07); padding:10px 14px; font-weight:800; }}
    .blocked {{ border-color:rgba(216,111,77,.55); }}
    .ready-for-apply-preview-review {{ border-color:rgba(113,182,107,.55); }}
    .source-placeholder {{ border-color:rgba(240,189,79,.72); }}
    .noop {{ border-color:rgba(140,151,132,.55); }}
    .status {{ color:#ffe28a; font-weight:900; }}
    .recovery {{ margin-top:14px; padding:14px; border-radius:16px; background:rgba(240,189,79,.1); border:1px solid rgba(240,189,79,.24); }}
    code {{ color:#ffe28a; overflow-wrap:anywhere; }}
    dl {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }}
    dl div {{ background:rgba(0,0,0,.2); border-radius:14px; padding:12px; }}
    dt {{ color:#9faa92; text-transform:uppercase; letter-spacing:.12em; font-size:11px; }}
    dd {{ margin:4px 0 0; font-weight:800; }}
    .tradeoff {{ color:#f5ecd2; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · Episode 4</p>
    <h1>Apply preview, not apply.</h1>
    <p>This packet translates reviewed proposals into possible future operations while preserving whole sources and avoiding accidental timeline writes.</p>
    <div class="metrics">
      <span class="pill">reviewed {esc(counts.get('reviewedOperations', 0))}</span>
      <span class="pill">ready {esc(counts.get('readyForApplyPreviewReview', 0))}</span>
      <span class="pill">source placeholders {esc(counts.get('sourcePlaceholders', 0))}</span>
      <span class="pill">blocked {esc(counts.get('blocked', 0))}</span>
      <span class="pill">noop {esc(counts.get('noop', 0))}</span>
    </div>
    <p><strong>Next:</strong> {esc(packet.get('nextSafestAction'))}</p>
  </header>
  {''.join(operation_html)}
</main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, packet: dict[str, Any], latest_pointer: Path = LATEST_POINTER) -> None:
    json_path = session_dir / "episode4-apply-preview.json"
    markdown_path = session_dir / "episode4-apply-preview.md"
    html_path = session_dir / "index.html"
    packet.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_json(latest_pointer, {
        "schema": "quipsly.episode4-apply-preview-pointer.v1",
        "generatedAt": iso_now(),
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "truth": packet.get("truth"),
    })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger-pointer", default=str(LEDGER_POINTER))
    parser.add_argument("--intake-pointer", default=str(INTAKE_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    packet = build_packet(args)
    if args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
        return
    if args.markdown:
        print(render_markdown(packet))
        return
    counts = packet.get("counts") or {}
    print(f"Episode 4 apply-preview packet: {packet.get('status')}")
    print(f"  Board: {packet.get('htmlPath')}")
    print(f"  Packet: {packet.get('jsonPath')}")
    print(
        "  Operations: "
        f"reviewed={counts.get('reviewedOperations')} "
        f"ready={counts.get('readyForApplyPreviewReview')} "
        f"blocked={counts.get('blocked')} "
        f"noop={counts.get('noop')}"
    )
    print(f"  Next: {packet.get('nextSafestAction')}")


if __name__ == "__main__":
    main()
