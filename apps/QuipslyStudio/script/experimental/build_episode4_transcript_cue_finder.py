#!/usr/bin/env python3
"""Build an Episode 4 transcript cue board for watched/source clip moments.

The board scans normalized Episode 4 transcript chunks for language that often
means a reference clip, watched video, source insert, b-roll, or screen moment
belongs near that sequence time. It does not import clips or mutate timeline
state; it only creates evidence to help Charlie/Codex find and place the right
media later.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
TRANSCRIPT_POINTER = RELEASE_ROOT / "review-board/transcript-full-asr/latest-episode-04-transcript-chunks.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-transcript-cues"
LATEST_POINTER = OUT_ROOT / "latest-episode4-transcript-cues.json"
SCHEMA = "quipsly.episode4-transcript-cues.v1"
EPISODE_DROP_ROOT = Path("/Volumes/My Passport/Episode 4")
WATCHED_DROP = EPISODE_DROP_ROOT / "Watched Clips"
SOURCE_DROP = EPISODE_DROP_ROOT / "Source Clips"
REFERENCE_DROP = EPISODE_DROP_ROOT / "Reference Clips"

HIGH_PHRASES = [
    "watch this",
    "watched this",
    "we watched",
    "just watched",
    "this clip",
    "that clip",
    "the clip",
    "play the clip",
    "show the clip",
    "show some clips",
    "clips in between",
    "show clips",
    "pull up",
    "bring up",
    "look at this",
    "look at that",
    "show this",
    "show that",
    "on screen",
    "b roll",
    "b-roll",
]
MEDIUM_WORDS = [
    "watch",
    "watched",
    "watching",
    "clip",
    "clips",
    "video",
    "footage",
    "screen",
    "youtube",
    "instagram",
    "reel",
    "short",
    "post",
]
VISUAL_VERBS = [
    "show",
    "showing",
    "look",
    "see",
    "saw",
]
CONTEXT_WORDS = [
    "this",
    "that",
    "these",
    "those",
    "here",
    "there",
    "now",
    "before",
    "after",
    "again",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-cues")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    whole = int(seconds)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def iter_segments(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk in manifest.get("chunks") or []:
        if not isinstance(chunk, dict):
            continue
        path = Path(str(chunk.get("normalizedTranscriptJsonPath") or ""))
        if not path.exists():
            continue
        payload = load_json(path)
        for index, segment in enumerate(payload.get("segments") or []):
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "").strip()
            if not text:
                continue
            try:
                start = float(segment.get("start") or 0.0)
                end = float(segment.get("end") or start)
            except Exception:
                continue
            rows.append({
                "segmentId": f"{chunk.get('chunkId')}-segment-{index + 1:03d}",
                "chunkId": chunk.get("chunkId"),
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "timeLabel": fmt_time(start),
                "speaker": segment.get("speaker") or "Speaker",
                "text": text,
                "transcriptPath": str(path),
            })
    return sorted(rows, key=lambda row: float(row.get("startSeconds") or 0.0))


def score_segment(segment: dict[str, Any]) -> dict[str, Any] | None:
    text = str(segment.get("text") or "")
    lower = re.sub(r"\s+", " ", text.lower()).strip()
    if not lower:
        return None

    phrase_hits = [phrase for phrase in HIGH_PHRASES if phrase in lower]
    word_hits = []
    tokens = set(re.findall(r"[a-z0-9']+", lower))
    for word in MEDIUM_WORDS:
        if word in tokens or word.replace("-", "") in tokens:
            word_hits.append(word)
    context_hits = [word for word in CONTEXT_WORDS if word in tokens]
    visual_verb_hits = [word for word in VISUAL_VERBS if word in tokens]

    if not phrase_hits and not word_hits:
        return None

    score = len(phrase_hits) * 4 + len(set(word_hits)) * 1.25 + min(2, len(context_hits)) * 0.35
    if any(word in word_hits for word in ["watch", "watched", "watching"]):
        score += 1.0
    if any(word in word_hits for word in ["clip", "clips", "video", "footage"]):
        score += 1.0
    if visual_verb_hits and any(word in word_hits for word in ["clip", "clips", "video", "footage", "screen"]):
        score += 0.75
    if phrase_hits:
        confidence = "high"
    elif score >= 3.0:
        confidence = "medium"
    else:
        confidence = "low"

    cue_type = "reference-clip-cue"
    if any(word in word_hits for word in ["youtube", "instagram", "reel", "short", "post"]):
        cue_type = "source-platform-cue"
    if any(word in word_hits for word in ["screen", "show", "showing"]):
        cue_type = "visual-insert-cue"
    if any(word in word_hits for word in ["watch", "watched", "watching"]):
        cue_type = "watched-clip-cue"

    return {
        "score": round(score, 2),
        "confidence": confidence,
        "cueType": cue_type,
        "phraseHits": phrase_hits,
        "wordHits": sorted(set(word_hits)),
        "contextHits": sorted(set(context_hits)),
        "visualVerbHits": sorted(set(visual_verb_hits)),
    }


def build_hits(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for segment in segments:
        score = score_segment(segment)
        if not score:
            continue
        start = float(segment.get("startSeconds") or 0.0)
        end = float(segment.get("endSeconds") or start)
        hit = {
            **segment,
            **score,
            "reviewStartSeconds": round(max(0.0, start - 20.0), 3),
            "reviewEndSeconds": round(end + 45.0, 3),
            "reviewWindowLabel": f"{fmt_time(max(0.0, start - 20.0))} -> {fmt_time(end + 45.0)}",
        }
        hits.append(hit)
    return sorted(hits, key=lambda row: (-float(row.get("score") or 0), float(row.get("startSeconds") or 0)))


def group_hits(hits_by_time: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for hit in sorted(hits_by_time, key=lambda row: float(row.get("startSeconds") or 0.0)):
        start = float(hit.get("startSeconds") or 0.0)
        end = float(hit.get("endSeconds") or start)
        if groups and start - float(groups[-1].get("endSeconds") or 0.0) <= 45.0:
            group = groups[-1]
            group["endSeconds"] = round(max(float(group.get("endSeconds") or 0.0), end), 3)
            group["reviewEndSeconds"] = round(max(float(group.get("reviewEndSeconds") or 0.0), float(hit.get("reviewEndSeconds") or end)), 3)
            group["hits"].append(hit)
            group["score"] = round(float(group.get("score") or 0.0) + float(hit.get("score") or 0.0), 2)
            group["confidence"] = "high" if any(row.get("confidence") == "high" for row in group["hits"]) else "medium"
            continue
        cue_id = f"ep4-cue-{len(groups) + 1:03d}"
        groups.append({
            "cueId": cue_id,
            "startSeconds": round(start, 3),
            "endSeconds": round(end, 3),
            "reviewStartSeconds": hit.get("reviewStartSeconds"),
            "reviewEndSeconds": hit.get("reviewEndSeconds"),
            "reviewWindowLabel": hit.get("reviewWindowLabel"),
            "score": hit.get("score"),
            "confidence": hit.get("confidence"),
            "cueType": hit.get("cueType"),
            "hits": [hit],
            "humanAction": (
                f"Review Episode 4 around {hit.get('reviewWindowLabel')}. If this is a watched/source clip moment, "
                f"drop the matching media into {WATCHED_DROP} or {SOURCE_DROP} and include {cue_id} or the sequence time in the filename/note."
            ),
        })
    for group in groups:
        group["hitCount"] = len(group.get("hits") or [])
        group["timeLabel"] = fmt_time(float(group.get("startSeconds") or 0.0))
        group["reviewWindowLabel"] = f"{fmt_time(float(group.get('reviewStartSeconds') or 0.0))} -> {fmt_time(float(group.get('reviewEndSeconds') or 0.0))}"
    return sorted(groups, key=lambda row: (-float(row.get("score") or 0.0), float(row.get("startSeconds") or 0.0)))


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Episode 4 transcript cue finder",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key in ["segmentsScanned", "cueHits", "cueGroups", "highConfidenceGroups", "mediumConfidenceGroups", "lowConfidenceGroups"]:
        lines.append(f"- {key}: `{counts.get(key)}`")
    lines.extend(["", "## Top cue groups", ""])
    for group in payload.get("cueGroups") or []:
        if not isinstance(group, dict):
            continue
        first_hit = (group.get("hits") or [{}])[0]
        lines.append(f"### {group.get('cueId')} · {group.get('confidence')} · {group.get('reviewWindowLabel')}")
        lines.append(f"- Type: `{group.get('cueType')}`")
        lines.append(f"- Score: `{group.get('score')}` from `{group.get('hitCount')}` hit(s)")
        lines.append(f"- Human action: {group.get('humanAction')}")
        lines.append(f"- Example: {first_hit.get('text')}")
        lines.append("")
    lines.extend(["## Drop folders", ""])
    for path in payload.get("dropFolders") or []:
        lines.append(f"- `{path}`")
    lines.extend(["", "## Truth boundary", ""])
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    for key in ["clipImportCreated", "timelineDecisionsWritten", "transcriptImported", "sourceFilesMutated", "exportsRendered", "externalPublishing"]:
        lines.append(f"- {key}: `{truth.get(key)}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    cards = []
    for group in payload.get("cueGroups") or []:
        if not isinstance(group, dict):
            continue
        hits = group.get("hits") if isinstance(group.get("hits"), list) else []
        hit_rows = "".join(
            f"<li><strong>{esc(hit.get('timeLabel'))}</strong> <span>{esc(hit.get('text'))}</span> <small>{esc(', '.join(hit.get('wordHits') or []))}</small></li>"
            for hit in hits[:4]
            if isinstance(hit, dict)
        )
        cards.append(f"""
        <article class=\"card {esc(group.get('confidence'))}\">
          <div class=\"cardtop\"><span class=\"cueid\">{esc(group.get('cueId'))}</span><span class=\"pill\">{esc(group.get('confidence'))}</span><span class=\"pill\">{esc(group.get('cueType'))}</span></div>
          <h2>{esc(group.get('reviewWindowLabel'))}</h2>
          <p class=\"action\">{esc(group.get('humanAction'))}</p>
          <ul>{hit_rows}</ul>
        </article>
        """)
    cards_html = "".join(cards) or "<p>No cue groups found in the currently completed transcript chunks.</p>"
    drop_html = "".join(f"<li><code>{esc(path)}</code></li>" for path in payload.get("dropFolders") or [])
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 transcript cues</title>
<style>
:root {{ color-scheme:dark; --bg:#0e1711; --panel:#19271d; --ink:#fff0d3; --muted:#c6b894; --line:#34523b; --leaf:#76dc86; --gold:#f1c64f; --clay:#db8159; --water:#6cc9d3; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(118,220,134,.17),transparent 28%),linear-gradient(135deg,#0b130f,#251a10 75%); color:var(--ink); }}
main {{ max-width:1200px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(25,39,29,.92); padding:22px; margin:18px 0; box-shadow:0 18px 48px rgba(0,0,0,.3); }}
h1 {{ font-size:clamp(40px,6vw,78px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.counts,.cardtop {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }}
.pill,.cueid {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.22); font-size:12px; font-weight:800; }}
.cueid {{ color:var(--gold); }}
.card.high {{ border-color:rgba(241,198,79,.75); }} .card.medium {{ border-color:rgba(108,201,211,.55); }} .card.low {{ opacity:.82; }}
.action {{ color:var(--leaf); }} li {{ margin:8px 0; }} small {{ color:var(--muted); display:block; }} code {{ color:var(--leaf); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · Episode 4 source clip map</p><h1>{esc(payload.get('status'))}</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">segments {esc(counts.get('segmentsScanned'))}</span><span class=\"pill\">hits {esc(counts.get('cueHits'))}</span><span class=\"pill\">groups {esc(counts.get('cueGroups'))}</span><span class=\"pill\">high {esc(counts.get('highConfidenceGroups'))}</span></div></header>
<section class=\"panel\"><p class=\"eyebrow\">Drop folders</p><ul>{drop_html}</ul><p>Confirmed watched clips only become episode source truth after a human/agent places or marks them explicitly. Nearby files are clues, not truth.</p></section>
<section class=\"grid\">{cards_html}</section>
</main></body></html>"""


def build(args: argparse.Namespace) -> dict[str, Any]:
    manifest = load_pointer(Path(args.transcript_pointer))
    segments = iter_segments(manifest)
    hits = build_hits(segments)
    groups = group_hits(sorted(hits, key=lambda row: float(row.get("startSeconds") or 0.0)))[: args.limit]
    out_dir = OUT_ROOT / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "segmentsScanned": len(segments),
        "cueHits": len(hits),
        "cueGroups": len(groups),
        "highConfidenceGroups": sum(1 for group in groups if group.get("confidence") == "high"),
        "mediumConfidenceGroups": sum(1 for group in groups if group.get("confidence") == "medium"),
        "lowConfidenceGroups": sum(1 for group in groups if group.get("confidence") == "low"),
    }
    status = "episode4-transcript-cues-ready" if groups else "episode4-transcript-cues-empty"
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "transcriptPointer": str(args.transcript_pointer),
        "transcriptManifestPath": manifest.get("jsonPath") or "",
        "transcriptStatus": manifest.get("status") or "unknown",
        "counts": counts,
        "cueGroups": groups,
        "dropFolders": [str(WATCHED_DROP), str(SOURCE_DROP), str(REFERENCE_DROP)],
        "nextSafestAction": (
            "Review the top cue windows, then place confirmed watched/source media into the Episode 4 drop folders with cue id or time labels."
            if groups else
            "Run more transcript chunks, then rebuild cue finder; no watched/source cues were found in completed chunks yet."
        ),
        "truth": {
            "clipImportCreated": False,
            "timelineDecisionsWritten": False,
            "transcriptImported": False,
            "sourceFilesMutated": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "nearbyMediaTreatedAsConfirmedTruth": False,
        },
    }
    json_path = out_dir / "episode4-transcript-cues.json"
    markdown_path = out_dir / "episode4-transcript-cues.md"
    html_path = out_dir / "index.html"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    payload.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, payload)
    write_json(LATEST_POINTER, {
        "schema": "quipsly.episode4-transcript-cues-pointer.v1",
        "generatedAt": iso_now(),
        "status": status,
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": counts,
        "truth": payload["truth"],
    })
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Find Episode 4 transcript cues for watched/source clips.")
    parser.add_argument("--transcript-pointer", default=str(TRANSCRIPT_POINTER))
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    if args.limit <= 0:
        parser.error("--limit must be positive")
    payload = build(args)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(payload), end="")
    else:
        counts = payload.get("counts") or {}
        print(f"Episode 4 transcript cues: {payload.get('status')}")
        print(f"  Board: {payload.get('htmlPath')}")
        print(f"  JSON: {payload.get('jsonPath')}")
        print(f"  Groups: {counts.get('cueGroups')} hits={counts.get('cueHits')} scanned={counts.get('segmentsScanned')}")
        print(f"  Next: {payload.get('nextSafestAction')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
