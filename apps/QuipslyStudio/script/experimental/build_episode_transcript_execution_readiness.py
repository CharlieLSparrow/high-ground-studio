#!/usr/bin/env python3
"""Build transcript execution readiness for episode media.

This turns transcript source work orders into a safe ASR execution queue. It does
not run ASR, write sidecars, import transcripts, edit timelines, render, approve,
upload, publish, schedule, overwrite, delete, or mutate original media.
"""
from __future__ import annotations

import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SOURCE_POINTER = RELEASE_ROOT / "review-board/transcript-source-workorders/latest-transcript-source-workorders.json"
OUT_ROOT = RELEASE_ROOT / "review-board/transcript-execution-readiness"
LATEST_POINTER = OUT_ROOT / "latest-transcript-execution-readiness.json"
PROVIDER = Path(__file__).resolve().parent / "local_transcript_provider.py"
SCHEMA = "quipsly.episode-transcript-execution-readiness.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-execution-readiness")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def provider_command(path: str, output_path: Path) -> str:
    return f"python3 {shell_quote(str(PROVIDER))} {shell_quote(path)} > {shell_quote(str(output_path))}"


def provider_doctor_command() -> str:
    return f"python3 {shell_quote(str(PROVIDER))} --doctor"


def selected_sources_for_episode(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def priority(row: dict[str, Any]) -> tuple[int, int, float, str]:
        kind = str(row.get("sourceKind") or "")
        source_rank = {
            "external-high-quality-audio": 0,
            "call-recording": 1,
            "external-audio": 2,
            "exported-podcast-master": 3,
            "source-video-scratch-audio": 4,
            "exported-video-audio": 5,
        }.get(kind, 8)
        duration = float(row.get("durationSeconds") or 0)
        return (int(row.get("transcriptionPriority") or 9), source_rank, -duration, str(row.get("path") or ""))

    ordered = sorted(sources, key=priority)
    selected: list[dict[str, Any]] = []
    seen_kinds: set[str] = set()
    for row in ordered:
        kind = str(row.get("sourceKind") or "")
        if int(row.get("transcriptionPriority") or 9) <= 2:
            selected.append(row)
            seen_kinds.add(kind)
        if len(selected) >= 4:
            break
    for wanted in ["exported-podcast-master", "source-video-scratch-audio", "exported-video-audio"]:
        if wanted in seen_kinds:
            continue
        candidate = next((row for row in ordered if row.get("sourceKind") == wanted), None)
        if candidate:
            selected.append(candidate)
            seen_kinds.add(wanted)
        if len(selected) >= 6:
            break
    return selected[:6]


def raw_output_path(episode: int | None, media_id: str) -> Path:
    ep = f"episode-{episode:02d}" if episode else "episode-unknown"
    return OUT_ROOT / "planned-provider-outputs" / ep / f"{media_id}.provider-output.txt"


def normalized_output_path(episode: int | None, media_id: str) -> Path:
    ep = f"episode-{episode:02d}" if episode else "episode-unknown"
    return OUT_ROOT / "planned-normalized-transcripts" / ep / f"{media_id}.quipsly-transcript.json"


def reconciliation_output_path(episode: int | None) -> Path:
    ep = f"episode-{episode:02d}" if episode else "episode-unknown"
    return OUT_ROOT / "planned-reconciled-spines" / ep / f"{ep}.reconciled-transcript-spine.json"


def build_execution_item(source: dict[str, Any], episode: int | None, sequence: int) -> dict[str, Any]:
    media_id = str(source.get("mediaId") or f"source-{sequence}")
    raw_path = raw_output_path(episode, media_id)
    normalized_path = normalized_output_path(episode, media_id)
    return {
        "queueId": f"transcript-{episode or 'unknown'}-{sequence:02d}-{media_id}",
        "episode": episode,
        "episodeLabel": f"Episode {episode}" if episode else "Episode unknown",
        "mediaId": media_id,
        "sourceKind": source.get("sourceKind") or "unknown",
        "fileName": source.get("fileName") or Path(str(source.get("path") or "")).name,
        "sourcePath": source.get("path") or "",
        "durationSeconds": source.get("durationSeconds"),
        "durationLabel": source.get("durationLabel") or "unknown",
        "valueNote": source.get("valueNote") or "",
        "plannedRawProviderOutputPath": str(raw_path),
        "plannedNormalizedTranscriptJsonPath": str(normalized_path),
        "safeAsrCommand": provider_command(str(source.get("path") or ""), raw_path),
        "safeNormalizeCommand": "planned: normalize provider output into Quipsly transcript JSON after ASR completes and format is known",
        "status": "ready-for-asr" if source.get("path") else "missing-source-path",
        "truth": {
            "asrRun": False,
            "rawProviderOutputWritten": False,
            "normalizedTranscriptWritten": False,
            "transcriptImported": False,
            "timelineDecisionsWritten": False,
            "sourceFilesMutated": False,
        },
    }


def build() -> dict[str, Any]:
    source_packet = load_pointer(SOURCE_POINTER)
    episodes = source_packet.get("episodes") if isinstance(source_packet.get("episodes"), list) else []
    execution_episodes: list[dict[str, Any]] = []
    selected_total = 0
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        episode = ep.get("episode") if isinstance(ep.get("episode"), int) else None
        sources = ep.get("sources") if isinstance(ep.get("sources"), list) else []
        selected = selected_sources_for_episode([row for row in sources if isinstance(row, dict)])
        items = [build_execution_item(source, episode, index) for index, source in enumerate(selected, start=1)]
        selected_total += len(items)
        execution_episodes.append({
            "episode": episode,
            "episodeLabel": ep.get("episodeLabel") or (f"Episode {episode}" if episode else "Episode unknown"),
            "sourceCount": len(sources),
            "selectedCount": len(items),
            "selectedSources": items,
            "plannedReconciledTranscriptSpinePath": str(reconciliation_output_path(episode)),
            "reconciliationSteps": [
                "Run ASR into raw provider-output sidecars for the selected sources.",
                "Normalize each provider output into Quipsly transcript JSON with segments, word timings when available, speaker placeholders, and source metadata.",
                "Compare high-quality audio, call recording, video scratch audio, and exported podcast/video audio instead of trusting one source blindly.",
                "Promote a reconciled transcript spine only after timing/speaker/content review.",
                "Use transcript spine for edit/short suggestions, captions, show notes, quotes, and Nest writing packets after review.",
            ],
        })
    provider = source_packet.get("providerDoctor") if isinstance(source_packet.get("providerDoctor"), dict) else {}
    provider_available = bool(provider.get("available"))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "transcript-execution-readiness-ready" if execution_episodes else "transcript-execution-readiness-empty",
        "releaseRoot": str(RELEASE_ROOT),
        "sourceWorkordersPointer": str(SOURCE_POINTER),
        "sourceWorkordersHtml": source_packet.get("htmlPath") or "",
        "sourceWorkordersJson": source_packet.get("jsonPath") or "",
        "providerDoctor": provider,
        "providerDoctorCommand": provider_doctor_command(),
        "providerAvailable": provider_available,
        "counts": {
            "episodes": len(execution_episodes),
            "selectedSources": selected_total,
            "sourceWorkorderSources": (source_packet.get("counts") or {}).get("sources", 0) if isinstance(source_packet.get("counts"), dict) else 0,
            "highPrioritySources": (source_packet.get("counts") or {}).get("highPrioritySources", 0) if isinstance(source_packet.get("counts"), dict) else 0,
            "asrCommandsReady": selected_total,
            "asrRun": 0,
            "rawProviderOutputsWritten": 0,
            "normalizedTranscriptsWritten": 0,
            "reconciledTranscriptSpinesWritten": 0,
        },
        "nextSafestAction": (
            "Provider appears available. Run one Episode 1 or Episode 6 high-priority ASR command into the planned raw sidecar, then normalize and review before importing."
            if provider_available else
            "Install or configure a local ASR provider, then run the provider doctor before executing one high-priority ASR command."
        ),
        "episodes": execution_episodes,
        "truth": {
            "executionPlanningOnly": True,
            "asrRun": False,
            "rawProviderOutputsWritten": False,
            "normalizedTranscriptsWritten": False,
            "reconciledTranscriptSpinesWritten": False,
            "transcriptsImported": False,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Transcript execution readiness",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is the step after transcript source inventory and before ASR. It chooses a small, safe first execution queue and deterministic sidecar paths.",
        "",
        f"Provider available: `{payload.get('providerAvailable')}`",
        f"Provider doctor: `{payload.get('providerDoctorCommand')}`",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Why this queue exists",
        "",
        "- We do not want to transcribe 958 files blindly.",
        "- Each episode gets the best available word sources first: HQ audio, call recording, exported podcast/audio, and scratch video audio when useful.",
        "- Raw ASR provider output is preserved separately from normalized transcript JSON.",
        "- A reconciled transcript spine is promoted only after comparison/review.",
        "",
        "## Episode queues",
        "",
    ]
    for ep in payload.get("episodes") or []:
        lines.extend([
            f"### {ep.get('episodeLabel')}",
            "",
            f"- Candidate sources: `{ep.get('sourceCount')}`",
            f"- Selected first-pass sources: `{ep.get('selectedCount')}`",
            f"- Planned reconciled spine: `{ep.get('plannedReconciledTranscriptSpinePath')}`",
            "",
        ])
        for item in ep.get("selectedSources") or []:
            lines.extend([
                f"- `{item.get('sourceKind')}` `{item.get('durationLabel')}` `{item.get('fileName')}`",
                f"  - Source: `{item.get('sourcePath')}`",
                f"  - Raw output: `{item.get('plannedRawProviderOutputPath')}`",
                f"  - Normalized JSON: `{item.get('plannedNormalizedTranscriptJsonPath')}`",
                f"  - Command: `{item.get('safeAsrCommand')}`",
            ])
        lines.append("")
    lines.extend([
        "## Safety boundary",
        "",
        "- No ASR was run by this readiness board.",
        "- No transcript sidecars, normalized transcripts, or reconciled transcript spines were written.",
        "- No media, source files, timelines, exports, approvals, uploads, publications, schedules, overwrites, deletes, or receipt truth were mutated.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    sections: list[str] = []
    for ep in payload.get("episodes") or []:
        cards: list[str] = []
        for item in ep.get("selectedSources") or []:
            cards.append(f"""
            <article class=\"card\">
              <p class=\"eyebrow\">{esc(item.get('sourceKind'))} · {esc(item.get('durationLabel'))}</p>
              <h3>{esc(item.get('fileName'))}</h3>
              <p>{esc(item.get('valueNote'))}</p>
              <p class=\"path\">{esc(item.get('sourcePath'))}</p>
              <details><summary>ASR command</summary><pre><code>{esc(item.get('safeAsrCommand'))}</code></pre></details>
              <details><summary>Planned outputs</summary><pre><code>{esc(item.get('plannedRawProviderOutputPath'))}\n{esc(item.get('plannedNormalizedTranscriptJsonPath'))}</code></pre></details>
            </article>
            """)
        sections.append(f"""
        <section class=\"episode\">
          <p class=\"eyebrow\">{esc(ep.get('episodeLabel'))}</p>
          <h2>{esc(ep.get('selectedCount'))} selected from {esc(ep.get('sourceCount'))} sources</h2>
          <p class=\"path\">Reconciled spine target: {esc(ep.get('plannedReconciledTranscriptSpinePath'))}</p>
          <div class=\"grid\">{''.join(cards)}</div>
        </section>
        """)
    counts = payload.get("counts") or {}
    html_text = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Transcript execution readiness</title>
<style>
:root {{ color-scheme:dark; --bg:#101710; --panel:#1e2d22; --ink:#fff0d2; --muted:#c8baa0; --gold:#f1ca55; --leaf:#8edb91; --water:#6fc9dc; --line:#3b553e; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top right,rgba(111,201,220,.18),transparent 32%),linear-gradient(135deg,#101710,#231b13); color:var(--ink); }}
main {{ max-width:1280px; margin:0 auto; padding:36px 24px 80px; }}
header,.episode {{ border:1px solid var(--line); border-radius:30px; background:rgba(30,45,34,.93); padding:24px; margin:18px 0; box-shadow:0 18px 54px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,76px); line-height:.92; margin:.05em 0 .25em; }}
h2,h3 {{ margin:.2rem 0 .6rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.counts {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:14px; }}
.card {{ border:1px solid rgba(142,219,145,.28); border-radius:20px; background:rgba(13,21,15,.78); padding:15px; }}
.path {{ color:var(--muted); font-size:12px; overflow-wrap:anywhere; }}
pre {{ white-space:pre-wrap; color:var(--leaf); }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · transcript execution</p><h1>Ready to transcribe deliberately.</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">{esc(counts.get('episodes'))} episodes</span><span class=\"pill\">{esc(counts.get('selectedSources'))} selected sources</span><span class=\"pill\">{esc(counts.get('sourceWorkorderSources'))} inventoried sources</span><span class=\"pill\">provider available: {esc(payload.get('providerAvailable'))}</span></div></header>
{''.join(sections)}
<section class=\"episode\"><p class=\"eyebrow\">Safety</p><p>No ASR, sidecar writes, imports, timeline decisions, exports, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth occurred.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    payload = build()
    session_dir = OUT_ROOT / stamp()
    html_path = session_dir / "index.html"
    json_path = session_dir / "transcript-execution-readiness.json"
    markdown_path = session_dir / "START-HERE-transcript-execution-readiness.md"
    payload.update({
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "firstSafeAction": {
            "label": "Open transcript execution readiness",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local transcript execution-readiness board only. No ASR, sidecar writes, imports, media mutation, export, approval, upload, publication, schedule, overwrite, delete, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    write_json(LATEST_POINTER, payload)
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "counts": payload.get("counts"),
        "providerAvailable": payload.get("providerAvailable"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
