#!/usr/bin/env python3
"""Build a local manual-publishing packet for current v002 short candidates.

This is the Tower bridge, not Tower receipt truth. It packages candidate media,
draft captions, transcript evidence, platform copy, warnings, and review gates
so a human can post manually after approval.

It writes local sidecars only. It never approves, uploads, schedules, publishes,
mutates media, overwrites old versions, mutates accounts, or creates receipts.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_HUMAN_PACKET_POINTER = DEFAULT_ROOT / "review-board" / "short-v002-human-review-packet" / "latest-short-v002-human-review-packet.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-manual-publish-packet"
SCHEMA = "quipsly.studio.short-v002-manual-publish-packet.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: str | Path) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.exists():
        return {}
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).expanduser().resolve().as_uri()
    except Exception:
        return ""


def existing_path(path_value: str) -> str:
    if not path_value:
        return ""
    return path_value if Path(path_value).exists() else ""


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def resolve_human_packet(path: str | Path) -> tuple[dict[str, Any], dict[str, str]]:
    """Load either a packet payload or the latest-pointer file for one."""
    requested = Path(path).expanduser()
    first = load_json(requested)
    source = {
        "requestedPath": str(requested),
        "pointerPath": "",
        "payloadPath": str(requested) if first.get("items") else "",
    }
    if first.get("items"):
        return first, source
    payload_path = str(first.get("jsonPath") or "")
    if payload_path:
        source["pointerPath"] = str(requested)
        source["payloadPath"] = payload_path
        payload = load_json(payload_path)
        return payload, source
    return {}, source


def caption_review(item: dict[str, Any]) -> dict[str, Any]:
    transcript = as_dict(item.get("transcriptContext"))
    return as_dict(transcript.get("candidateCaptionDraftReview"))


def candidate_warnings(item: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for warning in as_list(item.get("warnings")):
        if warning:
            warnings.append(str(warning))
    for warning in as_list(item.get("surfaceAlignmentProblems")):
        if warning:
            warnings.append(f"Surface alignment: {warning}")
    for warning in as_list(caption_review(item).get("warnings")):
        if warning:
            warnings.append(f"Caption: {warning}")
    return list(dict.fromkeys(warnings))


def build_manual_item(item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    candidate_path = str(item.get("candidatePath") or "")
    context_paths = as_dict(item.get("contextPaths"))
    platform_draft = as_dict(item.get("platformDraft"))
    platforms = as_dict(platform_draft.get("platforms"))
    transcript = as_dict(item.get("transcriptContext"))
    candidate_exists = bool(existing_path(candidate_path))
    platform_ready = platform_draft.get("status") == "draft-platform-metadata-ready" and bool(platforms)
    srt_path = str(context_paths.get("candidateCaptionDraftSrt") or transcript.get("candidateCaptionDraftSrtPath") or "")
    vtt_path = str(context_paths.get("candidateCaptionDraftVtt") or transcript.get("candidateCaptionDraftVttPath") or "")
    transcript_path = str(context_paths.get("candidateTranscriptJson") or transcript.get("candidateTranscriptPath") or "")
    markdown_transcript_path = str(context_paths.get("candidateTranscriptMarkdown") or transcript.get("candidateTranscriptMarkdownPath") or "")
    warnings = candidate_warnings(item)
    if not candidate_exists:
        warnings.append("Candidate media file is missing.")
    if not platform_ready:
        warnings.append("Draft platform metadata is missing or not ready.")
    if not existing_path(srt_path) and not existing_path(vtt_path):
        warnings.append("Draft caption sidecar is missing.")
    ready_for_manual_review = candidate_exists and platform_ready
    copy_blocks: dict[str, dict[str, str]] = {}
    for platform, draft_value in platforms.items():
        draft = as_dict(draft_value)
        title = str(draft.get("title") or platform_draft.get("titleDraft") or "")
        body = str(draft.get("description") or draft.get("caption") or "")
        copy_blocks[str(platform)] = {
            "title": title,
            "body": body,
            "check": str(draft.get("check") or ""),
        }
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "status": "manual-post-prep-ready" if ready_for_manual_review else "manual-post-prep-needs-attention",
        "approvalState": "needs-human-approval",
        "publicationState": "not-uploaded-not-scheduled-not-published",
        "candidatePath": candidate_path,
        "candidateUri": file_uri(candidate_path),
        "candidateExists": candidate_exists,
        "paths": {
            "candidateVideo": candidate_path,
            "candidateTranscriptJson": transcript_path,
            "candidateTranscriptMarkdown": markdown_transcript_path,
            "draftCaptionSrt": srt_path,
            "draftCaptionVtt": vtt_path,
            "qualityBrief": str(item.get("qualityBriefPath") or ""),
            "decisionRehearsal": str(item.get("decisionRehearsalPath") or ""),
            "evidence": str(item.get("evidencePath") or ""),
            "theater": str(item.get("theaterPath") or ""),
        },
        "pathChecks": {
            "candidateVideoExists": candidate_exists,
            "candidateTranscriptJsonExists": bool(existing_path(transcript_path)),
            "candidateTranscriptMarkdownExists": bool(existing_path(markdown_transcript_path)),
            "draftCaptionSrtExists": bool(existing_path(srt_path)),
            "draftCaptionVttExists": bool(existing_path(vtt_path)),
        },
        "platformDraft": platform_draft,
        "platformCopyBlocks": copy_blocks,
        "reviewChecklist": as_list(item.get("reviewChecklist")),
        "watchListenExpectation": item.get("watchListenExpectation") or "",
        "warnings": warnings,
        "captionDraftReview": caption_review(item),
        "transcriptContext": transcript,
        "semanticContext": as_dict(item.get("semanticContext")),
        "nextSafestAction": "Human watches/listens, edits platform copy in voice, then manually posts only after explicit approval.",
        "truth": "Manual publishing prep only. This item is not approved, uploaded, scheduled, published, externally posted, or receipt-backed.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    human_packet, source = resolve_human_packet(args.human_packet)
    requested_ids = set(args.short_id or [])
    packet_items = [item for item in as_list(human_packet.get("items")) if isinstance(item, dict)]
    if requested_ids:
        packet_items = [item for item in packet_items if str(item.get("shortId") or "") in requested_ids]
    items = [build_manual_item(item) for item in packet_items]
    ready = sum(1 for item in items if item.get("status") == "manual-post-prep-ready")
    needs_attention = len(items) - ready
    missing_media = sum(1 for item in items if not item.get("pathChecks", {}).get("candidateVideoExists"))
    missing_caption = sum(
        1
        for item in items
        if not item.get("pathChecks", {}).get("draftCaptionSrtExists")
        and not item.get("pathChecks", {}).get("draftCaptionVttExists")
    )
    status = "short-v002-manual-publish-packet-ready" if items and needs_attention == 0 else "short-v002-manual-publish-packet-needs-attention"
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": status,
        "sourcePacket": {
            **source,
            "status": human_packet.get("status") or "",
            "generatedAt": human_packet.get("generatedAt") or "",
        },
        "counts": {
            "items": len(items),
            "readyForManualReview": ready,
            "needsAttention": needs_attention,
            "missingCandidateMedia": missing_media,
            "missingCaptionDraft": missing_caption,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "approvalRecorded": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": items,
        "nextSafestAction": "Open the HTML packet, watch/listen each short, then manually edit/copy platform drafts only after approval.",
        "truth": "Local manual-publishing packet only. It does not approve, upload, schedule, publish, mutate source media, overwrite exports, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 manual-publishing packet",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Ready for manual review: `{payload.get('counts', {}).get('readyForManualReview')}`",
        f"Needs attention: `{payload.get('counts', {}).get('needsAttention')}`",
        "",
        "This packet prepares local posting copy and artifacts. It does not approve or publish anything.",
        "",
    ]
    for item in as_list(payload.get("items")):
        paths = as_dict(item.get("paths"))
        path_checks = as_dict(item.get("pathChecks"))
        lines.extend(
            [
                f"## `{item.get('shortId')}`",
                "",
                f"- Episode: `{item.get('episode')}`",
                f"- Status: `{item.get('status')}`",
                f"- Approval: `{item.get('approvalState')}`",
                f"- Publication: `{item.get('publicationState')}`",
                f"- Candidate: `{item.get('candidatePath')}`",
                f"- Candidate exists: `{path_checks.get('candidateVideoExists')}`",
                f"- Draft SRT: `{paths.get('draftCaptionSrt')}`",
                f"- Draft VTT: `{paths.get('draftCaptionVtt')}`",
                f"- Transcript: `{paths.get('candidateTranscriptMarkdown') or paths.get('candidateTranscriptJson')}`",
                f"- Warnings: `{'; '.join(item.get('warnings') or []) or 'none'}`",
                "",
                "### Platform copy",
                "",
            ]
        )
        for platform, copy_block in as_dict(item.get("platformCopyBlocks")).items():
            lines.extend(
                [
                    f"#### `{platform}`",
                    "",
                    f"Check: {copy_block.get('check') or ''}",
                    "",
                    "Title:",
                    "",
                    "```text",
                    str(copy_block.get("title") or ""),
                    "```",
                    "",
                    "Body:",
                    "",
                    "```text",
                    str(copy_block.get("body") or ""),
                    "```",
                    "",
                ]
            )
        lines.extend(["### Watch/listen checklist", ""])
        for check in as_list(item.get("reviewChecklist")):
            if isinstance(check, dict):
                lines.append(f"- **{check.get('label')}** `{check.get('status')}`: {check.get('prompt')}")
        lines.extend(["", f"Next: {item.get('nextSafestAction')}", ""])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def copy_button(label: str, value: str) -> str:
    disabled = " disabled" if not value else ""
    return f"<button class=\"copy\" data-copy=\"{escape(value, quote=True)}\"{disabled}>{escape(label)}</button>"


def render_html_card(item: dict[str, Any]) -> str:
    paths = as_dict(item.get("paths"))
    path_checks = as_dict(item.get("pathChecks"))
    video = (
        f"<video controls preload=\"metadata\" src=\"{escape(str(item.get('candidateUri') or ''), quote=True)}\"></video>"
        if item.get("candidateUri")
        else "<div class=\"missing\">No candidate video URI.</div>"
    )
    warnings = as_list(item.get("warnings"))
    warning_html = "".join(f"<li>{escape(str(warning))}</li>" for warning in warnings) or "<li>none</li>"
    path_html = "".join(
        f"<li><strong>{escape(label)}:</strong> <code>{escape(str(value))}</code></li>"
        for label, value in [
            ("Candidate video", paths.get("candidateVideo") or ""),
            ("Draft SRT", paths.get("draftCaptionSrt") or ""),
            ("Draft VTT", paths.get("draftCaptionVtt") or ""),
            ("Candidate transcript", paths.get("candidateTranscriptMarkdown") or paths.get("candidateTranscriptJson") or ""),
            ("Quality brief", paths.get("qualityBrief") or ""),
            ("Decision rehearsal", paths.get("decisionRehearsal") or ""),
        ]
        if value
    )
    platform_cards = []
    for platform, copy_block in as_dict(item.get("platformCopyBlocks")).items():
        title = str(copy_block.get("title") or "")
        body = str(copy_block.get("body") or "")
        platform_cards.append(
            f"""
            <section class="platform">
              <h3>{escape(str(platform))}</h3>
              <p>{escape(str(copy_block.get('check') or ''))}</p>
              <label>Title</label>
              <pre>{escape(title)}</pre>
              {copy_button('Copy title', title)}
              <label>Body</label>
              <pre>{escape(body)}</pre>
              {copy_button('Copy body', body)}
            </section>
            """
        )
    checklist_html = "".join(
        f"<li><strong>{escape(str(check.get('label') or ''))}</strong> <span>{escape(str(check.get('status') or ''))}</span><br>{escape(str(check.get('prompt') or ''))}</li>"
        for check in as_list(item.get("reviewChecklist"))
        if isinstance(check, dict)
    )
    return f"""
    <article class="card">
      <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(str(item.get('status')))} · {escape(str(item.get('approvalState')))}</div>
      <h2>{escape(str(item.get('shortId')))}</h2>
      {video}
      <div class="meta">
        <div><strong>Candidate exists</strong><span>{escape(str(path_checks.get('candidateVideoExists')))}</span></div>
        <div><strong>Draft captions</strong><span>SRT {escape(str(path_checks.get('draftCaptionSrtExists')))} · VTT {escape(str(path_checks.get('draftCaptionVttExists')))}</span></div>
        <div><strong>Publication</strong><span>{escape(str(item.get('publicationState')))}</span></div>
      </div>
      <h3>Warnings</h3>
      <ul>{warning_html}</ul>
      <h3>Artifact paths</h3>
      <ul class="paths">{path_html}</ul>
      <h3>Platform drafts</h3>
      <div class="platforms">{''.join(platform_cards) or '<p>No platform copy blocks generated.</p>'}</div>
      <h3>Watch/listen checklist</h3>
      <ul>{checklist_html or '<li>No checklist generated.</li>'}</ul>
      <p><strong>Next:</strong> {escape(str(item.get('nextSafestAction') or ''))}</p>
      <p class="truth">{escape(str(item.get('truth') or ''))}</p>
    </article>
    """


def render_html(payload: dict[str, Any]) -> str:
    cards = "".join(render_html_card(item) for item in as_list(payload.get("items")) if isinstance(item, dict))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly short v002 manual-publishing packet</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101914; --panel:#223229; --ink:#f8ecd1; --muted:#bcae8f; --gold:#dfbf55; --leaf:#8bd199; --blue:#8cc7df; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#314b37,var(--bg) 55%); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; }}
    h1 {{ margin:0; font-size:40px; letter-spacing:-.035em; }}
    .sub {{ color:var(--muted); margin:8px 0 26px; max-width:820px; }}
    .counts {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 28px; }}
    .counts span {{ border:1px solid rgba(223,191,85,.28); background:rgba(223,191,85,.1); border-radius:999px; padding:8px 12px; font-weight:800; }}
    .card {{ background:rgba(34,50,41,.94); border:1px solid rgba(223,191,85,.24); border-radius:28px; padding:22px; margin:22px 0; box-shadow:0 22px 72px rgba(0,0,0,.32); }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:900; }}
    h2 {{ margin:6px 0 16px; font-size:28px; }}
    video {{ width:100%; max-height:720px; border-radius:20px; background:#080c0a; }}
    .meta {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; margin:14px 0; }}
    .meta div,.platform {{ border:1px solid rgba(248,236,209,.13); background:rgba(0,0,0,.13); border-radius:18px; padding:13px; }}
    .meta strong,.meta span,label {{ display:block; }}
    .meta span,label {{ color:var(--muted); }}
    .platforms {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }}
    .platform h3 {{ color:var(--blue); margin:0 0 8px; }}
    pre, code {{ white-space:pre-wrap; word-break:break-word; }}
    pre {{ background:rgba(0,0,0,.18); border-radius:14px; padding:12px; color:var(--ink); }}
    .paths code {{ color:var(--muted); }}
    button.copy {{ appearance:none; border:0; border-radius:999px; padding:9px 12px; background:rgba(139,209,153,.18); color:#ddffe4; font-weight:900; cursor:pointer; margin:0 8px 10px 0; }}
    button.copy:disabled {{ opacity:.45; cursor:not-allowed; }}
    .truth {{ color:var(--muted); border-top:1px solid rgba(248,236,209,.13); padding-top:12px; }}
    .toast {{ position:fixed; right:24px; bottom:24px; background:#1f3429; color:var(--ink); border:1px solid rgba(223,191,85,.5); border-radius:16px; padding:12px 16px; opacity:0; transform:translateY(10px); transition:.2s; }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body><main>
  <h1>Short v002 manual-publishing packet</h1>
  <p class="sub">Local handoff for human-approved manual posting. This does not approve, upload, schedule, publish, or create receipt truth.</p>
  <div class="counts">
    <span>Status: {escape(str(payload.get('status')))}</span>
    <span>Items: {escape(str(payload.get('counts', {}).get('items')))}</span>
    <span>Ready: {escape(str(payload.get('counts', {}).get('readyForManualReview')))}</span>
    <span>Needs attention: {escape(str(payload.get('counts', {}).get('needsAttention')))}</span>
  </div>
  {cards or '<p>No manual-publishing items available.</p>'}
</main>
<div class="toast" id="toast">Copied</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('button.copy').forEach((button) => {{
  button.addEventListener('click', async () => {{
    const value = button.dataset.copy || '';
    if (!value) return;
    try {{ await navigator.clipboard.writeText(value); }}
    catch (error) {{ window.prompt('Copy:', value); }}
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1300);
  }});
}});
</script>
</body></html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str, formats: set[str]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    if "json" in formats:
        paths["jsonPath"] = str(output_dir / f"{basename}.json")
    if "markdown" in formats:
        paths["markdownPath"] = str(output_dir / f"{basename}.md")
    if "html" in formats:
        paths["htmlPath"] = str(output_dir / f"{basename}.html")
    pointer = output_dir / "latest-short-v002-manual-publish-packet.json"
    paths["latestPointerJson"] = str(pointer)
    payload["outputPaths"] = paths
    if paths.get("jsonPath"):
        Path(paths["jsonPath"]).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if paths.get("markdownPath"):
        Path(paths["markdownPath"]).write_text(render_markdown(payload), encoding="utf-8")
    if paths.get("htmlPath"):
        Path(paths["htmlPath"]).write_text(render_html(payload), encoding="utf-8")
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a manual-publishing handoff packet for v002 short candidates.")
    parser.add_argument("--human-packet", default=str(DEFAULT_HUMAN_PACKET_POINTER), help="Human review packet payload or latest-pointer JSON.")
    parser.add_argument("--short-id", action="append", default=[], help="Short id to include. Repeatable. Defaults to all packet items.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()
    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-short-v002-manual-publish-packet"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, formats)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "short-v002-manual-publish-packet-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
