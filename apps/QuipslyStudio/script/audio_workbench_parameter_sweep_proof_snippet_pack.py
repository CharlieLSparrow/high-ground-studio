#!/usr/bin/env python3
"""Render proof-only audio snippets for selected parameter sweep variants.

The parameter sweep proof plan names the knobs. This script renders a small,
honest listen pack for the variants that can be auditioned from existing derived
speaker-cleanup proof snippets. It does not approve audio, fail audio, render
edit branches, upload files, or mutate original media.

Important: these snippets are proof auditions from derived proof-pack stems. They
are not a production v007 baseline and should never be promoted without the real
repair renderer and human listening.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def safe_slug(value: Any) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "item"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def ffprobe_duration(path: Path, ffprobe: str) -> float | None:
    result = run_capture([
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ])
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def db_from_text(value: str | None, default: str = "0dB") -> str:
    if not value:
        return default
    match = re.search(r"([+-]?\d+(?:\.\d+)?)\s*dB", value, flags=re.IGNORECASE)
    if not match:
        return default
    number = float(match.group(1))
    if number.is_integer():
        return f"{int(number)}dB"
    return f"{number:g}dB"


def snippet_by_label(window: dict[str, Any], label: str) -> Path | None:
    needle = label.lower()
    for snippet in window.get("snippets") or []:
        if needle in str(snippet.get("label") or "").lower() and snippet.get("ok") is True:
            path = snippet.get("path")
            if path and Path(path).exists():
                return Path(path)
    return None


def select_windows(proof_pack: dict[str, Any], required_flags: list[str], limit: int) -> list[dict[str, Any]]:
    windows = proof_pack.get("windows") or []
    selected: list[dict[str, Any]] = []
    for window in windows:
        flags = set(window.get("flags") or [])
        if any(flag in flags for flag in required_flags):
            selected.append(window)
        if len(selected) >= limit:
            return selected
    return selected


def render_mix(
    *,
    ffmpeg: str,
    ffprobe: str,
    output: Path,
    inputs: list[tuple[Path, str]],
) -> dict[str, Any]:
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error"]
    for path, _volume in inputs:
        command.extend(["-i", str(path)])
    labels: list[str] = []
    filters: list[str] = []
    for index, (_path, volume) in enumerate(inputs):
        label = f"a{index}"
        labels.append(label)
        filters.append(f"[{index}:a]volume={volume}[{label}]")
    if len(labels) == 1:
        filters.append(f"[{labels[0]}]alimiter=limit=0.97[out]")
    else:
        filters.append("".join(f"[{label}]" for label in labels) + f"amix=inputs={len(labels)}:duration=shortest:normalize=0,alimiter=limit=0.97[out]")
    command.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ])
    result = run_capture(command)
    ok = result.returncode == 0 and output.exists() and output.stat().st_size > 0
    duration = ffprobe_duration(output, ffprobe) if ok else None
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": ok,
        "durationSeconds": duration,
        "stderrTail": result.stderr[-2000:],
    }


def plan_by_id(sweep_plan: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(plan.get("id")): plan for plan in sweep_plan.get("plans") or []}


def volume_for_delta(variant: dict[str, Any], key: str, default: str) -> str:
    deltas = variant.get("parameterDeltas") or {}
    return db_from_text(str(deltas.get(key) or ""), default)


def make_variant_specs(plan: dict[str, Any]) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    plan_id = str(plan.get("id"))
    for variant in plan.get("variants") or []:
        variant_id = str(variant.get("id"))
        if plan_id == "charlie-echo-under-homer-sweep":
            specs.append({
                "planId": plan_id,
                "variantId": variant_id,
                "label": variant.get("label"),
                "windowFlags": ["charlie_echo_bleed_may_remain_under_homer", "overlap_preserved"],
                "primaryLabel": "Homer contribution",
                "secondaryLabel": "Charlie raw aligned",
                "primaryVolume": "0dB",
                "secondaryVolume": volume_for_delta(variant, "charlie-under-homer-duck-depth-db", "-24dB"),
                "renderNote": "Auditions Homer contribution with raw Charlie attenuated to approximate duck depth. This is proof-only, not the final source-aware cleanup renderer.",
            })
        elif plan_id == "homer-park-noise-under-charlie-sweep":
            specs.append({
                "planId": plan_id,
                "variantId": variant_id,
                "label": variant.get("label"),
                "windowFlags": ["homer_noise_bleed_may_remain_under_charlie", "overlap_preserved"],
                "primaryLabel": "Charlie contribution",
                "secondaryLabel": "Homer raw aligned",
                "primaryVolume": "0dB",
                "secondaryVolume": volume_for_delta(variant, "homer-under-charlie-duck-depth-db", "-20dB"),
                "renderNote": "Auditions Charlie contribution with raw Homer attenuated to approximate park-noise duck depth. This is proof-only, not the final source-aware cleanup renderer.",
            })
        elif plan_id == "homer-presence-balance-sweep":
            specs.append({
                "planId": plan_id,
                "variantId": variant_id,
                "label": variant.get("label"),
                "windowFlags": ["homer_loss_or_overgate_risk", "overlap_preserved"],
                "primaryLabel": "Charlie contribution",
                "secondaryLabel": "Homer contribution",
                "primaryVolume": volume_for_delta(variant, "charlie-primary-gain-db", "0dB"),
                "secondaryVolume": volume_for_delta(variant, "homer-primary-gain-db", "+4dB"),
                "renderNote": "Auditions contribution-stem speaker balance only. It does not apply bus compression or mastering changes.",
            })
        elif plan_id == "natural-gating-sweep":
            raw_blend = {"conservative": "-24dB", "standard": "-20dB", "aggressive-natural": "-16dB"}.get(variant_id, "-20dB")
            specs.append({
                "planId": plan_id,
                "variantId": variant_id,
                "label": variant.get("label"),
                "windowFlags": ["charlie_loss_or_overgate_risk", "homer_loss_or_overgate_risk", "overlap_preserved"],
                "primaryLabel": "Charlie contribution",
                "secondaryLabel": "Charlie raw aligned",
                "tertiaryLabel": "Homer contribution",
                "quaternaryLabel": "Homer raw aligned",
                "primaryVolume": "0dB",
                "secondaryVolume": raw_blend,
                "tertiaryVolume": "0dB",
                "quaternaryVolume": raw_blend,
                "renderNote": "Auditions a low-level raw-source safety blend to approximate a more permissive activity threshold. This is not a replacement for true activity-map regeneration.",
            })
    return specs


def render_html(report: dict[str, Any]) -> str:
    sections: list[str] = []
    for plan in report["plans"]:
        rows: list[str] = []
        for item in plan.get("items") or []:
            audio = ""
            if item.get("path"):
                audio = f'<audio controls preload="metadata" src="{escape(file_uri(item.get("path")))}"></audio>'
            ingredients = "".join(f"<li><code>{escape(src.get('label'))}</code> at <code>{escape(src.get('volume'))}</code></li>" for src in item.get("sources") or [])
            rows.append(f"""
            <article class=\"variant {escape(item.get('status'))}\">
              <div class=\"meta\"><span>{escape(item.get('variantId'))}</span><span>{escape(item.get('timecode'))}</span><span>{escape(item.get('status'))}</span></div>
              <h3>{escape(item.get('variantLabel'))}</h3>
              {audio}
              <p>{escape(item.get('renderNote'))}</p>
              <ul>{ingredients}</ul>
              <small>{escape(item.get('path') or item.get('unavailableReason'))}</small>
            </article>
            """)
        unavailable = "".join(f"<li><strong>{escape(item.get('title'))}</strong>: {escape(item.get('reason'))}</li>" for item in plan.get("unavailable") or [])
        unavailable_block = f"<details><summary>Unavailable variants</summary><ul>{unavailable}</ul></details>" if unavailable else ""
        sections.append(f"""
        <section class=\"plan\">
          <h2>{escape(plan.get('title'))}</h2>
          <p>{escape(plan.get('summary'))}</p>
          <div class=\"grid\">{''.join(rows)}</div>
          {unavailable_block}
        </section>
        """)
    return f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><title>Parameter Sweep Proof Snippets</title>
<style>
:root {{ color-scheme: dark; --bg:#10140f; --panel:#1d271b; --panel2:#263321; --gold:#edc95a; --leaf:#90d36f; --clay:#d0704d; --ink:#fff3d5; --muted:#c1b28f; --line:rgba(255,243,213,.16); }}
body {{ margin:0; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 0%, rgba(144,211,111,.22), transparent 32rem), linear-gradient(135deg,#0d130e,#171c12 52%,#241b11); }}
header {{ padding:28px 38px; position:sticky; top:0; z-index:2; border-bottom:1px solid var(--line); background:rgba(16,20,15,.92); backdrop-filter:blur(18px); }}
h1 {{ margin:0; font-size:30px; color:var(--gold); }} .sub {{ color:var(--muted); margin-top:6px; }} .truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }} .pill {{ padding:8px 11px; border-radius:999px; background:rgba(144,211,111,.12); border:1px solid rgba(144,211,111,.24); color:#d8f7c8; }}
main {{ padding:28px 38px 56px; }} .plan {{ margin-bottom:28px; }} h2 {{ margin:0 0 8px; color:#ffe897; }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:14px; }} .variant {{ background:linear-gradient(145deg,var(--panel),var(--panel2)); border:1px solid var(--line); border-radius:18px; padding:16px; box-shadow:0 14px 42px rgba(0,0,0,.26); }} .variant.rendered {{ border-color:rgba(144,211,111,.38); }} .meta {{ display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:11px; letter-spacing:.11em; text-transform:uppercase; }} .meta span {{ background:rgba(0,0,0,.22); border-radius:999px; padding:3px 8px; }} h3 {{ margin:10px 0 8px; }} audio {{ width:100%; margin:6px 0 10px; }} code {{ color:#d8f7c8; }} small, p, li {{ color:var(--muted); }} details {{ margin-top:14px; background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:14px; padding:12px; }} summary {{ cursor:pointer; color:#ffe897; }}
</style></head><body>
<header><h1>Parameter Sweep Proof Snippets</h1><div class=\"sub\">Controlled, derived listen snippets for sweep variants. Evidence only, not a new baseline.</div><div class=\"truth\"><span class=\"pill\">baseline: {escape(report['baselineId'])}</span><span class=\"pill\">approval: {escape(report['approvalStatus'])}</span><span class=\"pill\">rendered snippets: {report['renderedSnippetCount']}</span><span class=\"pill\">unavailable: {report['unavailableVariantCount']}</span><span class=\"pill\">branch render: false</span></div></header>
<main>{''.join(sections)}</main></body></html>"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Sweep Proof Snippets: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet renders short proof-only snippets for parameter sweep variants that can be auditioned honestly from existing derived proof-pack stems. It is not v007, not an approval, not a branch render, and not a source-media mutation.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Rendered proof snippets: `{report['renderedSnippetCount']}`",
        f"- Render failures: `{report['renderFailureCount']}`",
        f"- Unavailable variant routes: `{report['unavailableVariantCount']}`",
        f"- HTML: `{report['html']}`",
        f"- Playlist: `{report['playlist']}`",
        "",
        "## Rendered snippets",
        "",
        "| Plan | Window | Variant | Status | Snippet |",
        "|---|---:|---|---:|---|",
    ]
    for plan in report["plans"]:
        for item in plan.get("items") or []:
            lines.append(f"| {plan['title']} | `{item.get('timecode')}` | `{item.get('variantId')}` {item.get('variantLabel')} | `{item.get('status')}` | `{item.get('path') or item.get('unavailableReason')}` |")
    lines.extend(["", "## Unavailable routes", ""])
    any_unavailable = False
    for plan in report["plans"]:
        for item in plan.get("unavailable") or []:
            any_unavailable = True
            lines.append(f"- {plan['title']} / `{item.get('variantId')}`: {item.get('reason')}")
    if not any_unavailable:
        lines.append("- None.")
    lines.extend([
        "",
        "## Guardrails",
        "",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Derived review snippet render attempted: `{str(report['derivedReviewSnippetRenderAttempted']).lower()}`",
        f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
    ])
    return "\n".join(lines)


def build_pack(manifest: dict[str, Any], baseline_dir: Path, generated_at: str, max_windows_per_plan: int, ffmpeg: str, ffprobe: str) -> tuple[dict[str, Any], list[str]]:
    outputs = manifest.get("outputs") or {}
    sweep_path = output_path(outputs.get("latestAudioWorkbenchParameterSweepProofPlan"))
    proof_pack_path = output_path(outputs.get("latestSpeakerCleanupProofPack"))
    if not sweep_path or not Path(sweep_path).exists():
        raise FileNotFoundError("Missing latestAudioWorkbenchParameterSweepProofPlan JSON")
    if not proof_pack_path or not Path(proof_pack_path).exists():
        raise FileNotFoundError("Missing latestSpeakerCleanupProofPack JSON")
    sweep_plan = read_json(Path(sweep_path))
    proof_pack = read_json(Path(proof_pack_path))
    plans = plan_by_id(sweep_plan)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    out_dir = baseline_dir / f"audio-workbench-parameter-sweep-proof-snippet-pack-{slug}-{generated_at}"
    clips_dir = out_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    playlist_lines = ["#EXTM3U", f"# Quipsly parameter sweep proof snippets for {baseline_id}"]
    rendered_count = 0
    failures: list[dict[str, Any]] = []
    plan_reports: list[dict[str, Any]] = []

    renderable_plan_ids = [
        "charlie-echo-under-homer-sweep",
        "homer-park-noise-under-charlie-sweep",
        "homer-presence-balance-sweep",
        "natural-gating-sweep",
    ]
    for plan_id in renderable_plan_ids:
        plan = plans.get(plan_id)
        if not plan:
            continue
        specs = make_variant_specs(plan)
        selected = select_windows(proof_pack, specs[0]["windowFlags"] if specs else [], max_windows_per_plan)
        items: list[dict[str, Any]] = []
        unavailable: list[dict[str, Any]] = []
        for window in selected:
            master = snippet_by_label(window, "Mastered spine")
            if master:
                output = clips_dir / f"{safe_slug(plan_id)}-window-{int(window.get('index') or 0):02d}-control-current-v006.m4a"
                render = render_mix(ffmpeg=ffmpeg, ffprobe=ffprobe, output=output, inputs=[(master, "0dB")])
                row = {
                    "planId": plan_id,
                    "windowIndex": window.get("index"),
                    "timecode": window.get("timecode"),
                    "variantId": "control-current-v006",
                    "variantLabel": "Current v006 master",
                    "status": "rendered" if render["ok"] else "failed",
                    "path": str(output) if render["ok"] else None,
                    "durationSeconds": render.get("durationSeconds"),
                    "renderNote": "Current v006 mastered spine control snippet for this proof window.",
                    "sources": [{"label": "Mastered spine", "path": str(master), "volume": "0dB"}],
                    "stderrTail": render.get("stderrTail"),
                }
                if render["ok"]:
                    rendered_count += 1
                    playlist_lines.extend([f"#EXTINF:{row['durationSeconds'] or 0:.3f},{plan.get('title')} / control / {window.get('timecode')}", str(output)])
                else:
                    failures.append(row)
                items.append(row)
            for spec in specs:
                paths_and_volumes: list[tuple[Path, str]] = []
                sources: list[dict[str, Any]] = []
                for label_key, volume_key in [
                    ("primaryLabel", "primaryVolume"),
                    ("secondaryLabel", "secondaryVolume"),
                    ("tertiaryLabel", "tertiaryVolume"),
                    ("quaternaryLabel", "quaternaryVolume"),
                ]:
                    label = spec.get(label_key)
                    if not label:
                        continue
                    path = snippet_by_label(window, str(label))
                    volume = str(spec.get(volume_key) or "0dB")
                    if path:
                        paths_and_volumes.append((path, volume))
                        sources.append({"label": label, "path": str(path), "volume": volume})
                if len(paths_and_volumes) < 2:
                    unavailable.append({
                        "variantId": spec["variantId"],
                        "title": plan.get("title"),
                        "windowIndex": window.get("index"),
                        "reason": "Required proof-pack snippets were missing for this variant/window.",
                    })
                    continue
                output = clips_dir / f"{safe_slug(plan_id)}-window-{int(window.get('index') or 0):02d}-{safe_slug(spec['variantId'])}.m4a"
                render = render_mix(ffmpeg=ffmpeg, ffprobe=ffprobe, output=output, inputs=paths_and_volumes)
                row = {
                    "planId": plan_id,
                    "windowIndex": window.get("index"),
                    "timecode": window.get("timecode"),
                    "variantId": spec["variantId"],
                    "variantLabel": spec.get("label"),
                    "status": "rendered" if render["ok"] else "failed",
                    "path": str(output) if render["ok"] else None,
                    "durationSeconds": render.get("durationSeconds"),
                    "renderNote": spec["renderNote"],
                    "sources": sources,
                    "stderrTail": render.get("stderrTail"),
                }
                if render["ok"]:
                    rendered_count += 1
                    playlist_lines.extend([f"#EXTINF:{row['durationSeconds'] or 0:.3f},{plan.get('title')} / {spec['variantId']} / {window.get('timecode')}", str(output)])
                else:
                    failures.append(row)
                items.append(row)
        plan_reports.append({
            "id": plan_id,
            "title": plan.get("title"),
            "summary": plan.get("passCondition"),
            "selectedWindowCount": len(selected),
            "items": items,
            "unavailable": unavailable,
        })

    for plan_id in ["dxrevive-stem-restoration-sweep", "structural-gap-branch-policy-plan"]:
        plan = plans.get(plan_id)
        if not plan:
            continue
        unavailable = []
        for variant in plan.get("variants") or []:
            unavailable.append({
                "variantId": variant.get("id"),
                "title": plan.get("title"),
                "reason": "This plan needs a real returned bounce or branch-policy renderer. It is intentionally not faked by the proof-snippet pack.",
            })
        plan_reports.append({
            "id": plan_id,
            "title": plan.get("title"),
            "summary": plan.get("passCondition"),
            "selectedWindowCount": 0,
            "items": [],
            "unavailable": unavailable,
        })

    playlist_path = out_dir / "parameter-sweep-proof-snippets.m3u"
    html_path = out_dir / "parameter-sweep-proof-snippets.html"
    json_path = out_dir / "parameter-sweep-proof-snippet-pack.json"
    md_path = out_dir / f"audio-workbench-parameter-sweep-proof-snippet-pack-{slug}-{generated_at}.md"
    open_command = out_dir / "open-parameter-sweep-proof-snippets.command"
    report = {
        "schema": "quipsly.audio-workbench.parameter-sweep-proof-snippet-pack.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sweepPlanPath": sweep_path,
        "speakerCleanupProofPackPath": proof_pack_path,
        "outputDir": str(out_dir),
        "clipsDir": str(clips_dir),
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
        "playlist": str(playlist_path),
        "openCommand": str(open_command),
        "renderedSnippetCount": rendered_count,
        "renderFailureCount": len(failures),
        "unavailableVariantCount": sum(len(plan.get("unavailable") or []) for plan in plan_reports),
        "plans": plan_reports,
        "failures": failures,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "derivedReviewSnippetRenderAttempted": True,
        "branchRenderAttempted": False,
        "renderAttempted": True,
        "renderPurpose": "derived-review-snippets-only",
        "originalMediaMutated": False,
        "nextSafestAction": "Listen to current-v006 control and rendered variant snippets for the failing symptom. If a variant wins, implement the real source-aware repair renderer for a timestamped v007 proof candidate instead of promoting these snippets directly.",
    }
    playlist_path.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")
    write_json(json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    open_command.write_text("#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(html_path)) + "\nopen " + shell_quote(str(md_path)) + "\n", encoding="utf-8")
    os.chmod(open_command, 0o755)
    return report, playlist_lines


def register_outputs(manifest: dict[str, Any], report: dict[str, Any]) -> None:
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPack"] = report["json"]
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackMarkdown"] = report["markdown"]
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackHtml"] = report["html"]
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackPlaylist"] = report["playlist"]
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackOpenCommand"] = report["openCommand"]
    history = outputs.setdefault("audioWorkbenchParameterSweepProofSnippetPackHistory", [])
    if isinstance(history, list) and report["json"] not in history:
        history.append(report["json"])
    manifest["audioWorkbenchParameterSweepProofSnippetPackCount"] = int(manifest.get("audioWorkbenchParameterSweepProofSnippetPackCount") or 0) + 1
    manifest["audioWorkbenchParameterSweepProofSnippetPackLatestRenderedCount"] = report["renderedSnippetCount"]
    manifest["audioWorkbenchParameterSweepProofSnippetPackLatestFailureCount"] = report["renderFailureCount"]
    manifest["audioWorkbenchParameterSweepProofSnippetPackLatestUnavailableCount"] = report["unavailableVariantCount"]
    manifest["audioWorkbenchParameterSweepProofSnippetPackApprovalStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofSnippetPackBranchStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofSnippetPackBranchRenderAttempted"] = False
    manifest["audioWorkbenchParameterSweepProofSnippetPackOriginalMediaMutated"] = False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--max-windows-per-plan", type=int, default=2)
    args = parser.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    report, _playlist = build_pack(manifest, baseline_dir, generated_at, max(1, args.max_windows_per_plan), ffmpeg, ffprobe)
    register_outputs(manifest, report)
    write_json(manifest_path, manifest)
    print(f"Parameter sweep proof snippets: {report['markdown']}")
    print(f"Parameter sweep proof snippets HTML: {report['html']}")
    print(f"Rendered snippets: {report['renderedSnippetCount']}")
    print(f"Render failures: {report['renderFailureCount']}")
    print(f"Unavailable variant routes: {report['unavailableVariantCount']}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Branch render attempted: false")
    print("Original media mutated: false")


if __name__ == "__main__":
    main()
