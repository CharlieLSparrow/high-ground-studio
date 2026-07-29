#!/usr/bin/env python3
"""Render visual waveform contact sheets for audio proof windows.

The output is review evidence, not approval. It helps a human reviewer see the
exact windows where machine checks asked for careful listening.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


PROOF_KEYS = [
    ("rawAligned", "Raw aligned parent baseline", "f2a65a"),
    ("sourceAwareContributionMix", "Source-aware contribution mix", "58a6ff"),
    ("conformedMasterSpine", "Conformed mastered spine", "f2d15a"),
    ("speakerSplitCharlieLeftHomerRight", "Speaker split diagnostic", "a88cff"),
]


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "proof-window"


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def load_manifest(baseline_dir: Path) -> tuple[Path, dict[str, Any]]:
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    return manifest_path, json.loads(manifest_path.read_text())


def render_waveform(ffmpeg: str, source: Path, dest: Path, color: str) -> dict[str, Any]:
    if not source.exists():
        return {
            "source": str(source),
            "waveform": str(dest),
            "exists": False,
            "rendered": False,
            "error": "source audio does not exist",
        }
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-filter_complex",
        f"aformat=channel_layouts=mono,showwavespic=s=1400x180:colors={color}",
        "-frames:v",
        "1",
        str(dest),
    ]
    result = subprocess.run(cmd, text=True, capture_output=True)
    return {
        "source": str(source),
        "waveform": str(dest),
        "exists": True,
        "rendered": result.returncode == 0 and dest.exists(),
        "returncode": result.returncode,
        "stderr": result.stderr.strip(),
    }


def build_html(payload: dict[str, Any]) -> str:
    rows: list[str] = []
    for window in payload["windows"]:
        cards: list[str] = []
        for artifact in window["artifacts"]:
            status = "rendered" if artifact["rendered"] else "missing or failed"
            img = ""
            if artifact["rendered"]:
                img = f'<img src="{escape(Path(artifact["waveform"]).name)}" alt="{escape(artifact["label"])} waveform" />'
            cards.append(
                f"""
                <section class="artifact">
                  <h3>{escape(artifact["label"])}</h3>
                  <p><strong>Status:</strong> {escape(status)}</p>
                  <p><code>{escape(artifact["source"])}</code></p>
                  {img}
                </section>
                """
            )
        rows.append(
            f"""
            <article class="window">
              <header>
                <h2>{escape(window["label"])}</h2>
                <p>Sequence start: <strong>{window["sequenceStartSeconds"]:.2f}s</strong> | Duration: <strong>{window["durationSeconds"]:.2f}s</strong></p>
              </header>
              <div class="grid">{''.join(cards)}</div>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Audio Proof Window Visual QC</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101513;
      --panel: #17211d;
      --panel-2: #223027;
      --text: #f3ead4;
      --muted: #b7aa8d;
      --gold: #f2d15a;
      --green: #7fd08c;
      --blue: #58a6ff;
    }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, #203b30 0, var(--bg) 42rem);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    main {{ max-width: 1500px; margin: 0 auto; padding: 34px; }}
    h1 {{ margin: 0 0 8px; color: var(--gold); letter-spacing: .04em; }}
    h2 {{ margin: 0; color: var(--green); }}
    h3 {{ margin: 0 0 8px; color: var(--gold); }}
    p {{ color: var(--muted); }}
    code {{ overflow-wrap: anywhere; color: #d6c7a1; }}
    .summary, .window {{
      background: color-mix(in srgb, var(--panel) 88%, black);
      border: 1px solid #405244;
      border-radius: 22px;
      box-shadow: 0 18px 52px rgba(0,0,0,.35);
      margin: 0 0 22px;
      padding: 22px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }}
    .artifact {{
      background: var(--panel-2);
      border: 1px solid #485b4d;
      border-radius: 16px;
      padding: 16px;
    }}
    img {{
      display: block;
      width: 100%;
      border-radius: 12px;
      background: #050807;
      border: 1px solid #566858;
    }}
    .warning {{ color: #ffb86c; font-weight: 700; }}
  </style>
</head>
<body>
  <main>
    <section class="summary">
      <h1>Audio Proof Window Visual QC</h1>
      <p>Baseline: <code>{escape(str(payload["baselineId"]))}</code></p>
      <p>Generated: <code>{escape(str(payload["generatedAt"]))}</code></p>
      <p class="warning">This page is review evidence, not approval. Human listen proof is still required before branch inheritance.</p>
    </section>
    {''.join(rows)}
  </main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Audio Proof Window Visual QC: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is review evidence, not approval. Human listen proof is still required before branch inheritance.",
        "",
        f"- HTML contact sheet: `{payload['html']}`",
        f"- Windows: `{len(payload['windows'])}`",
        f"- Missing or failed waveforms: `{payload['failedWaveformCount']}`",
        "",
    ]
    for window in payload["windows"]:
        lines.extend(
            [
                f"## {window['label']}",
                "",
                f"- Sequence start: `{window['sequenceStartSeconds']:.2f}s`",
                f"- Duration: `{window['durationSeconds']:.2f}s`",
                "",
            ]
        )
        for artifact in window["artifacts"]:
            status = "rendered" if artifact["rendered"] else "missing-or-failed"
            lines.append(f"- {artifact['label']}: `{status}` -> `{artifact['waveform']}`")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--ffmpeg", default=None)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path, manifest = load_manifest(baseline_dir)
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg not found on PATH")

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    output_dir = baseline_dir / f"visual-proof-windows-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    proof_snippets = manifest.get("outputs", {}).get("proofSnippets") or []
    windows: list[dict[str, Any]] = []
    failed_count = 0
    for window_index, snippet in enumerate(proof_snippets, start=1):
        label = str(snippet.get("label") or f"window-{window_index}")
        window_slug = safe_slug(f"{window_index}-{label}")
        artifacts = []
        for key, artifact_label, color in PROOF_KEYS:
            path = output_path(snippet.get(key))
            if not path:
                rendered = {
                    "label": artifact_label,
                    "key": key,
                    "source": "",
                    "waveform": str(output_dir / f"{window_slug}-{key}.png"),
                    "exists": False,
                    "rendered": False,
                    "error": "missing snippet path",
                }
            else:
                rendered = render_waveform(
                    ffmpeg=ffmpeg,
                    source=Path(path),
                    dest=output_dir / f"{window_slug}-{safe_slug(key)}.png",
                    color=color,
                )
                rendered.update({"label": artifact_label, "key": key})
            failed_count += 0 if rendered["rendered"] else 1
            artifacts.append(rendered)
        windows.append(
            {
                "label": label,
                "sequenceStartSeconds": float(snippet.get("sequenceStartSeconds") or 0.0),
                "durationSeconds": float(snippet.get("durationSeconds") or 0.0),
                "artifacts": artifacts,
            }
        )

    payload = {
        "schema": "quipsly.audio-workbench.visual-proof-windows.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "html": str(output_dir / f"audio-proof-window-visual-qc-{slug}.html"),
        "markdown": str(baseline_dir / f"audio-proof-window-visual-qc-{slug}-{generated_at}.md"),
        "json": str(baseline_dir / f"audio-proof-window-visual-qc-{slug}-{generated_at}.json"),
        "outputDir": str(output_dir),
        "windowCount": len(windows),
        "failedWaveformCount": failed_count,
        "windows": windows,
    }

    html_path = Path(payload["html"])
    md_path = Path(payload["markdown"])
    json_path = Path(payload["json"])
    html_path.write_text(build_html(payload))
    md_path.write_text(build_markdown(payload) + "\n")
    json_path.write_text(json.dumps(payload, indent=2) + "\n")

    outputs = manifest.setdefault("outputs", {})
    outputs["latestVisualProofWindows"] = str(json_path)
    outputs["latestVisualProofWindowsMarkdown"] = str(md_path)
    outputs["latestVisualProofWindowsHtml"] = str(html_path)
    history = outputs.setdefault("visualProofWindows", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["latestVisualProofWindowsGeneratedAt"] = generated_at
    manifest["visualProofWindowCount"] = len(windows)
    manifest["visualProofFailedWaveformCount"] = failed_count
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {html_path}")
    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")
    print(f"Windows: {len(windows)}")
    print(f"Missing or failed waveforms: {failed_count}")


if __name__ == "__main__":
    main()
