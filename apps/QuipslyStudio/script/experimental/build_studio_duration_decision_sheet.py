#!/usr/bin/env python3
"""Build a reviewer-facing decision sheet for Studio duration warnings.

This reads the latest duration-warning packet and creates a clearer handoff:
what differs, what snippets to open, what likely happened, and which safe local
review commands are available. It never edits release artifacts or records
approval.
"""
from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-duration-decision-sheet.v1"


def now_stamp() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y%m%d-%H%M%S"), now.isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def duration_label(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\\''") + "'"


def classify_episode(ep: dict[str, Any]) -> dict[str, str]:
    longest = ep.get("longestArtifact") if isinstance(ep.get("longestArtifact"), dict) else {}
    shortest = ep.get("shortestArtifact") if isinstance(ep.get("shortestArtifact"), dict) else {}
    longest_id = str(longest.get("artifactId") or "")
    shortest_id = str(shortest.get("artifactId") or "")
    spread = float(ep.get("spreadSeconds") or 0)

    if longest_id == "podcastAudio":
        likely = "Audio-only file extends beyond the long-form video. Treat podcast/RSS audio as held until the extra audio is reviewed or regenerated."
        primary = "Hold or refine podcastAudio unless a human confirms the extra audio is intentional."
    elif shortest_id == "podcastAudio":
        likely = "Long-form video extends beyond the audio-only file. Review the extra video tail and decide whether the podcast audio ended too early or the video tail should be trimmed in a new version."
        primary = "Review extra video tail before approving either long-form video or podcast audio."
    elif spread > 600:
        likely = "Large duration spread across release artifacts. Treat as a publishing blocker until watched/listened."
        primary = "Create a repair version or explicit hold before publication."
    else:
        likely = "Small or moderate duration spread. It may be explainable, but still needs explicit review before publication."
        primary = "Record a review decision after checking snippets."
    return {"likelyInterpretation": likely, "primaryDecision": primary}


def artifact_rows(ep: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for review in ep.get("artifactTailReviews") or []:
        if not isinstance(review, dict):
            continue
        tail = review.get("tailReview") if isinstance(review.get("tailReview"), dict) else {}
        rows.append({
            "kind": "tail",
            "artifactId": review.get("artifactId") or "",
            "label": review.get("label") or "",
            "sourceDurationLabel": review.get("sourceDurationLabel") or "",
            "sourcePath": review.get("sourcePath") or "",
            "reviewPath": tail.get("outputPath") or "",
            "startLabel": tail.get("startLabel") or "",
            "durationLabel": tail.get("durationLabel") or "",
            "openCommand": f"open {shell_quote(str(tail.get('outputPath') or ''))}" if tail.get("outputPath") else "",
        })
    for review in ep.get("extraAfterShortestReviews") or []:
        if not isinstance(review, dict):
            continue
        derivative = review.get("reviewDerivative") if isinstance(review.get("reviewDerivative"), dict) else {}
        rows.append({
            "kind": "extra-after-shortest",
            "artifactId": review.get("artifactId") or "",
            "label": review.get("label") or "",
            "sourceDurationLabel": review.get("extraDurationLabel") or "",
            "sourcePath": review.get("sourcePath") or "",
            "reviewPath": derivative.get("outputPath") or "",
            "startLabel": review.get("extraStartsAtLabel") or "",
            "durationLabel": derivative.get("durationLabel") or review.get("extraDurationLabel") or "",
            "openCommand": f"open {shell_quote(str(derivative.get('outputPath') or ''))}" if derivative.get("outputPath") else "",
        })
    return rows


def build_episode_decision(ep: dict[str, Any]) -> dict[str, Any]:
    classification = classify_episode(ep)
    rows = artifact_rows(ep)
    episode = int(ep.get("episode") or 0)
    spread = float(ep.get("spreadSeconds") or 0)
    safe_commands = ep.get("safeReviewCommands") if isinstance(ep.get("safeReviewCommands"), list) else []
    return {
        "episode": episode,
        "version": ep.get("version") or "",
        "status": ep.get("status") or "review-warning",
        "urgency": ep.get("urgency") or "duration-review",
        "spreadSeconds": spread,
        "spreadLabel": ep.get("spreadLabel") or duration_label(spread),
        "plainEnglish": ep.get("plainEnglish") or "Duration mismatch needs review.",
        "nextSafestAction": ep.get("nextSafestAction") or classification["primaryDecision"],
        "likelyInterpretation": classification["likelyInterpretation"],
        "primaryDecision": classification["primaryDecision"],
        "longestArtifact": ep.get("longestArtifact") or {},
        "shortestArtifact": ep.get("shortestArtifact") or {},
        "reviewRows": rows,
        "safeReviewCommands": safe_commands,
        "nonDestructiveRepairOptions": ep.get("nonDestructiveRepairOptions") or [],
    }


def render_html(decisions: list[dict[str, Any]], packet: dict[str, Any], out_dir: Path, generated_at: str) -> str:
    cards = []
    for decision in decisions:
        row_html = []
        for row in decision["reviewRows"]:
            row_html.append(f"""
            <tr>
              <td><strong>{html.escape(row['kind'])}</strong></td>
              <td>{html.escape(row['label'])}<br><small>{html.escape(row['artifactId'])}</small></td>
              <td>{html.escape(row['startLabel'])}</td>
              <td>{html.escape(row['durationLabel'])}</td>
              <td><code>{html.escape(row['reviewPath'])}</code><br><code>{html.escape(row['openCommand'])}</code></td>
            </tr>
            """)
        commands = "".join(f"<li><code>{html.escape(str(command))}</code></li>" for command in decision["safeReviewCommands"])
        repairs = "".join(f"<li>{html.escape(str(option))}</li>" for option in decision["nonDestructiveRepairOptions"])
        cards.append(f"""
        <section class="episode-card urgency-{html.escape(str(decision['urgency']))}">
          <div class="episode-head">
            <div>
              <p class="eyebrow">Episode {decision['episode']} · {html.escape(str(decision['version']))}</p>
              <h2>{html.escape(decision['spreadLabel'])} duration spread</h2>
            </div>
            <span class="status">{html.escape(str(decision['urgency']))}</span>
          </div>
          <p class="plain">{html.escape(decision['plainEnglish'])}</p>
          <div class="decision-grid">
            <div><h3>Likely interpretation</h3><p>{html.escape(decision['likelyInterpretation'])}</p></div>
            <div><h3>Primary decision</h3><p>{html.escape(decision['primaryDecision'])}</p></div>
            <div><h3>Next safest action</h3><p>{html.escape(decision['nextSafestAction'])}</p></div>
          </div>
          <table>
            <thead><tr><th>Snippet</th><th>Artifact</th><th>Start</th><th>Length</th><th>Open</th></tr></thead>
            <tbody>{''.join(row_html)}</tbody>
          </table>
          <details open><summary>Safe local review commands</summary><ul>{commands}</ul></details>
          <details><summary>Non-destructive repair options</summary><ul>{repairs}</ul></details>
        </section>
        """)
    source_html = html.escape(str(packet.get("htmlPath") or ""))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quipsly Studio Duration Decision Sheet</title>
<style>
  :root {{ color-scheme: dark; --bg:#11140f; --panel:#1b2119; --panel2:#232b20; --ink:#f5efd9; --muted:#b9ad8d; --gold:#e7bd36; --clay:#cf654f; --leaf:#60d379; --line:#3c482f; }}
  body {{ margin:0; background:radial-gradient(circle at top left,#293322,#11140f 42%,#0b0d0a); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
  main {{ max-width:1180px; margin:0 auto; padding:36px 28px 60px; }}
  .hero {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(96,211,121,.12),rgba(231,189,54,.08)); border-radius:28px; padding:28px; box-shadow:0 18px 60px rgba(0,0,0,.28); }}
  .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:800; margin:0 0 8px; }}
  h1 {{ font-size:42px; line-height:1; margin:0 0 14px; }}
  h2 {{ margin:0; font-size:30px; }}
  h3 {{ margin:.2rem 0 .4rem; color:var(--gold); }}
  p {{ color:var(--muted); line-height:1.45; }}
  code {{ color:#fce8a5; white-space:normal; word-break:break-word; }}
  .episode-card {{ margin-top:22px; border:1px solid var(--line); background:rgba(27,33,25,.92); border-radius:24px; padding:22px; }}
  .episode-head {{ display:flex; align-items:center; justify-content:space-between; gap:18px; }}
  .status {{ color:#140f08; background:var(--gold); border-radius:999px; padding:8px 12px; font-weight:900; text-transform:uppercase; font-size:12px; }}
  .urgency-major-duration-review .status {{ background:var(--clay); color:#fff3ed; }}
  .plain {{ font-size:17px; color:#f2dfb6; }}
  .decision-grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:18px 0; }}
  .decision-grid > div {{ border:1px solid #3a462f; background:var(--panel2); border-radius:18px; padding:14px; }}
  table {{ width:100%; border-collapse:collapse; margin:18px 0; overflow:hidden; border-radius:16px; }}
  th,td {{ border-bottom:1px solid #36402d; padding:10px; text-align:left; vertical-align:top; }}
  th {{ color:var(--leaf); background:#151a13; font-size:12px; text-transform:uppercase; letter-spacing:.12em; }}
  details {{ border:1px solid #38432f; border-radius:16px; padding:12px 14px; margin-top:10px; background:#151a13; }}
  summary {{ cursor:pointer; font-weight:800; color:var(--ink); }}
  li {{ margin:8px 0; color:var(--muted); }}
  @media (max-width:900px) {{ .decision-grid {{ grid-template-columns:1fr; }} h1 {{ font-size:34px; }} }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio · local review only</p>
    <h1>Duration warnings, translated into decisions.</h1>
    <p>Generated {html.escape(generated_at)}. This page reads the existing duration-warning packet and makes it easier to decide what to listen to next. It does not edit, trim, approve, upload, publish, or capture receipts.</p>
    <p>Source warning packet: <code>{source_html}</code></p>
  </section>
  {''.join(cards)}
</main>
</body>
</html>"""


def render_markdown(decisions: list[dict[str, Any]], packet: dict[str, Any], generated_at: str) -> str:
    lines = [
        "# Quipsly Studio duration decision sheet",
        "",
        f"Generated: `{generated_at}`",
        "",
        "This is local review guidance only. It does not edit media, approve artifacts, publish, upload, schedule, or capture receipts.",
        "",
        f"Source packet: `{packet.get('htmlPath') or packet.get('jsonPath') or ''}`",
        "",
    ]
    for decision in decisions:
        lines.extend([
            f"## Episode {decision['episode']} `{decision['version']}` - {decision['spreadLabel']} spread",
            "",
            f"- Status: `{decision['urgency']}`",
            f"- Meaning: {decision['plainEnglish']}",
            f"- Likely interpretation: {decision['likelyInterpretation']}",
            f"- Primary decision: {decision['primaryDecision']}",
            "",
            "Open snippets:",
        ])
        for row in decision["reviewRows"]:
            lines.append(f"- `{row['kind']}` {row['label']} at {row['startLabel']} for {row['durationLabel']}: `{row['openCommand']}`")
        lines.extend(["", "Safe local review commands:"])
        for command in decision["safeReviewCommands"]:
            lines.append(f"- `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RELEASE_ROOT
    packet_pointer_path = release_root / "review-board" / "duration-warning-packets" / "latest-duration-warning-review-packet.json"
    packet = load_json(packet_pointer_path)
    packet_path = packet_pointer_path
    if packet and not packet.get("episodes") and packet.get("jsonPath"):
        pointed_path = Path(str(packet.get("jsonPath")))
        pointed_packet = load_json(pointed_path)
        if pointed_packet.get("episodes"):
            packet = pointed_packet
            packet_path = pointed_path
    if not packet:
        print(json.dumps({"ok": False, "error": f"No duration warning packet found at {packet_pointer_path}"}, indent=2))
        return 1
    stamp, generated_at = now_stamp()
    out_dir = release_root / "review-board" / "duration-decision-sheets" / f"{stamp}-duration-decision-sheet"
    out_dir.mkdir(parents=True, exist_ok=True)
    decisions = [build_episode_decision(ep) for ep in packet.get("episodes") or [] if isinstance(ep, dict)]
    counts = {
        "episodes": len(decisions),
        "majorWarnings": sum(1 for decision in decisions if decision.get("urgency") == "major-duration-review"),
        "reviewWarnings": sum(1 for decision in decisions if decision.get("urgency") != "major-duration-review"),
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    first_decision = decisions[0] if decisions else {}
    first_review_row = next((row for row in first_decision.get("reviewRows", []) if row.get("openCommand")), {}) if first_decision else {}
    first_safe_command = next((command for command in first_decision.get("safeReviewCommands", []) if command), "") if first_decision else ""
    first_decision_evidence_action = {
        "episode": first_decision.get("episode") or 0,
        "version": first_decision.get("version") or "",
        "urgency": first_decision.get("urgency") or "",
        "spreadLabel": first_decision.get("spreadLabel") or "",
        "nextSafestAction": first_decision.get("nextSafestAction") or "",
        "primaryDecision": first_decision.get("primaryDecision") or "",
        "firstOpenCommand": first_review_row.get("openCommand") or "",
        "firstReviewCommand": first_safe_command,
        "safety": "Open review evidence and record local review status only. Does not mutate artifacts, approve, publish, upload, schedule, or capture receipts.",
    }
    payload = {
        "schema": SCHEMA,
        "generatedAt": generated_at,
        "status": "duration-decision-sheet-ready" if decisions else "no-duration-warnings",
        "releaseRoot": str(release_root),
        "sourceWarningPacketPointerJson": str(packet_pointer_path),
        "sourceWarningPacketJson": str(packet_path),
        "sourceWarningPacketHtml": packet.get("htmlPath") or "",
        "sessionDir": str(out_dir),
        "episodeCount": len(decisions),
        "counts": counts,
        "nextSafestAction": first_decision_evidence_action["nextSafestAction"] or "No duration warning decisions are currently queued.",
        "firstDecisionEvidenceAction": first_decision_evidence_action,
        "episodes": decisions,
        "truth": "Decision sheet only. Reads warning packets and writes review guidance; does not mutate artifacts, approve, publish, upload, schedule, or capture receipts.",
    }
    html_path = out_dir / "index.html"
    json_path = out_dir / "duration-decision-sheet.json"
    markdown_path = out_dir / "START-HERE-duration-decision-sheet.md"
    first_safe_action = {
        "label": "Open Studio duration decision sheet",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens the local decision sheet only. It does not mutate artifacts, approve, publish, upload, schedule, overwrite, delete, or capture receipts.",
    }
    payload.update({
        "firstSafeAction": first_safe_action,
        "firstOpenCommand": first_safe_action["command"],
        "firstReviewEvidenceCommand": first_decision_evidence_action["firstOpenCommand"],
        "firstReviewCommand": first_decision_evidence_action["firstReviewCommand"],
    })
    html_path.write_text(render_html(decisions, packet, out_dir, generated_at))
    json_path.write_text(json.dumps({**payload, "htmlPath": str(html_path), "jsonPath": str(json_path), "markdownPath": str(markdown_path)}, indent=2))
    markdown_path.write_text(render_markdown(decisions, packet, generated_at))
    pointer = {
        "schema": SCHEMA,
        "generatedAt": generated_at,
        "updatedAt": generated_at,
        "status": payload["status"],
        "humanAsk": "Open the snippets for each duration warning and choose approve/refine/hold locally before any publishing work.",
        "agentSafeParallelWork": "Codex may summarize warning evidence, prepare review notes, and stage dry-run decision commands. Do not approve on a human's behalf, publish, upload, schedule, overwrite, mutate media, or create receipt truth.",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "sessionDir": str(out_dir),
        "episodeCount": len(decisions),
        "counts": counts,
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": first_safe_action,
        "firstDecisionEvidenceAction": first_decision_evidence_action,
        "firstOpenCommand": first_safe_action["command"],
        "firstReviewEvidenceCommand": first_decision_evidence_action["firstOpenCommand"],
        "firstReviewCommand": first_decision_evidence_action["firstReviewCommand"],
        "episodes": [{
            "episode": d["episode"],
            "version": d["version"],
            "urgency": d["urgency"],
            "spreadSeconds": d["spreadSeconds"],
            "spreadLabel": d["spreadLabel"],
            "nextSafestAction": d["nextSafestAction"],
            "primaryDecision": d["primaryDecision"],
        } for d in decisions],
        "truth": payload["truth"],
    }
    latest_path = release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(pointer, indent=2))
    print(json.dumps({"ok": True, **pointer}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
