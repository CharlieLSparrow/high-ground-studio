#!/usr/bin/env python3
"""Build a read-only Studio360 proof-render review desk.

This turns the proof-render ledger into a human/agent review surface. It does
not render, repair, export full masters, upload, publish, overwrite, delete, or
mutate source media.
"""

from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.proof-review-desk.v1"
LATEST_POINTER = "latest-360-proof-review-desk.json"
MIN_USEFUL_PROOF_REVIEW_SECONDS = 3.0


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-proof-review-desk")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path: str) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except Exception:
        return ""


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def safe_counts(payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts")
    return counts if isinstance(counts, dict) else {}


def media_summary(entry: dict[str, Any]) -> dict[str, Any]:
    paths = entry.get("paths") if isinstance(entry.get("paths"), dict) else {}
    candidate = entry.get("candidate") if isinstance(entry.get("candidate"), dict) else {}
    ffprobe = entry.get("ffprobe") if isinstance(entry.get("ffprobe"), dict) else {}
    output = str(paths.get("proofOutputPath") or paths.get("outputPath") or "")
    path = Path(output)
    streams = ffprobe.get("streams") if isinstance(ffprobe.get("streams"), list) else []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    format_payload = ffprobe.get("format") if isinstance(ffprobe.get("format"), dict) else {}
    compact_duration = ffprobe.get("durationSeconds")
    compact_width = ffprobe.get("width")
    compact_height = ffprobe.get("height")
    compact_video_codec = ffprobe.get("videoCodec")
    compact_audio_codec = "audio-present" if ffprobe.get("audio") else ""
    duration = float(format_payload.get("duration") or compact_duration or 0)
    width = video_stream.get("width") or compact_width or ""
    height = video_stream.get("height") or compact_height or ""
    audio_codec = audio_stream.get("codec_name") or compact_audio_codec or ""
    flags: list[str] = []
    if not path.exists():
        flags.append("missing-proof-output")
    if duration <= 0:
        flags.append("missing-duration")
    if 0 < duration < MIN_USEFUL_PROOF_REVIEW_SECONDS:
        flags.append("proof-too-short")
    if not width or not height:
        flags.append("missing-frame-size")
    if not audio_codec:
        flags.append("audio-needs-check")
    recommended_decision = "review-proof-before-full-render"
    full_render_gate = "blocked-until-proof-reviewed"
    if "proof-too-short" in flags:
        recommended_decision = "needs-longer-proof-before-full-render"
        full_render_gate = "blocked-proof-too-short"
    return {
        "entryId": entry.get("entryId") or "",
        "status": entry.get("status") or "",
        "candidateId": candidate.get("candidateId") or "",
        "recipeId": candidate.get("recipeId") or "",
        "groupKey": candidate.get("groupKey") or "",
        "aspect": candidate.get("aspect") or "unknown",
        "version": candidate.get("version") or "",
        "outputPath": output,
        "outputExists": path.exists(),
        "outputBytes": path.stat().st_size if path.exists() else 0,
        "durationSeconds": duration,
        "videoCodec": video_stream.get("codec_name") or compact_video_codec or "",
        "width": width,
        "height": height,
        "audioCodec": audio_codec,
        "audioPresent": bool(audio_codec),
        "reviewStatus": "needs-human-proof-review",
        "recommendedDecision": recommended_decision,
        "fullRenderGate": full_render_gate,
        "reviewFlags": flags,
        "reviewFlagSummary": ", ".join(flags) if flags else "proof-file-readable",
        "reviewChecklist": [
            "Subject placement works for the requested aspect ratio.",
            "Horizon/roll is level enough or intentionally stylized.",
            "Crop does not cut off faces, captions, or key action.",
            "Camera motion feels calm, not seasick.",
            "Audio is present or intentionally silent.",
        ],
        "openCommand": f"open {shell_quote(output)}" if output else "",
        "reviewCommand": f"open {shell_quote(str(entry.get('htmlPath') or entry.get('jsonPath') or output))}",
        "fileUri": file_uri(output),
        "htmlPath": entry.get("htmlPath") or "",
        "jsonPath": entry.get("jsonPath") or "",
        "nextSafestAction": entry.get("nextSafestAction") or "Open proof output and inspect framing/audio before any full render.",
    }


def build_packet(root: Path) -> dict[str, Any]:
    ledger_pointer = load_json(root / "latest-360-proof-render-ledger.json")
    ledger_path = Path(str(ledger_pointer.get("jsonPath") or root / "ProofRenders" / "proof-render-ledger.json"))
    ledger = load_json(ledger_path)
    entries = [entry for entry in ledger.get("entries") or [] if isinstance(entry, dict)]
    rows = [media_summary(entry) for entry in entries]
    rows.sort(key=lambda row: (str(row.get("aspect")), str(row.get("candidateId")), str(row.get("version")), str(row.get("outputPath"))))
    counts = {
        "entries": len(rows),
        "outputsPresent": sum(1 for row in rows if row.get("outputExists")),
        "outputsMissing": sum(1 for row in rows if not row.get("outputExists")),
        "needsHumanProofReview": sum(1 for row in rows if row.get("reviewStatus") == "needs-human-proof-review"),
        "blockedUntilProofReviewed": sum(1 for row in rows if row.get("fullRenderGate") == "blocked-until-proof-reviewed"),
        "tooShortProofs": sum(1 for row in rows if "proof-too-short" in (row.get("reviewFlags") or [])),
        "minimumUsefulProofReviewSeconds": MIN_USEFUL_PROOF_REVIEW_SECONDS,
        "audioPresent": sum(1 for row in rows if row.get("audioPresent")),
        "audioNeedsCheck": sum(1 for row in rows if "audio-needs-check" in (row.get("reviewFlags") or [])),
        "rowsWithReviewFlags": sum(1 for row in rows if row.get("reviewFlags")),
        "aspects": safe_counts(ledger).get("aspects") or {},
        "statuses": safe_counts(ledger).get("statuses") or {},
        "originalsMutated": False,
        "externalPublishing": False,
        "fullRenderCreated": False,
        "versionOverwritten": False,
    }
    first = rows[0] if rows else {}
    status = "proof-review-ready" if rows and counts["outputsMissing"] == 0 else "proof-review-needs-output" if rows else "needs-proof-render"
    first_candidate = {
        "candidateId": first.get("candidateId") or first.get("recipeId") or "",
        "recipeId": first.get("recipeId") or "",
        "groupKey": first.get("groupKey") or "",
        "aspect": first.get("aspect") or "",
        "version": first.get("version") or "",
        "status": first.get("status") or "",
        "outputPath": first.get("outputPath") or "",
        "outputExists": first.get("outputExists") or False,
        "openCommand": first.get("openCommand") or "",
        "durationSeconds": first.get("durationSeconds") or 0,
        "frame": f"{first.get('width') or ''}x{first.get('height') or ''}".strip("x"),
        "humanReviewAsk": "Open this proof output and classify framing, horizon, crop, motion, and audio before any full render.",
        "agentSafeParallelWork": "Summarize proof metadata, compare proof outputs, and prepare review packets. Do not render full masters, mutate originals, or publish.",
    } if first else {}
    review_classification_options = [
        "useful-proof",
        "needs-reframe",
        "wrong-source",
        "audio-issue",
        "too-short",
        "blocked",
        "promote-candidate-after-human-review",
    ]
    first_review_note_template = {
        "title": "Studio360 proof review note",
        "candidateId": first_candidate.get("candidateId") if first_candidate else "",
        "groupKey": first_candidate.get("groupKey") if first_candidate else "",
        "aspect": first_candidate.get("aspect") if first_candidate else "",
        "outputPath": first_candidate.get("outputPath") if first_candidate else "",
        "classificationOptions": review_classification_options,
        "copyPasteMarkdown": (
            "## Studio360 proof review note\n\n"
            f"- Candidate: {first_candidate.get('candidateId') if first_candidate else ''}\n"
            f"- Group: {first_candidate.get('groupKey') if first_candidate else ''}\n"
            f"- Aspect: {first_candidate.get('aspect') if first_candidate else ''}\n"
            f"- Proof output: {first_candidate.get('outputPath') if first_candidate else ''}\n"
            "- Classification: <choose one: useful-proof | needs-reframe | wrong-source | audio-issue | too-short | blocked | promote-candidate-after-human-review>\n"
            "- Framing/horizon/crop notes:\n"
            "- Motion comfort notes:\n"
            "- Audio notes:\n"
            "- Follow-up for Codex:\n"
            "- Follow-up for Charlie/Mako/Homer:\n"
            "- Explicit non-claims: not a full render approval, not published, not uploaded, not scheduled, no receipt truth, originals untouched.\n"
        ),
        "truth": "Review note template only. It does not write review state, render, upload, publish, approve full exports, overwrite, delete, or mutate originals.",
    }
    proof_review_recipe = [
        {
            "label": "1. Open first proof output",
            "command": first.get("openCommand") or "",
            "why": "A 10-second proof is the evidence gate before full export.",
            "safety": "Opens local proof media only.",
        },
        {
            "label": "2. Inspect image and motion",
            "command": "",
            "why": "Check subject placement, horizon, crop, motion comfort, and whether 16:9 or 9:16 framing feels useful.",
            "safety": "Review instruction only.",
        },
        {
            "label": "3. Inspect audio",
            "command": "",
            "why": "Confirm the proof has expected audio or intentionally no audio before promoting any render path.",
            "safety": "Review instruction only.",
        },
        {
            "label": "4. Classify the proof",
            "command": "",
            "why": "Use useful, needs-reframe, blocked, or promote-to-full-render as review language.",
            "safety": "Review state only. No full render, upload, publication, or source mutation.",
        },
    ]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "ledgerPath": str(ledger_path),
        "status": status,
        "counts": counts,
        "rows": rows,
        "truth": "Studio360 proof review only. It opens local proof derivatives and receipts; it does not render, upload, publish, overwrite, delete, create full exports, or mutate originals.",
        "humanAsk": "Open the first proof output, inspect framing/horizon/crop/motion/audio, and classify the proof before any full render.",
        "agentSafeParallelWork": "Prepare proof summaries, compare proof outputs, and update local review packets only. Do not render full masters, mutate originals, upload, publish, or overwrite versions.",
        "firstProofCandidate": first_candidate,
        "reviewClassificationOptions": review_classification_options,
        "firstReviewNoteTemplate": first_review_note_template,
        "proofReviewRecipe": proof_review_recipe,
        "selectedGroups": sorted({str(row.get("groupKey") or "") for row in rows if row.get("groupKey")}),
        "selectedAspects": sorted({str(row.get("aspect") or "") for row in rows if row.get("aspect")}),
        "nextSafestAction": "Open each proof output, inspect 16:9/9:16 framing and audio, then promote only reviewed renderer paths.",
        "firstSafeAction": {
            "label": "Open first Studio360 proof output" if first else "Open Studio360 proof ledger",
            "command": first.get("openCommand") or f"open {shell_quote(str(ledger_path))}",
            "path": first.get("outputPath") or str(ledger_path),
            "safety": "Opens local proof output or ledger only. No source media or external platform is changed.",
        },
        "safety": {
            "externalPublishing": False,
            "fullRenderCreated": False,
            "originalsMutated": False,
            "versionOverwritten": False,
        },
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["aspect", "candidateId", "recipeId", "groupKey", "version", "status", "reviewStatus", "recommendedDecision", "fullRenderGate", "reviewFlagSummary", "outputExists", "durationSeconds", "width", "height", "videoCodec", "audioCodec", "audioPresent", "outputPath", "openCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Studio360 proof review desk",
        "",
        packet["truth"],
        "",
        f"- Status: `{packet['status']}`",
        f"- Proof outputs present: `{packet['counts']['outputsPresent']}/{packet['counts']['entries']}`",
        f"- Too-short proofs: `{packet['counts']['tooShortProofs']}` below `{packet['counts']['minimumUsefulProofReviewSeconds']}` seconds",
        f"- Next safe action: {packet['nextSafestAction']}",
        f"- Human ask: {packet.get('humanAsk')}",
        "",
        "## Proof review recipe",
        "",
    ]
    for step in packet.get("proofReviewRecipe") or []:
        lines += [
            f"### {step.get('label')}",
            f"- Why: {step.get('why')}",
            f"- Command: `{step.get('command') or ''}`",
            f"- Safety: {step.get('safety')}",
            "",
        ]
    if packet.get("firstReviewNoteTemplate"):
        template = packet["firstReviewNoteTemplate"]
        lines += [
            "## Copyable first proof review note",
            "",
            template.get("truth") or "",
            "",
            "```markdown",
            template.get("copyPasteMarkdown") or "",
            "```",
            "",
        ]
    lines += [
        "## Proof outputs",
        "",
    ]
    for row in packet.get("rows") or []:
        lines += [
            f"### {row.get('aspect')} - {row.get('candidateId') or row.get('recipeId')}",
            "",
            f"- Output exists: `{row.get('outputExists')}`",
            f"- Review status: `{row.get('reviewStatus')}`",
            f"- Full render gate: `{row.get('fullRenderGate')}`",
            f"- Review flags: `{row.get('reviewFlagSummary')}`",
            f"- Duration: `{row.get('durationSeconds')}`",
            f"- Frame: `{row.get('width')}x{row.get('height')}`",
            "",
            "```bash",
            str(row.get("openCommand") or ""),
            "```",
            "",
        ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    rows = []
    for row in packet.get("rows") or []:
        media = f'<video controls src="{esc(row.get("fileUri"))}"></video>' if row.get("fileUri") else "<p>No local output path.</p>"
        rows.append(f"""
        <article class="card">
          <div class="head">
            <div>
              <p class="eyebrow">{esc(row.get('aspect'))}</p>
              <h2>{esc(row.get('candidateId') or row.get('recipeId') or row.get('groupKey'))}</h2>
            </div>
            <span>{esc(row.get('status'))}</span>
          </div>
          {media}
          <p>{esc(row.get('durationSeconds'))}s · {esc(row.get('width'))}x{esc(row.get('height'))} · {esc(row.get('videoCodec'))}/{esc(row.get('audioCodec'))}</p>
          <p><strong>{esc(row.get('reviewStatus'))}</strong> · {esc(row.get('fullRenderGate'))} · {esc(row.get('reviewFlagSummary'))}</p>
          <code>{esc(row.get('openCommand'))}</code>
          <p class="safety">{esc(row.get('nextSafestAction'))}</p>
        </article>
        """)
    counts = packet["counts"]
    review_template = packet.get("firstReviewNoteTemplate") if isinstance(packet.get("firstReviewNoteTemplate"), dict) else {}
    review_template_html = ""
    if review_template:
        review_template_html = f"""
    <details open>
      <summary>Copyable first proof review note</summary>
      <p>{esc(review_template.get('truth'))}</p>
      <code>{esc(review_template.get('copyPasteMarkdown'))}</code>
    </details>
        """
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Studio360 proof review</title>
<style>
:root {{ color-scheme:dark; --bg:#101711; --panel:#1b271f; --ink:#fff4db; --muted:#c9b99b; --honey:#f1c85b; --moss:#91b874; --line:rgba(255,244,219,.15); --creek:#75cdd8; }}
body {{ margin:0; font-family:Avenir Next, ui-sans-serif, system-ui, sans-serif; background:radial-gradient(circle at 10% 0%, rgba(145,184,116,.22), transparent 30rem), var(--bg); color:var(--ink); }}
main {{ max-width:1280px; margin:0 auto; padding:38px 22px 70px; }}
.hero,.card {{ border:1px solid var(--line); border-radius:26px; background:linear-gradient(180deg,rgba(27,39,31,.95),rgba(8,13,10,.98)); box-shadow:0 22px 70px rgba(0,0,0,.28); }}
.hero {{ padding:28px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:18px; margin-top:22px; }}
.card {{ padding:18px; }}
.head {{ display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }}
.eyebrow {{ margin:0 0 6px; color:var(--honey); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; }}
h1 {{ margin:0; font-size:clamp(38px,6vw,74px); line-height:.92; }}
h2 {{ margin:0; }}
p {{ color:var(--muted); line-height:1.5; }}
video {{ width:100%; max-height:360px; border-radius:18px; background:#050705; margin-top:12px; }}
code {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.35); color:var(--creek); border-radius:14px; padding:12px; }}
.metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }}
.metrics span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:var(--moss); font-weight:800; }}
.safety {{ font-size:12px; }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio360</p>
    <h1>Proof renders before full renders.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safe action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="metrics">
      <span>{esc(packet.get('status'))}</span>
      <span>{counts.get('outputsPresent')}/{counts.get('entries')} outputs present</span>
      <span>{counts.get('tooShortProofs')} too short</span>
      <span>{esc(counts.get('aspects'))}</span>
    </div>
    {review_template_html}
  </section>
  <section class="grid">{''.join(rows)}</section>
</main>
</body>
</html>
""", encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Build a read-only Studio360 proof review desk.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.studio360_root)
    packet = build_packet(root)
    out_dir = root / "ProofReviewDesk" / stamp()
    out_dir.mkdir(parents=True, exist_ok=False)
    json_path = out_dir / "studio360-proof-review-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-studio360-proof-review-desk.md"
    csv_path = out_dir / "studio360-proof-review-desk.csv"
    first_proof_output_action = packet.get("firstSafeAction") or {}
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Studio360 proof review desk",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens the local Studio360 proof review desk only. No render, upload, publication, overwrite, delete, full export, or original source mutation occurs.",
        },
        "firstProofOutputAction": first_proof_output_action,
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet.get("rows") or [])
    write_html(html_path, packet)
    pointer = {**packet}
    pointer.pop("rows", None)
    write_json(root / LATEST_POINTER, pointer)
    print(json.dumps({
        "status": packet["status"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "nextSafestAction": packet["nextSafestAction"],
        "safety": packet["safety"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
