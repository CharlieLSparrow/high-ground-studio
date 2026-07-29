#!/usr/bin/env python3
"""Build a stratified blind-listen sampler for an audio-spine candidate.

This is a review-routing artifact only. It does not approve audio, fail audio,
unlock branch inheritance, render final episode/short branches, upload, publish,
or mutate source/original media. It creates a deterministic randomized listen
map from the current Defect Atlas so humans can hear balanced proof windows
before seeing the machine labels.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import shlex
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STATUS = "blind-listen-sampler-ready"
MAX_SAMPLES = 12
MIN_WINDOW_SECONDS = 10.0
MAX_WINDOW_SECONDS = 35.0
PADDING_SECONDS = 3.0


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "m4aPath", "wavPath", "audioPath", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def float_value(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def timecode(seconds: Any) -> str:
    value = float_value(seconds, 0.0) or 0.0
    total = max(0, int(round(value)))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def severity_rank(severity: str) -> int:
    return {"critical": 5, "high": 4, "review-before-repair": 3, "medium": 2, "low": 1, "context": 0}.get(str(severity), 1)


def choose_master_audio(manifest: dict[str, Any], outputs: dict[str, Any]) -> str | None:
    candidates = [
        manifest.get("audioMorningPublicationReadinessRecommendedListeningFile"),
        output_path(outputs.get("masterM4a")),
        output_path(outputs.get("masterWav")),
        output_path(outputs.get("latestSpeakerCleanupListenReelM4a")),
    ]
    for candidate in candidates:
        if candidate and Path(str(candidate)).exists():
            return str(candidate)
    return None


def normalize_window(item: dict[str, Any]) -> tuple[float, float]:
    start = float_value(item.get("startSeconds"), 0.0) or 0.0
    end = float_value(item.get("endSeconds"), None)
    if end is None or end <= start:
        end = start + 20.0
    start = max(0.0, start - PADDING_SECONDS)
    end = end + PADDING_SECONDS
    duration = end - start
    if duration < MIN_WINDOW_SECONDS:
        end = start + MIN_WINDOW_SECONDS
    if end - start > MAX_WINDOW_SECONDS:
        center = (start + end) / 2.0
        start = max(0.0, center - (MAX_WINDOW_SECONDS / 2.0))
        end = start + MAX_WINDOW_SECONDS
    return round(start, 3), round(end, 3)


def stable_shuffle(items: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    def key(item: dict[str, Any]) -> str:
        raw = f"{seed}|{item.get('id')}|{item.get('stage')}|{item.get('startSeconds')}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    return sorted(items, key=key)


def select_samples(defect_atlas: dict[str, Any], baseline_id: str) -> tuple[list[dict[str, Any]], dict[str, int]]:
    timed = [item for item in defect_atlas.get("items") or [] if item.get("kind") == "timed" and float_value(item.get("startSeconds"), None) is not None]
    timed = sorted(timed, key=lambda item: (-severity_rank(str(item.get("severity"))), float_value(item.get("startSeconds"), 0.0) or 0.0))
    by_stage: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_severity: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in timed:
        by_stage[str(item.get("stage") or "unknown")].append(item)
        by_severity[str(item.get("severity") or "unknown")].append(item)

    chosen: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any], stratum: str) -> None:
        item_id = str(item.get("id") or f"item-{len(seen)}")
        if item_id in seen or len(chosen) >= MAX_SAMPLES:
            return
        seen.add(item_id)
        sample = dict(item)
        sample["selectionStratum"] = stratum
        chosen.append(sample)

    for stage in sorted(by_stage):
        stage_items = stable_shuffle(by_stage[stage], baseline_id + stage)
        stage_items = sorted(stage_items, key=lambda item: (-severity_rank(str(item.get("severity"))), float_value(item.get("startSeconds"), 0.0) or 0.0))
        if stage_items:
            add(stage_items[0], f"stage:{stage}")

    for severity in ("critical", "high", "review-before-repair", "medium", "low"):
        for item in stable_shuffle(by_severity.get(severity, []), baseline_id + severity):
            add(item, f"severity:{severity}")
            if len(chosen) >= MAX_SAMPLES:
                break
        if len(chosen) >= MAX_SAMPLES:
            break

    for item in stable_shuffle(timed, baseline_id + "fill"):
        add(item, "balanced-fill")
        if len(chosen) >= MAX_SAMPLES:
            break

    randomized = stable_shuffle(chosen, baseline_id + "blind-order")
    samples: list[dict[str, Any]] = []
    for index, item in enumerate(randomized, start=1):
        start, end = normalize_window(item)
        samples.append(
            {
                "blindId": f"BLIND-{index:02d}",
                "startSeconds": start,
                "endSeconds": end,
                "durationSeconds": round(end - start, 3),
                "listenTimecode": timecode(start),
                "ratingPrompts": [
                    "Speech clarity: can you understand both hosts without strain?",
                    "Background and bleed: does echo/noise distract or mask speech?",
                    "Naturalness: does the cleanup sound human, not chopped or gated?",
                    "Fatigue: would this still feel comfortable after several minutes?",
                    "Decision: pass, needs focused proof, or fail this window?",
                ],
                "hiddenReveal": {
                    "defectAtlasItemId": item.get("id"),
                    "stage": item.get("stage"),
                    "severity": item.get("severity"),
                    "title": item.get("title"),
                    "reasons": item.get("reasons") or [],
                    "evidence": item.get("evidence") or [],
                    "nextAction": item.get("nextAction"),
                    "artifactPath": item.get("artifactPath"),
                    "selectionStratum": item.get("selectionStratum"),
                    "sourceKey": item.get("sourceKey"),
                },
            }
        )
    return samples, {"stageStrata": len(by_stage), "severityStrata": len(by_severity)}


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    defect_atlas, defect_atlas_path = load_output_report(outputs, "latestAudioDefectAtlas")
    baseline_id = str(manifest.get("baselineId") or baseline_dir.name)
    samples, strata = select_samples(defect_atlas, baseline_id) if defect_atlas else ([], {"stageStrata": 0, "severityStrata": 0})
    master_audio = choose_master_audio(manifest, outputs)
    return {
        "schema": "quipsly.audio-workbench.blind-listen-sampler.v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baselineId": baseline_id,
        "status": STATUS if samples and master_audio else "blind-listen-sampler-needs-inputs",
        "reviewTarget": "episode-4-v006-high-quality-audio-spine",
        "purpose": "Give humans a balanced randomized listen path before revealing machine defect labels.",
        "methodology": [
            "Stratify from the Defect Atlas across stage owners and severity levels.",
            "Hide machine labels during first listen to reduce confirmation bias.",
            "Reveal defect families after notes are captured so repairs stay scoped and reversible.",
            "Use separate rating prompts for clarity, bleed/background, naturalness, fatigue, and decision.",
        ],
        "sampleCount": len(samples),
        "hiddenRevealCount": len(samples),
        "stageStratumCount": strata["stageStrata"],
        "severityStratumCount": strata["severityStrata"],
        "masterAudioPath": master_audio,
        "defectAtlasPath": defect_atlas_path,
        "samples": samples,
        "nextSafeAction": "Use the blind sampler only as a listen aid. After listening, reveal labels and route notes through the guarded human decision path; do not unlock branch renders from this sampler alone.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Blind listen sampler: {report['baselineId']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Review target: `{report['reviewTarget']}`",
        f"- Sample count: `{report['sampleCount']}`",
        f"- Stage strata: `{report['stageStratumCount']}`",
        f"- Severity strata: `{report['severityStratumCount']}`",
        f"- Master audio: `{report.get('masterAudioPath') or 'missing'}`",
        "",
        "This packet intentionally hides the machine labels first. Listen, write notes, then reveal the defect-atlas mapping.",
        "",
        "## Blind listen order",
        "",
        "| Blind ID | Time | Duration | Prompts |",
        "|---|---:|---:|---|",
    ]
    for sample in report["samples"]:
        prompts = "<br>".join(sample["ratingPrompts"])
        lines.append(f"| `{sample['blindId']}` | `{sample['listenTimecode']}` | `{sample['durationSeconds']}s` | {prompts} |")
    lines.extend(["", "## Reveal map", "", "| Blind ID | Stage | Severity | Atlas item | Title | Next action |", "|---|---|---:|---|---|---|"])
    for sample in report["samples"]:
        reveal = sample["hiddenReveal"]
        title = str(reveal.get("title") or "").replace("|", "\\|")
        action = str(reveal.get("nextAction") or "").replace("|", "\\|")
        lines.append(f"| `{sample['blindId']}` | `{reveal.get('stage')}` | `{reveal.get('severity')}` | `{reveal.get('defectAtlasItemId')}` | {title} | {action} |")
    lines.extend(["", "## Guardrail", "", report["nextSafeAction"], ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    audio_src = "file://" + html.escape(str(report.get("masterAudioPath") or ""))
    cards = []
    reveal_rows = []
    for sample in report["samples"]:
        prompts = "".join(f"<li>{html.escape(prompt)}</li>" for prompt in sample["ratingPrompts"])
        reveal = sample["hiddenReveal"]
        cards.append(
            f"""
            <article class=\"sample\">
              <h2>{html.escape(sample['blindId'])}</h2>
              <p><b>Start:</b> {html.escape(sample['listenTimecode'])} <b>Duration:</b> {sample['durationSeconds']}s</p>
              <button onclick=\"playWindow({sample['startSeconds']}, {sample['endSeconds']})\">Play window</button>
              <button onclick=\"pauseAudio()\">Pause</button>
              <ul>{prompts}</ul>
              <label>Decision
                <select id=\"decision-{html.escape(sample['blindId'])}\">
                  <option value=\"unsure\">Unsure</option>
                  <option value=\"pass\">Pass</option>
                  <option value=\"needs-focused-proof\">Needs focused proof</option>
                  <option value=\"needs-repair\">Needs repair</option>
                </select>
              </label>
              <div class=\"ratings\">
                <label>Clarity <input id=\"clarity-{html.escape(sample['blindId'])}\" type=\"number\" min=\"1\" max=\"5\" placeholder=\"1-5\"></label>
                <label>Bleed/noise <input id=\"bleed-{html.escape(sample['blindId'])}\" type=\"number\" min=\"1\" max=\"5\" placeholder=\"1-5\"></label>
                <label>Naturalness <input id=\"naturalness-{html.escape(sample['blindId'])}\" type=\"number\" min=\"1\" max=\"5\" placeholder=\"1-5\"></label>
                <label>Fatigue <input id=\"fatigue-{html.escape(sample['blindId'])}\" type=\"number\" min=\"1\" max=\"5\" placeholder=\"1-5\"></label>
              </div>
              <textarea id=\"notes-{html.escape(sample['blindId'])}\" placeholder=\"Notes before reveal: what did you hear?\"></textarea>
            </article>
            """
        )
        reveal_rows.append(
            f"<tr><td>{html.escape(sample['blindId'])}</td><td>{html.escape(str(reveal.get('stage')))}</td><td>{html.escape(str(reveal.get('severity')))}</td><td>{html.escape(str(reveal.get('defectAtlasItemId')))}</td><td>{html.escape(str(reveal.get('title')))}</td><td>{html.escape(str(reveal.get('nextAction')))}</td></tr>"
        )
    sample_ids = [sample["blindId"] for sample in report["samples"]]
    sample_ids_json = json.dumps(sample_ids)
    return f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><title>Blind listen sampler</title>
<style>
:root {{ color-scheme: dark; --bg:#111712; --panel:#1a241c; --ink:#f5eddc; --muted:#bcae93; --gold:#f3ca4f; --green:#72d68a; --blue:#76c7ff; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; background:radial-gradient(circle at top left,#2b4033,var(--bg)); color:var(--ink); }}
main {{ max-width:1160px; margin:0 auto; padding:34px; }}
.hero,.sample,details {{ background:rgba(26,36,28,.9); border:1px solid rgba(243,202,79,.22); border-radius:22px; box-shadow:0 18px 54px rgba(0,0,0,.28); }}
.hero {{ padding:28px; margin-bottom:22px; }}
.sample {{ padding:18px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px; }}
button {{ border:0; border-radius:999px; padding:9px 13px; background:var(--gold); color:#201a10; font-weight:800; margin-right:8px; }}
textarea {{ width:100%; min-height:92px; margin-top:10px; background:#0f1511; color:var(--ink); border:1px solid rgba(255,255,255,.15); border-radius:14px; padding:12px; }}
select,input {{ background:#0f1511; color:var(--ink); border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:7px; margin:4px 8px 4px 0; }}
.ratings {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:6px; margin-top:8px; color:var(--muted); }}
a {{ color:var(--blue); }}
.pill {{ display:inline-block; margin-right:8px; padding:7px 11px; border-radius:999px; background:rgba(255,255,255,.08); color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; }}
td,th {{ padding:9px; border-bottom:1px solid rgba(255,255,255,.1); text-align:left; }}
details {{ margin-top:22px; padding:18px; }}
</style></head><body><main>
<section class=\"hero\">
  <span class=\"pill\">{html.escape(report['status'])}</span><span class=\"pill\">{report['sampleCount']} blind samples</span><span class=\"pill\">labels hidden first</span>
  <h1>Blind listen sampler</h1>
  <p>{html.escape(report['purpose'])}</p>
  <p><b>Master audio:</b> <a href=\"{audio_src}\">{html.escape(str(report.get('masterAudioPath') or 'missing'))}</a></p>
  <audio id=\"master\" controls preload=\"metadata\" src=\"{audio_src}\" style=\"width:100%\"></audio>
  <p>{html.escape(report['nextSafeAction'])}</p>
  <button onclick=\"exportNotes()\">Export notes JSON</button>
</section>
<section class=\"grid\">{''.join(cards)}</section>
<details><summary>Reveal machine labels after blind notes</summary><table><thead><tr><th>Blind ID</th><th>Stage</th><th>Severity</th><th>Atlas item</th><th>Title</th><th>Next action</th></tr></thead><tbody>{''.join(reveal_rows)}</tbody></table></details>
<script>
const sampleIds = {sample_ids_json};
let stopAt = null;
const audio = document.getElementById('master');
function playWindow(start,end) {{ stopAt = end; audio.currentTime = start; audio.play(); }}
function pauseAudio() {{ audio.pause(); }}
audio.addEventListener('timeupdate', () => {{ if (stopAt !== null && audio.currentTime >= stopAt) {{ audio.pause(); stopAt = null; }} }});
function exportNotes() {{
  const payload = {{ schema:'quipsly.audio-workbench.blind-listen-notes.v1', baselineId:{json.dumps(report['baselineId'])}, generatedAt:new Date().toISOString(), notes: sampleIds.map(id => {{ return {{
    blindId:id,
    decision:document.getElementById('decision-' + id).value,
    clarityScore:document.getElementById('clarity-' + id).value,
    bleedNoiseScore:document.getElementById('bleed-' + id).value,
    naturalnessScore:document.getElementById('naturalness-' + id).value,
    fatigueScore:document.getElementById('fatigue-' + id).value,
    notes:document.getElementById('notes-' + id).value
  }}; }}) }};
  const blob = new Blob([JSON.stringify(payload,null,2)], {{type:'application/json'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'quipsly-blind-listen-notes-' + Date.now() + '.json'; a.click();
  URL.revokeObjectURL(url);
}}
</script>
</main></body></html>"""


def update_manifest(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, stable_open: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioBlindListenSampler"] = str(stable_json)
    outputs["latestAudioBlindListenSamplerMarkdown"] = str(stable_md)
    outputs["latestAudioBlindListenSamplerHtml"] = str(stable_html)
    outputs["latestAudioBlindListenSamplerOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioBlindListenSamplerHistory", [])
    history.append(str(stable_json))
    history[:] = history[-20:]
    manifest["audioBlindListenSamplerLatestStatus"] = report["status"]
    manifest["audioBlindListenSamplerSampleCount"] = report["sampleCount"]
    manifest["audioBlindListenSamplerHiddenRevealCount"] = report["hiddenRevealCount"]
    manifest["audioBlindListenSamplerStageStratumCount"] = report["stageStratumCount"]
    manifest["audioBlindListenSamplerSeverityStratumCount"] = report["severityStratumCount"]
    manifest["audioBlindListenSamplerMasterAudioPath"] = report.get("masterAudioPath")
    manifest["audioBlindListenSamplerApprovalStateChanged"] = False
    manifest["audioBlindListenSamplerBranchStateChanged"] = False
    manifest["audioBlindListenSamplerRenderAttempted"] = False
    manifest["audioBlindListenSamplerUploadAttempted"] = False
    manifest["audioBlindListenSamplerPublicationAttempted"] = False
    manifest["audioBlindListenSamplerOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(Path(args.baseline_dir))
    report = build_report(baseline_dir)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = str(report.get("baselineId") or "audio-baseline").replace("/", "-")
    versioned_dir = baseline_dir / f"audio-blind-listen-sampler-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "blind-listen-sampler.json"
    versioned_md = versioned_dir / "blind-listen-sampler.md"
    versioned_html = versioned_dir / "blind-listen-sampler.html"
    versioned_open = versioned_dir / "open-blind-listen-sampler.command"
    stable_json = baseline_dir / "AUDIO_BLIND_LISTEN_SAMPLER.json"
    stable_md = baseline_dir / "AUDIO_BLIND_LISTEN_SAMPLER.md"
    stable_html = baseline_dir / "AUDIO_BLIND_LISTEN_SAMPLER.html"
    stable_open = baseline_dir / "OPEN_AUDIO_BLIND_LISTEN_SAMPLER.command"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (versioned_json, stable_json):
        write_json(path, report)
    for path in (versioned_md, stable_md):
        write_text(path, markdown)
    for path in (versioned_html, stable_html):
        write_text(path, html_doc)
    for path, target in ((versioned_open, versioned_html), (stable_open, stable_html)):
        write_text(path, "#!/bin/zsh\nset -e\nopen " + shell_quote(str(target)) + "\n")
        os.chmod(path, 0o755)

    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(json.dumps({"status": report["status"], "sampleCount": report["sampleCount"], "html": str(stable_html)}, indent=2))


if __name__ == "__main__":
    main()
