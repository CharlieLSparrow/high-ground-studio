#!/usr/bin/env python3
"""Create a review workorder for carry-forward short candidates.

This script does not copy media, export media, approve shorts, or claim that an
older short belongs to a newer episode version. It turns a carry-forward
manifest into a human/agent checklist so prior good work can be reviewed
against the current edit without becoming fake readiness.
"""
from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MANIFEST = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/"
    "shorts-carryforward-review/episode-01-v004-shorts-carryforward-manifest.json"
)


@dataclass
class MediaFacts:
    status: str = "not-probed"
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    aspect: str = ""
    fps: float | None = None
    has_video: bool = False
    has_audio: bool = False
    video_codec: str = ""
    audio_codec: str = ""
    duration_bucket: str = ""
    review_hint: str = ""
    warning: str = ""


@dataclass
class ShortReviewItem:
    index: int
    title: str
    filename: str
    source_path: str
    source_version: str
    target_version: str
    bytes: int
    media_facts: MediaFacts = field(default_factory=MediaFacts)
    status: str = "needs-timing-review"
    review_checks: list[str] = field(default_factory=lambda: [
        "Open the candidate short and confirm the hook still makes sense against the target episode version.",
        "Check whether the start lands on a complete thought, breath, or intentional cold open.",
        "Check whether the ending resolves cleanly without feeling chopped.",
        "Confirm 9:16 framing keeps faces, captions, and important gestures readable.",
        "Confirm captions/text do not sit on faces.",
        "Confirm audio cadence still feels human, not over-tightened.",
        "Decide accept, refine, reject, or hold before any native target-version export.",
    ])
    next_action: str = "Review against target version, then export accepted/refined shorts as native target-version shorts."
    truth: str = (
        "Carry-forward candidate only. This is not a current-version short export, "
        "approval, publication, or receipt."
    )


def read_manifest(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data.get("candidates"), list):
        raise ValueError(f"manifest has no candidates list: {path}")
    return data


def parse_rate(raw: str) -> float | None:
    if not raw or raw == "0/0":
        return None
    try:
        numerator, denominator = raw.split("/", 1)
        denominator_value = float(denominator)
        if denominator_value == 0:
            return None
        return round(float(numerator) / denominator_value, 3)
    except (ValueError, ZeroDivisionError):
        return None


def aspect_label(width: int | None, height: int | None) -> str:
    if not width or not height:
        return ""
    ratio = width / height
    if abs(ratio - (9 / 16)) < 0.04:
        return "9:16"
    if abs(ratio - (16 / 9)) < 0.04:
        return "16:9"
    if abs(ratio - 1) < 0.04:
        return "1:1"
    return f"{width}:{height}"


def duration_bucket(duration: float | None) -> tuple[str, str]:
    if duration is None:
        return ("unknown-duration", "Duration is unknown; verify playback before review.")
    if duration < 10:
        return (
            "micro-proof",
            "Very short. Treat as a proof blip, cold-open sting, or reject unless the hook is instantly clear.",
        )
    if duration < 20:
        return (
            "short-hook",
            "Short enough for a tight hook. Check that the thought resolves and does not feel like a fragment.",
        )
    if duration <= 60:
        return (
            "standard-social-short",
            "Good platform-short duration range. Focus review on hook, pacing, captions, and clean ending.",
        )
    if duration <= 90:
        return (
            "extended-short",
            "Longer social short. Only keep if the story arc earns the extra time.",
        )
    return (
        "too-long-for-default-short",
        "Likely too long for the default short lane. Consider splitting or using as a platform-specific variant.",
    )


def probe_media(path_text: str, enabled: bool = True) -> MediaFacts:
    path = Path(path_text).expanduser()
    if not enabled:
        return MediaFacts(status="disabled", warning="Media probing disabled for this workorder run.")
    if not path.exists():
        return MediaFacts(status="missing", warning="Source short file is missing.")
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return MediaFacts(status="ffprobe-missing", warning="ffprobe is not installed or not on PATH.")

    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=20)
        data = json.loads(result.stdout or "{}")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        return MediaFacts(status="probe-error", warning=str(error))

    streams = data.get("streams", []) if isinstance(data.get("streams"), list) else []
    format_payload = data.get("format", {}) if isinstance(data.get("format"), dict) else {}
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    duration_raw = format_payload.get("duration")
    duration: float | None = None
    if duration_raw is not None:
        try:
            duration = round(float(duration_raw), 3)
        except ValueError:
            duration = None
    width = int(video_stream.get("width")) if isinstance(video_stream, dict) and video_stream.get("width") else None
    height = int(video_stream.get("height")) if isinstance(video_stream, dict) and video_stream.get("height") else None
    bucket, hint = duration_bucket(duration)
    return MediaFacts(
        status="ok",
        duration_seconds=duration,
        width=width,
        height=height,
        aspect=aspect_label(width, height),
        fps=parse_rate(str(video_stream.get("avg_frame_rate", ""))) if isinstance(video_stream, dict) else None,
        has_video=video_stream is not None,
        has_audio=audio_stream is not None,
        video_codec=str(video_stream.get("codec_name", "")) if isinstance(video_stream, dict) else "",
        audio_codec=str(audio_stream.get("codec_name", "")) if isinstance(audio_stream, dict) else "",
        duration_bucket=bucket,
        review_hint=hint,
    )


def build_items(manifest: dict[str, Any]) -> list[ShortReviewItem]:
    items: list[ShortReviewItem] = []
    for position, candidate in enumerate(manifest.get("candidates", []), start=1):
        if not isinstance(candidate, dict):
            continue
        index = int(candidate.get("index") or position)
        title = str(candidate.get("title") or candidate.get("filename") or f"Candidate {index:02d}")
        filename = str(candidate.get("filename") or Path(str(candidate.get("sourcePath", ""))).name)
        source_path = str(candidate.get("sourcePath") or "")
        source_version = str(candidate.get("sourceVersion") or manifest.get("sourceVersion") or "")
        target_version = str(candidate.get("targetVersion") or manifest.get("targetVersion") or "")
        bytes_value = int(candidate.get("bytes") or 0)
        items.append(
            ShortReviewItem(
                index=index,
                title=title,
                filename=filename,
                source_path=source_path,
                source_version=source_version,
                target_version=target_version,
                bytes=bytes_value,
                media_facts=probe_media(source_path),
            )
        )
    return items


def build_workorder(manifest_path: Path, manifest: dict[str, Any], items: list[ShortReviewItem]) -> dict[str, Any]:
    return {
        "model": "quipsly-studio-shorts-carryforward-workorder",
        "version": "2026-07-02.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": manifest.get("episode"),
        "sourceVersion": manifest.get("sourceVersion"),
        "targetVersion": manifest.get("targetVersion"),
        "sourceManifest": str(manifest_path),
        "candidateCount": len(items),
        "status": "needs-human-or-agent-review",
        "reviewOutcomes": ["accept", "refine", "reject", "hold"],
        "items": [asdict(item) for item in items],
        "nextSafestAction": (
            "Review candidates against the target episode edit. Export accepted or refined shorts "
            "into a new non-overwriting native target-version package."
        ),
        "truth": (
            "This is a workorder over carry-forward candidates. It does not mutate source media, "
            "copy media, approve media, publish media, or make older shorts count as native current-version shorts."
        ),
    }


def render_markdown(workorder: dict[str, Any]) -> str:
    lines = [
        "# Episode shorts carry-forward workorder",
        "",
        f"Generated: `{workorder['generatedAt']}`",
        f"Episode: `{workorder.get('episode')}`",
        f"Source version: `{workorder.get('sourceVersion')}`",
        f"Target version: `{workorder.get('targetVersion')}`",
        f"Source manifest: `{workorder.get('sourceManifest')}`",
        "",
        "> Truth: carry-forward candidates are review inputs, not native current-version shorts, approvals, posts, or receipts.",
        "",
        "## Review outcomes",
        "",
        "- `accept`: timing and framing still work; export as a native target-version short later.",
        "- `refine`: idea is good, but start/end/framing/caption/audio needs adjustment.",
        "- `reject`: not useful for this target version.",
        "- `hold`: needs a human decision or missing context.",
        "",
        "## Candidates",
        "",
    ]
    for item in workorder["items"]:
        lines.append(f"### {item['index']:02d}. {item['title']}")
        lines.append("")
        lines.append(f"- File: `{item['filename']}`")
        lines.append(f"- Source path: `{item['source_path']}`")
        lines.append(f"- Status: `{item['status']}`")
        facts = item.get("media_facts", {})
        lines.append(
            "- Media facts: "
            f"`{facts.get('duration_seconds', 'unknown')}s`, "
            f"`{facts.get('width', '?')}x{facts.get('height', '?')}`, "
            f"`{facts.get('aspect') or 'unknown aspect'}`, "
            f"audio `{facts.get('has_audio', False)}`, "
            f"`{facts.get('duration_bucket') or 'unknown bucket'}`"
        )
        if facts.get("review_hint"):
            lines.append(f"- Media review hint: {facts['review_hint']}")
        if facts.get("warning"):
            lines.append(f"- Media warning: {facts['warning']}")
        lines.append(f"- Next action: {item['next_action']}")
        lines.append("- Checks:")
        for check in item["review_checks"]:
            lines.append(f"  - {check}")
        lines.append("")
    lines.append("## Next safest action")
    lines.append("")
    lines.append(workorder["nextSafestAction"])
    lines.append("")
    return "\n".join(lines)


def file_uri(path_text: str) -> str:
    try:
        return Path(path_text).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def render_html(workorder: dict[str, Any]) -> str:
    title = f"Episode {workorder.get('episode')} shorts carry-forward review"
    rows: list[str] = []
    for item in workorder["items"]:
        checks = "\n".join(f"<li>{html.escape(check)}</li>" for check in item["review_checks"])
        source_uri = file_uri(item.get("source_path", ""))
        facts = item.get("media_facts", {})
        duration = facts.get("duration_seconds")
        duration_text = f"{duration:.1f}s" if isinstance(duration, (int, float)) else "unknown"
        size_text = (
            f"{facts.get('width')}x{facts.get('height')}"
            if facts.get("width") and facts.get("height")
            else "unknown size"
        )
        audio_text = "audio present" if facts.get("has_audio") else "audio missing"
        bucket_text = str(facts.get("duration_bucket") or "unknown bucket")
        hint_text = str(facts.get("review_hint") or "")
        media_warning = facts.get("warning") or ""
        command_base = (
            "script/shorts_carryforward_record_review.py "
            f"--index {item['index']} --outcome "
        )
        rows.append(
            f"""
            <article class="candidate">
              <div class="candidate__copy">
                <p class="eyebrow">Candidate {item['index']:02d}</p>
                <h2>{html.escape(item['title'])}</h2>
                <p class="filename">{html.escape(item['filename'])}</p>
                <div class="facts">
                  <span>{html.escape(duration_text)}</span>
                  <span>{html.escape(size_text)}</span>
                  <span>{html.escape(str(facts.get('aspect') or 'unknown aspect'))}</span>
                  <span>{html.escape(audio_text)}</span>
                  <span>{html.escape(bucket_text)}</span>
                </div>
                {f'<p class="hint">{html.escape(hint_text)}</p>' if hint_text else ''}
                {f'<p class="warning">{html.escape(media_warning)}</p>' if media_warning else ''}
                <p class="truth">{html.escape(item['truth'])}</p>
                <ul>{checks}</ul>
                <div class="commands">
                  <code>{html.escape(command_base)}accept --reviewer Mako --note "Works against v004"</code>
                  <code>{html.escape(command_base)}refine --reviewer Mako --note "Good idea, needs timing/framing"</code>
                  <code>{html.escape(command_base)}reject --reviewer Mako --note "Not useful for v004"</code>
                  <code>{html.escape(command_base)}hold --reviewer Mako --note "Needs Charlie decision"</code>
                </div>
              </div>
              <div class="candidate__media">
                <video controls preload="metadata" src="{html.escape(source_uri)}"></video>
                <p><a href="{html.escape(source_uri)}">Open source short</a></p>
              </div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bark: #241c16;
      --soil: #35281e;
      --moss: #7ea36a;
      --fern: #b8d99a;
      --honey: #f1c95b;
      --clay: #d9855b;
      --mist: #e8dfce;
      --ink: #fff8e8;
      --panel: rgba(255, 248, 232, 0.07);
      --line: rgba(255, 248, 232, 0.15);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 8%, rgba(126, 163, 106, 0.25), transparent 28rem),
        radial-gradient(circle at 90% 18%, rgba(241, 201, 91, 0.17), transparent 24rem),
        linear-gradient(135deg, #151d17, var(--bark) 58%, #15120f);
      color: var(--ink);
      line-height: 1.5;
    }}
    main {{ width: min(1320px, calc(100vw - 48px)); margin: 0 auto; padding: 40px 0 80px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 32px;
      background: linear-gradient(135deg, rgba(255, 248, 232, 0.10), rgba(126, 163, 106, 0.08));
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
    }}
    .eyebrow {{
      margin: 0 0 8px;
      color: var(--honey);
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 0.78rem;
    }}
    h1 {{ margin: 0; font-size: clamp(2.1rem, 5vw, 4.6rem); line-height: 0.95; max-width: 860px; }}
    .hero p {{ color: var(--mist); max-width: 850px; font-size: 1.08rem; }}
    .status-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 24px; }}
    .stat {{ border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: rgba(0, 0, 0, 0.18); }}
    .stat strong {{ display: block; font-size: 1.55rem; color: var(--fern); }}
    .candidate {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 430px);
      gap: 24px;
      margin-top: 24px;
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 26px;
      background: var(--panel);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.2);
    }}
    .candidate h2 {{ margin: 0 0 6px; font-size: 1.45rem; }}
    .filename {{ margin: 0 0 14px; color: var(--fern); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; overflow-wrap: anywhere; }}
    .facts {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }}
    .facts span {{
      border: 1px solid rgba(184, 217, 154, 0.24);
      border-radius: 999px;
      padding: 5px 9px;
      color: var(--fern);
      background: rgba(126, 163, 106, 0.10);
      font-size: 0.82rem;
      font-weight: 800;
    }}
    .hint {{ color: #f7e4a1; border-left: 4px solid var(--honey); padding-left: 12px; }}
    .warning {{ color: #ffd5bf; border-left: 4px solid var(--clay); padding-left: 12px; }}
    .truth {{ color: var(--mist); border-left: 4px solid var(--clay); padding-left: 12px; }}
    ul {{ padding-left: 1.15rem; color: var(--mist); }}
    .commands {{ display: grid; gap: 8px; margin-top: 16px; }}
    code {{ display: block; padding: 10px 12px; border-radius: 12px; background: rgba(0, 0, 0, 0.35); color: #fff0bd; overflow-x: auto; }}
    video {{ width: 100%; max-height: 68vh; background: #050505; border-radius: 18px; border: 1px solid var(--line); }}
    a {{ color: var(--honey); }}
    @media (max-width: 900px) {{
      main {{ width: min(100vw - 24px, 760px); padding-top: 20px; }}
      .hero {{ padding: 24px; }}
      .candidate {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio review workbench</p>
      <h1>{html.escape(title)}</h1>
      <p>These are carry-forward candidates from <strong>{html.escape(str(workorder.get('sourceVersion')))}</strong> for review against <strong>{html.escape(str(workorder.get('targetVersion')))}</strong>. Watch, decide, and record the decision before creating native current-version shorts.</p>
      <div class="status-grid">
        <div class="stat"><strong>{len(workorder['items'])}</strong> candidates</div>
        <div class="stat"><strong>0</strong> approvals implied</div>
        <div class="stat"><strong>0</strong> media mutations</div>
        <div class="stat"><strong>4</strong> outcomes: accept, refine, reject, hold</div>
      </div>
    </section>
    {''.join(rows)}
  </main>
</body>
</html>
"""


def default_output_dir(manifest_path: Path) -> Path:
    return manifest_path.parent


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a shorts carry-forward realignment workorder.")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST), help="Carry-forward manifest JSON.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to the manifest folder.")
    parser.add_argument("--basename", default="episode-01-v004-shorts-realignment-workorder")
    parser.add_argument("--format", choices=["markdown", "json", "html", "both", "all"], default="all")
    args = parser.parse_args()

    manifest_path = Path(args.manifest).expanduser()
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else default_output_dir(manifest_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = read_manifest(manifest_path)
    items = build_items(manifest)
    workorder = build_workorder(manifest_path, manifest, items)

    if args.format in {"json", "both", "all"}:
        (output_dir / f"{args.basename}.json").write_text(
            json.dumps(workorder, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    if args.format in {"markdown", "both", "all"}:
        (output_dir / f"{args.basename}.md").write_text(render_markdown(workorder), encoding="utf-8")
    if args.format in {"html", "all"}:
        (output_dir / f"{args.basename}.html").write_text(render_html(workorder), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(workorder, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(workorder), end="")
    else:
        print(render_markdown(workorder), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
