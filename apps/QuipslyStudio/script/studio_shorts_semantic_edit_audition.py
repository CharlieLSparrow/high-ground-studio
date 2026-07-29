#!/usr/bin/env python3
"""Create a versioned audition packet for one semantic edit candidate.

Auditions are local preview artifacts for testing proposed in/out points. They do
not mutate timeline decisions, source media, transcript approval, exports used
for publishing, publication state, or receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_CANDIDATES_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-edit-candidates"
    / "quipsly-studio-shorts-semantic-edit-candidates.json"
)
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "semantic-edit-auditions"
SCHEMA = "quipsly.studio.shorts-semantic-edit-audition.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def slug(value: str, fallback: str = "audition") -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean or fallback


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Semantic edit candidates JSON not found: {path}\nRun: script/agentctl.sh studio-shorts-semantic-edit-candidates --all")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def choose_item(items: list[dict[str, Any]], short_id: str, rank: int) -> dict[str, Any]:
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in semantic edit candidates: {short_id}")
    if rank > 0:
        for item in items:
            if int(item.get("rank") or -1) == rank:
                return item
        raise SystemExit(f"Rank not found in semantic edit candidates: {rank}")
    if items:
        return items[0]
    raise SystemExit("Semantic edit candidates board has no items.")


def choose_candidate(item: dict[str, Any], index: int) -> dict[str, Any]:
    candidates = [candidate for candidate in item.get("candidates", []) if isinstance(candidate, dict)]
    if not candidates:
        raise SystemExit(f"No candidates for {item.get('shortId')}")
    if index < 0 or index >= len(candidates):
        raise SystemExit(f"Candidate index out of range: {index}")
    return candidates[index]


def audition_range(candidate: dict[str, Any], duration: float) -> dict[str, Any]:
    ctype = str(candidate.get("type") or "")
    if ctype == "test-stronger-in-point":
        start = float(candidate.get("candidateAudioLeadSeconds") or candidate.get("candidateInSeconds") or 0)
        end = duration
    elif ctype == "check-earlier-out-point":
        out = float(candidate.get("candidateOutSeconds") or duration)
        start = max(0.0, out - 10.0)
        end = min(duration, out + 1.0)
    else:
        start = 0.0
        end = min(duration, 12.0)
    start = max(0.0, min(start, duration))
    end = max(start, min(end, duration))
    length = max(0.0, end - start)
    warnings: list[str] = []
    if length < 5.0:
        warnings.append("Audition tail is under 5 seconds; this may indicate the source short needs a different excerpt, not just a trim.")
    if start > duration * 0.65:
        warnings.append("Candidate starts late in the existing short; review whether the original short recipe is too setup-heavy.")
    return {"startSeconds": round(start, 3), "endSeconds": round(end, 3), "durationSeconds": round(length, 3), "warnings": warnings}


def build_payload(candidates_path: Path, output_root: Path, item: dict[str, Any], candidate: dict[str, Any], candidate_index: int) -> dict[str, Any]:
    media_path = Path(str(item.get("mediaPath") or ""))
    if not media_path.exists():
        raise SystemExit(f"Media not found for audition: {media_path}")
    media_duration = ffprobe_duration(media_path)
    arange = audition_range(candidate, media_duration)
    short_id = str(item.get("shortId") or "unknown-short")
    folder = output_root / slug(short_id) / f"{stamp()}-{slug(str(candidate.get('type') or 'candidate'))}"
    preview_path = folder / f"{slug(short_id)}-{slug(str(candidate.get('type') or 'candidate'))}-audition.mp4"
    ffmpeg_command = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{arange['startSeconds']:.3f}",
        "-i",
        str(media_path),
        "-t",
        f"{arange['durationSeconds']:.3f}",
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(preview_path),
    ]
    paths = {
        "folder": str(folder),
        "json": str(folder / "semantic-edit-audition.json"),
        "markdown": str(folder / "semantic-edit-audition.md"),
        "html": str(folder / "semantic-edit-audition.html"),
        "preview": str(preview_path),
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceCandidatesJson": str(candidates_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "title": item.get("title"),
        "mediaPath": str(media_path),
        "mediaUri": file_uri(str(media_path)),
        "sourceMediaDurationSeconds": round(media_duration, 3),
        "candidateIndex": candidate_index,
        "candidate": candidate,
        "auditionRange": arange,
        "renderedPreview": False,
        "ffmpegCommand": " ".join(shell_quote(part) for part in ffmpeg_command),
        "ffmpegCommandArgv": ffmpeg_command,
        "artifactPaths": paths,
        "safeCommands": {
            "openSourceShort": f"open {shell_quote(str(media_path))}",
            "renderAuditionPreview": " ".join(shell_quote(part) for part in ffmpeg_command),
            "openAuditionPreview": f"open {shell_quote(str(preview_path))}",
            "revealAuditionFolder": f"open {shell_quote(str(folder))}",
        },
        "nextSafestAction": "Render or open the audition preview, watch/listen it, then record whether the candidate improves the hook/cadence before changing timeline decisions.",
        "truth": "Versioned local semantic edit audition packet only. It does not mutate source media, timeline decisions, canonical exports, transcript approval, publication state, or receipt truth.",
    }


def render_preview(payload: dict[str, Any]) -> dict[str, Any]:
    duration = float((payload.get("auditionRange") or {}).get("durationSeconds") or 0)
    if duration <= 0:
        raise SystemExit("Audition range duration is zero; refusing to render empty preview.")
    folder = Path(payload["artifactPaths"]["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(payload["ffmpegCommandArgv"], capture_output=True, text=True)
    payload["ffmpegExitCode"] = result.returncode
    payload["ffmpegStderrTail"] = result.stderr[-4000:]
    payload["renderedPreview"] = result.returncode == 0 and Path(payload["artifactPaths"]["preview"]).exists()
    if not payload["renderedPreview"]:
        payload["nextSafestAction"] = "Preview render failed. Inspect ffmpegStderrTail, keep the packet, and do not change timeline decisions from this failed audition."
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    candidate = payload.get("candidate") or {}
    arange = payload.get("auditionRange") or {}
    lines = [
        "# Semantic edit audition",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode: `Episode {payload.get('episode')}`",
        f"- Candidate: `{candidate.get('type')}`",
        f"- Source: `{payload.get('mediaPath')}`",
        f"- Audition range: `{arange.get('startSeconds')}` to `{arange.get('endSeconds')}` (`{arange.get('durationSeconds')}`s)",
        f"- Rendered preview: `{payload.get('renderedPreview')}`",
        "",
        payload.get("truth", ""),
        "",
        "## Candidate",
        "",
        f"- Reason: {candidate.get('reason')}",
        f"- Anchor: `{candidate.get('anchorWord', '')}` / {candidate.get('anchorPhrase', '')}",
        f"- Human review: {candidate.get('humanReview')}",
        "",
        "## Warnings",
        "",
    ]
    for warning in arange.get("warnings", []):
        lines.append(f"- {warning}")
    if not arange.get("warnings"):
        lines.append("- none")
    lines.extend(["", "## Safe commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        lines.append(f"- {label}: `{command}`")
    lines.extend(["", f"Next safest action: {payload.get('nextSafestAction')}", ""])
    return "\n".join(lines)


def render_html(payload: dict[str, Any]) -> str:
    candidate = payload.get("candidate") or {}
    arange = payload.get("auditionRange") or {}
    preview = payload.get("artifactPaths", {}).get("preview") if payload.get("renderedPreview") else payload.get("mediaPath")
    video = f"<video controls preload='metadata' src='{esc(file_uri(str(preview)))}'></video>" if preview else ""
    warnings = "".join(f"<li>{esc(warning)}</li>" for warning in arange.get("warnings", [])) or "<li>none</li>"
    buttons = "".join(f"<button data-copy='{esc(command)}'>{esc(label)}</button>" for label, command in (payload.get("safeCommands") or {}).items())
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Semantic edit audition - {esc(payload.get('shortId'))}</title><style>
:root{{color-scheme:dark;--soil:#171008;--moss:#14261a;--cream:#fff0d0;--honey:#f2c94c;--fern:#8ee39a;--water:#76d7df;--line:rgba(255,240,208,.16)}}*{{box-sizing:border-box}}body{{margin:0;color:var(--cream);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(140deg,var(--moss),var(--soil))}}main{{width:min(1100px,calc(100vw - 32px));margin:0 auto;padding:34px 0 80px}}article{{border:1px solid var(--line);border-radius:30px;background:rgba(255,240,208,.07);padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.25)}}h1{{font-size:clamp(34px,5vw,64px);line-height:.94;letter-spacing:-.05em;margin:0 0 8px}}h2{{color:var(--honey);font-size:13px;letter-spacing:.14em;text-transform:uppercase}}video{{width:100%;max-height:620px;object-fit:contain;background:#050604;border:1px solid var(--line);border-radius:22px}}code{{color:var(--water);overflow-wrap:anywhere}}button{{border:1px solid var(--line);border-radius:999px;background:rgba(118,215,223,.13);color:var(--cream);padding:8px 10px;margin:4px}}.truth{{color:rgba(255,240,208,.76)}}
</style></head><body><main><article><h2>Quipsly Studio</h2><h1>Semantic edit audition</h1>{video}<p class="truth">{esc(payload.get('truth'))}</p><p><strong>Range:</strong> {esc(arange.get('startSeconds'))} to {esc(arange.get('endSeconds'))} ({esc(arange.get('durationSeconds'))}s)</p><p><strong>Candidate:</strong> {esc(candidate.get('type'))}</p><p><strong>Reason:</strong> {esc(candidate.get('reason'))}</p><p><strong>Anchor:</strong> {esc(candidate.get('anchorPhrase'))}</p><h3>Warnings</h3><ul>{warnings}</ul><h3>Safe commands</h3>{buttons}<p><strong>Next:</strong> {esc(payload.get('nextSafestAction'))}</p></article></main><script>document.querySelectorAll('button[data-copy]').forEach((b)=>b.addEventListener('click',async()=>{{await navigator.clipboard.writeText(b.dataset.copy||'');const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,900)}}));</script></body></html>"""


def write_outputs(payload: dict[str, Any]) -> None:
    folder = Path(payload["artifactPaths"]["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    Path(payload["artifactPaths"]["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    Path(payload["artifactPaths"]["markdown"]).write_text(render_markdown(payload), encoding="utf-8")
    Path(payload["artifactPaths"]["html"]).write_text(render_html(payload), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a semantic edit audition packet for one short candidate.")
    parser.add_argument("--candidates", default=str(DEFAULT_CANDIDATES_JSON), help="Semantic edit candidates JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Audition output root.")
    parser.add_argument("--short-id", default="", help="Short id to audition. Defaults to first ranked candidate.")
    parser.add_argument("--rank", type=int, default=0, help="Candidate item rank to audition.")
    parser.add_argument("--candidate-index", type=int, default=0, help="Candidate index within the selected short.")
    parser.add_argument("--render-preview", action="store_true", help="Render a local audition preview clip with ffmpeg.")
    parser.add_argument("--dry-run", action="store_true", help="Print payload without writing packet files or rendering.")
    args = parser.parse_args()

    candidates_path = Path(args.candidates).expanduser()
    board = read_json(candidates_path)
    items = [item for item in board.get("items", []) if isinstance(item, dict)]
    item = choose_item(items, args.short_id, args.rank)
    candidate = choose_candidate(item, args.candidate_index)
    payload = build_payload(candidates_path, Path(args.output_root).expanduser(), item, candidate, args.candidate_index)
    if args.dry_run:
        payload["dryRun"] = True
        payload["truth"] = "Dry run only. No packet files were written, no preview was rendered, no timeline/media/export/publication state was mutated."
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0
    if args.render_preview:
        payload = render_preview(payload)
    write_outputs(payload)
    print(json.dumps({
        "ok": True,
        "shortId": payload.get("shortId"),
        "renderedPreview": payload.get("renderedPreview"),
        "artifactPaths": payload.get("artifactPaths"),
        "auditionRange": payload.get("auditionRange"),
        "warnings": (payload.get("auditionRange") or {}).get("warnings", []),
        "nextSafestAction": payload.get("nextSafestAction"),
        "truth": payload.get("truth"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
