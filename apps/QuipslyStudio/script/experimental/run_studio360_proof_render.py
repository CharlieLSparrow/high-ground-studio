#!/usr/bin/env python3
"""Run exactly one Studio360 proof render from the latest renderer preflight.

This is intentionally narrower than the renderer preflight:
- It executes one proof render only.
- It never overwrites an existing output.
- It writes a versioned receipt packet, HTML/Markdown review page, and pointer.
- It does not run full renders, upload, publish, delete, repair, or mutate source
  media.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
LATEST_PREFLIGHT_POINTER = "latest-360-renderer-preflight.json"
LATEST_PROOF_POINTER = "latest-360-proof-render.json"
LATEST_PROOF_LEDGER_POINTER = "latest-360-proof-render-ledger.json"
SCHEMA = "quipsly.studio360.proof-render.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-proof-render")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


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


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def command_available(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in (
        Path("/opt/homebrew/bin") / name,
        Path("/usr/local/bin") / name,
        Path("/usr/bin") / name,
        Path("/bin") / name,
    ):
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    return ""


def ffmpeg_has_v360(ffmpeg_path: str) -> bool:
    if not ffmpeg_path:
        return False
    try:
        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-filters"],
            text=True,
            capture_output=True,
            timeout=8,
            check=False,
        )
    except Exception:
        return False
    return " v360 " in result.stdout or " v360" in result.stdout


def output_size(aspect: str) -> tuple[int, int, float, float]:
    if aspect == "9:16":
        return 1080, 1920, 72.0, 128.0
    return 1920, 1080, 82.0, 46.0


def v360_filter(aspect: str) -> str:
    width, height, h_fov, v_fov = output_size(aspect)
    return (
        f"v360=input=equirect:output=flat:w={width}:h={height}:"
        f"yaw=0:pitch=0:roll=0:h_fov={h_fov}:v_fov={v_fov},format=yuv420p"
    )


def choose_row(rows: list[dict[str, Any]], selector: str) -> dict[str, Any]:
    ready = [row for row in rows if row.get("status") == "dry-run-ready"]
    if selector in {"", "first", "first-ready"}:
        return ready[0] if ready else {}
    for row in ready:
        if selector in {
            str(row.get("candidateId") or ""),
            str(row.get("recipeId") or ""),
            str(row.get("groupKey") or ""),
            str(row.get("aspect") or ""),
        }:
            return row
    return {}


def ffprobe_media(ffprobe_path: str, media_path: Path) -> dict[str, Any]:
    if not ffprobe_path or not media_path.exists():
        return {"available": False}
    result = subprocess.run(
        [
            ffprobe_path,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(media_path),
        ],
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    payload = {}
    if result.stdout:
        try:
            payload = json.loads(result.stdout)
        except Exception:
            payload = {}
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    first_video = video_streams[0] if video_streams else {}
    return {
        "available": result.returncode == 0,
        "returncode": result.returncode,
        "durationSeconds": safe_float((payload.get("format") or {}).get("duration") if isinstance(payload.get("format"), dict) else 0),
        "sizeBytes": int((payload.get("format") or {}).get("size") or 0) if isinstance(payload.get("format"), dict) else 0,
        "streamCount": len(streams),
        "video": bool(video_streams),
        "audio": bool(audio_streams),
        "videoCodec": first_video.get("codec_name") or "",
        "width": int(first_video.get("width") or 0),
        "height": int(first_video.get("height") or 0),
        "stderr": result.stderr[-2000:] if result.stderr else "",
    }


def prepare_session(root: Path) -> Path:
    base = root / "ProofRenders" / stamp()
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def build_failure_packet(root: Path, session_dir: Path, selector: str, reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "sessionDir": str(session_dir),
        "selector": selector,
        "status": "proof-render-blocked",
        "reason": reason,
        "extra": extra or {},
        "counts": {
            "proofRenderExecuted": 0,
            "proofOutputCreated": 0,
            "fullRenderCreated": 0,
            "originalsMutated": False,
            "externalPublishing": False,
            "versionOverwritten": False,
        },
        "safety": {
            "originalsMutated": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
            "externalPublishing": False,
            "fullRenderCreated": False,
        },
        "nextSafestAction": "Resolve this proof-render blocker, then rerun one proof render only.",
    }


def build_success_or_skip_packet(root: Path, session_dir: Path, selector: str, row: dict[str, Any], ffmpeg_result: subprocess.CompletedProcess[str] | None, output_probe: dict[str, Any], status: str) -> dict[str, Any]:
    output_path = Path(str(row.get("proposedProofOutputPath") or ""))
    source_path = Path(str(row.get("proofSourcePath") or ""))
    executed = 1 if ffmpeg_result is not None else 0
    created = 1 if status == "proof-render-created" else 0
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "sessionDir": str(session_dir),
        "selector": selector,
        "status": status,
        "truth": "Studio360 proof render receipt. One proof render path is inspected/executed at most; no full render, upload, publication, delete, overwrite, repair, park, or original source mutation occurred.",
        "candidate": {
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "recipeId": row.get("recipeId") or "",
            "aspect": row.get("aspect") or "",
            "version": row.get("version") or "",
            "proofSeconds": row.get("proofSeconds") or 0,
            "renderMode": row.get("renderMode") or "",
        },
        "paths": {
            "proofSourcePath": str(source_path),
            "proofOutputPath": str(output_path),
            "fullOutputPath": row.get("proposedFullOutputPath") or "",
        },
        "ffmpeg": {
            "executed": bool(ffmpeg_result),
            "returncode": ffmpeg_result.returncode if ffmpeg_result else None,
            "stdoutPath": str(session_dir / "ffmpeg-stdout.txt"),
            "stderrPath": str(session_dir / "ffmpeg-stderr.txt"),
        },
        "ffprobe": output_probe,
        "counts": {
            "proofRenderExecuted": executed,
            "proofOutputCreated": created,
            "fullRenderCreated": 0,
            "originalsMutated": False,
            "externalPublishing": False,
            "versionOverwritten": False,
        },
        "safety": {
            "originalsMutated": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
            "externalPublishing": False,
            "fullRenderCreated": False,
            "humanReviewRequiredBeforePromotion": True,
        },
        "nextSafestAction": "Open the proof output and inspect framing/audio before promoting this renderer path to more proofs or a full render.",
        "firstSafeAction": {
            "label": "Open Studio360 proof render",
            "command": f"open '{str(output_path).replace(chr(39), chr(39) + chr(92) + chr(39) + chr(39))}'",
            "path": str(output_path),
            "safety": "Open local proof output only. No source media is changed.",
        },
    }


def write_review_files(session_dir: Path, packet: dict[str, Any]) -> tuple[Path, Path, Path]:
    json_path = session_dir / "360-proof-render.json"
    md_path = session_dir / "START-HERE-360-proof-render.md"
    html_path = session_dir / "index.html"
    write_json(json_path, packet)
    paths = packet.get("paths") if isinstance(packet.get("paths"), dict) else {}
    candidate = packet.get("candidate") if isinstance(packet.get("candidate"), dict) else {}
    ffprobe = packet.get("ffprobe") if isinstance(packet.get("ffprobe"), dict) else {}
    md_path.write_text(
        "\n".join(
            [
                "# Studio360 proof render",
                "",
                f"- Status: `{packet.get('status')}`",
                f"- Candidate: `{candidate.get('candidateId') or ''}`",
                f"- Aspect: `{candidate.get('aspect') or ''}`",
                f"- Proof output: `{paths.get('proofOutputPath') or ''}`",
                f"- Duration: `{ffprobe.get('durationSeconds') or 0}` seconds",
                f"- Resolution: `{ffprobe.get('width') or 0}x{ffprobe.get('height') or 0}`",
                f"- Audio: `{ffprobe.get('audio')}`",
                "",
                "## Truth",
                "",
                str(packet.get("truth") or "No originals were mutated. No external publication occurred."),
                "",
                "## Next safest action",
                "",
                str(packet.get("nextSafestAction") or ""),
                "",
            ]
        ),
        encoding="utf-8",
    )
    html_path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Studio360 proof render</title>
<style>
body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101612; color: #f4ead6; }}
main {{ max-width: 1080px; margin: 0 auto; padding: 32px; }}
.card {{ border: 1px solid rgba(244,234,214,.18); border-radius: 20px; background: rgba(255,255,255,.06); padding: 22px; margin: 18px 0; }}
.badge {{ display: inline-block; padding: 6px 10px; border-radius: 999px; background: #244b36; color: #a7f0c0; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; font-size: 12px; }}
code {{ color: #f8d86a; overflow-wrap: anywhere; }}
video {{ width: 100%; max-height: 70vh; background: #050605; border-radius: 16px; }}
</style>
</head>
<body>
<main>
<span class="badge">{esc(packet.get('status'))}</span>
<h1>Studio360 proof render</h1>
<div class="card">
<h2>Proof output</h2>
<p><code>{esc(paths.get('proofOutputPath'))}</code></p>
<p>Duration: <strong>{esc(ffprobe.get('durationSeconds'))}</strong>s · Resolution: <strong>{esc(ffprobe.get('width'))}x{esc(ffprobe.get('height'))}</strong> · Audio: <strong>{esc(ffprobe.get('audio'))}</strong></p>
<video src="file://{esc(paths.get('proofOutputPath'))}" controls></video>
</div>
<div class="card">
<h2>Candidate</h2>
<p>{esc(candidate.get('candidateId'))} · {esc(candidate.get('aspect'))} · {esc(candidate.get('version'))}</p>
<p>Source: <code>{esc(paths.get('proofSourcePath'))}</code></p>
</div>
<div class="card">
<h2>Truth</h2>
<p>{esc(packet.get('truth'))}</p>
<p><strong>Next:</strong> {esc(packet.get('nextSafestAction'))}</p>
</div>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )
    return json_path, md_path, html_path


def write_latest_pointer(root: Path, packet: dict[str, Any], json_path: Path, md_path: Path, html_path: Path) -> None:
    pointer = {
        "schema": "quipsly.studio360.latest-proof-render.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "",
        "humanAsk": "Open the latest proof render and inspect framing, audio, duration, and aspect before promoting this path to additional renders.",
        "agentSafeParallelWork": "Codex may summarize proof metadata, compare proof outputs, and improve review packets. Do not run full renders, upload, publish, delete, overwrite, mutate originals, or create receipts.",
        "sessionDir": packet.get("sessionDir") or "",
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts") or {},
        "candidate": packet.get("candidate") or {},
        "paths": packet.get("paths") or {},
        "ffprobe": packet.get("ffprobe") or {},
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "originalsMutated": False,
        "externalPublishing": False,
        "fullRenderCreated": False,
        "versionOverwritten": False,
    }
    write_json(root / LATEST_PROOF_POINTER, pointer)


def update_proof_ledger(root: Path, packet: dict[str, Any], json_path: Path, md_path: Path, html_path: Path) -> None:
    ledger_path = root / "ProofRenders" / "proof-render-ledger.json"
    current = load_json(ledger_path)
    entries = current.get("entries") if isinstance(current.get("entries"), list) else []
    candidate = packet.get("candidate") if isinstance(packet.get("candidate"), dict) else {}
    paths = packet.get("paths") if isinstance(packet.get("paths"), dict) else {}
    ffprobe = packet.get("ffprobe") if isinstance(packet.get("ffprobe"), dict) else {}
    entry_id = "|".join([
        str(candidate.get("candidateId") or ""),
        str(candidate.get("aspect") or ""),
        str(candidate.get("version") or ""),
        str(paths.get("proofOutputPath") or ""),
    ])
    entries = [entry for entry in entries if isinstance(entry, dict) and entry.get("entryId") != entry_id]
    entries.append({
        "entryId": entry_id,
        "updatedAt": iso_now(),
        "status": packet.get("status") or "",
        "candidate": candidate,
        "paths": paths,
        "ffprobe": ffprobe,
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "safety": packet.get("safety") or {},
    })
    entries = entries[-100:]
    aspect_counts: dict[str, int] = {}
    statuses: dict[str, int] = {}
    for entry in entries:
        entry_candidate = entry.get("candidate") if isinstance(entry.get("candidate"), dict) else {}
        aspect = str(entry_candidate.get("aspect") or "unknown")
        status = str(entry.get("status") or "unknown")
        aspect_counts[aspect] = aspect_counts.get(aspect, 0) + 1
        statuses[status] = statuses.get(status, 0) + 1
    ledger = {
        "schema": "quipsly.studio360.proof-render-ledger.v1",
        "updatedAt": iso_now(),
        "studio360Root": str(root),
        "status": "proof-render-ledger-ready" if entries else "needs-proof-render",
        "counts": {
            "entries": len(entries),
            "aspects": aspect_counts,
            "statuses": statuses,
            "originalsMutated": False,
            "externalPublishing": False,
            "fullRenderCreated": False,
            "versionOverwritten": False,
        },
        "entries": entries,
        "latestEntry": entries[-1] if entries else {},
        "truth": "Studio360 proof-render ledger only. It records local proof receipts and does not imply full render, upload, publication, deletion, overwrite, or source mutation.",
        "nextSafestAction": "Review proof outputs by aspect, then promote only the renderer path that passes human review.",
    }
    write_json(ledger_path, ledger)
    write_json(root / LATEST_PROOF_LEDGER_POINTER, {
        "schema": "quipsly.studio360.latest-proof-render-ledger.v1",
        "updatedAt": ledger["updatedAt"],
        "status": ledger["status"],
        "humanAsk": "Review the proof-render ledger and decide which proof output, if any, is safe to use as the basis for more render work.",
        "agentSafeParallelWork": "Codex may summarize ledger entries, compare aspects/statuses, and prepare review notes. Do not render, upload, publish, delete, overwrite, mutate originals, or create receipts.",
        "jsonPath": str(ledger_path),
        "counts": ledger["counts"],
        "latestEntry": ledger["latestEntry"],
        "firstSafeAction": {
            "label": "Open Studio360 proof-render ledger",
            "path": str(ledger_path),
            "command": f"open {json.dumps(str(ledger_path))}",
            "safety": "Opens local proof-render ledger evidence only. No render, full export, upload, publication, deletion, overwrite, source mutation, or receipt truth is created.",
        },
        "truth": ledger["truth"],
        "nextSafestAction": ledger["nextSafestAction"],
    })


def run(root: Path, selector: str) -> dict[str, Any]:
    session_dir = prepare_session(root)
    preflight_pointer = load_json(root / LATEST_PREFLIGHT_POINTER)
    preflight_path = Path(str(preflight_pointer.get("jsonPath") or ""))
    if not preflight_path.exists():
        return build_failure_packet(root, session_dir, selector, "latest renderer preflight is missing", {"pointer": str(root / LATEST_PREFLIGHT_POINTER)})
    preflight = load_json(preflight_path)
    rows = preflight.get("preflightRows") if isinstance(preflight.get("preflightRows"), list) else []
    row = choose_row([r for r in rows if isinstance(r, dict)], selector)
    if not row:
        return build_failure_packet(root, session_dir, selector, "no matching dry-run-ready preflight row", {"preflightPath": str(preflight_path)})
    ffmpeg_path = command_available("ffmpeg")
    ffprobe_path = command_available("ffprobe")
    if not ffmpeg_path:
        return build_failure_packet(root, session_dir, selector, "ffmpeg missing")
    if not ffmpeg_has_v360(ffmpeg_path):
        return build_failure_packet(root, session_dir, selector, "ffmpeg v360 filter missing", {"ffmpeg": ffmpeg_path})
    source_path = Path(str(row.get("proofSourcePath") or ""))
    output_path = Path(str(row.get("proposedProofOutputPath") or ""))
    if not source_path.exists():
        return build_failure_packet(root, session_dir, selector, "proof source missing", {"proofSourcePath": str(source_path)})
    if not output_path:
        return build_failure_packet(root, session_dir, selector, "proof output path missing")
    if output_path.exists():
        probe = ffprobe_media(ffprobe_path, output_path)
        return build_success_or_skip_packet(root, session_dir, selector, row, None, probe, "proof-output-already-exists")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg_path,
        "-hide_banner",
        "-n",
        "-t",
        str(int(row.get("proofSeconds") or 10)),
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        v360_filter(str(row.get("aspect") or "16:9")),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    command_path = session_dir / "ffmpeg-command.json"
    write_json(command_path, {"argv": command, "source": str(source_path), "output": str(output_path)})
    result = subprocess.run(command, text=True, capture_output=True, timeout=600, check=False)
    (session_dir / "ffmpeg-stdout.txt").write_text(result.stdout or "", encoding="utf-8")
    (session_dir / "ffmpeg-stderr.txt").write_text(result.stderr or "", encoding="utf-8")
    probe = ffprobe_media(ffprobe_path, output_path)
    if result.returncode != 0 or not output_path.exists():
        return build_failure_packet(
            root,
            session_dir,
            selector,
            "ffmpeg proof render failed",
            {"returncode": result.returncode, "stderrPath": str(session_dir / "ffmpeg-stderr.txt"), "commandPath": str(command_path)},
        )
    return build_success_or_skip_packet(root, session_dir, selector, row, result, probe, "proof-render-created")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("selector", nargs="?", default="first", help="first, candidateId, recipeId, groupKey, or aspect")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.root)
    packet = run(root, args.selector)
    session_dir = Path(str(packet.get("sessionDir") or ""))
    json_path, md_path, html_path = write_review_files(session_dir, packet)
    write_latest_pointer(root, packet, json_path, md_path, html_path)
    update_proof_ledger(root, packet, json_path, md_path, html_path)
    print(json.dumps({
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "outputPath": (packet.get("paths") or {}).get("proofOutputPath") if isinstance(packet.get("paths"), dict) else "",
        "nextSafestAction": packet.get("nextSafestAction"),
    }, indent=2))
    return 0 if packet.get("status") in {"proof-render-created", "proof-output-already-exists"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
