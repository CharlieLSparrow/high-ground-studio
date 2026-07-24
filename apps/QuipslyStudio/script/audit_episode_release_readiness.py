#!/usr/bin/env python3
"""Audit QuipslyStudio episode release readiness across video, shorts, podcast, and publication handoffs.

Talks to the running native app AgentServer. It does not export media by default,
mark receipts published, or approve draft shorts. It is an operator map for the
next safe release actions.
"""
from __future__ import annotations

import argparse
import html
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_SESSIONS = [
    "episode-1-premiere-rescue",
    "episode-2-native-proof",
    "episode-3-premiere-rescue",
]

DESTINATION_REQUIREMENTS = [
    ("YouTube", "episode-16x9-master"),
    ("Patreon", "episode-16x9-master"),
    ("YouTube Shorts", "social-short-clips"),
    ("Instagram", "social-short-clips"),
    ("Facebook", "social-short-clips"),
    ("LinkedIn", "social-short-clips"),
    ("Spotify", "podcast-audio-master"),
    ("Apple Podcasts", "podcast-audio-master"),
]


def get_json(base_url: str, path: str, timeout: int = 30) -> dict[str, Any]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for(base_url: str, predicate, timeout: float = 45, interval: float = 0.35) -> dict[str, Any]:
    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        last = get_json(base_url, "/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def load_session(base_url: str, session: str) -> dict[str, Any]:
    get_json(base_url, "/load_session?name=" + urllib.parse.quote(session))
    return wait_for(
        base_url,
        lambda payload: payload.get("activeSessionName") == session and payload.get("laneCount", 0) > 0,
        timeout=50,
    )


def queue_summary(base_url: str) -> dict[str, Any]:
    payload = get_json(base_url, "/shorts_queue")
    clips = payload.get("clips") or []
    statuses: dict[str, int] = {}
    exported = 0
    for clip in clips:
        status = (clip.get("reviewStatus") or "draft").lower()
        statuses[status] = statuses.get(status, 0) + 1
        if (clip.get("exportStatus") or "").lower() == "exported":
            exported += 1
    return {
        "count": len(clips),
        "exportedCount": exported,
        "reviewStatusCounts": statuses,
        "candidateTitles": [clip.get("title", "") for clip in clips[:10]],
    }


def records_for_lane(records: list[dict[str, Any]], lane_id: str) -> list[dict[str, Any]]:
    return [
        r for r in records
        if r.get("deliveryLaneId") == lane_id
        or str(r.get("deliveryLaneId", "")).startswith(lane_id + "/")
    ]


def records_for_destination(records: list[dict[str, Any]], platform: str, lane_id: str) -> list[dict[str, Any]]:
    return [
        r for r in records
        if r.get("platform") == platform
        and (
            r.get("deliveryLaneId") == lane_id
            or str(r.get("deliveryLaneId", "")).startswith(lane_id + "/")
        )
    ]


def artifact_ready(record: dict[str, Any]) -> bool:
    path = record.get("artifactPath") or ""
    return bool(path and Path(path).exists() and Path(path).stat().st_size > 0)


def artifact_link(path: str) -> dict[str, Any]:
    file_path = Path(path)
    return {
        "path": path,
        "name": file_path.name,
        "fileUrl": "file://" + urllib.parse.quote(str(file_path)),
        "exists": file_path.exists(),
        "sizeBytes": file_path.stat().st_size if file_path.exists() else 0,
    }


def operator_next_action(platform: str, lane_id: str, ready_count: int, record_count: int) -> str:
    if ready_count <= 0:
        if lane_id == "social-short-clips":
            return "Generate exports for reviewed Keep shorts first. Draft/refine/reject clips are review material, not publish approvals."
        if lane_id == "podcast-audio-master":
            return "Generate the podcast audio master or full release packet before opening the podcast host workflow."
        return "Generate the 16:9 master/full release packet before upload."
    if platform == "YouTube":
        return "Upload the 16:9 master to YouTube, add title/description/thumbnail, then record the public URL as a receipt."
    if platform == "Patreon":
        return "Create the Patreon post using the 16:9 master or embed, then record the Patreon post URL as a receipt."
    if platform in {"YouTube Shorts", "Instagram", "Facebook", "LinkedIn"}:
        return (
            f"Upload reviewed 9:16 derivative(s) for {platform}. "
            "Use only human-approved Keep clips; record each public post URL after posting."
        )
    if platform in {"Spotify", "Apple Podcasts"}:
        return f"Publish the podcast audio through the podcast host/RSS workflow for {platform}, then record the public episode URL."
    return f"Upload {ready_count} ready artifact(s), then record the receipt URL."


def receipt_command(record: dict[str, Any], platform: str, lane_id: str) -> str:
    existing = (record.get("agentCommand") or "").strip()
    if existing:
        return existing
    public_url = "<public-url>"
    provider_id = "<provider-id>"
    notes = "manual receipt"
    record_id = record.get("id") or "<receipt-id>"
    if lane_id == "podcast-audio-master":
        return f'script/agentctl.sh podcast-receipt-capture "{platform}" published {public_url} {provider_id} "{notes}"'
    if lane_id == "episode-16x9-master":
        return f'script/agentctl.sh episode-receipt-capture "{platform}" published {public_url} {provider_id} "{notes}"'
    if lane_id == "social-short-clips" or str(record.get("deliveryLaneId", "")).startswith("social-short-clips/"):
        return f'script/agentctl.sh social-receipt-capture "{record_id}" published {public_url} {provider_id} "{notes}"'
    return f'script/agentctl.sh publish-receipt-update-platform "{platform}" "{lane_id}" published {public_url} {provider_id} "{notes}"'


def compact_delivery_lanes(state: dict[str, Any]) -> list[dict[str, Any]]:
    readiness = state.get("deliveryReadiness") or {}
    lanes = readiness.get("lanes") or []
    return [
        {
            "id": lane.get("id", ""),
            "label": lane.get("label", ""),
            "format": lane.get("format", ""),
            "status": lane.get("status", ""),
            "ready": bool(lane.get("ready")),
            "destinations": lane.get("destinations") or [],
            "nextAction": lane.get("nextAction", ""),
            "agentAction": lane.get("agentAction", ""),
        }
        for lane in lanes
    ]


def release_summary_for_state(base_url: str, state: dict[str, Any], output_root: Path, proof_seconds: float) -> dict[str, Any]:
    session = state.get("activeSessionName") or ""
    safe_session = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in session).strip("-") or "episode"
    short_queue = queue_summary(base_url)
    ledger = state.get("publishLedger") or {}
    records = ledger.get("records") or []
    cockpit = state.get("publicationCockpit") or {}
    full_release = state.get("fullRelease") or {}
    podcast_packet = state.get("podcastPacket") or {}
    delivery_packet = state.get("deliveryPacket") or {}

    destination_rows = []
    for platform, lane_id in DESTINATION_REQUIREMENTS:
        matches = records_for_destination(records, platform, lane_id)
        ready_matches = [record for record in matches if artifact_ready(record)]
        receipt_matches = [record for record in matches if record.get("receiptCaptured")]
        sample_records = ready_matches[:3] if ready_matches else matches[:3]
        destination_rows.append({
            "platform": platform,
            "laneId": lane_id,
            "recordCount": len(matches),
            "artifactReadyCount": len(ready_matches),
            "receiptCapturedCount": len(receipt_matches),
            "status": "receipt-captured" if receipt_matches else ("ready-to-upload" if ready_matches else "needs-artifact-or-packet"),
            "artifactPaths": [record.get("artifactPath", "") for record in ready_matches[:3]],
            "artifacts": [artifact_link(record.get("artifactPath", "")) for record in ready_matches[:5] if record.get("artifactPath")],
            "receiptCommands": [receipt_command(record, platform, lane_id) for record in sample_records],
            "receiptCommand": receipt_command(sample_records[0], platform, lane_id) if sample_records else "",
            "operatorNextAction": operator_next_action(platform, lane_id, len(ready_matches), len(matches)),
        })

    release_output = output_root / safe_session
    basename = f"{safe_session}-release-proof"
    reviewed_queue_basename = f"{safe_session}-reviewed-keeps"
    return {
        "session": session,
        "title": state.get("projectTitle", ""),
        "productionReady": bool(state.get("productionReady")),
        "laneCount": state.get("laneCount", 0),
        "deliveryCounts": (state.get("deliveryReadiness") or {}).get("counts") or {},
        "deliveryLanes": compact_delivery_lanes(state),
        "shortQueue": short_queue,
        "shortsNeedHumanKeepDecision": short_queue["count"] > 0 and short_queue["reviewStatusCounts"].get("keep", 0) == 0,
        "publishLedger": {
            "recordCount": ledger.get("recordCount", 0),
            "readyToUploadCount": ledger.get("readyToUploadCount", 0),
            "publishedCount": ledger.get("publishedCount", 0),
            "needsExportCount": ledger.get("needsExportCount", 0),
        },
        "publicationCockpit": {
            "status": cockpit.get("status", ""),
            "phase": cockpit.get("publicationPhase", ""),
            "receiptCapturedCount": cockpit.get("receiptCapturedCount", 0),
            "receiptRemainingCount": cockpit.get("receiptRemainingCount", 0),
            "receiptTotalCount": cockpit.get("receiptTotalCount", 0),
            "outputPath": cockpit.get("outputPath", ""),
        },
        "podcastPacket": {
            "status": podcast_packet.get("status", ""),
            "outputPath": podcast_packet.get("outputPath", ""),
            "receiptTargets": podcast_packet.get("receiptTargets", []),
            "readyPacketStatus": podcast_packet.get("readyPacketStatus", ""),
            "readyPacketOutputPath": podcast_packet.get("readyPacketOutputPath", ""),
        },
        "deliveryPacket": {
            "artifactStatuses": [
                {
                    "id": artifact.get("id", ""),
                    "label": artifact.get("label", ""),
                    "status": artifact.get("status", ""),
                    "fileExists": artifact.get("fileExists", False),
                    "outputPath": artifact.get("outputPath", ""),
                }
                for artifact in (delivery_packet.get("artifacts") or [])
            ]
        },
        "fullRelease": {
            "status": full_release.get("status", ""),
            "outputPath": full_release.get("outputPath", ""),
            "publishLedgerRecordCount": full_release.get("publishLedgerRecordCount", 0),
            "publishReleaseChecklistReadiness": full_release.get("publishReleaseChecklistReadiness", ""),
        },
        "destinations": destination_rows,
        "safeCommands": {
            "load": f"script/agentctl.sh load-session {session}",
            "fullReleaseProof": f"script/agentctl.sh full-release-prepare {release_output} {basename} {proof_seconds:g}",
            "exportProxyPackage": f"script/agentctl.sh export-proxy-package {release_output} {basename} {proof_seconds:g}",
            "audioMaster": f"script/agentctl.sh audio-master-export {release_output} {basename}-podcast-audio {proof_seconds:g}",
            "podcastPacket": f"script/agentctl.sh podcast-packet-generate {release_output} {basename}-podcast",
            "publishPacket": f"script/agentctl.sh publish-packet-generate {release_output} {basename}-publish",
            "publicationCockpit": f"script/agentctl.sh publication-cockpit-generate {release_output} {basename}-cockpit",
            "reviewedSocialQueue": f"script/agentctl.sh reviewed-social-queue-generate {release_output} {reviewed_queue_basename}",
        },
        "lastMediaAction": state.get("lastMediaAction", ""),
    }


def status_class(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in (value or "unknown").lower())


def write_html(report: dict[str, Any], output_root: Path) -> Path:
    body: list[str] = []
    for session in report["sessions"]:
        short_counts = (session.get("shortQueue") or {}).get("reviewStatusCounts") or {}
        body.append(f"""
<section class="episode">
  <div class="episodeHeader">
    <div>
      <p class="eyebrow">{html.escape(session.get('session',''))}</p>
      <h2>{html.escape(session.get('title') or session.get('session') or 'Episode')}</h2>
    </div>
    <div class="status {'ready' if session.get('productionReady') else 'blocked'}">{'production ready' if session.get('productionReady') else 'not ready'}</div>
  </div>
  <div class="metrics">
    <span>lanes <strong>{html.escape(str(session.get('laneCount',0)))}</strong></span>
    <span>shorts <strong>{html.escape(str((session.get('shortQueue') or {}).get('count',0)))}</strong></span>
    <span>exported shorts <strong>{html.escape(str((session.get('shortQueue') or {}).get('exportedCount',0)))}</strong></span>
    <span>keep <strong>{html.escape(str(short_counts.get('keep',0)))}</strong></span>
    <span>ready receipts <strong>{html.escape(str((session.get('publishLedger') or {}).get('readyToUploadCount',0)))}</strong></span>
    <span>published <strong>{html.escape(str((session.get('publishLedger') or {}).get('publishedCount',0)))}</strong></span>
  </div>
  <h3>Destination handoff</h3>
  <table>
    <thead><tr><th>Destination</th><th>Status</th><th>Upload artifact</th><th>Human next action</th><th>Receipt command</th></tr></thead>
    <tbody>
""")
        for destination in session.get("destinations") or []:
            artifacts = destination.get("artifacts") or []
            artifact_html = "<span class=\"muted\">No ready artifact yet</span>"
            if artifacts:
                artifact_items = []
                for artifact in artifacts[:3]:
                    artifact_items.append(
                        f"<li><a href=\"{html.escape(artifact.get('fileUrl',''))}\">{html.escape(artifact.get('name') or artifact.get('path',''))}</a>"
                        f"<br><small>{html.escape(artifact.get('path',''))}</small></li>"
                    )
                artifact_html = "<ul class=\"artifacts\">" + "".join(artifact_items) + "</ul>"
            commands = destination.get("receiptCommands") or []
            command_html = "<span class=\"muted\">No receipt command until packet exists</span>"
            if commands:
                command_html = "<br>".join(f"<code>{html.escape(command)}</code>" for command in commands[:2])
            body.append(f"""
      <tr>
        <td><strong>{html.escape(destination.get('platform',''))}</strong><br><code>{html.escape(destination.get('laneId',''))}</code></td>
        <td><span class="pill {status_class(destination.get('status',''))}">{html.escape(destination.get('status',''))}</span><br><small>{html.escape(str(destination.get('artifactReadyCount',0)))} / {html.escape(str(destination.get('recordCount',0)))} ready, {html.escape(str(destination.get('receiptCapturedCount',0)))} receipts</small></td>
        <td>{artifact_html}</td>
        <td>{html.escape(destination.get('operatorNextAction',''))}</td>
        <td>{command_html}</td>
      </tr>
""")
        body.append("</tbody></table>")
        body.append("<h3>Next safe commands</h3><div class=\"commands\">")
        for label, command in (session.get("safeCommands") or {}).items():
            body.append(f"<p><strong>{html.escape(label)}</strong><br><code>{html.escape(command)}</code></p>")
        body.append("</div>")
        if session.get("shortsNeedHumanKeepDecision"):
            body.append("<p class=\"warning\">Shorts exist, but none are marked Keep. Review candidates before generating a reviewed social queue.</p>")
        body.append("</section>")

    page = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Episode Release Readiness</title>
  <style>
    :root {{ color-scheme: dark; --bg:#0f1512; --panel:#18231f; --line:#34433b; --ink:#f4eddc; --muted:#a99d88; --gold:#f1cd45; --green:#57d982; --red:#ff6576; --blue:#62b8ff; }}
    body {{ margin:0; background:radial-gradient(circle at 12% 0%, #2b463a, var(--bg) 42%); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1200px; margin:0 auto; padding:44px 28px 80px; }}
    h1 {{ font-size:clamp(38px,6vw,72px); line-height:.92; letter-spacing:-.06em; margin:0 0 14px; }}
    h2 {{ margin:0; font-size:28px; }} h3 {{ margin:22px 0 10px; color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; }}
    .lede {{ max-width:820px; color:var(--muted); font-size:18px; }}
    .episode {{ margin:24px 0; padding:24px; border:1px solid var(--line); border-radius:26px; background:color-mix(in srgb,var(--panel) 90%,transparent); box-shadow:0 24px 70px #0008; }}
    .episodeHeader,.metrics {{ display:flex; align-items:center; flex-wrap:wrap; gap:10px; justify-content:space-between; }}
    .metrics {{ justify-content:flex-start; margin:16px 0; }}
    .eyebrow {{ margin:0 0 5px; color:var(--gold); text-transform:uppercase; letter-spacing:.28em; font-size:12px; font-weight:900; }}
    .metrics span,.status,.pill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:6px 10px; background:#22302a; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:12px; font-weight:800; }}
    .ready,.ready_to_upload,.receipt_captured {{ color:var(--green); border-color:color-mix(in srgb,var(--green) 45%,var(--line)); }}
    .needs_artifact_or_packet,.blocked,.warning {{ color:var(--gold); }}
    table {{ width:100%; border-collapse:collapse; overflow:hidden; border-radius:14px; }} th,td {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }} th {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.12em; }}
    code {{ color:#c9e7ff; font-size:12px; word-break:break-all; }} a {{ color:#9fd2ff; }} small,.muted {{ color:var(--muted); }} .artifacts {{ margin:0; padding-left:18px; }} .artifacts li {{ margin:0 0 8px; }} .commands {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:10px; }} .commands p {{ background:#111a17; border:1px solid var(--line); border-radius:14px; padding:10px; margin:0; }}
  </style>
</head>
<body><main>
  <p class="eyebrow">Quipsly release operator map</p>
  <h1>Episode publishing readiness.</h1>
  <p class="lede">Generated from the running native app. This does not upload, schedule, mark receipts, approve draft shorts, or touch source media. It tells a human or Codex editor what is ready and which safe command moves the release forward.</p>
  {''.join(body)}
</main></body></html>"""
    path = output_root / "episodes-release-readiness.html"
    path.write_text(page)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-url", default="http://127.0.0.1:8080")
    parser.add_argument("--sessions", nargs="*", default=DEFAULT_SESSIONS)
    parser.add_argument("--output", default=str(Path.home() / "Movies" / "QuipslyExports" / "ReleaseReadiness" / "episodes-1-3"))
    parser.add_argument("--proof-seconds", type=float, default=30)
    args = parser.parse_args()

    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "model": "quipsly-episodes-release-readiness-audit",
        "version": "2026-06-18.episodes-release-readiness.v2.handoff",
        "agentUrl": args.agent_url,
        "proofSecondsForSuggestedCommands": args.proof_seconds,
        "truth": "Loads each native session through the app and reports readiness. It does not export, upload, publish, approve draft shorts, or touch originals.",
        "sessions": [],
    }

    for session in args.sessions:
        state = load_session(args.agent_url, session)
        if state.get("activeSessionName") != session:
            report["sessions"].append({
                "session": session,
                "status": "failed-to-load",
                "activeSessionName": state.get("activeSessionName", ""),
            })
            continue
        summary = release_summary_for_state(args.agent_url, state, output_root, args.proof_seconds)
        summary["status"] = "loaded"
        report["sessions"].append(summary)

    report_path = output_root / "episodes-release-readiness.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True))
    html_path = write_html(report, output_root)
    print(json.dumps({
        "status": "pass",
        "reportPath": str(report_path),
        "htmlPath": str(html_path),
        "sessions": [
            {
                "session": item.get("session"),
                "productionReady": item.get("productionReady"),
                "shorts": (item.get("shortQueue") or {}).get("count"),
                "keep": ((item.get("shortQueue") or {}).get("reviewStatusCounts") or {}).get("keep", 0),
                "readyToUpload": (item.get("publishLedger") or {}).get("readyToUploadCount", 0),
                "published": (item.get("publishLedger") or {}).get("publishedCount", 0),
            }
            for item in report["sessions"]
        ],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
