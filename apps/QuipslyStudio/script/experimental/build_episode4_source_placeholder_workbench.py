#!/usr/bin/env python3
"""Build an Episode 4 source-placeholder workbench.

This workbench turns source-missing clip-weave intent into a focused review
surface. It explains where the watched/source clip belongs, why it was proposed,
what J/L-cut behavior is intended, what evidence/audio can help identify the
missing clip, and what remains safe while the clip is missing.

Safety boundary: sidecar review artifacts only. This command never imports
clips, writes timeline/session state, creates shorts, renders exports, publishes,
uploads, deletes, overwrites previous versions, or mutates source media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
APPLY_POINTER = RELEASE_ROOT / "review-board/episode4-apply-preview/latest-episode4-apply-preview.json"
CUE_REVIEW_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-cue-review/latest-episode4-source-clip-cue-review.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-source-placeholder-workbench"
LATEST_POINTER = OUT_ROOT / "latest-episode4-source-placeholder-workbench.json"
SCHEMA = "quipsly.episode4-source-placeholder-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-source-placeholder-workbench")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = pointer.get("jsonPath")
    if isinstance(target, str) and target:
        payload = load_json(Path(target))
        if payload:
            return {**pointer, **payload, "pointerPath": str(path)}
    return {**pointer, "pointerPath": str(path)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def truth() -> dict[str, Any]:
    return {
        "sidecarReviewArtifactsOnly": True,
        "sourceFilesReadOnly": True,
        "sourceFilesMutated": False,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "finalExportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def cue_review_lookup(cue_review: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for item in dict_list(cue_review.get("reviewItems")):
        cue_id = str(item.get("cueId") or "")
        if cue_id:
            lookup[cue_id] = item
    return lookup


def placeholder_operations(apply_preview: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for operation in dict_list(apply_preview.get("operations")):
        if operation.get("operationKind") == "clip-weave-source-placeholder" or operation.get("operationStatus") == "source-placeholder":
            rows.append(operation)
    return rows


def workbench_item(operation: dict[str, Any], cue_review_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    preview = operation.get("previewOperation") if isinstance(operation.get("previewOperation"), dict) else {}
    recovery = operation.get("sourceRecovery") if isinstance(operation.get("sourceRecovery"), dict) else {}
    cue_id = str(recovery.get("cueId") or preview.get("cueId") or "")
    cue_review = cue_review_by_id.get(cue_id, {})
    audio = cue_review.get("audioReviewClip") if isinstance(cue_review.get("audioReviewClip"), dict) else {}
    contexts = dict_list(cue_review.get("contexts"))
    return {
        "id": f"source-placeholder-{operation.get('proposalId') or cue_id or 'unknown'}",
        "proposalId": operation.get("proposalId"),
        "cueId": cue_id,
        "status": "source-placeholder-review-ready",
        "timeLabel": operation.get("timeLabel") or cue_review.get("reviewWindowLabel"),
        "sequenceStartSeconds": operation.get("startSeconds") or preview.get("sequenceStartSeconds"),
        "sequenceEndSeconds": operation.get("endSeconds") or preview.get("sequenceEndSeconds"),
        "intent": operation.get("intent"),
        "explanation": operation.get("explanation"),
        "tradeoff": operation.get("tradeoff"),
        "jCutHint": preview.get("jCutHint"),
        "lCutHint": preview.get("lCutHint"),
        "reviewNotes": operation.get("reviewNotes"),
        "reviewNextAction": operation.get("reviewNextAction"),
        "canContinueMainEpisodeEdit": bool(operation.get("canContinueMainEpisodeEdit")),
        "canWriteRealClipInsert": bool(operation.get("canWriteRealClipInsert")),
        "sourceRecovery": recovery,
        "suggestedFilename": recovery.get("suggestedFilename") or f"{cue_id}-short-description.mp4",
        "dropbox": recovery.get("dropbox"),
        "humanInstruction": recovery.get("humanInstruction"),
        "cueReview": {
            "status": cue_review.get("status") or "missing-cue-review",
            "confidence": cue_review.get("confidence"),
            "cueType": cue_review.get("cueType"),
            "reviewWindowLabel": cue_review.get("reviewWindowLabel"),
            "audioReviewClipPath": audio.get("path") if audio.get("ok") else "",
            "audioReviewClipError": "" if audio.get("ok") else audio.get("error") or "audio review clip missing",
            "sourceAudioPath": cue_review.get("sourceAudioPath"),
            "contexts": contexts[:5],
        },
        "reviewChecklist": [
            "Listen to the cue-review audio window and identify the watched/source clip.",
            "Drop or copy the found clip into the Episode 4 watched/source clip dropbox with the cue ID in the filename.",
            "Rerun source clip intake and apply preview; do not write real clip-weave metadata until a cue match exists.",
            "After the source is matched, inspect whether the J-cut/L-cut hints preserve the podcast cadence.",
        ],
        "safeNow": [
            "Continue shaping Episode 4 host-camera and audio decisions around this marked source moment.",
            "Keep the missing clip visible as a placeholder so reviewers know exactly what must be recovered.",
            "Prepare shorts or cadence notes that do not depend on pretending this clip exists.",
        ],
        "notAllowedYet": [
            "Do not create a real source clip insert.",
            "Do not export a final version that implies this watched/source clip was included.",
            "Do not substitute nearby host-camera media and call it the watched clip.",
        ],
    }


def next_action(items: list[dict[str, Any]]) -> str:
    if not items:
        return "No source placeholders are active. Continue review or rebuild apply preview after source intake changes."
    first = items[0]
    cue_id = first.get("cueId") or "the next cue"
    filename = first.get("suggestedFilename") or "ep4-cue-###-short-description.mp4"
    return f"Recover {cue_id}: find the watched/source clip, copy it as {filename}, then rerun source intake and apply preview."


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    apply_preview = load_pointer(Path(args.apply_pointer))
    cue_review = load_pointer(Path(args.cue_review_pointer))
    items = [workbench_item(operation, cue_review_lookup(cue_review)) for operation in placeholder_operations(apply_preview)]
    counts = {
        "sourcePlaceholders": len(items),
        "withAudioReviewClip": sum(1 for item in items if item.get("cueReview", {}).get("audioReviewClipPath")),
        "canContinueMainEpisodeEdit": sum(1 for item in items if item.get("canContinueMainEpisodeEdit")),
        "canWriteRealClipInsert": sum(1 for item in items if item.get("canWriteRealClipInsert")),
    }
    session_dir = Path(args.out_root) / stamp()
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-source-placeholder-workbench-ready" if items else "episode4-source-placeholder-workbench-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "applyPreviewPointer": str(args.apply_pointer),
        "cueReviewPointer": str(args.cue_review_pointer),
        "counts": counts,
        "items": items,
        "nextSafestAction": next_action(items),
        "truth": truth(),
    }
    write_surfaces(session_dir, packet, Path(args.latest_pointer))
    return packet


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 source-placeholder workbench",
        "",
        f"Status: `{packet.get('status')}`",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        "This is a review surface for missing watched/source clips. It does not write timeline metadata.",
        "",
        f"Next: {packet.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in (packet.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    for index, item in enumerate(packet.get("items") or [], 1):
        cue = item.get("cueReview") if isinstance(item.get("cueReview"), dict) else {}
        lines += [
            "",
            f"## {index}. {item.get('cueId')} · {item.get('timeLabel')}",
            "",
            f"- Proposal: `{item.get('proposalId')}`",
            f"- Status: `{item.get('status')}`",
            f"- Intent: {item.get('intent')}",
            f"- Explanation: {item.get('explanation')}",
            f"- Tradeoff: {item.get('tradeoff')}",
            f"- J-cut hint: {item.get('jCutHint')}",
            f"- L-cut hint: {item.get('lCutHint')}",
            f"- Suggested filename: `{item.get('suggestedFilename')}`",
            f"- Dropbox: `{item.get('dropbox')}`",
            f"- Audio review clip: `{cue.get('audioReviewClipPath') or cue.get('audioReviewClipError')}`",
            f"- Continue main edit now: `{item.get('canContinueMainEpisodeEdit')}`",
            f"- Real clip insert allowed now: `{item.get('canWriteRealClipInsert')}`",
            "",
            "### Evidence",
        ]
        for context in cue.get("contexts") or []:
            lines.append(f"- `{context.get('timeLabel')}` {context.get('text')}")
        lines += ["", "### Safe now"]
        lines += [f"- {value}" for value in item.get("safeNow") or []]
        lines += ["", "### Not allowed yet"]
        lines += [f"- {value}" for value in item.get("notAllowedYet") or []]
    if not packet.get("items"):
        lines += ["", "No source placeholders are active."]
    return "\n".join(lines).rstrip() + "\n"


def audio_link(path: str) -> str:
    if not path:
        return ""
    return f'<audio controls preload="metadata" src="file://{esc(path)}"></audio><p><code>{esc(path)}</code></p>'


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    cards: list[str] = []
    for item in packet.get("items") or []:
        cue = item.get("cueReview") if isinstance(item.get("cueReview"), dict) else {}
        contexts = "".join(
            f"<li><code>{esc(context.get('timeLabel'))}</code> {esc(context.get('text'))}</li>"
            for context in (cue.get("contexts") or [])[:5]
            if isinstance(context, dict)
        )
        safe = "".join(f"<li>{esc(value)}</li>" for value in item.get("safeNow") or [])
        not_allowed = "".join(f"<li>{esc(value)}</li>" for value in item.get("notAllowedYet") or [])
        cards.append(f"""
        <article class="card">
          <p class="eyebrow">{esc(item.get('proposalId'))} · {esc(item.get('status'))}</p>
          <h2>{esc(item.get('cueId'))} <span>{esc(item.get('timeLabel'))}</span></h2>
          <p class="intent">{esc(item.get('intent'))}</p>
          <div class="grid">
            <section><h3>Why here</h3><p>{esc(item.get('explanation'))}</p></section>
            <section><h3>Tradeoff</h3><p>{esc(item.get('tradeoff'))}</p></section>
            <section><h3>J-cut</h3><p>{esc(item.get('jCutHint'))}</p></section>
            <section><h3>L-cut</h3><p>{esc(item.get('lCutHint'))}</p></section>
          </div>
          <section class="recovery">
            <h3>Recovery action</h3>
            <p>{esc(item.get('humanInstruction'))}</p>
            <p><strong>Suggested filename:</strong> <code>{esc(item.get('suggestedFilename'))}</code></p>
            <p><strong>Drop folder:</strong> <code>{esc(item.get('dropbox'))}</code></p>
          </section>
          <section class="audio">
            <h3>Cue audio</h3>
            {audio_link(str(cue.get('audioReviewClipPath') or '')) or f"<p>{esc(cue.get('audioReviewClipError') or 'No audio review clip available.')}</p>"}
          </section>
          <section><h3>Transcript evidence</h3><ul>{contexts}</ul></section>
          <div class="columns">
            <section><h3>Safe now</h3><ul>{safe}</ul></section>
            <section><h3>Not allowed yet</h3><ul>{not_allowed}</ul></section>
          </div>
        </article>
        """)
    if not cards:
        cards.append("<article class='card'><h2>No source placeholders active</h2><p>Review proposals or rerun apply preview after source intake changes.</p></article>")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Source Placeholder Workbench</title>
  <style>
    body {{ margin:0; background:#121812; color:#f6edcf; font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:42px 24px 72px; }}
    header,.card {{ border:1px solid rgba(240,189,79,.28); border-radius:26px; padding:24px; background:linear-gradient(135deg,rgba(34,52,37,.94),rgba(23,28,23,.98)); box-shadow:0 20px 60px rgba(0,0,0,.30); margin:16px 0; }}
    .eyebrow {{ color:#f0bd4f; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
    h1 {{ margin:0; font-family:Georgia,serif; font-size:clamp(40px,6vw,72px); line-height:.92; }}
    h2 {{ margin:.2em 0; font-family:Georgia,serif; font-size:30px; }}
    h2 span {{ color:#a9b69a; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:16px; }}
    h3 {{ color:#f0bd4f; margin-bottom:6px; }}
    p,li {{ color:#d4c9ad; line-height:1.55; }}
    code {{ color:#ffe28a; overflow-wrap:anywhere; }}
    .metrics,.columns,.grid {{ display:grid; gap:12px; }}
    .metrics {{ grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-top:18px; }}
    .grid,.columns {{ grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); }}
    .pill,section {{ border-radius:18px; background:rgba(255,255,255,.06); padding:14px; }}
    .pill strong {{ display:block; color:#f0bd4f; font-size:26px; }}
    .recovery {{ border:1px solid rgba(240,189,79,.22); background:rgba(240,189,79,.08); }}
    audio {{ width:100%; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · Episode 4</p>
    <h1>Source placeholders keep the edit moving.</h1>
    <p>This workbench shows missing watched/source clip intent without pretending the media exists. Use it to recover clips, preserve cadence, and continue the host-camera edit safely.</p>
    <div class="metrics">
      <div class="pill"><strong>{esc(counts.get('sourcePlaceholders', 0))}</strong>source placeholders</div>
      <div class="pill"><strong>{esc(counts.get('withAudioReviewClip', 0))}</strong>with cue audio</div>
      <div class="pill"><strong>{esc(counts.get('canContinueMainEpisodeEdit', 0))}</strong>can continue</div>
      <div class="pill"><strong>{esc(counts.get('canWriteRealClipInsert', 0))}</strong>real inserts allowed</div>
    </div>
    <p><strong>Next:</strong> {esc(packet.get('nextSafestAction'))}</p>
  </header>
  {''.join(cards)}
</main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, packet: dict[str, Any], latest_pointer: Path) -> None:
    json_path = session_dir / "episode4-source-placeholder-workbench.json"
    markdown_path = session_dir / "episode4-source-placeholder-workbench.md"
    html_path = session_dir / "index.html"
    packet.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_json(latest_pointer, {
        "schema": "quipsly.episode4-source-placeholder-workbench-pointer.v1",
        "generatedAt": iso_now(),
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "truth": packet.get("truth"),
    })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-pointer", default=str(APPLY_POINTER))
    parser.add_argument("--cue-review-pointer", default=str(CUE_REVIEW_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    packet = build_packet(args)
    if args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
        return
    if args.markdown:
        print(render_markdown(packet))
        return
    counts = packet.get("counts") or {}
    print(f"Episode 4 source-placeholder workbench: {packet.get('status')}")
    print(f"  Board: {packet.get('htmlPath')}")
    print(f"  Packet: {packet.get('jsonPath')}")
    print(
        "  Placeholders: "
        f"source={counts.get('sourcePlaceholders')} "
        f"audio={counts.get('withAudioReviewClip')} "
        f"continue={counts.get('canContinueMainEpisodeEdit')} "
        f"real-inserts={counts.get('canWriteRealClipInsert')}"
    )
    print(f"  Next: {packet.get('nextSafestAction')}")


if __name__ == "__main__":
    main()
