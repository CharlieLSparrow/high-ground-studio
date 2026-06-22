#!/usr/bin/env python3
"""Generate a calm local HTML packet for short listen-through review.

Input is the JSON returned by `script/agentctl.sh shorts-queue`.
Output is a manifest plus an HTML review page. This script never mutates the
running app, source media, review status, or publication receipts.
"""

from __future__ import annotations

import datetime as _dt
import html
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any


def usage() -> None:
    print(
        "Usage: generate_short_listen_review_packet.py /path/shorts-queue.json /output/folder [basename]",
        file=sys.stderr,
    )


def file_uri(path: str) -> str:
    if not path:
        return ""
    return Path(path).expanduser().resolve().as_uri()


def safe_filename(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return safe or "short-listen-review"


def first_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def status_label(clip: dict[str, Any]) -> str:
    evidence = clip.get("reviewEvidence") or {}
    readiness = evidence.get("publicationReadiness") or {}
    missing = readiness.get("requiredIncompleteStepIds") or []
    review = first_text(clip.get("reviewStatus") or evidence.get("reviewStatus") or "draft")
    if review == "refine":
        return "needs refinement"
    if review == "keep":
        return "kept"
    if review == "reject":
        return "rejected"
    if "listen-through" in missing:
        return "needs listen-through"
    if "caption-copy" in missing or "hook-platform-copy" in missing:
        return "needs copy review"
    return review.replace("-", " ") or "draft"


def latest_note_path(notes: str, marker: str) -> str:
    for line in reversed(notes.splitlines()):
        if marker in line:
            return line.split(marker, 1)[1].strip()
    return ""


def command_for(clip: dict[str, Any], action: str) -> str:
    clip_id = first_text(clip.get("id"))
    title = first_text(clip.get("title") or "short")
    evidence = clip.get("reviewEvidence") or {}
    if action == "select":
        return f"script/agentctl.sh shorts-select id {clip_id}"
    if action == "preview":
        return f"script/agentctl.sh shorts-select id {clip_id} >/dev/null && script/agentctl.sh shorts-preview-selected play"
    if action == "listen":
        note = f"listened through {title}; note audio/timing/framing result"
        return f"script/agentctl.sh shorts-select id {clip_id} >/dev/null && script/agentctl.sh shorts-listen-through {json.dumps(note)}"
    if action == "text":
        return f"script/agentctl.sh shorts-select id {clip_id} >/dev/null && script/agentctl.sh shorts-text-review approve {json.dumps('copy reviewed; burn-in remains metadata-only unless explicitly approved')}"
    if action == "refine":
        return f"script/agentctl.sh shorts-review {clip_id} refine {json.dumps('needs refinement; describe trim/crop/audio/copy fix')}"
    if action == "keep":
        return f"script/agentctl.sh shorts-review {clip_id} keep {json.dumps('listen-through passed; ready for next publication-prep step')}"
    if action == "reject":
        return f"script/agentctl.sh shorts-review {clip_id} reject {json.dumps('not useful for publication; preserve as learning data')}"
    if action == "contact":
        return first_text(evidence.get("contactSheetCommand"))
    if action == "audio":
        export_path = first_text(evidence.get("exportPath") or latest_note_path(first_text(clip.get("publishNotes")), "Exported 9:16 short: "))
        duration = evidence.get("recipeDuration") or clip.get("recipeDuration") or clip.get("duration") or 0
        if export_path:
            return f"script/agentctl.sh shorts-audio-sanity {json.dumps(export_path)} {float(duration or 0):.3f}"
    return ""


def clip_payload(clip: dict[str, Any], index: int) -> dict[str, Any]:
    evidence = clip.get("reviewEvidence") or {}
    readiness = evidence.get("publicationReadiness") or {}
    transcript = clip.get("transcriptContext") or evidence.get("transcriptContext") or {}
    burn = evidence.get("textBurnPolicy") or {}
    publish_notes = first_text(clip.get("publishNotes"))
    export_path = first_text(evidence.get("exportPath") or latest_note_path(publish_notes, "Exported 9:16 short: "))
    contact_sheet_path = latest_note_path(publish_notes, "visual review contact sheet:")
    missing = readiness.get("requiredIncompleteStepIds") or []

    text_burn_policy = {
        "overlayDirective": first_text(burn.get("primaryOverlayDirective") or "unknown"),
        "captionDirective": first_text(burn.get("captionDirective") or "unknown"),
        "captionBurnedIn": bool(burn.get("captionBurnedIn")),
        "overlayBurnedIn": bool(burn.get("primaryOverlayBurnedIn")),
        "policy": first_text(burn.get("policy") or "Text stays metadata/platform copy unless a positioned safe rail is explicitly approved."),
        "safeRailRule": first_text(burn.get("safeRailRule") or "Avoid covering faces and platform UI safe zones. Generic approvals are not enough; name the rail."),
    }
    has_text_copy = bool(first_text(clip.get("primaryOverlayText")) or first_text(clip.get("captionDraft")))
    current_policy_suppresses_text = has_text_copy and not text_burn_policy["overlayBurnedIn"] and not text_burn_policy["captionBurnedIn"]
    export_exists = bool(export_path and os.path.exists(export_path))
    publish_notes = first_text(clip.get("publishNotes") or clip.get("notes"))
    has_metadata_only_export_proof = "metadata-only-export-v1" in publish_notes.lower()
    if export_exists and current_policy_suppresses_text and has_metadata_only_export_proof:
        text_export_freshness = {
            "status": "fresh_metadata_only_export",
            "detail": "This derivative was exported after the metadata-only text policy proof was recorded. Continue normal visual/listen review.",
        }
    elif export_exists and current_policy_suppresses_text:
        text_export_freshness = {
            "status": "verify_no_burned_text_or_reexport",
            "detail": "An exported derivative exists, but current policy keeps this text metadata-only. Visually verify the export has no old burned-in face text, or re-export under the current policy.",
        }
    elif export_exists:
        text_export_freshness = {
            "status": "export_exists_matches_current_text_policy",
            "detail": "An exported derivative exists. Continue visual/listen review against the current text policy.",
        }
    else:
        text_export_freshness = {
            "status": "no_export_yet",
            "detail": "No exported derivative exists yet. The next export will use the current text burn policy.",
        }

    return {
        "index": index,
        "id": first_text(clip.get("id")),
        "title": first_text(clip.get("title") or f"Short {index}"),
        "status": status_label(clip),
        "reviewStatus": first_text(clip.get("reviewStatus") or "draft"),
        "exportStatus": first_text(clip.get("exportStatus") or ""),
        "sequenceStartTime": clip.get("sequenceStartTime") or clip.get("startTime") or 0,
        "sequenceEndTime": clip.get("sequenceEndTime") or ((clip.get("startTime") or 0) + (clip.get("duration") or 0)),
        "duration": evidence.get("recipeDuration") or clip.get("recipeDuration") or clip.get("duration") or 0,
        "exportPath": export_path,
        "lastExportedPath": export_path,
        "expectedExportPath": export_path,
        "exportUri": file_uri(export_path) if export_path and os.path.exists(export_path) else "",
        "exportExists": export_exists,
        "lastExportExists": export_exists,
        "contactSheetPath": contact_sheet_path,
        "contactSheetUri": file_uri(contact_sheet_path) if contact_sheet_path and os.path.exists(contact_sheet_path) else "",
        "missingSteps": missing,
        "hookText": first_text(clip.get("hookText")),
        "overlayText": first_text(clip.get("primaryOverlayText")),
        "captionDraft": first_text(clip.get("captionDraft")),
        "transcriptExcerpt": first_text(transcript.get("excerpt") or transcript.get("text") or ""),
        "textBurnSummary": text_burn_policy,
        "textBurnPolicy": text_burn_policy,
        "textExportFreshness": text_export_freshness,
        "textExportFreshnessProof": {
            "metadataOnlyExportProofPresent": has_metadata_only_export_proof,
        },
        "commands": {
            "select": command_for(clip, "select"),
            "preview": command_for(clip, "preview"),
            "markListened": command_for(clip, "listen"),
            "textReview": command_for(clip, "text"),
            "refine": command_for(clip, "refine"),
            "keep": command_for(clip, "keep"),
            "reject": command_for(clip, "reject"),
            "contactSheet": command_for(clip, "contact"),
            "audioSanity": command_for(clip, "audio"),
        },
    }


def render_html(manifest: dict[str, Any]) -> str:
    clips = manifest["clips"]
    cards = []
    for clip in clips:
        title = html.escape(clip["title"])
        status = html.escape(clip["status"])
        export_notice = (
            f'<video controls preload="metadata" src="{html.escape(clip["exportUri"])}"></video>'
            if clip["exportUri"]
            else '<div class="missing">No exported derivative found.</div>'
        )
        contact = (
            f'<img class="sheet" src="{html.escape(clip["contactSheetUri"])}" alt="Contact sheet for {title}">'
            if clip["contactSheetUri"]
            else '<div class="missing">No contact sheet image found.</div>'
        )
        missing = " · ".join(html.escape(first_text(step)) for step in clip["missingSteps"]) or "none"
        transcript = html.escape(clip["transcriptExcerpt"] or "No overlapping transcript excerpt yet.")
        hook = html.escape(clip["hookText"] or "No hook text yet.")
        overlay = html.escape(clip["overlayText"] or "No overlay text yet.")
        caption = html.escape(clip["captionDraft"] or "No caption draft yet.")
        burn = clip["textBurnSummary"]
        freshness = clip["textExportFreshness"]
        command_blocks = []
        for label, command in clip["commands"].items():
            if not command:
                continue
            escaped_command = html.escape(command)
            data_command = html.escape(command, quote=True)
            command_blocks.append(
                f'<button class="copy" data-command="{data_command}">Copy {html.escape(label)}</button>'
                f'<code>{escaped_command}</code>'
            )
        cards.append(
            f"""
            <article class="card" data-status="{html.escape(clip['status'])}">
              <header>
                <p class="eyebrow">#{clip['index']:02d} · {status}</p>
                <h2>{title}</h2>
                <p class="meta">{clip['sequenceStartTime']:.2f}s -> {clip['sequenceEndTime']:.2f}s · {clip['duration']:.2f}s · missing: {missing}</p>
              </header>
              <section class="media-grid">
                <div>
                  <h3>Listen / watch derivative</h3>
                  {export_notice}
                </div>
                <div>
                  <h3>Visual proof</h3>
                  {contact}
                </div>
              </section>
              <section class="review">
                <h3>Listen-through checklist</h3>
                <ul>
                  <li>Does the first second make sense, or does it need a lead-in?</li>
                  <li>Any clipped words, awkward jump, silence, sync issue, or audio glitch?</li>
                  <li>Run audio sanity first when available; it catches silence/no-audio/clipping risk but does not replace listening.</li>
                  <li>Does the ending land cleanly?</li>
                  <li>Does the crop/framing still feel good with sound on?</li>
                  <li>What one note would make the next pass faster?</li>
                </ul>
              </section>
              <section class="copy-fields">
                <p><strong>Hook:</strong> {hook}</p>
                <p><strong>Overlay:</strong> {overlay}</p>
                <p><strong>Caption draft:</strong> {caption}</p>
                <p><strong>Transcript:</strong> {transcript}</p>
                <p><strong>Text burn:</strong> overlay={html.escape(burn['overlayDirective'])}, caption={html.escape(burn['captionDirective'])}, captionBurnedIn={burn['captionBurnedIn']}, overlayBurnedIn={burn['overlayBurnedIn']}</p>
                <p><strong>Export freshness:</strong> {html.escape(freshness['status'])}. {html.escape(freshness['detail'])}</p>
                <p><strong>Face-safe rule:</strong> {html.escape(burn['safeRailRule'])}</p>
                <p><strong>Text policy:</strong> {html.escape(burn['policy'])}</p>
              </section>
              <section class="commands">
                <h3>Safe commands</h3>
                {' '.join(command_blocks)}
              </section>
            </article>
            """
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(manifest['title'])}</title>
  <style>
    :root {{
      --soil: #35291e;
      --bark: #574536;
      --moss: #4f6f46;
      --sage: #dfe8d5;
      --cream: #fff8ea;
      --honey: #d39b32;
      --clay: #b75b45;
      --ink: #221914;
      --line: rgba(53, 41, 30, 0.18);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Avenir Next, ui-sans-serif, system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(211, 155, 50, .25), transparent 34rem),
        linear-gradient(140deg, #fff8ea, #edf5e7 50%, #f8ead8);
    }}
    main {{ width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0 64px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 28px;
      background: rgba(255, 248, 234, .76);
      box-shadow: 0 18px 50px rgba(53, 41, 30, .10);
      position: sticky;
      top: 16px;
      z-index: 3;
      backdrop-filter: blur(16px);
    }}
    .eyebrow {{ color: var(--honey); text-transform: uppercase; letter-spacing: .18em; font-weight: 800; font-size: 12px; }}
    h1 {{ margin: 0; font-family: Georgia, serif; font-size: clamp(36px, 6vw, 72px); line-height: .92; color: var(--soil); }}
    .summary {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }}
    .pill {{ border-radius: 999px; padding: 8px 12px; background: var(--sage); font-weight: 800; color: var(--moss); }}
    .card {{
      margin-top: 24px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255, 255, 247, .86);
      box-shadow: 0 10px 32px rgba(53, 41, 30, .10);
      padding: 22px;
    }}
    .card h2 {{ margin: 0; font-family: Georgia, serif; font-size: 32px; color: var(--soil); }}
    .meta {{ color: var(--bark); font-weight: 650; }}
    .media-grid {{ display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(260px, 1.2fr); gap: 18px; align-items: start; }}
    video, .sheet, .missing {{
      width: 100%;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #1d1916;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
    }}
    video {{ max-height: 560px; }}
    .sheet {{ background: var(--cream); }}
    .missing {{ min-height: 220px; display: grid; place-items: center; color: var(--cream); }}
    .review, .copy-fields, .commands {{
      margin-top: 16px;
      border-top: 1px solid var(--line);
      padding-top: 16px;
    }}
    .commands {{ display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }}
    code {{
      display: block;
      overflow-x: auto;
      background: #211914;
      color: #ffe7ba;
      border-radius: 12px;
      padding: 9px 10px;
      font-size: 12px;
    }}
    button.copy {{
      border: 0;
      border-radius: 999px;
      padding: 9px 12px;
      background: var(--soil);
      color: var(--cream);
      font-weight: 800;
      cursor: pointer;
    }}
    button.copy:hover {{ background: var(--moss); }}
    @media (max-width: 860px) {{
      .hero {{ position: static; }}
      .media-grid {{ grid-template-columns: 1fr; }}
      .commands {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio review packet</p>
      <h1>{html.escape(manifest['title'])}</h1>
      <p>{html.escape(manifest['truth'])}</p>
      <div class="summary">
        <span class="pill">{manifest['counts']['total']} shorts</span>
        <span class="pill">{manifest['counts']['needsListenThrough']} need listen-through</span>
        <span class="pill">{manifest['counts']['needsRefinement']} need refinement</span>
        <span class="pill">{manifest['counts']['needsTextReview']} need copy review</span>
      </div>
    </section>
    {''.join(cards)}
  </main>
  <script>
    document.querySelectorAll('button.copy').forEach(button => {{
      button.addEventListener('click', async () => {{
        const command = button.dataset.command || '';
        await navigator.clipboard.writeText(command);
        const old = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => button.textContent = old, 900);
      }});
    }});
  </script>
</body>
</html>
"""


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        usage()
        return 2

    input_path = Path(argv[1])
    output_dir = Path(argv[2]).expanduser()
    basename = safe_filename(argv[3] if len(argv) > 3 else "short-listen-review")
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    clips = [clip_payload(clip, index + 1) for index, clip in enumerate(payload.get("clips") or [])]

    def missing_count(step_id: str) -> int:
        return sum(1 for clip in clips if step_id in clip["missingSteps"])

    def clip_needs_any(*step_ids: str) -> int:
        wanted = set(step_ids)
        return sum(1 for clip in clips if wanted.intersection(clip["missingSteps"]))

    def clip_is_refinement(clip: dict[str, Any]) -> bool:
        return clip["reviewStatus"] == "refine" or clip["status"] == "needs refinement"

    manifest = {
        "model": "quipsly-short-listen-review-packet",
        "version": "2026-06-19.short-listen-review-packet.v1",
        "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "title": "Episode 1 shorts listen-through review",
        "sourceModel": payload.get("model"),
        "counts": {
            "total": len(clips),
            "needsListenThrough": sum(
                1 for clip in clips
                if "listen-through" in clip["missingSteps"] and not clip_is_refinement(clip)
            ),
            "needsListenThroughIncludingRefine": missing_count("listen-through"),
            "needsRefinement": sum(1 for clip in clips if clip_is_refinement(clip)),
            "needsTextReview": clip_needs_any("caption-copy", "hook-platform-copy"),
        },
        "clips": clips,
        "truth": "This packet is for listening, visual sanity, notes, and command copying. It does not mutate Quipsly state or approve publication by itself.",
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / f"{basename}.json"
    html_path = output_dir / f"{basename}.html"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    html_path.write_text(render_html(manifest), encoding="utf-8")
    print(json.dumps({
        "status": "generated",
        "htmlPath": str(html_path),
        "manifestPath": str(manifest_path),
        "jsonPath": str(manifest_path),
        "clipCount": len(clips),
        "counts": manifest["counts"],
        "needsListenThrough": manifest["counts"]["needsListenThrough"],
        "truth": manifest["truth"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
