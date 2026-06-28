#!/usr/bin/env python3
"""Build a Tower publishing sprint companion.

This joins the current Publisher Desk, social command center, manual calendar,
manual packet board, review command sheet, and unblock brief into one calm
operator sprint. It does not publish, upload, schedule, approve, mutate accounts,
or create receipt truth.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import shlex
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_POINTER = "latest-tower-publishing-sprint-companion.json"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def pointer(release_root: Path, rel: str) -> dict[str, Any]:
    return load_json(release_root / rel)


def card(label: str, payload: dict[str, Any], why: str) -> dict[str, Any]:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    return {
        "label": label,
        "status": payload.get("status") or "unknown",
        "htmlPath": payload.get("htmlPath") or "",
        "jsonPath": payload.get("jsonPath") or "",
        "markdownPath": payload.get("markdownPath") or "",
        "worksheetPath": payload.get("worksheetPath") or "",
        "counts": counts,
        "why": why,
        "nextSafestAction": payload.get("nextSafestAction") or "",
        "firstSafeAction": payload.get("firstSafeAction") or {},
        "truth": payload.get("truth") or "",
    }


def build_packet(release_root: Path) -> dict[str, Any]:
    unblock = pointer(release_root, "tower-review-unblock-brief/latest-tower-review-unblock-brief.json")
    publisher = pointer(release_root, "tower-publisher-desk/latest-tower-publisher-desk.json")
    social = pointer(release_root, "tower-social-command-center/latest-tower-social-command-center.json")
    calendar = pointer(release_root, "tower-manual-calendar/latest-tower-manual-calendar.json")
    manual_board = pointer(release_root, "tower-manual-packet-board/latest-tower-manual-packet-board.json")
    review_commands = pointer(release_root, "review-board/tower-review-command-sheets/latest-tower-review-command-sheet.json")
    anomalies = pointer(release_root, "review-board/tower-review-anomalies/latest-tower-review-anomalies.json")
    top_review = pointer(release_root, "review-board/latest-studio-top-review-companion.json")
    quality = pointer(release_root, "review-board/studio-package-quality-desk/latest-studio-package-quality-desk.json")

    publisher_counts = publisher.get("counts") if isinstance(publisher.get("counts"), dict) else {}
    social_counts = social.get("counts") if isinstance(social.get("counts"), dict) else {}
    calendar_counts = calendar.get("counts") if isinstance(calendar.get("counts"), dict) else {}
    unblock_counts = unblock.get("counts") if isinstance(unblock.get("counts"), dict) else {}
    quality_counts = quality.get("counts") if isinstance(quality.get("counts"), dict) else {}
    top_review_counts = top_review.get("counts") if isinstance(top_review.get("counts"), dict) else {}

    counts = {
        "episodes": as_int(publisher_counts.get("episodes") or quality_counts.get("currentBestPackages")),
        "reviewRows": as_int(publisher_counts.get("reviewRows") or unblock_counts.get("reviewRows")),
        "pendingRows": as_int(publisher_counts.get("pendingRows") or unblock_counts.get("pendingRows")),
        "warningRows": as_int(publisher_counts.get("warningRows") or unblock_counts.get("warningRows")),
        "blockedOrReview": as_int(publisher_counts.get("blockedOrReview") or social_counts.get("blockedOrReview")),
        "socialItems": as_int(publisher_counts.get("socialItems") or social_counts.get("items")),
        "calendarRows": as_int(publisher_counts.get("calendarRows") or calendar_counts.get("calendarRows")),
        "receiptSlots": as_int(publisher_counts.get("receiptSlots") or unblock_counts.get("receiptSlots")),
        "capturedReceipts": as_int(publisher_counts.get("capturedReceipts") or unblock_counts.get("capturedReceipts")),
        "readyForApproval": as_int(publisher_counts.get("readyForApproval") or social_counts.get("readyForApproval")),
        "publishBlockedPackages": as_int(unblock_counts.get("publishBlockedPackages") or quality_counts.get("warningEpisodes")),
        "studioTopReviewItems": as_int(top_review_counts.get("reviewItems")),
        "studioTopReviewDurationCandidates": as_int(top_review_counts.get("durationCandidateItems")),
        "studioTopReviewSyncInvestigations": as_int(top_review_counts.get("syncInvestigationItems")),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "versionsOverwritten": False,
    }

    artifacts = [
        card("1. Review unblock brief", unblock, "Find the real blockers before platform prep."),
        card("2. Studio top review companion", top_review, "Episode 1/4 review evidence should be cleared before publication trust."),
        card("3. Publisher Desk", publisher, "One joined view of review rows, social packets, draft calendar, and receipt slots."),
        card("4. Manual packet board", manual_board, "Human-readable packet evidence for manual posting after approval."),
        card("5. Social command center", social, "Platform rows and receipt templates, still blocked by review until approved."),
        card("6. Manual calendar", calendar, "Draft local calendar intent only; no external schedule exists."),
        card("7. Review command sheet", review_commands, "Metadata-only review decisions live here before publishing."),
    ]
    if anomalies:
        artifacts.append(card("8. Review anomaly sheet", anomalies, "Investigate smoke/test holds or suspicious review states."))

    packet = {
        "schema": "quipsly.tower.publishing-sprint-companion.v1",
        "status": "tower-publishing-sprint-ready",
        "generatedAt": utc_now(),
        "releaseRoot": str(release_root),
        "counts": counts,
        "humanAsk": (
            "Run one Tower publishing sprint: clear review blockers first, inspect platform packets second, "
            "ask for explicit human approval third, and only then capture real external receipts after manual posting."
        ),
        "nextSafestAction": "Open this publishing sprint companion, start with review blockers, and do not use platform packets until review/approval truth is explicit.",
        "firstSafeAction": {
            "label": "Open Tower publishing sprint",
            "command": "",
            "safety": "Opens local publishing guidance only. No publish, upload, schedule, approval, account mutation, or receipt capture occurs.",
        },
        "sprintPlan": [
            "Open review unblock evidence before opening platform packets.",
            "Open the Studio top review worksheet and classify Episode 1 candidate plus Episode 4 sync evidence.",
            "Resolve Episode 1 duration candidate and Episode 4 sync investigation before treating packets as approval-ready.",
            "Use the social/calendar views as manual prep only while readyForApproval is zero.",
            "Capture receipt truth only from real external URLs/provider IDs after explicit approval.",
            "Keep local readiness, human approval, and external publication receipts as separate states.",
        ],
        "artifactCards": artifacts,
        "studioReviewGate": {
            "status": top_review.get("status") or "unknown",
            "reviewItems": as_int(top_review_counts.get("reviewItems")),
            "durationCandidateItems": as_int(top_review_counts.get("durationCandidateItems")),
            "syncInvestigationItems": as_int(top_review_counts.get("syncInvestigationItems")),
            "htmlPath": top_review.get("htmlPath") or "",
            "worksheetPath": top_review.get("worksheetPath") or "",
            "firstReviewItem": top_review.get("firstReviewItem") if isinstance(top_review.get("firstReviewItem"), dict) else {},
            "nextSafestAction": top_review.get("nextSafestAction") or "",
            "mustStayBlockedUntil": [
                "Episode 1 duration candidate is promoted/refined/held with an explicit local decision.",
                "Episode 4 sync mismatch is classified from evidence, not trimmed blindly.",
                "Current-best package truth is regenerated after any repair or promotion.",
            ],
            "safeCommand": f"open {shell_quote(str(top_review.get('worksheetPath') or top_review.get('htmlPath') or ''))}",
        },
        "receiptTruthContract": {
            "localPacketReady": "Local files and metadata exist.",
            "humanApproved": "A human explicitly approved a specific artifact/platform action.",
            "published": "A real external platform URL or provider receipt exists.",
            "notAllowedHere": [
                "Fake receipt creation",
                "External upload",
                "External schedule creation",
                "Account mutation",
                "Approval by implication",
            ],
        },
        "agentSafeParallelWork": (
            "Improve packet clarity, prepare copy, inspect blockers, and generate dry-run review commands. "
            "Do not publish, schedule, upload, approve, mutate accounts, or create receipts."
        ),
        "truth": (
            "Tower publishing sprint companion only. It reads local review, packet, calendar, social, and receipt-slot evidence; "
            "it does not publish, upload, schedule, approve, mutate accounts, overwrite versions, or create receipt truth."
        ),
    }
    return packet


def render_artifact(card_payload: dict[str, Any]) -> str:
    counts = card_payload.get("counts") or {}
    count_text = ", ".join(f"{key}: {value}" for key, value in counts.items() if isinstance(value, (int, float, str, bool)) and key in {
        "episodes", "reviewRows", "pendingRows", "warningRows", "blockedOrReview", "items", "calendarRows",
        "receiptSlots", "capturedReceipts", "readyForApproval", "publishBlockedPackages", "reviewablePackages"
    })
    return f"""
    <article class="card">
      <h3>{esc(card_payload.get('label'))}</h3>
      <p class="pill">{esc(card_payload.get('status'))}</p>
      <p>{esc(card_payload.get('why'))}</p>
      <p class="muted">{esc(count_text)}</p>
      <p><strong>Next:</strong> {esc(card_payload.get('nextSafestAction'))}</p>
      <pre>{esc(json.dumps({
        "open": (card_payload.get("firstSafeAction") or {}).get("command") or f"open {shell_quote(str(card_payload.get('htmlPath') or ''))}",
        "html": card_payload.get("htmlPath"),
        "json": card_payload.get("jsonPath"),
        "worksheet": card_payload.get("worksheetPath"),
      }, indent=2))}</pre>
      <p class="truth">{esc(card_payload.get('truth'))}</p>
    </article>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") or {}
    steps = "".join(f"<li>{esc(step)}</li>" for step in packet.get("sprintPlan") or [])
    artifacts = "".join(render_artifact(row) for row in packet.get("artifactCards") or [])
    studio_gate = packet.get("studioReviewGate") if isinstance(packet.get("studioReviewGate"), dict) else {}
    gate_reasons = "".join(f"<li>{esc(reason)}</li>" for reason in studio_gate.get("mustStayBlockedUntil") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tower publishing sprint</title>
  <style>
    :root {{ --bg:#14150f; --panel:#232111; --card:#302c16; --ink:#fff5df; --muted:#d3c5a3; --gold:#f0cb58; --leaf:#92d37c; --sky:#8ad4e8; --clay:#df805a; --line:#574c23; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; color:var(--ink); background:radial-gradient(circle at top, #4b421a, var(--bg) 42rem); }}
    main {{ max-width:1280px; margin:0 auto; padding:32px; }}
    header, section {{ background:rgba(35,33,17,.9); border:1px solid var(--line); border-radius:24px; padding:24px; margin-bottom:20px; box-shadow:0 20px 80px rgba(0,0,0,.3); }}
    h1 {{ margin:.1rem 0 .5rem; font-size:clamp(2rem, 5vw, 4.5rem); line-height:.95; }}
    .kicker {{ color:var(--gold); font-weight:900; letter-spacing:.2em; text-transform:uppercase; }}
    .summary {{ color:var(--muted); max-width:78rem; font-size:1.05rem; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(145px, 1fr)); gap:10px; margin:18px 0; }}
    .metric {{ background:rgba(255,255,255,.06); border:1px solid var(--line); border-radius:16px; padding:12px; }}
    .metric strong {{ display:block; color:var(--gold); font-size:1.5rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:14px; }}
    .card {{ background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px; }}
    .pill {{ color:var(--leaf); font-weight:900; }}
    .muted {{ color:var(--muted); }}
    .truth {{ color:var(--sky); }}
    .warning {{ color:var(--clay); font-weight:900; }}
    pre {{ white-space:pre-wrap; background:#0e0d08; padding:12px; border-radius:12px; overflow:auto; }}
  </style>
</head>
<body>
<main>
  <header>
    <div class="kicker">Tower publishing sprint</div>
    <h1>Prepare the launch. Do not fake the receipt.</h1>
    <p class="summary">{esc(packet.get('humanAsk'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(counts.get('episodes'))}</strong> episodes</div>
      <div class="metric"><strong>{esc(counts.get('blockedOrReview'))}</strong> blocked/review rows</div>
      <div class="metric"><strong>{esc(counts.get('socialItems'))}</strong> platform rows</div>
      <div class="metric"><strong>{esc(counts.get('readyForApproval'))}</strong> ready for approval</div>
      <div class="metric"><strong>{esc(counts.get('capturedReceipts'))}</strong> receipts</div>
      <div class="metric"><strong>{esc(counts.get('studioTopReviewItems'))}</strong> Studio gate items</div>
    </div>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <ol>{steps}</ol>
    <p class="warning">No external platform action happens from this companion.</p>
  </header>
  <section>
    <h2>Sprint artifacts</h2>
    <div class="grid">{artifacts}</div>
  </section>
  <section>
    <h2>Studio review gate before publishing</h2>
    <p class="summary">Tower may prepare packets, but it should not imply approval while Studio has top review items unresolved.</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(studio_gate.get('reviewItems'))}</strong> review items</div>
      <div class="metric"><strong>{esc(studio_gate.get('durationCandidateItems'))}</strong> duration candidates</div>
      <div class="metric"><strong>{esc(studio_gate.get('syncInvestigationItems'))}</strong> sync investigations</div>
    </div>
    <p><strong>Open worksheet:</strong></p>
    <pre>{esc(studio_gate.get('safeCommand'))}</pre>
    <p><strong>Must stay blocked until:</strong></p>
    <ul>{gate_reasons}</ul>
  </section>
  <section>
    <h2>Receipt truth contract</h2>
    <pre>{esc(json.dumps(packet.get('receiptTruthContract') or {}, indent=2))}</pre>
  </section>
  <section>
    <h2>Safety truth</h2>
    <p>{esc(packet.get('truth'))}</p>
  </section>
</main>
</body>
</html>
"""


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Tower publishing sprint companion",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Current truth",
        "",
        f"- Episodes: `{counts.get('episodes')}`",
        f"- Blocked/review rows: `{counts.get('blockedOrReview')}`",
        f"- Social/platform rows: `{counts.get('socialItems')}`",
        f"- Ready for approval: `{counts.get('readyForApproval')}`",
        f"- Captured receipts: `{counts.get('capturedReceipts')}`",
        f"- Studio top review items: `{counts.get('studioTopReviewItems')}`",
        "",
        "## Studio review gate",
        "",
        f"- Status: `{(packet.get('studioReviewGate') or {}).get('status')}`",
        f"- Worksheet: `{(packet.get('studioReviewGate') or {}).get('worksheetPath')}`",
        f"- Open: `{(packet.get('studioReviewGate') or {}).get('safeCommand')}`",
        "",
        "## Sprint plan",
        "",
    ]
    lines.extend(f"{idx}. {step}" for idx, step in enumerate(packet.get("sprintPlan") or [], start=1))
    lines.extend(["", "## Artifact order", ""])
    for row in packet.get("artifactCards") or []:
        action = row.get("firstSafeAction") if isinstance(row.get("firstSafeAction"), dict) else {}
        lines.extend([
            f"### {row.get('label')}",
            f"- Status: `{row.get('status')}`",
            f"- Why: {row.get('why')}",
            f"- Open: `{action.get('command') or ('open ' + shell_quote(str(row.get('htmlPath') or '')) )}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["## Safety", "", packet.get("truth") or "", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Tower publishing sprint companion.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()

    release_root = Path(args.release_root)
    packet = build_packet(release_root)
    out_dir = release_root / "tower-publishing-sprint" / f"{stamp()}-tower-publishing-sprint"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "index.html"
    json_path = out_dir / "tower-publishing-sprint-companion.json"
    markdown_path = out_dir / "START-HERE-tower-publishing-sprint.md"
    packet.update({
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
    })
    packet["firstSafeAction"]["command"] = f"open {shell_quote(str(html_path))}"
    packet["firstSafeAction"]["path"] = str(html_path)

    write_json(json_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)

    pointer_payload = {
        "schema": packet["schema"],
        "status": packet["status"],
        "generatedAt": packet["generatedAt"],
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "counts": packet["counts"],
        "humanAsk": packet["humanAsk"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": packet["firstSafeAction"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "truth": packet["truth"],
    }
    write_json(release_root / "tower-publishing-sprint" / LATEST_POINTER, pointer_payload)
    print(json.dumps(pointer_payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
