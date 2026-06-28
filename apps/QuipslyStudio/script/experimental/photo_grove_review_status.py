#!/usr/bin/env python3
"""Build a current Photo Grove review-status surface from a review ledger."""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-review.json")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def resolve_session(value: str | None) -> Path:
    if value and value != "latest":
        path = Path(value).expanduser()
        if path.is_file():
            return path.parent
        return path
    pointer = load_json(DEFAULT_POINTER)
    latest = pointer.get("latestSessionDir")
    if not latest:
        raise SystemExit(f"No latest Photo Grove session pointer found at {DEFAULT_POINTER}")
    return Path(str(latest))


def compute_counts(decisions: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "total": len(decisions),
        "pending": 0,
        "keep": 0,
        "reject": 0,
        "review": 0,
        "favorite": 0,
        "rated": 0,
        "flagged": 0,
    }
    for decision in decisions:
        status = decision.get("status")
        if status in counts:
            counts[status] += 1
        if decision.get("rating") is not None:
            counts["rated"] += 1
        if decision.get("flags"):
            counts["flagged"] += 1
    return counts


def build_status(session_dir: Path) -> dict[str, Any]:
    ledger_path = session_dir / "review-ledger.json"
    if not ledger_path.exists():
        raise SystemExit(f"Photo Grove review ledger not found: {ledger_path}")
    ledger = load_json(ledger_path)
    decisions = ledger.get("decisions") if isinstance(ledger.get("decisions"), list) else []
    counts = compute_counts(decisions)
    event_path = session_dir / "review-events.jsonl"
    event_count = 0
    last_event: dict[str, Any] | None = None
    if event_path.exists():
        for line in event_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            event_count += 1
            try:
                last_event = json.loads(line)
            except Exception:
                pass
    next_candidates = [
        {
            "id": decision.get("id"),
            "filename": decision.get("filename"),
            "flags": decision.get("flags") or [],
            "sourcePath": decision.get("sourcePath"),
        }
        for decision in decisions
        if decision.get("status") in {None, "pending", "review"}
    ][:12]
    status = {
        "schema": "quipsly.photo-grove.review-status.v1",
        "generatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "ledgerPath": str(ledger_path),
        "eventLogPath": str(event_path) if event_path.exists() else "",
        "htmlBoardPath": str(session_dir / "index.html") if (session_dir / "index.html").exists() else "",
        "counts": counts,
        "eventCount": event_count,
        "lastDecision": ledger.get("lastDecision") or last_event,
        "nextCandidates": next_candidates,
        "truth": "Review status only. Original photos are untouched.",
        "originalsMutated": False,
    }
    (session_dir / "review-status.json").write_text(json.dumps(status, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_markdown(session_dir, status)
    write_html(session_dir, status)
    return status


def write_markdown(session_dir: Path, status: dict[str, Any]) -> None:
    counts = status["counts"]
    lines = [
        "# Photo Grove review status",
        "",
        f"Generated: {status['generatedAt']}",
        "",
        "Originals are untouched. This file summarizes review metadata only.",
        "",
        "## Counts",
        "",
        f"- Total: {counts['total']}",
        f"- Pending: {counts['pending']}",
        f"- Review: {counts['review']}",
        f"- Keep: {counts['keep']}",
        f"- Favorite: {counts['favorite']}",
        f"- Reject: {counts['reject']}",
        f"- Rated: {counts['rated']}",
        f"- Flagged: {counts['flagged']}",
        f"- Events: {status['eventCount']}",
        "",
        "## Next review candidates",
        "",
        "| File | Flags |",
        "| --- | --- |",
    ]
    for candidate in status.get("nextCandidates") or []:
        flags = ", ".join(candidate.get("flags") or []) or "none"
        lines.append(f"| `{candidate.get('filename')}` | {flags} |")
    (session_dir / "review-status.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(session_dir: Path, status: dict[str, Any]) -> None:
    counts = status["counts"]
    candidate_cards = []
    for candidate in status.get("nextCandidates") or []:
        flags = ", ".join(candidate.get("flags") or []) or "none"
        candidate_cards.append(f"<li><b>{html.escape(str(candidate.get('filename')))}</b><span>{html.escape(flags)}</span></li>")
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Review Status</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1b271e; --ink:#f7eed9; --muted:#c8b99a; --moss:#8fc073; --gold:#e9c65b; --line:rgba(247,238,217,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top left, rgba(143,192,115,.16), transparent 38%), var(--bg); }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(36px,6vw,78px); line-height:.92; }}
    p {{ color:var(--muted); }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; padding:24px clamp(16px,4vw,56px); }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:linear-gradient(180deg,var(--panel),#121a14); }}
    .stat b {{ display:block; font-size:30px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ padding:0 clamp(16px,4vw,56px) 56px; }}
    section {{ border:1px solid var(--line); border-radius:24px; padding:20px; background:rgba(0,0,0,.18); }}
    li {{ margin:10px 0; }}
    li span {{ color:var(--muted); margin-left:10px; }}
    code {{ color:var(--gold); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove</div>
    <h1>Culling state, without touching originals.</h1>
    <p>Session: <code>{html.escape(status['sessionDir'])}</code></p>
  </header>
  <div class="stats">
    <div class="stat"><b>{counts['total']}</b><span>Total</span></div>
    <div class="stat"><b>{counts['pending']}</b><span>Pending</span></div>
    <div class="stat"><b>{counts['favorite']}</b><span>Favorites</span></div>
    <div class="stat"><b>{counts['keep']}</b><span>Keep</span></div>
    <div class="stat"><b>{counts['reject']}</b><span>Reject</span></div>
    <div class="stat"><b>{status['eventCount']}</b><span>Events</span></div>
  </div>
  <main>
    <section>
      <h2>Next review candidates</h2>
      <ul>{''.join(candidate_cards)}</ul>
    </section>
  </main>
</body>
</html>
"""
    (session_dir / "review-status.html").write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Photo Grove review status.")
    parser.add_argument("session", nargs="?", default="latest")
    session_dir = resolve_session(parser.parse_args().session)
    status = build_status(session_dir)
    print(json.dumps({
        "ok": True,
        "sessionDir": status["sessionDir"],
        "statusJsonPath": str(session_dir / "review-status.json"),
        "statusHtmlPath": str(session_dir / "review-status.html"),
        "counts": status["counts"],
        "eventCount": status["eventCount"],
        "originalsMutated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
