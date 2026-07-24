#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
RENDER = ROOT_DIR / "script" / "render_episode1_visual_proxy_export.sh"
READINESS = ROOT_DIR / "script" / "report_episode1_editor_readiness.sh"


def run(command, *, timeout=None):
    return subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def load_readiness():
    result = run([str(READINESS), "--json"], timeout=45)
    if result.returncode != 0:
        raise SystemExit("Could not read Episode 1 readiness:\n" + (result.stdout or "") + (result.stderr or ""))
    try:
        return json.loads(result.stdout)
    except Exception as error:
        raise SystemExit(f"Readiness report did not return valid JSON: {type(error).__name__}: {error}")


def render_one(format_name, output_path, *, proof_duration, include_audio, keep_work):
    command = [
        str(RENDER),
        "--format",
        format_name,
        "--output",
        str(output_path),
        "--json",
    ]
    if proof_duration is not None:
        command.extend(["--max-duration", str(proof_duration)])
    if include_audio:
        command.extend(["--include-audio", "--require-audio"])
    if keep_work:
        command.append("--keep-work")

    result = run(command, timeout=900)
    if result.returncode != 0:
        raise RuntimeError((result.stdout or "") + (result.stderr or ""))
    return json.loads(result.stdout)


def video_size(summary):
    for stream in summary.get("probe", {}).get("streams", []):
        if stream.get("codec_type") == "video":
            return stream.get("width"), stream.get("height")
    return None, None


def has_stream(summary, kind):
    return any(stream.get("codec_type") == kind for stream in summary.get("probe", {}).get("streams", []))


def main():
    parser = argparse.ArgumentParser(description="Export Episode 1 horizontal + vertical package from Quipsly metadata.")
    parser.add_argument("--output-dir", default=str(Path.home() / "Movies" / "Quipsly" / "Exports" / "Episode 1"))
    parser.add_argument("--basename", default="episode-1-quipsly-export")
    parser.add_argument("--proof-duration", type=float, default=None, help="Render only the first N program seconds.")
    parser.add_argument("--allow-visual-only", action="store_true", help="Do not require audio proxies; render silent visual package.")
    parser.add_argument("--keep-work", action="store_true", help="Keep renderer intermediate chunks.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    readiness = load_readiness()
    include_audio = not args.allow_visual_only

    if include_audio and readiness.get("productionReady") is not True:
        payload = {
            "status": "blocked",
            "reason": "Episode 1 production package requires audio proxies. Use --allow-visual-only for silent proof exports.",
            "readinessStatus": readiness.get("status"),
            "productionReady": readiness.get("productionReady"),
            "productionReadinessDetail": readiness.get("productionReadinessDetail"),
            "nextActions": readiness.get("nextActions", []),
        }
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            print(payload["reason"])
            print(payload["productionReadinessDetail"])
            for action in payload["nextActions"]:
                print(f"- {action}")
        return 2

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    horizontal_path = output_dir / f"{args.basename}-16x9.mp4"
    vertical_path = output_dir / f"{args.basename}-9x16.mp4"

    renders = {}
    errors = []
    try:
        renders["horizontal16x9"] = render_one(
            "horizontal16x9",
            horizontal_path,
            proof_duration=args.proof_duration,
            include_audio=include_audio,
            keep_work=args.keep_work,
        )
        renders["vertical9x16"] = render_one(
            "vertical9x16",
            vertical_path,
            proof_duration=args.proof_duration,
            include_audio=include_audio,
            keep_work=args.keep_work,
        )
    except Exception as error:
        errors.append(f"{type(error).__name__}: {error}")

    for format_name, expected_size in {
        "horizontal16x9": (1280, 720),
        "vertical9x16": (720, 1280),
    }.items():
        summary = renders.get(format_name)
        if not summary:
            continue
        if summary.get("status") != "rendered":
            errors.append(f"{format_name}: renderer status was {summary.get('status')!r}")
        if tuple(video_size(summary)) != expected_size:
            errors.append(f"{format_name}: expected video size {expected_size}, got {video_size(summary)}")
        if include_audio and not has_stream(summary, "audio"):
            errors.append(f"{format_name}: expected audio stream")
        if not include_audio and has_stream(summary, "audio"):
            errors.append(f"{format_name}: visual-only package should not include audio")
        if summary.get("usesProxyPlaybackOnly") is not True:
            errors.append(f"{format_name}: expected proxy-only render")

    package = {
        "status": "exported" if not errors else "failed",
        "packageType": "episode1_dual_format",
        "outputDir": str(output_dir),
        "basename": args.basename,
        "proofDuration": args.proof_duration,
        "audioIncluded": include_audio,
        "productionReadyAtStart": readiness.get("productionReady"),
        "visualRoughCutReadyAtStart": readiness.get("visualRoughCutReady"),
        "outputs": {
            "horizontal16x9": {
                "path": str(horizontal_path),
                "exists": horizontal_path.is_file(),
                "summary": renders.get("horizontal16x9", {}),
            },
            "vertical9x16": {
                "path": str(vertical_path),
                "exists": vertical_path.is_file(),
                "summary": renders.get("vertical9x16", {}),
            },
        },
        "nonDestructiveInvariant": "Package exports are derived from the output-plan metadata and proxy playback paths; source lanes and SHOW/SKIP decisions are unchanged.",
        "errors": errors,
    }

    if args.json:
        print(json.dumps(package, indent=2))
    else:
        if errors:
            print("Episode 1 production package export failed.")
            for error in errors:
                print(f"- {error}")
        else:
            print("Episode 1 production package exported.")
            print(f"Output directory: {output_dir}")
            print(f"16:9: {horizontal_path}")
            print(f"9:16: {vertical_path}")
            print(f"Audio included: {include_audio}")
            print(package["nonDestructiveInvariant"])

    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
