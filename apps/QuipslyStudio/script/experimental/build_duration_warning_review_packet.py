#!/usr/bin/env python3
"""Build derivative review packets for long-form duration mismatch warnings.

Reads the latest review-blocker report, creates small review derivatives from
already-exported release artifacts, and writes a human/agent packet. It never
mutates source media, never overwrites previous release versions, and never
publishes or approves anything.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
TAIL_SECONDS = 90.0
EXTRA_SECONDS = 180.0


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-duration-warning-review")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def duration_label(seconds: Any) -> str:
    try:
        total = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(max(0, total), 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def safe_slug(value: str, fallback: str = "artifact") -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip()).strip("-_")
    return slug or fallback


def file_uri(path_value: str) -> str:
    try:
        return Path(path_value).as_uri()
    except ValueError:
        return "file://" + quote(path_value)


def tool_path(name: str) -> str:
    return shutil.which(name) or name


def run_ffmpeg_slice(source: Path, output: Path, start: float, duration: float, timeout: int = 240) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output = output.with_name(f"{output.stem}-{datetime.now().strftime('%H%M%S')}{output.suffix}")
    cmd = [
        tool_path("ffmpeg"),
        "-hide_banner",
        "-loglevel", "error",
        "-ss", f"{max(0, start):.3f}",
        "-i", str(source),
        "-t", f"{max(0.1, duration):.3f}",
        "-map", "0",
        "-c", "copy",
        "-y",
        str(output),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        # Some video files cannot stream-copy cleanly from arbitrary offsets. Fall back to a safe review transcode.
        fallback_cmd = [
            tool_path("ffmpeg"),
            "-hide_banner",
            "-loglevel", "error",
            "-ss", f"{max(0, start):.3f}",
            "-i", str(source),
            "-t", f"{max(0.1, duration):.3f}",
            "-vf", "scale='min(1280,iw)':-2",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "26",
            "-c:a", "aac",
            "-b:a", "160k",
            "-y",
            str(output),
        ]
        fallback = subprocess.run(fallback_cmd, capture_output=True, text=True, timeout=timeout)
        result_payload = {
            "command": " ".join(cmd),
            "fallbackCommand": " ".join(fallback_cmd),
            "returnCode": fallback.returncode,
            "stderr": fallback.stderr.strip(),
            "streamCopyFailed": result.stderr.strip(),
            "usedFallbackTranscode": True,
        }
    else:
        result_payload = {
            "command": " ".join(cmd),
            "returnCode": result.returncode,
            "stderr": result.stderr.strip(),
            "usedFallbackTranscode": False,
        }
    exists = output.exists() and output.stat().st_size > 0
    result_payload.update({
        "outputPath": str(output),
        "outputExists": exists,
        "outputBytes": output.stat().st_size if output.exists() else 0,
        "startSeconds": round(max(0, start), 3),
        "durationSeconds": round(max(0.1, duration), 3),
        "startLabel": duration_label(start),
        "durationLabel": duration_label(duration),
    })
    return result_payload


def artifact_extension(item: dict[str, Any]) -> str:
    path = Path(str(item.get("path") or ""))
    suffix = path.suffix.lower()
    if suffix in {".mp4", ".mov", ".m4v", ".webm", ".m4a", ".mp3", ".wav", ".aac", ".flac"}:
        return suffix
    if item.get("hasVideo"):
        return ".mp4"
    if item.get("hasAudio"):
        return ".m4a"
    return ".bin"


def media_preview_html(path_value: str, label: str) -> str:
    suffix = Path(path_value).suffix.lower()
    uri = html.escape(file_uri(path_value), quote=True)
    label_html = html.escape(label)
    if suffix in {".mp4", ".mov", ".m4v", ".webm"}:
        return f"""
        <figure class=\"preview\">
          <figcaption>{label_html}</figcaption>
          <video controls preload=\"metadata\" src=\"{uri}\"></video>
          <a href=\"{uri}\">Open video</a>
        </figure>
        """
    if suffix in {".m4a", ".mp3", ".wav", ".aac", ".flac"}:
        return f"""
        <figure class=\"preview audio\">
          <figcaption>{label_html}</figcaption>
          <audio controls preload=\"metadata\" src=\"{uri}\"></audio>
          <a href=\"{uri}\">Open audio</a>
        </figure>
        """
    return f"<p><a href=\"{uri}\">{label_html}</a></p>"


def build_packet(release_root: Path, create_derivatives: bool = True) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-review-blocker-report.json")
    report_path = Path(str(pointer.get("jsonPath") or ""))
    if not report_path.exists():
        raise SystemExit(f"Latest review blocker JSON not found: {report_path}")
    report = load_json(report_path)
    output_root = release_root / "review-board" / "duration-warning-packets"
    output_dir = output_root / stamp_now()
    output_dir.mkdir(parents=True, exist_ok=False)
    derivatives_dir = output_dir / "derivatives"

    episode_packets: list[dict[str, Any]] = []
    for episode in report.get("episodes") or []:
        warning_evidence = episode.get("warningEvidence") if isinstance(episode.get("warningEvidence"), list) else []
        for evidence in warning_evidence:
            if not isinstance(evidence, dict) or evidence.get("kind") != "long-form-duration-spread":
                continue
            comparison = [item for item in evidence.get("artifactComparison") or [] if isinstance(item, dict)]
            valid = []
            for item in comparison:
                try:
                    duration = float(item.get("durationSeconds") or 0)
                except (TypeError, ValueError):
                    duration = 0
                path = Path(str(item.get("path") or ""))
                item = dict(item)
                item["fileExists"] = path.exists()
                item["fileBytes"] = path.stat().st_size if path.exists() else 0
                item["durationSeconds"] = round(duration, 3)
                if duration > 0 and path.exists():
                    valid.append(item)
            if len(valid) < 2:
                continue
            shortest = min(valid, key=lambda item: float(item.get("durationSeconds") or 0))
            longest = max(valid, key=lambda item: float(item.get("durationSeconds") or 0))
            shortest_end = float(shortest.get("durationSeconds") or 0)
            longest_end = float(longest.get("durationSeconds") or 0)
            episode_no = episode.get("episode")
            episode_slug = f"episode-{episode_no}"
            artifact_reviews: list[dict[str, Any]] = []
            extra_reviews: list[dict[str, Any]] = []

            for item in valid:
                source = Path(str(item.get("path") or ""))
                duration = float(item.get("durationSeconds") or 0)
                artifact_slug = safe_slug(str(item.get("artifactId") or item.get("label") or source.stem))
                extension = artifact_extension(item)
                tail_duration = min(TAIL_SECONDS, duration)
                tail_start = max(0, duration - tail_duration)
                tail_output = derivatives_dir / episode_slug / f"{episode_slug}-{artifact_slug}-tail-{int(round(tail_duration))}s{extension}"
                tail_result = None
                if create_derivatives:
                    try:
                        tail_result = run_ffmpeg_slice(source, tail_output, tail_start, tail_duration)
                    except Exception as error:  # noqa: BLE001 - packet should capture safe failure evidence.
                        tail_result = {
                            "outputPath": str(tail_output),
                            "outputExists": False,
                            "error": str(error),
                            "startSeconds": round(tail_start, 3),
                            "durationSeconds": round(tail_duration, 3),
                        }
                artifact_reviews.append({
                    "artifactId": item.get("artifactId"),
                    "label": item.get("label"),
                    "sourcePath": item.get("path"),
                    "sourceDurationSeconds": duration,
                    "sourceDurationLabel": duration_label(duration),
                    "tailReview": tail_result,
                })

                if duration > shortest_end + 1:
                    extra_duration = min(EXTRA_SECONDS, duration - shortest_end)
                    extra_output = derivatives_dir / episode_slug / f"{episode_slug}-{artifact_slug}-extra-after-{safe_slug(str(shortest.get('artifactId') or 'shortest'))}-{int(round(extra_duration))}s{extension}"
                    extra_result = None
                    if create_derivatives:
                        try:
                            extra_result = run_ffmpeg_slice(source, extra_output, shortest_end, extra_duration)
                        except Exception as error:  # noqa: BLE001
                            extra_result = {
                                "outputPath": str(extra_output),
                                "outputExists": False,
                                "error": str(error),
                                "startSeconds": round(shortest_end, 3),
                                "durationSeconds": round(extra_duration, 3),
                            }
                    extra_reviews.append({
                        "artifactId": item.get("artifactId"),
                        "label": item.get("label"),
                        "sourcePath": item.get("path"),
                        "extraStartsAfterArtifactId": shortest.get("artifactId"),
                        "extraStartsAtSeconds": round(shortest_end, 3),
                        "extraStartsAtLabel": duration_label(shortest_end),
                        "extraDurationSeconds": round(extra_duration, 3),
                        "extraDurationLabel": duration_label(extra_duration),
                        "reviewDerivative": extra_result,
                    })

            episode_packets.append({
                "episode": episode_no,
                "version": episode.get("version") or "",
                "status": episode.get("status") or "",
                "urgency": evidence.get("urgency") or "duration-review",
                "spreadSeconds": evidence.get("spreadSeconds") or 0,
                "spreadLabel": evidence.get("spreadLabel") or duration_label(evidence.get("spreadSeconds")),
                "plainEnglish": evidence.get("plainEnglish") or "Duration mismatch needs review.",
                "shortestArtifact": {
                    "artifactId": shortest.get("artifactId"),
                    "label": shortest.get("label"),
                    "durationSeconds": shortest_end,
                    "durationLabel": duration_label(shortest_end),
                },
                "longestArtifact": {
                    "artifactId": longest.get("artifactId"),
                    "label": longest.get("label"),
                    "durationSeconds": longest_end,
                    "durationLabel": duration_label(longest_end),
                },
                "artifactTailReviews": artifact_reviews,
                "extraAfterShortestReviews": extra_reviews,
                "nonDestructiveRepairOptions": evidence.get("nonDestructiveRepairOptions") or [],
                "safeReviewCommands": evidence.get("safeReviewCommands") or [],
                "nextSafestAction": "Open the tail and extra-after-shortest derivatives, then decide whether the video or audio boundary is the intended release boundary.",
            })

    packet: dict[str, Any] = {
        "schema": "quipsly.duration-warning-review-packet.v1",
        "generatedAt": iso_now(),
        "status": "duration-warning-review-ready",
        "releaseRoot": str(release_root),
        "sourceReviewBlockerReport": str(report_path),
        "sessionDir": str(output_dir),
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "duration-warning-review-packet.json"),
        "markdownPath": str(output_dir / "START-HERE-duration-warning-review.md"),
        "derivativesDir": str(derivatives_dir),
        "tailSeconds": TAIL_SECONDS,
        "extraSeconds": EXTRA_SECONDS,
        "episodeCount": len(episode_packets),
        "episodes": episode_packets,
        "derivativesCreated": create_derivatives,
        "humanAsk": "Watch and listen to the generated tail/extra-boundary evidence before deciding whether the audio or video boundary is the intended release boundary.",
        "agentSafeParallelWork": "Codex may summarize duration evidence and prepare dry-run repair/promotion notes. Do not trim, promote, approve, publish, upload, schedule, overwrite, mutate sources, or create receipt truth.",
        "nextSafestAction": "Open the duration warning review packet, review the evidence snippets, then record a human decision for each flagged episode.",
        "truth": "Derivative review packet only. Reads exported release artifacts and writes small review snippets; does not mutate originals, overwrite versions, publish, upload, approve, or capture receipts.",
    }
    write_json(output_dir / "duration-warning-review-packet.json", packet)
    write_markdown(output_dir / "START-HERE-duration-warning-review.md", packet)
    write_html(output_dir / "index.html", packet)
    pointer_payload = {
        "schema": "quipsly.duration-warning-review-packet.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": packet["status"],
        "sessionDir": str(output_dir),
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "episodeCount": len(episode_packets),
        "humanAsk": packet["humanAsk"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": {
            "label": "Open duration warning review packet",
            "command": f"open {shell_quote(packet['htmlPath'])}",
            "path": packet["htmlPath"],
            "safety": "Opens local duration evidence only. No repair, trim, promotion, approval, publishing, upload, schedule, overwrite, source mutation, delete, or receipt capture occurs.",
        },
        "truth": packet["truth"],
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    write_json(output_root / "latest-duration-warning-review-packet.json", pointer_payload)
    return packet


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Duration warning review packet",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        packet["truth"],
        "",
        f"Source review report: `{packet['sourceReviewBlockerReport']}`",
        "",
    ]
    for episode in packet.get("episodes") or []:
        lines.extend([
            f"## Episode {episode.get('episode')} {episode.get('version') or ''}",
            "",
            f"- Urgency: `{episode.get('urgency')}`",
            f"- Spread: `{episode.get('spreadLabel')}` (`{episode.get('spreadSeconds')}` seconds)",
            f"- Shortest artifact: `{episode.get('shortestArtifact', {}).get('label')}` `{episode.get('shortestArtifact', {}).get('durationLabel')}`",
            f"- Longest artifact: `{episode.get('longestArtifact', {}).get('label')}` `{episode.get('longestArtifact', {}).get('durationLabel')}`",
            f"- Next safest action: {episode.get('nextSafestAction')}",
            "",
            "### Tail review derivatives",
            "",
        ])
        for item in episode.get("artifactTailReviews") or []:
            tail = item.get("tailReview") or {}
            lines.append(f"- {item.get('label')}: `{tail.get('outputPath') or 'not-created'}` status `{tail.get('outputExists')}`")
        lines.extend(["", "### Extra after shortest derivative(s)", ""])
        for item in episode.get("extraAfterShortestReviews") or []:
            derivative = item.get("reviewDerivative") or {}
            lines.append(
                f"- {item.get('label')}: starts at `{item.get('extraStartsAtLabel')}`, duration `{item.get('extraDurationLabel')}`, file `{derivative.get('outputPath') or 'not-created'}` status `{derivative.get('outputExists')}`"
            )
        lines.extend(["", "### Non-destructive repair options", ""])
        for option in episode.get("nonDestructiveRepairOptions") or []:
            lines.append(f"- {option}")
        lines.extend(["", "### Safe local review commands", ""])
        for command in episode.get("safeReviewCommands") or []:
            lines.append(f"- `{command}`")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    sections: list[str] = []
    for episode in packet.get("episodes") or []:
        tail_previews = []
        for item in episode.get("artifactTailReviews") or []:
            tail = item.get("tailReview") or {}
            if tail.get("outputExists"):
                tail_previews.append(media_preview_html(str(tail.get("outputPath") or ""), f"Tail: {item.get('label')}"))
        extra_previews = []
        for item in episode.get("extraAfterShortestReviews") or []:
            derivative = item.get("reviewDerivative") or {}
            if derivative.get("outputExists"):
                extra_previews.append(media_preview_html(str(derivative.get("outputPath") or ""), f"Extra after shortest: {item.get('label')}"))
        repair_options = "\n".join(str(option) for option in episode.get("nonDestructiveRepairOptions") or [])
        commands = "\n".join(str(command) for command in episode.get("safeReviewCommands") or [])
        sections.append(f"""
        <section class=\"episode {html.escape(str(episode.get('urgency') or 'duration-review'))}\">
          <div class=\"badge\">{html.escape(str(episode.get('urgency') or 'duration-review'))}</div>
          <h2>Episode {html.escape(str(episode.get('episode')))} {html.escape(str(episode.get('version') or ''))}</h2>
          <p><b>Spread:</b> {html.escape(str(episode.get('spreadLabel') or ''))} ({html.escape(str(episode.get('spreadSeconds') or 0))} seconds)</p>
          <p>{html.escape(str(episode.get('plainEnglish') or ''))}</p>
          <div class=\"facts\">
            <span>Shortest: {html.escape(str((episode.get('shortestArtifact') or {}).get('label') or ''))} · {html.escape(str((episode.get('shortestArtifact') or {}).get('durationLabel') or ''))}</span>
            <span>Longest: {html.escape(str((episode.get('longestArtifact') or {}).get('label') or ''))} · {html.escape(str((episode.get('longestArtifact') or {}).get('durationLabel') or ''))}</span>
          </div>
          <h3>Tail review</h3>
          <div class=\"preview-grid\">{''.join(tail_previews) or '<p>No derivative tails were created.</p>'}</div>
          <h3>Extra after the shortest artifact ends</h3>
          <p class=\"hint\">This is the mismatch zone. If it contains real episode content, the shorter artifact probably needs repair or a clear platform-specific explanation.</p>
          <div class=\"preview-grid\">{''.join(extra_previews) or '<p>No extra-after-shortest derivative was created.</p>'}</div>
          <details><summary>Non-destructive repair options</summary><pre>{html.escape(repair_options)}</pre></details>
          <details><summary>Safe local review commands</summary><pre>{html.escape(commands)}</pre></details>
        </section>
        """)
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Quipsly Duration Warning Review</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111712; --panel:#1d271f; --ink:#f8f0dc; --muted:#cbbfa2; --gold:#e8c85d; --clay:#c57b5c; --water:#6ec4d8; --line:rgba(248,240,220,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(110,196,216,.16), transparent 34%), var(--bg); color:var(--ink); }}
    header {{ padding:38px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,6vw,76px); line-height:.92; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    main {{ padding:26px clamp(16px,4vw,56px) 70px; display:grid; gap:18px; }}
    .episode {{ border:1px solid rgba(232,200,93,.45); border-radius:24px; padding:20px; background:rgba(29,39,31,.94); box-shadow:0 18px 44px rgba(0,0,0,.22); }}
    .episode.major-duration-review {{ border-color:rgba(197,123,92,.72); }}
    .badge {{ display:inline-flex; border-radius:999px; padding:7px 11px; background:rgba(0,0,0,.28); color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    h2 {{ font-size:34px; margin:14px 0 8px; }}
    h3 {{ margin-top:18px; color:var(--gold); }}
    .facts {{ display:flex; flex-wrap:wrap; gap:10px; margin:12px 0; }}
    .facts span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; color:var(--ink); background:rgba(248,240,220,.06); font-weight:800; }}
    .hint {{ color:var(--water); }}
    .preview-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    .preview {{ margin:0; border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(0,0,0,.2); }}
    .preview figcaption {{ color:var(--gold); font-weight:900; margin-bottom:8px; }}
    .preview video {{ width:100%; max-height:340px; border-radius:12px; background:#050705; }}
    .preview audio {{ width:100%; }}
    a {{ color:var(--water); font-weight:800; overflow-wrap:anywhere; }}
    details {{ margin-top:14px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
    code {{ color:var(--gold); }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Quipsly Studio</div>
    <h1>Duration warnings with actual review evidence.</h1>
    <p>{html.escape(packet['truth'])}</p>
    <p>Source report: <code>{html.escape(packet['sourceReviewBlockerReport'])}</code></p>
  </header>
  <main>{''.join(sections)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build derivative review packet for duration mismatch warnings.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--no-derivatives", action="store_true", help="Write packet without ffmpeg derivative snippets.")
    args = parser.parse_args()
    packet = build_packet(Path(args.release_root), create_derivatives=not args.no_derivatives)
    print(json.dumps({
        "ok": True,
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "episodeCount": packet["episodeCount"],
        "derivativesCreated": packet["derivativesCreated"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
