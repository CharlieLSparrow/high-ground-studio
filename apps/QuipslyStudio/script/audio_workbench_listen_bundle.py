#!/usr/bin/env python3
"""Create a friendly local listen-proof bundle for an Audio Workbench baseline.

The Audio Workbench writes excellent evidence, but the paths are long and the
correct listen order matters. This script builds a small reviewer folder with
readable symlinks, an M3U playlist, a markdown checklist, and a browser-friendly
HTML board. It does not copy or mutate media.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def safe_slug(value: str, *, max_length: int = 72) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug[:max_length].strip("-") or "item")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_name(baseline_id: str) -> str:
    safe = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"listen-proof-bundle-{safe_slug(safe)}-{stamp}"


def symlink_file(source: Path, dest: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    if dest.exists() or dest.is_symlink():
        raise FileExistsError(dest)
    os.symlink(source, dest)


def add_item(
    *,
    items: list[dict[str, Any]],
    source_path: str | None,
    output_dir: Path,
    filename: str,
    title: str,
    role: str,
    source_note: str,
    window_label: str | None = None,
    sequence_start: float | None = None,
) -> None:
    if not source_path:
        return
    source = Path(source_path)
    suffix = source.suffix or ".m4a"
    target_name = f"{filename}{suffix}"
    target = output_dir / target_name
    symlink_file(source, target)
    items.append(
        {
            "title": title,
            "role": role,
            "sourceNote": source_note,
            "windowLabel": window_label,
            "sequenceStartSeconds": sequence_start,
            "sourcePath": str(source),
            "bundlePath": str(target),
            "relativePath": target_name,
        }
    )


def write_m3u(path: Path, items: list[dict[str, Any]]) -> None:
    lines = ["#EXTM3U"]
    for item in items:
        lines.append(f"#EXTINF:-1,{item['title']}")
        lines.append(item["relativePath"])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    q = packet.get("qualitySummary", {})
    lines = [
        "# Episode 4 v006 audio listen proof",
        "",
        f"- Baseline: `{packet.get('baselineId')}`",
        f"- Status: `{packet.get('approvalStatus')}`",
        f"- Bundle folder: `{packet.get('outputDir')}`",
        f"- Full handoff WAV: `{packet.get('masterWav')}`",
        f"- Full listening M4A: `{packet.get('masterM4a')}`",
        "",
        "## Machine QC",
        "",
        f"- Ready for human listen proof: `{q.get('readyForHumanListenProof')}`",
        f"- Warnings: `{'; '.join(q.get('warnings', [])) or 'none'}`",
        f"- Advisories: `{'; '.join(q.get('advisories', [])) or 'none'}`",
        f"- Loudness: `{q.get('integratedLufs')}` LUFS",
        f"- True peak: `{q.get('truePeakDbfs')}` dBFS",
        f"- Duration delta: `{q.get('durationDeltaSeconds')}` seconds",
        "",
        "## Listen order",
        "",
    ]
    for item in packet.get("items", []):
        lines.append(f"- `{item['relativePath']}` - {item['title']} ({item['sourceNote']})")
    lines.extend(
        [
            "",
            "## Reviewer checklist",
            "",
            "- [ ] Play the full M4A long enough to judge overall level and tone.",
            "- [ ] In each proof window, compare raw aligned -> candidate source-aware -> candidate master.",
            "- [ ] Confirm Homer is not disappearing in Homer-heavy windows.",
            "- [ ] Confirm Charlie gaps do not carry distracting Homer echo.",
            "- [ ] Confirm laughter, breaths, and reactions do not feel chopped off.",
            "- [ ] Note any bad timestamp before requesting a new candidate.",
            "",
            "## Important",
            "",
            "This bundle is for listen proof only. It does not approve publication. The normal stereo WAV is the handoff file; speaker-split items are diagnostics.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    q = packet.get("qualitySummary", {})
    cards = []
    for item in packet.get("items", []):
        title = html.escape(item["title"])
        note = html.escape(item["sourceNote"])
        rel = html.escape(item["relativePath"])
        cards.append(
            f"""
            <section class="card">
              <div class="meta">{html.escape(item["role"])}</div>
              <h2>{title}</h2>
              <p>{note}</p>
              <audio controls preload="metadata" src="{rel}"></audio>
              <code>{rel}</code>
            </section>
            """
        )
    body = "\n".join(cards)
    page = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 4 v006 Audio Listen Proof</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #121812;
      --panel: #1d261b;
      --ink: #f6ecd4;
      --muted: #bfae8a;
      --moss: #90b66b;
      --gold: #f2c14e;
      --bark: #5c4128;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(144,182,107,.22), transparent 30rem),
        radial-gradient(circle at bottom right, rgba(242,193,78,.16), transparent 34rem),
        var(--bg);
      color: var(--ink);
      font: 16px/1.5 Avenir Next, Avenir, Helvetica, sans-serif;
    }}
    header {{
      padding: 48px min(6vw, 72px) 24px;
      border-bottom: 1px solid rgba(246,236,212,.14);
    }}
    .kicker {{
      color: var(--gold);
      letter-spacing: .22em;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 12px;
    }}
    h1 {{
      font-size: clamp(34px, 5vw, 68px);
      line-height: .95;
      margin: 12px 0 18px;
      max-width: 980px;
    }}
    .summary {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 28px;
      max-width: 1100px;
    }}
    .pill {{
      background: rgba(29,38,27,.72);
      border: 1px solid rgba(246,236,212,.12);
      border-radius: 18px;
      padding: 14px 16px;
    }}
    .pill b {{ color: var(--moss); display: block; }}
    main {{
      padding: 28px min(6vw, 72px) 72px;
      display: grid;
      gap: 18px;
      max-width: 1120px;
    }}
    .card {{
      background: linear-gradient(145deg, rgba(29,38,27,.94), rgba(28,25,18,.92));
      border: 1px solid rgba(246,236,212,.13);
      border-radius: 26px;
      padding: 22px;
      box-shadow: 0 18px 60px rgba(0,0,0,.28);
    }}
    .meta {{
      color: var(--gold);
      letter-spacing: .16em;
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 900;
    }}
    h2 {{ margin: 7px 0 6px; font-size: 22px; }}
    p {{ color: var(--muted); margin: 0 0 14px; }}
    audio {{ width: 100%; margin: 6px 0 12px; }}
    code {{
      display: block;
      overflow-wrap: anywhere;
      color: #d7c398;
      background: rgba(0,0,0,.22);
      border-radius: 12px;
      padding: 10px;
      font-size: 12px;
    }}
  </style>
</head>
<body>
  <header>
    <div class="kicker">Quipsly Audio Workbench</div>
    <h1>Episode 4 v006 listen proof</h1>
    <p>This is a machine-rendered candidate. It is structurally clean, but still needs human ears before branch renders or publication.</p>
    <div class="summary">
      <div class="pill"><b>Status</b>{html.escape(str(packet.get("approvalStatus")))}</div>
      <div class="pill"><b>Ready for ears</b>{html.escape(str(q.get("readyForHumanListenProof")))}</div>
      <div class="pill"><b>Loudness</b>{html.escape(str(q.get("integratedLufs")))} LUFS</div>
      <div class="pill"><b>True peak</b>{html.escape(str(q.get("truePeakDbfs")))} dBFS</div>
    </div>
  </header>
  <main>
    {body}
  </main>
</body>
</html>
"""
    path.write_text(page, encoding="utf-8")


def create_bundle(baseline_dir: Path, output_dir: Path | None) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = manifest.get("baselineId") or "unknown-baseline"
    outputs = manifest.get("outputs", {})
    bundle_dir = output_dir or (baseline_dir / output_name(baseline_id))
    bundle_dir.mkdir(parents=True, exist_ok=False)

    items: list[dict[str, Any]] = []
    add_item(
        items=items,
        source_path=(outputs.get("masterM4a") or {}).get("path"),
        output_dir=bundle_dir,
        filename="00-full-episode-4-v006-listening-copy",
        title="Full Episode 4 v006 listening copy",
        role="full-master",
        source_note="normal stereo M4A for listening",
    )
    add_item(
        items=items,
        source_path=(outputs.get("masterWav") or {}).get("path"),
        output_dir=bundle_dir,
        filename="00-full-episode-4-v006-premiere-handoff",
        title="Full Episode 4 v006 Premiere handoff WAV",
        role="full-handoff",
        source_note="normal stereo WAV for Premiere/Quipsly import",
    )
    for index, snippet in enumerate(outputs.get("proofSnippets", []), start=1):
        label = snippet.get("label") or f"window-{index}"
        start = snippet.get("sequenceStartSeconds")
        prefix = f"{index:02d}-{int(round(float(start or 0))):04d}s-{safe_slug(label, max_length=42)}"
        add_item(
            items=items,
            source_path=snippet.get("rawAligned"),
            output_dir=bundle_dir,
            filename=f"{prefix}-a-raw-parent",
            title=f"{label}: raw aligned parent evidence",
            role="proof-window",
            source_note=snippet.get("rawAlignedSource") or "raw aligned evidence",
            window_label=label,
            sequence_start=start,
        )
        add_item(
            items=items,
            source_path=snippet.get("sourceAwareContributionMix"),
            output_dir=bundle_dir,
            filename=f"{prefix}-b-v006-source-aware",
            title=f"{label}: v006 source-aware candidate",
            role="proof-window",
            source_note=snippet.get("sourceAwareContributionMixSource") or "candidate source-aware mix",
            window_label=label,
            sequence_start=start,
        )
        add_item(
            items=items,
            source_path=snippet.get("conformedMasterSpine"),
            output_dir=bundle_dir,
            filename=f"{prefix}-c-v006-mastered",
            title=f"{label}: v006 mastered candidate",
            role="proof-window",
            source_note=snippet.get("conformedMasterSpineSource") or "candidate mastered spine",
            window_label=label,
            sequence_start=start,
        )
        add_item(
            items=items,
            source_path=snippet.get("speakerSplitCharlieLeftHomerRight"),
            output_dir=bundle_dir,
            filename=f"{prefix}-d-speaker-split-diagnostic",
            title=f"{label}: speaker split diagnostic",
            role="diagnostic",
            source_note=snippet.get("speakerSplitSource") or "diagnostic speaker split",
            window_label=label,
            sequence_start=start,
        )

    packet = {
        "schema": "quipsly.audio-workbench.listen-proof-bundle.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "outputDir": str(bundle_dir),
        "masterWav": (outputs.get("masterWav") or {}).get("path"),
        "masterM4a": (outputs.get("masterM4a") or {}).get("path"),
        "qualitySummary": manifest.get("qualitySummary", {}),
        "items": items,
    }
    write_json(bundle_dir / "listen-proof-bundle.json", packet)
    write_m3u(bundle_dir / "listen-proof.m3u", items)
    write_markdown(bundle_dir / "README.md", packet)
    write_html(bundle_dir / "listen-proof.html", packet)

    manifest.setdefault("outputs", {})["listenProofBundle"] = str(bundle_dir)
    manifest.setdefault("outputs", {})["listenProofBundleManifest"] = str(bundle_dir / "listen-proof-bundle.json")
    (baseline_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return packet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    packet = create_bundle(resolve_baseline_dir(args.baseline_dir), args.output_dir)
    print(json.dumps({"outputDir": packet["outputDir"], "itemCount": len(packet["items"])}, indent=2))


if __name__ == "__main__":
    main()
