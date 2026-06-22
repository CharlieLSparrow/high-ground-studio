#!/usr/bin/env python3
"""Export a fillable short-review decision template from running QuipslyStudio sessions.

The template is intentionally non-mutating. A human or Codex editor reviews the
exported shorts, changes each decision status to keep/refine/reject/needs-review,
then imports it with script/import_review_short_decisions.py --execute --save.
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


def slugify(value: str) -> str:
    safe = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in safe:
        safe = safe.replace("--", "-")
    return safe.strip("-") or "session"


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


def last_exported_short_path(publish_notes: str) -> str:
    marker = "Exported 9:16 short: "
    for line in reversed((publish_notes or "").splitlines()):
        if marker in line:
            return line.split(marker, 1)[1].strip()
    return ""


def file_url(path: str) -> str:
    return "file://" + urllib.parse.quote(str(Path(path)))


def agent_url(base_url: str, path: str, **query: str) -> str:
    return f"{base_url.rstrip('/')}{path}?" + urllib.parse.urlencode(query)


def normalized_initial_status(current_status: str) -> str:
    value = (current_status or "").strip().lower().replace("_", "-").replace(" ", "-")
    if value in {"keep", "refine", "reject"}:
        return value
    return "needs-review"


def review_priority(status: str) -> int:
    value = (status or "").lower()
    if value == "keep":
        return 4
    if value in {"ready-for-human-review", "needs-review", "needs-captions"}:
        return 0
    if value == "draft":
        return 1
    if value == "refine":
        return 2
    if value == "reject":
        return 3
    return 1


def build_decisions(base_url: str, sessions: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    decisions: list[dict[str, Any]] = []
    session_summaries: list[dict[str, Any]] = []
    for session in sessions:
        state = load_session(base_url, session)
        if state.get("activeSessionName") != session:
            session_summaries.append({
                "session": session,
                "status": "failed-to-load",
                "activeSessionName": state.get("activeSessionName", ""),
                "decisionCount": 0,
            })
            continue
        queue = get_json(base_url, "/shorts_queue")
        clips = queue.get("clips") or []
        session_summaries.append({
            "session": session,
            "status": "loaded",
            "title": state.get("projectTitle", ""),
            "decisionCount": len(clips),
            "productionReady": state.get("productionReady", False),
        })
        for index, clip in enumerate(clips, start=1):
            export_path = last_exported_short_path(clip.get("publishNotes", ""))
            current_status = clip.get("reviewStatus") or "draft"
            initial_status = normalized_initial_status(current_status)
            export_exists = bool(export_path and Path(export_path).exists())
            transcript_context = clip.get("transcriptContext") or {}
            transcript_speakers = transcript_context.get("speakers") or []
            decisions.append({
                "candidateId": f"{session}::{clip.get('title', '')}",
                "session": session,
                "shortClipId": clip.get("id", ""),
                "index": index,
                "title": clip.get("title", ""),
                "status": initial_status,
                "currentReviewStatus": current_status,
                "notes": "",
                "sequenceStartTime": clip.get("sequenceStartTime", clip.get("startTime", 0)),
                "recipeDuration": clip.get("recipeDuration", clip.get("duration", 0)),
                "exportStatus": clip.get("exportStatus", ""),
                "exportPath": export_path,
                "exportFileUrl": file_url(export_path) if export_path else "",
                "exportExists": export_exists,
                "hookText": clip.get("hookText", ""),
                "captionDraft": clip.get("captionDraft", ""),
                "transcriptStatus": transcript_context.get("status", ""),
                "transcriptExcerpt": transcript_context.get("excerpt", ""),
                "transcriptSpeakers": transcript_speakers,
                "transcriptSegmentCount": transcript_context.get("segmentCount", 0),
                "destinationCount": len(clip.get("destinationPresets") or clip.get("destinations") or []),
                "segmentCount": len(clip.get("segments") or []),
                "agentPreviewCommand": f"script/agentctl.sh load-session {session} && script/agentctl.sh shorts-select id {clip.get('id', '')} && script/agentctl.sh shorts-preview-selected play",
                "agentApplyCommand": f"script/agentctl.sh load-session {session} && script/agentctl.sh shorts-review {clip.get('id', '')} keep \"approved after review\"",
                "agentRefineCommand": f"script/agentctl.sh load-session {session} && script/agentctl.sh shorts-review {clip.get('id', '')} refine \"needs refinement after review\"",
                "agentRejectCommand": f"script/agentctl.sh load-session {session} && script/agentctl.sh shorts-review {clip.get('id', '')} reject \"rejected after review\"",
                "loadedSessionKeepUrl": agent_url(base_url, "/shorts_review", id=clip.get("id", ""), status="keep", notes="approved from review board"),
                "loadedSessionRefineUrl": agent_url(base_url, "/shorts_review", id=clip.get("id", ""), status="refine", notes="needs refinement from review board"),
                "loadedSessionRejectUrl": agent_url(base_url, "/shorts_review", id=clip.get("id", ""), status="reject", notes="rejected from review board"),
                "instruction": "Change status to keep, refine, reject, or needs-review. Only keep flows into reviewed social queues.",
            })
    decisions.sort(key=lambda item: (item["session"], review_priority(item.get("currentReviewStatus", "")), item.get("sequenceStartTime") or 0))
    return decisions, session_summaries


def write_html(payload: dict[str, Any], html_path: Path) -> None:
    cards: list[str] = []
    status_counts: dict[str, int] = {}
    for item in payload["decisions"]:
        export_path = item.get("exportPath") or ""
        proposed_status = item.get("status", "needs-review")
        current_status = item.get("currentReviewStatus", "")
        status_counts[proposed_status] = status_counts.get(proposed_status, 0) + 1
        if item.get("exportExists"):
            media = (
                f'<video controls preload="metadata" src="{html.escape(item.get("exportFileUrl",""))}"></video>'
                f'<a class="open" href="{html.escape(item.get("exportFileUrl",""))}">Open exported short</a>'
            )
        else:
            media = f'<div class="missing">No exported 9:16 file yet<br><small>{html.escape(item.get("exportStatus") or "missing export")}</small></div>'
        transcript_excerpt = item.get("transcriptExcerpt") or ""
        transcript_status = item.get("transcriptStatus") or "not attached"
        transcript_speakers = ", ".join(item.get("transcriptSpeakers") or []) or "speaker review needed"
        transcript_html = (
            f'<div class="transcript"><strong>Transcript context</strong>'
            f'<small>{html.escape(transcript_status)} · {html.escape(transcript_speakers)} · '
            f'{html.escape(str(item.get("transcriptSegmentCount") or 0))} segment(s)</small>'
            f'<p>{html.escape(transcript_excerpt or "No transcript context attached to this short yet.")}</p></div>'
        )
        cards.append(f"""
<article class="card status-{html.escape(proposed_status.replace('-', '_'))}">
  <div class="media">{media}</div>
  <div class="cardBody">
    <div class="cardTop">
      <span class="session">{html.escape(item.get('session',''))}</span>
      <span class="pill {html.escape(str(current_status).replace('-', '_'))}">{html.escape(current_status)}</span>
    </div>
    <h2>{html.escape(item.get('title',''))}</h2>
    <p class="meta">{html.escape(str(round(float(item.get('sequenceStartTime') or 0), 2)))}s sequence start · {html.escape(str(round(float(item.get('recipeDuration') or 0), 2)))}s · {html.escape(str(item.get('segmentCount', 1)))} segment(s)</p>
    <p class="copy">{html.escape(item.get('hookText') or item.get('captionDraft') or 'No hook/caption drafted yet.')}</p>
    {transcript_html}
    <div class="decision">
      <span>Template decision</span>
      <code>{html.escape(proposed_status)}</code>
    </div>
    <div class="quickActions">
      <a href="{html.escape(item.get('loadedSessionKeepUrl',''))}">Mark Keep</a>
      <a href="{html.escape(item.get('loadedSessionRefineUrl',''))}">Needs refinement</a>
      <a href="{html.escape(item.get('loadedSessionRejectUrl',''))}">Reject</a>
    </div>
    <p class="loadedWarning">Quick actions affect the currently loaded app session. Use the CLI command below when reviewing across episodes.</p>
    <details>
      <summary>Agent commands</summary>
      <p><strong>Preview in app</strong><br><code>{html.escape(item.get('agentPreviewCommand',''))}</code></p>
      <p><strong>Mark Keep immediately</strong><br><code>{html.escape(item.get('agentApplyCommand',''))}</code></p>
      <p><strong>Mark Refine</strong><br><code>{html.escape(item.get('agentRefineCommand',''))}</code></p>
      <p><strong>Mark Reject</strong><br><code>{html.escape(item.get('agentRejectCommand',''))}</code></p>
      <p><strong>Export path</strong><br><code>{html.escape(export_path)}</code></p>
    </details>
  </div>
</article>
""")
    summary = "".join(
        f"<span>{html.escape(status)} <strong>{count}</strong></span>"
        for status, count in sorted(status_counts.items())
    )
    json_path = html_path.with_suffix(".json")
    queue_commands = payload.get("reviewedQueueCommands") or []
    queue_command_cards = "".join(
        f"""
    <p><strong>{html.escape(item.get('session',''))}</strong><br>
    <code>{html.escape(item.get('command',''))}</code><br>
    <small>Outputs to {html.escape(item.get('output',''))}</small></p>
"""
        for item in queue_commands
    )
    page = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Quipsly Short Review Decision Template</title>
<style>
:root {{ color-scheme: dark; --bg:#101512; --panel:#19221f; --panel2:#202d27; --line:#34443c; --ink:#f4eddb; --muted:#aa9f8b; --gold:#f2cd45; --green:#58dc84; --red:#ff6678; --blue:#64b6ff; }}
body {{ margin:0; background:radial-gradient(circle at 10% 0%, #2a4539, var(--bg) 42%); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
main {{ max-width:1280px; margin:0 auto; padding:44px 28px 80px; }} h1 {{ font-size:clamp(36px,6vw,70px); line-height:.92; letter-spacing:-.06em; margin:0 0 12px; }}
.lede {{ color:var(--muted); max-width:900px; font-size:18px; }} .panel {{ background:color-mix(in srgb,var(--panel) 90%,transparent); border:1px solid var(--line); border-radius:24px; padding:20px; box-shadow:0 24px 70px #0008; margin:22px 0; }}
.summary {{ display:flex; gap:10px; flex-wrap:wrap; margin:18px 0; }} .summary span,.badge {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:#22302a; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:12px; font-weight:900; }}
.commands {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:10px; }} .commands p {{ background:#111a17; border:1px solid var(--line); border-radius:16px; padding:12px; margin:0; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:18px; }} .card {{ overflow:hidden; background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--line); border-radius:24px; box-shadow:0 20px 50px #0007; }} .card.status-keep {{ border-color:color-mix(in srgb,var(--green) 45%,var(--line)); }} .card.status-refine,.card.status-needs_review {{ border-color:color-mix(in srgb,var(--gold) 45%,var(--line)); }} .card.status-reject {{ opacity:.72; border-color:color-mix(in srgb,var(--red) 45%,var(--line)); }}
.media {{ background:#050807; aspect-ratio:9/16; max-height:520px; display:grid; place-items:center; border-bottom:1px solid var(--line); }} video {{ width:100%; height:100%; object-fit:contain; background:#050807; }} .missing {{ color:var(--gold); text-align:center; padding:24px; }}
.cardBody {{ padding:16px; }} .cardTop {{ display:flex; align-items:center; justify-content:space-between; gap:10px; }} h2 {{ margin:12px 0 6px; line-height:1.05; }} .meta,.copy {{ color:var(--muted); }} .decision {{ display:flex; align-items:center; justify-content:space-between; gap:10px; border:1px solid var(--line); border-radius:16px; padding:10px 12px; background:#101814; margin:14px 0; }}
.transcript {{ border:1px solid color-mix(in srgb,var(--blue) 28%,var(--line)); border-radius:16px; background:#0d1a1b; padding:11px 12px; margin:12px 0; }} .transcript strong {{ display:block; color:#c8f3ff; text-transform:uppercase; letter-spacing:.08em; font-size:11px; }} .transcript small {{ display:block; margin-top:2px; }} .transcript p {{ margin:8px 0 0; color:#dcebe7; font-size:13px; }}
.quickActions {{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:12px 0; }} .quickActions a {{ text-align:center; text-decoration:none; border:1px solid var(--line); border-radius:999px; padding:8px 9px; background:#101814; font-size:12px; font-weight:900; }} .quickActions a:first-child {{ color:var(--green); border-color:color-mix(in srgb,var(--green) 45%,var(--line)); }} .quickActions a:nth-child(2) {{ color:var(--gold); border-color:color-mix(in srgb,var(--gold) 45%,var(--line)); }} .quickActions a:last-child {{ color:var(--red); border-color:color-mix(in srgb,var(--red) 45%,var(--line)); }} .loadedWarning {{ color:var(--muted); font-size:12px; margin:0 0 12px; }}
small {{ color:var(--muted); }} code {{ color:#c9e7ff; font-size:11px; word-break:break-all; }} a {{ color:#92cfff; }} .open {{ display:block; margin-top:8px; font-weight:800; }} .session {{ color:var(--gold); font-weight:900; }}
.pill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:5px 8px; color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase; }} .pill.keep {{ color:var(--green); }} .pill.reject {{ color:var(--red); }} .pill.refine,.pill.needs_captions,.pill.ready_for_human_review,.pill.needs_review {{ color:var(--gold); }} .pill.draft {{ color:var(--blue); }}
</style></head><body><main>
<p style="color:var(--gold);text-transform:uppercase;letter-spacing:.28em;font-size:12px;font-weight:900;">Quipsly review template</p>
<h1>Choose what becomes publishable.</h1>
<p class="lede">Edit the JSON next to this HTML. Set each status to <code>keep</code>, <code>refine</code>, <code>reject</code>, or <code>needs-review</code>. Only <code>keep</code> can generate reviewed social upload queues.</p>
<div class="summary">{summary}</div>
<div class="panel">
  <h2>Review workflow</h2>
  <div class="commands">
    <p><strong>Decision file</strong><br><code>{html.escape(str(json_path))}</code></p>
    <p><strong>Dry run import</strong><br><code>script/agentctl.sh review-shorts-import {html.escape(str(json_path))}</code></p>
    <p><strong>Apply and save</strong><br><code>script/agentctl.sh review-shorts-import {html.escape(str(json_path))} --execute --save</code></p>
  </div>
</div>
<div class="panel">
  <h2>After review: generate approved social queues</h2>
  <p class="lede">Run these after statuses are applied and saved. They export only <code>keep</code> clips into upload-ready social queue folders. Clips still marked <code>draft</code>, <code>needs-review</code>, <code>refine</code>, or <code>reject</code> remain visible as review material but do not become publication queues.</p>
  <div class="commands">{queue_command_cards}</div>
</div>
<div class="grid">{''.join(cards)}</div>
</main></body></html>"""
    html_path.write_text(page)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-url", default="http://127.0.0.1:8080")
    parser.add_argument("--sessions", nargs="*", default=DEFAULT_SESSIONS)
    parser.add_argument("--output", default=str(Path.home() / "Movies" / "QuipslyExports" / "ReviewDecisions" / "episodes-1-3"))
    parser.add_argument("--basename", default="episodes-1-3-short-review-decisions")
    args = parser.parse_args()

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    decisions, session_summaries = build_decisions(args.agent_url, args.sessions)
    social_queue_root = output.parent.parent / "SocialQueues" / f"{args.basename}-approved-queues"
    reviewed_queue_commands = []
    for session in args.sessions:
        session_slug = slugify(session)
        session_output = social_queue_root / session_slug
        reviewed_queue_commands.append({
            "session": session,
            "output": str(session_output),
            "basename": f"{session_slug}-approved",
            "command": f"script/agentctl.sh reviewed-social-queue --session {session} --output {session_output} --basename {session_slug}-approved --include-status keep",
            "truth": "Exports only reviewStatus=keep shorts. It does not upload or schedule posts.",
        })
    payload = {
        "model": "quipsly-short-review-decision-template",
        "version": "2026-06-18.short-review-template.v3.action-board",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "agentUrl": args.agent_url,
        "decisionRule": "Only status=keep flows into reviewed social queues. refine/reject/needs-review stay visible but do not publish.",
        "sessions": session_summaries,
        "reviewedQueueCommands": reviewed_queue_commands,
        "decisions": decisions,
    }
    json_path = output / f"{args.basename}.json"
    html_path = output / f"{args.basename}.html"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    write_html(payload, html_path)
    print(json.dumps({
        "status": "pass",
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "decisionCount": len(decisions),
        "sessions": session_summaries,
        "nextActions": [
            f"Edit {json_path} statuses to keep/refine/reject/needs-review.",
            f"Dry run: script/agentctl.sh review-shorts-import {json_path}",
            f"Apply: script/agentctl.sh review-shorts-import {json_path} --execute --save",
        ],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
