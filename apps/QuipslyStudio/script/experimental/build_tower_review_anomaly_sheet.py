#!/usr/bin/env python3
"""Build a Tower review anomaly sheet for diagnostic/test review decisions.

This reads the local human-review ledger and surfaces likely smoke/test holds so
reviewers can reset or replace them deliberately. It never changes decisions.
"""
from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower-review-anomaly-sheet.v1"
DIAGNOSTIC_WORDS = ("smoke", "diagnostic", "test", "agent hold", "command smoke")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def is_diagnostic(artifact: dict[str, Any]) -> bool:
    decision = str(artifact.get("decision") or "").lower()
    if decision not in {"hold", "refine", "reject"}:
        return False
    notes = str(artifact.get("notes") or "").lower()
    reviewer = str(artifact.get("reviewer") or "").lower()
    return any(word in notes for word in DIAGNOSTIC_WORDS) or reviewer in {"codex", "agent", "smoke"}


def collect_anomalies(ledger: dict[str, Any]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    for episode in ledger.get("episodes") or []:
        if not isinstance(episode, dict):
            continue
        ep_num = int(episode.get("episode") or 0)
        version = episode.get("version") or ""
        for artifact in episode.get("reviewArtifacts") or []:
            if not isinstance(artifact, dict) or not is_diagnostic(artifact):
                continue
            artifact_id = str(artifact.get("id") or "")
            anomalies.append({
                "episode": ep_num,
                "version": version,
                "artifactId": artifact_id,
                "label": artifact.get("label") or artifact_id,
                "decision": artifact.get("decision") or "",
                "reviewer": artifact.get("reviewer") or "",
                "reviewedAt": artifact.get("reviewedAt") or "",
                "notes": artifact.get("notes") or "",
                "assetCount": artifact.get("assetCount") or 0,
                "paths": artifact.get("paths") or [],
                "resetToPendingCommand": f"./script/agentctl.sh tower-review-decision {ep_num} {artifact_id} pending '<reviewer>' '<reset diagnostic/test decision; real review still pending>'",
                "replaceWithRealHoldCommand": f"./script/agentctl.sh tower-review-decision {ep_num} {artifact_id} hold '<reviewer>' '<real human/agent review reason>'",
                "approveAfterReviewCommand": f"./script/agentctl.sh tower-review-decision {ep_num} {artifact_id} approve '<reviewer>' '<reviewed and approved for local publishing packet>'",
                "nextSafestAction": "Reset to pending if this was only a smoke/test flag; otherwise replace it with a real review note.",
            })
    return anomalies


def render_html(payload: dict[str, Any]) -> str:
    rows = []
    for item in payload["anomalies"]:
        rows.append(f"""
        <article>
          <p class="eyebrow">Episode {item['episode']} · {html.escape(str(item['version']))}</p>
          <h2>{html.escape(str(item['label']))}</h2>
          <p><b>Current:</b> {html.escape(str(item['decision']))} by {html.escape(str(item['reviewer']))} at {html.escape(str(item['reviewedAt']))}</p>
          <p>{html.escape(str(item['notes']))}</p>
          <div class="commands">
            <code>{html.escape(item['resetToPendingCommand'])}</code>
            <code>{html.escape(item['replaceWithRealHoldCommand'])}</code>
            <code>{html.escape(item['approveAfterReviewCommand'])}</code>
          </div>
          <p class="next">{html.escape(item['nextSafestAction'])}</p>
        </article>
        """)
    empty = "" if rows else "<article><h2>No diagnostic review anomalies found.</h2><p>Review ledger contains no smoke/test holds/refines/rejects.</p></article>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tower Review Anomalies</title>
<style>
  :root {{ color-scheme: dark; --bg:#11130f; --panel:#1d241b; --ink:#f6efd8; --muted:#b8ad8c; --gold:#edc94f; --clay:#cb6d56; --leaf:#61d283; --line:#39432f; }}
  body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink); background:radial-gradient(circle at top right,rgba(237,201,79,.16),transparent 36%),var(--bg); }}
  main {{ max-width:1060px; margin:0 auto; padding:36px 24px 64px; }}
  header, article {{ border:1px solid var(--line); background:rgba(29,36,27,.92); border-radius:24px; padding:24px; margin-bottom:16px; }}
  .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
  h1 {{ font-size:42px; margin:0 0 12px; line-height:1; }}
  h2 {{ margin:0 0 10px; }}
  p {{ color:var(--muted); line-height:1.45; }}
  .commands {{ display:grid; gap:10px; margin:16px 0; }}
  code {{ display:block; padding:10px 12px; border:1px solid #465338; border-radius:12px; background:#121711; color:#ffe698; overflow-wrap:anywhere; }}
  .next {{ color:#dfecc8; }}
</style>
</head>
<body><main>
<header>
  <p class="eyebrow">Tower · local review truth</p>
  <h1>Diagnostic holds should be explicit, not mysterious.</h1>
  <p>Generated {html.escape(payload['generatedAt'])}. This sheet identifies likely smoke/test review decisions and gives safe local commands. It does not reset, approve, publish, upload, schedule, or capture receipts.</p>
</header>
{''.join(rows) or empty}
</main></body></html>"""


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Tower review anomaly sheet",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "Local review guidance only. This does not mutate review decisions or publish anything.",
        "",
    ]
    if not payload["anomalies"]:
        lines.append("No diagnostic review anomalies found.\n")
        return "\n".join(lines)
    for item in payload["anomalies"]:
        lines.extend([
            f"## Episode {item['episode']} `{item['artifactId']}`",
            "",
            f"- Current decision: `{item['decision']}` by `{item['reviewer']}`",
            f"- Notes: {item['notes']}",
            f"- Reset if smoke only: `{item['resetToPendingCommand']}`",
            f"- Replace with real hold: `{item['replaceWithRealHoldCommand']}`",
            f"- Approve after review: `{item['approveAfterReviewCommand']}`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RELEASE_ROOT
    ledger_path = release_root / "review-board" / "human-review-ledger.json"
    ledger = load_json(ledger_path)
    if not ledger:
        print(json.dumps({"ok": False, "error": f"No human review ledger found at {ledger_path}"}, indent=2))
        return 1
    out_dir = release_root / "review-board" / "tower-review-anomalies" / f"{stamp()}-tower-review-anomalies"
    out_dir.mkdir(parents=True, exist_ok=False)
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-review-anomalies-ready",
        "releaseRoot": str(release_root),
        "humanReviewLedger": str(ledger_path),
        "sessionDir": str(out_dir),
        "anomalies": collect_anomalies(ledger),
        "humanAsk": "Review these anomaly rows before treating the review ledger as publication-ready. Decide whether each row is a real hold/refine decision or a stale diagnostic marker.",
        "agentSafeParallelWork": "Codex may summarize anomalies, prepare dry-run review-decision commands, and improve local notes. Do not change review decisions, publish, upload, schedule, approve, mutate accounts, or create receipt truth.",
        "nextSafestAction": "Open the anomaly sheet and clear only the rows that a human has confirmed are stale diagnostic artifacts.",
        "truth": "Review anomaly sheet only. No review decisions, receipts, schedules, uploads, or publications were changed.",
    }
    html_path = out_dir / "index.html"
    json_path = out_dir / "tower-review-anomalies.json"
    markdown_path = out_dir / "START-HERE-tower-review-anomalies.md"
    payload.update({"htmlPath": str(html_path), "jsonPath": str(json_path), "markdownPath": str(markdown_path), "counts": {"anomalies": len(payload["anomalies"])}})
    html_path.write_text(render_html(payload), encoding="utf-8")
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {key: payload[key] for key in ["schema", "generatedAt", "status", "htmlPath", "jsonPath", "markdownPath", "sessionDir", "counts", "humanAsk", "agentSafeParallelWork", "nextSafestAction", "truth"]}
    pointer["firstSafeAction"] = {
        "label": "Open Tower review anomalies",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local anomaly evidence only. No review decision, approval, publishing, upload, schedule, account mutation, overwrite, delete, source mutation, or receipt capture occurs.",
    }
    pointer["externalPublishing"] = False
    pointer["externalSchedulesCreated"] = False
    pointer["receiptTruthCreated"] = False
    pointer["anomalies"] = [{"episode": item["episode"], "artifactId": item["artifactId"], "decision": item["decision"], "reviewer": item["reviewer"]} for item in payload["anomalies"]]
    latest_path = release_root / "review-board" / "tower-review-anomalies" / "latest-tower-review-anomalies.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, **pointer}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
