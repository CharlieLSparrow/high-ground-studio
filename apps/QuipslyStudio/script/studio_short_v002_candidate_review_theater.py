#!/usr/bin/env python3
"""Build a calm local review theater for v002 short candidates.

The theater gives humans and agents one page per current candidate set: embedded
local video, contact sheet, transcript clue, warnings, and copyable review
commands. It does not record review decisions; decisions stay in the append-only
v002 candidate review ledger.
"""
from __future__ import annotations

import argparse
import json
import shlex
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_LEDGER = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"
DEFAULT_EVIDENCE_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"
DEFAULT_COMPARISON_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-comparisons"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-theater"
SCHEMA = "quipsly.studio.short-v002-candidate-review-theater.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(text: str) -> str:
    out = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "candidate"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def safe_load_json(path: Path) -> dict[str, Any]:
    try:
        return load_json(path)
    except Exception:
        return {}


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    path = Path(path_value).expanduser()
    try:
        return path.resolve().as_uri()
    except Exception:
        return ""


def latest_evidence(short_id: str, evidence_root: Path) -> tuple[str, dict[str, Any]]:
    pointer = evidence_root / f"latest-{slug(short_id)}-v002-candidate-evidence.json"
    if pointer.exists():
        pointer_data = safe_load_json(pointer)
        json_path = pointer_data.get("jsonPath")
        if json_path and Path(str(json_path)).exists():
            path = Path(str(json_path))
            return str(path), load_json(path)
    folder = evidence_root / slug(short_id)
    candidates = sorted(folder.glob("*/*v002-candidate-evidence.json"), key=lambda p: (p.stat().st_mtime, str(p)), reverse=True)
    if candidates:
        return str(candidates[0]), load_json(candidates[0])
    return "", {}


def latest_comparison(short_id: str, comparison_root: Path = DEFAULT_COMPARISON_ROOT) -> tuple[str, dict[str, Any]]:
    short_slug = slug(short_id)
    pointer = comparison_root / short_slug / f"latest-{short_slug}-candidate-comparison.json"
    if pointer.exists():
        pointer_data = safe_load_json(pointer)
        json_path = pointer_data.get("jsonPath")
        if json_path and Path(str(json_path)).exists():
            path = Path(str(json_path))
            return str(path), load_json(path)
    folder = comparison_root / short_slug
    if folder.exists():
        candidates = sorted(folder.glob("*candidate-comparison.json"), key=lambda p: (p.stat().st_mtime, str(p)), reverse=True)
        if candidates:
            return str(candidates[0]), load_json(candidates[0])
    return "", {}


def select_items(ledger: dict[str, Any], short_id: str | None, include_blocked: bool) -> list[dict[str, Any]]:
    rows = [item for item in ledger.get("items", []) if isinstance(item, dict)]
    if short_id:
        rows = [item for item in rows if str(item.get("shortId") or "") == short_id]
    if not include_blocked:
        rows = [item for item in rows if item.get("outputExists") and item.get("candidateStatus") == "v002-candidate-exported"]
    return rows


def command_for(short_id: str, decision: str, reviewer: str, note: str, *, watched_listened: bool = False, acknowledge_warnings: bool = False) -> str:
    parts = [
        "./script/agentctl.sh",
        "studio-short-v002-candidate-review",
        shlex.quote(short_id),
        shlex.quote(decision),
        shlex.quote(reviewer),
        shlex.quote(note),
    ]
    if watched_listened:
        parts.extend(["--watched", "--listened"])
    if acknowledge_warnings:
        parts.append("--acknowledge-warnings")
    return " ".join(parts)


def card_payload(item: dict[str, Any], evidence_root: Path, reviewer: str) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    evidence_path, evidence = latest_evidence(short_id, evidence_root)
    comparison_path, comparison = latest_comparison(short_id)
    transcript = evidence.get("transcript") if isinstance(evidence.get("transcript"), dict) else {}
    recommendation = evidence.get("recommendation") if isinstance(evidence.get("recommendation"), dict) else {}
    comparison_summary = comparison.get("comparison") if isinstance(comparison.get("comparison"), dict) else {}
    removed_tail = comparison.get("removedTail") if isinstance(comparison.get("removedTail"), dict) else {}
    contact_path = str((evidence.get("artifacts") or {}).get("contactSheetPath") or "") if isinstance(evidence.get("artifacts"), dict) else ""
    warnings = []
    for source in (recommendation.get("warnings"), transcript.get("warnings"), item.get("audioWarnings"), item.get("qualityWarnings")):
        if isinstance(source, list):
            warnings.extend(str(value) for value in source if value)
    output_path = str(item.get("outputPath") or "")
    hook = str(item.get("hookCandidate") or transcript.get("preview") or "")
    clean_warnings = sorted(set(warnings))
    warning_summary = "; ".join(clean_warnings)
    review_gate = {
        "status": "needs-human-listen" if item.get("reviewStatus") == "needs-listen" else str(item.get("reviewStatus") or "unreviewed"),
        "plainEnglish": "Watch and listen once before recording keep. Machine evidence can check files, transcript clues, and obvious silence, but it cannot judge human cadence or whether the moment lands.",
        "localReadinessBoundary": "KEEP means locally accepted for this review lane only. It is not YouTube, Instagram, Patreon, podcast, or website publication.",
        "checklist": [
            "Does the first two seconds make sense without extra setup?",
            "Does the spoken cadence feel human rather than over-trimmed?",
            "Does the ending land cleanly without clipping a useful pause or reaction?",
            "Do framing, captions, and audio feel safe enough for the current proof lane?",
        ],
        "decisionGuide": {
            "keep": "Use after watch/listen if the hook lands, cadence feels human, and the ending is clean.",
            "refineAgain": "Use if the idea is good but the hook, cut, framing, caption, audio, or ending needs another version.",
            "hold": "Use if the right choice depends on missing context, source uncertainty, or a human call.",
            "reject": "Use if this candidate should not move forward, while preserving the source idea and media.",
        },
    }
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "targetVersion": item.get("targetVersion"),
        "reviewStatus": item.get("reviewStatus"),
        "candidateStatus": item.get("candidateStatus"),
        "durationSeconds": item.get("durationSeconds"),
        "width": item.get("width"),
        "height": item.get("height"),
        "audioSanityStatus": item.get("audioSanityStatus"),
        "outputPath": output_path,
        "outputUri": file_uri(output_path),
        "manifestPath": item.get("manifestPath") or "",
        "evidencePath": evidence_path,
        "contactSheetPath": contact_path,
        "contactSheetUri": file_uri(contact_path),
        "comparisonPath": comparison_path,
        "comparisonStatus": comparison.get("status") or "missing",
        "comparisonBias": comparison_summary.get("reviewBias") or "",
        "comparisonNextSafestAction": comparison_summary.get("nextSafestAction") or "",
        "comparisonWarnings": comparison_summary.get("warnings") if isinstance(comparison_summary.get("warnings"), list) else [],
        "sourceCandidatePath": comparison.get("sourceCandidatePath") or "",
        "sourceCandidateUri": file_uri(str(comparison.get("sourceCandidatePath") or "")),
        "removedTailWordCount": removed_tail.get("wordCount"),
        "removedTailPreview": removed_tail.get("preview") or "",
        "hookCandidate": hook,
        "transcriptStatus": transcript.get("status") or "missing",
        "transcriptPreview": transcript.get("preview") or "",
        "transcriptJson": transcript.get("transcriptJson") or "",
        "captionDraftSrt": transcript.get("captionDraftSrt") or "",
        "warnings": clean_warnings,
        "warningSummary": warning_summary,
        "reviewGate": review_gate,
        "nextSafestAction": recommendation.get("nextSafestAction") or item.get("nextSafestAction") or "Watch/listen, then record a local review decision.",
        "commands": {
            "openCandidate": f"open {shlex.quote(output_path)}" if output_path else "",
            "revealCandidate": f"open -R {shlex.quote(output_path)}" if output_path else "",
            "keep": command_for(short_id, "keep", reviewer, "Watched/listened locally; candidate works. Still not externally published.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
            "refineAgain": command_for(short_id, "refine-again", reviewer, "Watched/listened locally; needs another refinement pass.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
            "reject": command_for(short_id, "reject", reviewer, "Watched/listened locally; reject this candidate, preserve source idea if useful.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
            "hold": command_for(short_id, "hold", reviewer, "Hold pending human/source/context decision."),
        },
        "truth": "Review theater row only. It does not approve, record decisions, upload, publish, schedule, mutate media, overwrite versions, normalize transcripts, mutate accounts, or create receipt truth.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    ledger_path = Path(args.ledger).expanduser()
    evidence_root = Path(args.evidence_root).expanduser()
    ledger = load_json(ledger_path)
    rows = select_items(ledger, args.short_id or None, args.include_blocked)
    cards = [card_payload(item, evidence_root, args.reviewer) for item in rows]
    selected = cards[0] if cards else {}
    selected_commands = selected.get("commands") if isinstance(selected.get("commands"), dict) else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-candidate-review-theater-ready",
        "reviewer": args.reviewer,
        "selectedShortId": args.short_id or "",
        "selectedCandidate": selected,
        "agentReadback": {
            "shortId": selected.get("shortId") or "",
            "episode": selected.get("episode"),
            "targetVersion": selected.get("targetVersion") or "",
            "reviewStatus": selected.get("reviewStatus") or "",
            "candidateStatus": selected.get("candidateStatus") or "",
            "candidatePath": selected.get("outputPath") or "",
            "evidencePath": selected.get("evidencePath") or "",
            "transcriptStatus": selected.get("transcriptStatus") or "",
            "transcriptJson": selected.get("transcriptJson") or "",
            "transcriptPreview": selected.get("transcriptPreview") or "",
            "hookCandidate": selected.get("hookCandidate") or "",
            "comparisonStatus": selected.get("comparisonStatus") or "",
            "comparisonBias": selected.get("comparisonBias") or "",
            "removedTailWordCount": selected.get("removedTailWordCount"),
            "sourceCandidatePath": selected.get("sourceCandidatePath") or "",
            "recommendation": selected.get("nextSafestAction") or "",
            "warningCount": len(selected.get("warnings") or []) if isinstance(selected.get("warnings"), list) else 0,
            "warningSummary": selected.get("warningSummary") or "",
            "warnings": selected.get("warnings") if isinstance(selected.get("warnings"), list) else [],
            "keepCommand": selected_commands.get("keep") or "",
            "refineAgainCommand": selected_commands.get("refineAgain") or "",
            "rejectCommand": selected_commands.get("reject") or "",
            "holdCommand": selected_commands.get("hold") or "",
        },
        "ledgerPath": str(ledger_path),
        "evidenceRoot": str(evidence_root),
        "counts": {
            "items": len(cards),
            "needsListen": sum(1 for item in cards if item.get("reviewStatus") == "needs-listen"),
            "keep": sum(1 for item in cards if item.get("reviewStatus") == "keep"),
            "refineAgain": sum(1 for item in cards if item.get("reviewStatus") == "refine-again"),
            "reject": sum(1 for item in cards if item.get("reviewStatus") == "reject"),
            "blocked": sum(1 for item in cards if not item.get("outputPath")),
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
        "items": cards,
        "nextSafestAction": "Open the HTML theater, watch/listen candidates with sound on, then copy a review command for keep/refine-again/reject/hold.",
        "truth": "Local review theater only. It embeds local media/evidence and copyable commands; it does not record review decisions, mutate media, overwrite versions, upload, publish, schedule, approve externally, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# V002 candidate review theater",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Reviewer: `{payload.get('reviewer')}`",
        f"Selected: `{payload.get('agentReadback', {}).get('shortId') or 'all'}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        "",
        "## Next safest action",
        "",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Candidates",
        "",
    ]
    for item in payload.get("items", []):
        lines.extend([
            f"### `{item.get('shortId')}`",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Version: `{item.get('targetVersion')}`",
            f"- Review: `{item.get('reviewStatus')}`",
            f"- MP4: `{item.get('outputPath')}`",
            f"- Evidence: `{item.get('evidencePath')}`",
            f"- Transcript: `{item.get('transcriptStatus')}`",
            f"- Comparison: `{item.get('comparisonBias') or item.get('comparisonStatus')}`",
            f"- Removed tail words: `{item.get('removedTailWordCount')}`",
            f"- Warnings: `{item.get('warningSummary') or 'none'}`",
            f"- Hook: {item.get('hookCandidate') or '(missing)' }",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "Review gate:",
            "",
            f"- Status: `{item.get('reviewGate', {}).get('status')}`",
            f"- Boundary: {item.get('reviewGate', {}).get('localReadinessBoundary')}",
            "",
            "Checklist:",
            "",
        ])
        for check in item.get("reviewGate", {}).get("checklist", []):
            lines.append(f"- {check}")
        lines.extend([
            "",
            "Commands:",
            "",
            f"```bash\n{item.get('commands', {}).get('keep')}\n{item.get('commands', {}).get('refineAgain')}\n{item.get('commands', {}).get('reject')}\n```",
            "",
        ])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for item in payload.get("items", []):
        warnings = "".join(f"<li>{escape(str(warning))}</li>" for warning in item.get("warnings", [])) or "<li>No automated warnings. Still watch/listen.</li>"
        warning_summary = escape(str(item.get("warningSummary") or "No automated warnings. Still watch/listen."))
        warning_class = "warning-banner has-warning" if item.get("warnings") else "warning-banner"
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        def button(label: str, key: str, tone: str = "") -> str:
            command = escape(str(commands.get(key) or ""), quote=True)
            return f"<button class=\"copy {tone}\" data-command=\"{command}\">{escape(label)}</button>"
        video = f"<video controls preload=\"metadata\" src=\"{escape(str(item.get('outputUri') or ''), quote=True)}\"></video>" if item.get("outputUri") else "<div class=\"missing\">No playable candidate output.</div>"
        source_video = f"<video controls preload=\"metadata\" src=\"{escape(str(item.get('sourceCandidateUri') or ''), quote=True)}\"></video>" if item.get("sourceCandidateUri") else "<div class=\"missing\">No source candidate comparison video.</div>"
        contact = f"<img src=\"{escape(str(item.get('contactSheetUri') or ''), quote=True)}\" alt=\"Contact sheet\">" if item.get("contactSheetUri") else "<div class=\"missing\">No contact sheet.</div>"
        comparison_warnings = "".join(f"<li>{escape(str(warning))}</li>" for warning in item.get("comparisonWarnings", [])) or "<li>No comparison warnings. Still listen once.</li>"
        review_gate = item.get("reviewGate") if isinstance(item.get("reviewGate"), dict) else {}
        checklist = "".join(f"<li>{escape(str(check))}</li>" for check in review_gate.get("checklist", []))
        decision_guide = review_gate.get("decisionGuide") if isinstance(review_gate.get("decisionGuide"), dict) else {}
        comparison_note = (
            f"<strong>{escape(str(item.get('comparisonBias') or item.get('comparisonStatus') or 'comparison missing'))}</strong>"
            f"<p>{escape(str(item.get('comparisonNextSafestAction') or 'Run source comparison before trusting trim safety.'))}</p>"
            f"<p>Removed-tail words: <strong>{escape(str(item.get('removedTailWordCount')))}</strong></p>"
            f"<p>{escape(str(item.get('removedTailPreview') or 'No ASR text detected in removed tail.'))}</p>"
            f"<ul>{comparison_warnings}</ul>"
        )
        cards.append(f"""
        <article class="card">
          <header>
            <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(str(item.get('targetVersion')))} · {escape(str(item.get('reviewStatus')))}</div>
            <h2>{escape(str(item.get('shortId')))}</h2>
            <p class="meta">{escape(str(item.get('durationSeconds')))}s · {escape(str(item.get('width')))}x{escape(str(item.get('height')))} · audio {escape(str(item.get('audioSanityStatus') or 'unchecked'))}</p>
            <p class="{warning_class}"><strong>Review caution:</strong> {warning_summary}</p>
          </header>
          <div class="media-grid">
            <div><h3>Current candidate</h3>{video}</div>
            <div><h3>Source candidate</h3>{source_video}</div>
            <div><h3>Contact sheet</h3>{contact}</div>
          </div>
          <section class="note"><strong>Hook clue</strong><p>{escape(str(item.get('hookCandidate') or 'Missing hook clue.'))}</p></section>
          <section class="note"><strong>Transcript clue · {escape(str(item.get('transcriptStatus')))}</strong><p>{escape(str(item.get('transcriptPreview') or 'No transcript preview available.'))}</p></section>
          <section class="note"><strong>Source comparison</strong>{comparison_note}</section>
          <section class="note gate">
            <strong>Review gate · {escape(str(review_gate.get('status') or 'needs-human-listen'))}</strong>
            <p>{escape(str(review_gate.get('plainEnglish') or 'Watch/listen before recording a local review decision.'))}</p>
            <p class="boundary">{escape(str(review_gate.get('localReadinessBoundary') or 'Local review state is not publication truth.'))}</p>
            <ul>{checklist}</ul>
            <div class="guide">
              <p><strong>KEEP:</strong> {escape(str(decision_guide.get('keep') or 'Use after watch/listen if this works.'))}</p>
              <p><strong>REFINE:</strong> {escape(str(decision_guide.get('refineAgain') or 'Use when the idea is good but the candidate needs another pass.'))}</p>
              <p><strong>HOLD:</strong> {escape(str(decision_guide.get('hold') or 'Use when a missing human/source/context decision is needed.'))}</p>
              <p><strong>REJECT:</strong> {escape(str(decision_guide.get('reject') or 'Use when this candidate should not continue.'))}</p>
            </div>
          </section>
          <section class="note"><strong>Warnings</strong><ul>{warnings}</ul></section>
          <section class="note"><strong>Next safest action</strong><p>{escape(str(item.get('nextSafestAction')))}</p></section>
          <section class="actions">
            {button('Copy KEEP command', 'keep', 'keep')}
            {button('Copy REFINE AGAIN command', 'refineAgain', 'refine')}
            {button('Copy REJECT command', 'reject', 'reject')}
            {button('Copy HOLD command', 'hold')}
            {button('Copy OPEN command', 'openCandidate')}
          </section>
          <p class="path">{escape(str(item.get('outputPath') or ''))}</p>
        </article>
        """)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly v002 Candidate Review Theater</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; --clay:#ce6d50; --blue:#62b7d8; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#2e4936,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1320px; margin:0 auto; }}
    h1 {{ margin:0 0 8px; font-size:38px; letter-spacing:-.03em; }}
    .sub {{ color:var(--muted); margin:0 0 24px; max-width:850px; }}
    .card {{ background:rgba(32,49,41,.93); border:1px solid rgba(218,190,85,.28); border-radius:28px; padding:24px; margin:22px 0; box-shadow:0 22px 70px rgba(0,0,0,.3); }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:12px; font-weight:900; }}
    h2 {{ margin:7px 0 4px; font-size:26px; }}
    .meta,.path {{ color:var(--muted); word-break:break-all; }}
    .warning-banner {{ margin:10px 0 0; padding:10px 12px; border-radius:14px; background:rgba(134,202,145,.10); border:1px solid rgba(134,202,145,.18); color:#d8f7d9; }}
    .warning-banner.has-warning {{ background:rgba(218,190,85,.14); border-color:rgba(218,190,85,.4); color:#fff1aa; }}
    .media-grid {{ display:grid; grid-template-columns:minmax(260px, .8fr) minmax(260px, .8fr) minmax(320px, 1fr); gap:20px; align-items:start; }}
    .media-grid h3 {{ margin:0 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.11em; font-size:12px; }}
    video,img {{ width:100%; border-radius:20px; border:1px solid rgba(248,236,209,.16); background:#0b100d; }}
    video {{ max-height:720px; }}
    .note {{ margin-top:18px; padding:16px; border-radius:18px; background:rgba(248,236,209,.06); border:1px solid rgba(248,236,209,.09); }}
    .note p {{ margin:.35rem 0 0; }}
    .gate {{ border-color:rgba(218,190,85,.35); background:linear-gradient(135deg, rgba(218,190,85,.13), rgba(134,202,145,.08)); }}
    .guide {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; margin-top:12px; }}
    .guide p {{ margin:0; padding:10px; border-radius:12px; background:rgba(0,0,0,.16); }}
    .actions {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    button {{ appearance:none; border:0; border-radius:999px; padding:10px 14px; color:var(--ink); background:rgba(248,236,209,.12); font-weight:850; cursor:pointer; }}
    button.keep {{ background:rgba(134,202,145,.23); color:#c9ffd1; }}
    button.refine {{ background:rgba(98,183,216,.22); color:#c8efff; }}
    button.reject {{ background:rgba(206,109,80,.25); color:#ffd7c9; }}
    .missing {{ min-height:220px; display:grid; place-items:center; border-radius:20px; border:1px dashed rgba(248,236,209,.25); color:var(--muted); }}
    .toast {{ position:fixed; right:24px; bottom:24px; background:#1f3429; color:var(--ink); border:1px solid rgba(218,190,85,.5); border-radius:16px; padding:12px 16px; opacity:0; transform:translateY(10px); transition:.2s; }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
    @media (max-width: 1100px) {{ .media-grid {{ grid-template-columns:1fr; }} body {{ padding:18px; }} }}
  </style>
</head>
<body>
<main>
  <h1>v002 candidate review theater</h1>
  <p class="sub">Watch with sound on, compare visual frames and transcript clues, then copy an explicit local review command. This page does not approve or publish anything by itself.</p>
  {''.join(cards)}
</main>
<div class="toast" id="toast">Copied command</div>
<script>
  const toast = document.getElementById('toast');
  document.querySelectorAll('button.copy').forEach((button) => {{
    button.addEventListener('click', async () => {{
      const command = button.dataset.command || '';
      if (!command) return;
      try {{ await navigator.clipboard.writeText(command); }} catch (error) {{ window.prompt('Copy command:', command); }}
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }});
  }});
</script>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    pointer = output_dir / "latest-short-v002-candidate-review-theater.json"
    paths = {"jsonPath": str(json_path), "markdownPath": str(md_path), "htmlPath": str(html_path)}
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local v002 candidate review theater.")
    parser.add_argument("--short-id", default="")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--evidence-root", default=str(DEFAULT_EVIDENCE_ROOT))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--include-blocked", action="store_true")
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    args = parser.parse_args()
    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-short-v002-candidate-review-theater"
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
