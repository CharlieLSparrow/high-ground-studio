#!/usr/bin/env python3
"""Review local v002 short refinement candidates.

This is the local review lane after a v002 candidate has been exported and
indexed. It keeps candidate existence separate from editorial approval:
ffprobe passing means "safe to review," not "ready to publish."

The tool writes local sidecars only. It does not render, mutate source media,
overwrite exports, upload, publish, schedule, approve externally, mutate
accounts, normalize transcript truth, or create receipt truth.
"""
from __future__ import annotations

import argparse
import json
import shlex
import shutil
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_DIR = DEFAULT_ROOT / "review-board" / "short-v002-candidate-index"
DEFAULT_INDEX_POINTER = DEFAULT_INDEX_DIR / "latest-short-v002-candidate-index.json"
DEFAULT_LEDGER_DIR = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger"
LEDGER_JSON_NAME = "studio-short-v002-candidate-review-ledger.json"
EVENTS_JSONL_NAME = "studio-short-v002-candidate-review-events.jsonl"
LEDGER_MD_NAME = "studio-short-v002-candidate-review-ledger.md"
LEDGER_HTML_NAME = "index.html"
SCHEMA = "quipsly.studio.short-v002-candidate-review-ledger.v1"
EVENT_SCHEMA = "quipsly.studio.short-v002-candidate-review-event.v1"
VERSION = "2026-07-03.v1"
ALLOWED_DECISIONS = {"keep", "refine-again", "reject", "needs-listen", "hold"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(text: str) -> str:
    cleaned = []
    for char in text.lower():
        if char.isalnum():
            cleaned.append(char)
        elif cleaned and cleaned[-1] != "-":
            cleaned.append("-")
    return "".join(cleaned).strip("-") or "review"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def find_latest_index(index_pointer: Path) -> Path:
    if index_pointer.exists():
        pointer = load_json(index_pointer)
        for key in ("jsonPath", "path"):
            raw = pointer.get(key)
            if raw:
                path = Path(str(raw)).expanduser()
                if path.exists() and path.name != index_pointer.name:
                    return path
    index_dir = index_pointer.parent
    candidates = [
        path for path in index_dir.glob("*short-v002-candidate-index.json")
        if not path.name.startswith("latest-")
    ]
    if not candidates:
        raise SystemExit(
            "No v002 candidate index JSON found. Run: "
            "./script/agentctl.sh studio-short-v002-candidate-index --all"
        )
    return sorted(candidates, key=lambda path: (path.stat().st_mtime, str(path)), reverse=True)[0]


def load_index(index_pointer: Path) -> tuple[Path, dict[str, Any]]:
    path = find_latest_index(index_pointer)
    return path, load_json(path)


def read_events(events_path: Path) -> list[dict[str, Any]]:
    if not events_path.exists():
        return []
    events: list[dict[str, Any]] = []
    for line_no, line in enumerate(events_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid review event JSON on line {line_no}: {events_path}: {exc}") from exc
        if isinstance(event, dict):
            events.append(event)
    return events


def latest_events_by_short(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for event in events:
        short_id = str(event.get("shortId") or "")
        decision = str(event.get("decision") or "")
        if short_id and decision in ALLOWED_DECISIONS:
            latest[short_id] = event
    return latest


def default_review_status(candidate: dict[str, Any]) -> str:
    status = str(candidate.get("status") or "")
    if status == "v002-candidate-exported" and candidate.get("outputExists"):
        return "needs-listen"
    if status == "blocked-weak-hook":
        return "blocked-before-review"
    if status == "missing-output-file":
        return "blocked-missing-output"
    return "pending-review"


def shell_quote(path: str) -> str:
    return shlex.quote(path) if path else "''"


def review_flag_suffix(candidate: dict[str, Any]) -> str:
    warnings = []
    for source in (candidate.get("audioWarnings"), candidate.get("qualityWarnings")):
        if isinstance(source, list):
            warnings.extend(str(value) for value in source if value)
    suffix = " --watched --listened"
    if warnings:
        suffix += " --acknowledge-warnings"
    return suffix


def review_gate_for(review_status: str) -> dict[str, Any]:
    if review_status == "needs-listen":
        status = "needs-human-listen"
        plain = "Watch and listen once before recording keep. Machine evidence can check files, transcript clues, and obvious silence, but it cannot judge human cadence or whether the moment lands."
    elif review_status == "keep":
        status = "locally-kept"
        plain = "This candidate is locally accepted for this review lane only. It still has no external publication or receipt truth."
    elif review_status == "refine-again":
        status = "needs-refinement"
        plain = "This candidate should get another versioned refinement pass. Preserve the current artifact as learning evidence."
    elif review_status == "hold":
        status = "held"
        plain = "This candidate is parked until a human, source, or context decision resolves the hold."
    elif review_status == "reject":
        status = "rejected-local-candidate"
        plain = "This local candidate should not move forward, but source media and source ideas remain untouched."
    elif review_status.startswith("blocked"):
        status = "blocked"
        plain = "Resolve the blocker before asking for a human keep/refine decision."
    else:
        status = review_status or "unknown"
        plain = "Inspect the candidate and evidence before changing local review state."
    return {
        "status": status,
        "plainEnglish": plain,
        "localReadinessBoundary": "KEEP means locally accepted for this review lane only. It is not YouTube, Instagram, Patreon, podcast, or website publication.",
        "receiptBoundary": "No external publication or receipt truth exists unless a platform URL, upload id, schedule id, or receipt sidecar is recorded separately.",
    }


def candidate_row(candidate: dict[str, Any], latest_event: dict[str, Any] | None) -> dict[str, Any]:
    review_status = str(latest_event.get("decision") if latest_event else default_review_status(candidate))
    output_path = str(candidate.get("outputPath") or "")
    manifest_path = str(candidate.get("manifestPath") or "")
    short_id = str(candidate.get("shortId") or "")
    latest_review_evidence = latest_event.get("reviewEvidence") if latest_event and isinstance(latest_event.get("reviewEvidence"), dict) else {}
    review_flags = review_flag_suffix(candidate)
    next_action = "Watch/listen with sound on, then record a v002 review decision."
    if review_status == "keep":
        next_action = "Locally kept for this review lane. Prepare packet metadata only; do not treat this as external publication."
    elif review_status == "refine-again":
        next_action = "Create a v003 or alternate v002 candidate from the review notes."
    elif review_status == "reject":
        next_action = "Do not promote this candidate. Preserve the source idea for future search if useful."
    elif review_status == "hold":
        next_action = "Resolve the hold reason before more export or review work."
    elif review_status.startswith("blocked"):
        next_action = str(candidate.get("nextSafestAction") or "Resolve candidate blocker before watch/listen review.")
    return {
        "shortId": short_id,
        "episode": candidate.get("episode"),
        "candidateStatus": candidate.get("status"),
        "reviewStatus": review_status,
        "reviewer": latest_event.get("reviewer") if latest_event else "",
        "reviewedAt": latest_event.get("createdAt") if latest_event else "",
        "reviewNotes": latest_event.get("notes") if latest_event else "",
        "reviewGate": review_gate_for(review_status),
        "reviewEvidence": latest_review_evidence,
        "targetVersion": candidate.get("targetVersion"),
        "outputPath": output_path,
        "outputExists": candidate.get("outputExists"),
        "manifestPath": manifest_path,
        "markdownPath": candidate.get("markdownPath") or "",
        "durationSeconds": candidate.get("durationSeconds"),
        "width": candidate.get("width"),
        "height": candidate.get("height"),
        "hasAudio": candidate.get("hasAudio"),
        "hasVideo": candidate.get("hasVideo"),
        "audioSanityStatus": candidate.get("audioSanityStatus") or "",
        "audioIssues": candidate.get("audioIssues") if isinstance(candidate.get("audioIssues"), list) else [],
        "audioWarnings": candidate.get("audioWarnings") if isinstance(candidate.get("audioWarnings"), list) else [],
        "qualityWarnings": candidate.get("qualityWarnings") if isinstance(candidate.get("qualityWarnings"), list) else [],
        "sourceCandidatePath": candidate.get("sourceCandidatePath") or "",
        "sourceEvidencePath": candidate.get("sourceEvidencePath") or "",
        "sourceReviewStatus": candidate.get("sourceReviewStatus") or "",
        "sourceTargetVersion": candidate.get("sourceTargetVersion") or "",
        "hookCandidate": candidate.get("hookCandidate") or "",
        "candidateNextSafestAction": candidate.get("nextSafestAction") or "",
        "nextSafestAction": next_action,
        "safeCommands": {
            "openCandidate": f"open {shell_quote(output_path)}" if output_path else "",
            "revealCandidate": f"open -R {shell_quote(output_path)}" if output_path else "",
            "openManifest": f"open {shell_quote(manifest_path)}" if manifest_path else "",
            "recordNeedsListen": f"./script/agentctl.sh studio-short-v002-candidate-review {short_id} needs-listen REVIEWER 'Needs watch/listen review.'",
            "recordKeep": f"./script/agentctl.sh studio-short-v002-candidate-review {short_id} keep REVIEWER 'Promising after local review; still not published.'{review_flags}",
            "recordRefineAgain": f"./script/agentctl.sh studio-short-v002-candidate-review {short_id} refine-again REVIEWER 'Needs another v002/v003 pass.'{review_flags}",
            "recordReject": f"./script/agentctl.sh studio-short-v002-candidate-review {short_id} reject REVIEWER 'Reject this candidate, preserve source idea if useful.'{review_flags}",
        },
        "truth": "V002 candidate review row only. It does not approve externally, upload, publish, schedule, mutate media, overwrite versions, delete files, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def build_ledger(root: Path, index_pointer: Path, ledger_dir: Path) -> dict[str, Any]:
    index_path, index_payload = load_index(index_pointer)
    events_path = ledger_dir / EVENTS_JSONL_NAME
    events = read_events(events_path)
    latest = latest_events_by_short(events)
    candidates = [item for item in index_payload.get("items", []) if isinstance(item, dict)]
    rows = [candidate_row(candidate, latest.get(str(candidate.get("shortId") or ""))) for candidate in candidates]
    decisions = {decision: 0 for decision in sorted(ALLOWED_DECISIONS)}
    for row in rows:
        status = str(row.get("reviewStatus") or "")
        if status in decisions:
            decisions[status] += 1
    counts = {
        "items": len(rows),
        "candidateExports": sum(1 for row in rows if row.get("candidateStatus") == "v002-candidate-exported" and row.get("outputExists")),
        "blockedWeakHook": sum(1 for row in rows if row.get("candidateStatus") == "blocked-weak-hook"),
        "reviewEvents": len(events),
        "reviewedCandidates": sum(1 for row in rows if row.get("reviewer")),
        "decisions": decisions,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    next_row = next((row for row in rows if row.get("reviewStatus") == "needs-listen"), rows[0] if rows else {})
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-candidate-review-ledger-ready",
        "root": str(root),
        "indexPath": str(index_path),
        "eventLogPath": str(events_path),
        "counts": counts,
        "agentReadback": {
            "nextShortId": next_row.get("shortId") or "",
            "nextReviewStatus": next_row.get("reviewStatus") or "",
            "nextReviewGateStatus": (next_row.get("reviewGate") or {}).get("status") if isinstance(next_row.get("reviewGate"), dict) else "",
            "nextLocalReadinessBoundary": (next_row.get("reviewGate") or {}).get("localReadinessBoundary") if isinstance(next_row.get("reviewGate"), dict) else "",
            "nextCandidatePath": next_row.get("outputPath") or "",
            "nextAction": next_row.get("nextSafestAction") or "No v002 candidate review rows found.",
        },
        "items": rows,
        "nextSafestAction": "Watch/listen exported v002 candidates, then record keep/refine-again/reject/hold without treating local review as publication approval.",
        "truth": "Local v002 candidate review ledger only. It reads the v002 candidate index and append-only local review events; it does not render media, approve externally, upload, publish, schedule, mutate originals, overwrite versions, delete files, normalize transcripts, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio short v002 candidate review ledger",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Candidates: `{payload.get('counts', {}).get('items')}`",
        f"Events: `{payload.get('counts', {}).get('reviewEvents')}`",
        "",
        "## Review states",
        "",
    ]
    for decision, count in (payload.get("counts", {}).get("decisions") or {}).items():
        lines.append(f"- `{decision}`: `{count}`")
    lines.extend(["", "## Candidates", ""])
    for item in payload.get("items", []):
        review_evidence = item.get("reviewEvidence") if isinstance(item.get("reviewEvidence"), dict) else {}
        lines.extend([
            f"### `{item.get('shortId')}`",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Candidate status: `{item.get('candidateStatus')}`",
            f"- Review status: `{item.get('reviewStatus')}`",
            f"- Review gate: `{item.get('reviewGate', {}).get('status') if isinstance(item.get('reviewGate'), dict) else ''}`",
            f"- Reviewer: `{item.get('reviewer') or ''}`",
            f"- Review evidence: `{review_evidence.get('status') or 'not-recorded'}`",
            f"- Output: `{item.get('outputPath')}`",
            f"- Duration: `{item.get('durationSeconds')}`",
            f"- Audio sanity: `{item.get('audioSanityStatus')}`",
            f"- Hook: {item.get('hookCandidate') or '(missing)' }",
            f"- Notes: {item.get('reviewNotes') or '(none)' }",
            f"- Boundary: {item.get('reviewGate', {}).get('localReadinessBoundary') if isinstance(item.get('reviewGate'), dict) else 'Local review state is not publication truth.'}",
            f"- Next: {item.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for item in payload.get("items", []):
        review_status = str(item.get("reviewStatus") or "")
        candidate_status = str(item.get("candidateStatus") or "")
        review_gate = item.get("reviewGate") if isinstance(item.get("reviewGate"), dict) else {}
        review_evidence = item.get("reviewEvidence") if isinstance(item.get("reviewEvidence"), dict) else {}
        review_evidence_status = str(review_evidence.get("status") or "not-recorded")
        review_evidence_plain = str(review_evidence.get("plainEnglish") or "No explicit watch/listen acknowledgement has been recorded yet.")
        cards.append(f"""
        <article class="card {escape(review_status)}">
          <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(candidate_status)}</div>
          <h2>{escape(str(item.get('shortId')))}</h2>
          <p><span class="pill">{escape(review_status)}</span> <span class="pill muted">{escape(str(item.get('durationSeconds')))}s</span> <span class="pill muted">audio {escape(str(item.get('audioSanityStatus') or 'unchecked'))}</span></p>
          <p><strong>Hook:</strong> {escape(str(item.get('hookCandidate') or 'missing'))}</p>
          <p><strong>Review:</strong> {escape(str(item.get('reviewNotes') or 'No local v002 review notes yet.'))}</p>
          <p><strong>Review evidence:</strong> {escape(review_evidence_status)} · {escape(review_evidence_plain)}</p>
          <section class="gate">
            <strong>Review gate · {escape(str(review_gate.get('status') or review_status))}</strong>
            <p>{escape(str(review_gate.get('plainEnglish') or 'Local review state only.'))}</p>
            <p>{escape(str(review_gate.get('localReadinessBoundary') or 'Local review state is not publication truth.'))}</p>
            <p>{escape(str(review_gate.get('receiptBoundary') or 'No external receipt truth exists here.'))}</p>
          </section>
          <p><strong>Next:</strong> {escape(str(item.get('nextSafestAction')))}</p>
          <p class="path">{escape(str(item.get('outputPath') or item.get('manifestPath')))}</p>
        </article>
        """)
    decisions = payload.get("counts", {}).get("decisions") or {}
    decision_html = "".join(f"<span class=\"stat\"><strong>{escape(str(count))}</strong>{escape(str(decision))}</span>" for decision, count in decisions.items())
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Studio v002 Candidate Review Ledger</title>
  <style>
    :root {{ color-scheme: dark; --bg: #101915; --panel: #203129; --ink: #f8ecd1; --muted: #baad90; --gold: #dabe55; --leaf: #86ca91; --clay: #ce6d50; --blue: #62b7d8; }}
    body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #2c4330, var(--bg)); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    h1 {{ margin: 0 0 8px; font-size: 34px; }}
    .sub {{ color: var(--muted); margin-bottom: 18px; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 24px; }}
    .stat {{ background: rgba(248,236,209,.08); border: 1px solid rgba(218,190,85,.22); border-radius: 16px; padding: 8px 12px; color: var(--muted); }}
    .stat strong {{ color: var(--ink); display: inline-block; min-width: 22px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }}
    .card {{ background: rgba(32,49,41,.9); border: 1px solid rgba(218,190,85,.25); border-radius: 22px; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.28); }}
    .card.keep {{ border-color: rgba(134,202,145,.8); }}
    .card.refine-again {{ border-color: rgba(98,183,216,.75); }}
    .card.reject {{ border-color: rgba(206,109,80,.75); }}
    .card.needs-listen {{ border-color: rgba(218,190,85,.75); }}
    .kicker {{ color: var(--gold); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 900; }}
    h2 {{ margin: 8px 0 10px; font-size: 22px; }}
    .pill {{ display: inline-block; border-radius: 999px; background: rgba(218,190,85,.16); color: var(--gold); padding: 3px 9px; margin: 0 4px 4px 0; font-weight: 800; font-size: 12px; }}
    .pill.muted {{ background: rgba(248,236,209,.08); color: var(--muted); }}
    .path {{ color: var(--muted); font-size: 12px; word-break: break-all; }}
    .gate {{ margin: 14px 0; padding: 14px; border-radius: 16px; background: rgba(218,190,85,.10); border: 1px solid rgba(218,190,85,.28); }}
    .gate p {{ margin: .35rem 0; color: var(--muted); }}
  </style>
</head>
<body>
  <h1>v002 candidate review ledger</h1>
  <p class="sub">Local watch/listen state for derivative v002 candidates. File exists does not mean approved.</p>
  <div class="stats">{decision_html}</div>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>
"""


def snapshot_existing_ledger(ledger_dir: Path) -> str:
    ledger_path = ledger_dir / LEDGER_JSON_NAME
    if not ledger_path.exists():
        return ""
    snapshots = ledger_dir / "snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)
    target = snapshots / f"{stamp_now()}-{LEDGER_JSON_NAME}"
    shutil.copy2(ledger_path, target)
    return str(target)


def write_ledger(payload: dict[str, Any], ledger_dir: Path) -> dict[str, str]:
    ledger_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "jsonPath": str(ledger_dir / LEDGER_JSON_NAME),
        "markdownPath": str(ledger_dir / LEDGER_MD_NAME),
        "htmlPath": str(ledger_dir / LEDGER_HTML_NAME),
    }
    (ledger_dir / LEDGER_JSON_NAME).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ledger_dir / LEDGER_MD_NAME).write_text(render_markdown(payload), encoding="utf-8")
    (ledger_dir / LEDGER_HTML_NAME).write_text(render_html(payload), encoding="utf-8")
    pointer = ledger_dir / "latest-short-v002-candidate-review-ledger.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def event_for_candidate(
    candidate: dict[str, Any],
    decision: str,
    reviewer: str,
    notes: str,
    *,
    watched: bool = False,
    listened: bool = False,
    acknowledge_warnings: bool = False,
) -> dict[str, Any]:
    now = utc_now()
    short_id = str(candidate.get("shortId") or "")
    candidate_warnings: list[str] = []
    for source in (candidate.get("audioWarnings"), candidate.get("qualityWarnings")):
        if isinstance(source, list):
            candidate_warnings.extend(str(value) for value in source if value)
    candidate_warnings = sorted(set(candidate_warnings))
    review_warnings: list[str] = []
    if decision == "keep" and not (watched and listened):
        review_warnings.append("KEEP was recorded without explicit watched/listened acknowledgement; treat as provisional local review evidence.")
    if decision in {"keep", "refine-again", "reject"} and candidate_warnings and not acknowledge_warnings:
        review_warnings.append("Candidate warnings were present but not explicitly acknowledged by the reviewer command.")
    review_evidence = {
        "watched": watched,
        "listened": listened,
        "acknowledgedCandidateWarnings": acknowledge_warnings or not candidate_warnings,
        "candidateWarnings": candidate_warnings,
        "reviewWarnings": review_warnings,
        "status": "watch-listen-acknowledged" if watched and listened else "missing-watch-listen-acknowledgement",
        "plainEnglish": "This local review event says the candidate was watched and listened to." if watched and listened else "This local review event does not explicitly prove the candidate was both watched and listened to.",
    }
    return {
        "schema": EVENT_SCHEMA,
        "version": VERSION,
        "eventId": f"{stamp_now()}-{slug(short_id)}-{slug(decision)}",
        "createdAt": now,
        "shortId": short_id,
        "episode": candidate.get("episode"),
        "decision": decision,
        "reviewer": reviewer,
        "notes": notes,
        "candidateStatus": candidate.get("status"),
        "candidateOutputPath": candidate.get("outputPath") or "",
        "candidateManifestPath": candidate.get("manifestPath") or "",
        "reviewEvidence": review_evidence,
        "reviewGate": review_gate_for(decision),
        "localReadinessBoundary": "KEEP means locally accepted for this review lane only. It is not YouTube, Instagram, Patreon, podcast, or website publication.",
        "receiptBoundary": "This event creates no platform URL, upload id, schedule id, external publication, or receipt truth.",
        "truth": "Local v002 candidate review event only. It does not approve externally, upload, publish, schedule, mutate media, overwrite versions, delete files, normalize transcripts, mutate accounts, or create receipt truth.",
    }


def record_review(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    index_pointer = Path(args.index_pointer).expanduser()
    ledger_dir = Path(args.ledger_dir).expanduser()
    if args.decision not in ALLOWED_DECISIONS:
        raise SystemExit(f"Decision must be one of: {', '.join(sorted(ALLOWED_DECISIONS))}")
    if not args.short_id:
        raise SystemExit("Missing short id.")
    if not args.reviewer:
        raise SystemExit("Missing reviewer.")
    index_path, index_payload = load_index(index_pointer)
    candidates = [item for item in index_payload.get("items", []) if isinstance(item, dict)]
    candidate = next((item for item in candidates if str(item.get("shortId") or "") == args.short_id), None)
    if not candidate:
        raise SystemExit(f"Short id not found in latest v002 candidate index: {args.short_id}")
    notes = " ".join(args.notes).strip()
    event = event_for_candidate(
        candidate,
        args.decision,
        args.reviewer,
        notes,
        watched=args.watched,
        listened=args.listened,
        acknowledge_warnings=args.acknowledge_warnings,
    )
    if args.dry_run:
        return {
            "schema": "quipsly.studio.short-v002-candidate-review-record-preview.v1",
            "generatedAt": utc_now(),
            "status": "dry-run",
            "ledgerMutated": False,
            "indexPath": str(index_path),
            "event": event,
            "truth": "Dry run only. No files were written.",
        }
    ledger_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshot_existing_ledger(ledger_dir)
    events_path = ledger_dir / EVENTS_JSONL_NAME
    with events_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    ledger = build_ledger(root, index_pointer, ledger_dir)
    ledger["outputPaths"] = write_ledger(ledger, ledger_dir)
    return {
        "schema": "quipsly.studio.short-v002-candidate-review-record-result.v1",
        "generatedAt": utc_now(),
        "status": "review-recorded",
        "ledgerMutated": True,
        "snapshotPath": snapshot_path,
        "event": event,
        "ledgerPath": ledger["outputPaths"]["jsonPath"],
        "htmlPath": ledger["outputPaths"]["htmlPath"],
        "truth": "Local v002 candidate review event recorded. No source media, exports, accounts, external publication, schedules, or receipt truth were mutated.",
    }


def build_command(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    index_pointer = Path(args.index_pointer).expanduser()
    ledger_dir = Path(args.ledger_dir).expanduser()
    ledger = build_ledger(root, index_pointer, ledger_dir)
    ledger["outputPaths"] = write_ledger(ledger, ledger_dir)
    return ledger


def print_payload(payload: dict[str, Any], fmt: str) -> None:
    if fmt == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif fmt == "html":
        print(render_html(payload))
    else:
        if payload.get("schema") == SCHEMA:
            print(render_markdown(payload), end="")
        else:
            print(json.dumps(payload, indent=2, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or record local v002 candidate review state.")
    parser.add_argument("command", nargs="?", default="build", choices=["build", "record"])
    parser.add_argument("short_id", nargs="?")
    parser.add_argument("decision", nargs="?")
    parser.add_argument("reviewer", nargs="?")
    parser.add_argument("notes", nargs="*")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--index-pointer", default=str(DEFAULT_INDEX_POINTER))
    parser.add_argument("--ledger-dir", default=str(DEFAULT_LEDGER_DIR))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--watched", action="store_true", help="Record that the reviewer watched the candidate output before this local decision.")
    parser.add_argument("--listened", action="store_true", help="Record that the reviewer listened with sound before this local decision.")
    parser.add_argument("--acknowledge-warnings", action="store_true", help="Record that visible candidate warnings were considered before this local decision.")
    parser.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    args = parser.parse_args()

    if args.command == "record":
        if not args.short_id or not args.decision or not args.reviewer:
            raise SystemExit("Usage: studio_short_v002_candidate_review.py record SHORT_ID DECISION REVIEWER [notes] [--dry-run]")
        payload = record_review(args)
    else:
        payload = build_command(args)
    print_payload(payload, args.format)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
