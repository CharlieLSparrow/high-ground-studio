#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
AUDIO_LANES = [
    {
        "laneName": "Charlie Audio - First Pod Ever.wav",
        "sourceFile": "First Pod Ever.wav",
        "proxyFile": "First_Pod_Ever_proxy.m4a",
    },
    {
        "laneName": "Homer Audio - HomerAudio.wav",
        "sourceFile": "HomerAudio.wav",
        "proxyFile": "HomerAudio_proxy.m4a",
    },
]


def run(command, *, timeout=20):
    try:
        return subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        return {
            "returncode": 124,
            "stdout": error.stdout or "",
            "stderr": error.stderr or f"Timed out after {timeout}s",
        }


def returncode(result):
    return result["returncode"] if isinstance(result, dict) else result.returncode


def stdout(result):
    return result.get("stdout", "") if isinstance(result, dict) else result.stdout


def stderr(result):
    return result.get("stderr", "") if isinstance(result, dict) else result.stderr


def compact(value, limit=500):
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def request_json(base_url, path, timeout=10):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}


def quote(value):
    return urllib.parse.quote(str(value), safe="")


def current_audio_lane_state(base_url):
    try:
        state = request_json(base_url, "/state", timeout=4)
    except Exception:
        return {}
    by_name = {}
    for lane in state.get("lanes", []):
        name = lane.get("name", "")
        if "Audio" in name:
            by_name[name] = lane
    return by_name


def mdfind_candidates():
    query = (
        'kMDItemFSName == "First Pod Ever.wav" || '
        'kMDItemFSName == "HomerAudio.wav" || '
        'kMDItemFSName == "First_Pod_Ever_proxy.m4a" || '
        'kMDItemFSName == "HomerAudio_proxy.m4a"'
    )
    result = run(["mdfind", query], timeout=25)
    if returncode(result) != 0:
        return [], compact(stderr(result))
    return [Path(line) for line in stdout(result).splitlines() if line.strip()], ""


def targeted_find_candidates(roots):
    candidates = []
    diagnostics = []
    names = {lane["sourceFile"] for lane in AUDIO_LANES} | {lane["proxyFile"] for lane in AUDIO_LANES}
    for root in roots:
        root_path = Path(root).expanduser()
        if not root_path.is_dir():
            continue
        for name in sorted(names):
            result = run(["find", str(root_path), "-maxdepth", "6", "-type", "f", "-name", name, "-print"], timeout=12)
            if returncode(result) == 0:
                candidates.extend(Path(line) for line in stdout(result).splitlines() if line.strip())
            else:
                diagnostics.append({
                    "root": str(root_path),
                    "name": name,
                    "returncode": returncode(result),
                    "diagnostic": compact(stderr(result) or stdout(result)),
                })
    return candidates, diagnostics


def exact_candidate_paths(media_dir, lane_state):
    paths = []
    media_root = Path(media_dir).expanduser()
    for lane in AUDIO_LANES:
        paths.append(media_root / lane["sourceFile"])
        state = lane_state.get(lane["laneName"], {})
        expected_proxy_path = state.get("playbackPath")
        if expected_proxy_path:
            paths.append(Path(expected_proxy_path))
    return paths


def safe_find_roots(roots, *, include_external):
    safe = []
    skipped = []
    for root in roots:
        root_path = Path(root).expanduser()
        is_external = str(root_path).startswith("/Volumes/")
        if is_external and not include_external:
            skipped.append({
                "root": str(root_path),
                "reason": "external_volume_skipped_by_default",
            })
            continue
        safe.append(str(root_path))
    return safe, skipped


def first_byte_readable(path, timeout=4):
    if not path.is_file():
        return False, "missing"
    try:
        result = subprocess.run(
            ["/usr/bin/head", "-c", "16", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f"Timed out after {timeout}s"
    except Exception as error:
        return False, compact(f"{type(error).__name__}: {error}")
    if result.returncode == 0:
        return True, ""
    diagnostic = result.stderr.decode("utf-8", errors="replace").strip()
    return False, compact(diagnostic or f"head exited {result.returncode}")


def ffprobe_audio(path):
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate",
            "-show_entries",
            "stream=index,codec_type,codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ],
        timeout=25,
    )
    if returncode(result) != 0:
        return {}, compact(stderr(result) or stdout(result))
    try:
        return json.loads(stdout(result)), ""
    except Exception as error:
        return {}, f"{type(error).__name__}: {error}"


def volumedetect(path, seconds):
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-t",
            str(seconds),
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        timeout=max(20, int(seconds) + 10),
    )
    text = stderr(result) + stdout(result)
    mean = None
    max_volume = None
    for line in text.splitlines():
        if "mean_volume:" in line:
            try:
                mean = float(line.split("mean_volume:", 1)[1].split("dB", 1)[0].strip())
            except Exception:
                pass
        if "max_volume:" in line:
            try:
                max_volume = float(line.split("max_volume:", 1)[1].split("dB", 1)[0].strip())
            except Exception:
                pass
    return {
        "meanVolumeDb": mean,
        "maxVolumeDb": max_volume,
        "returncode": returncode(result),
        "diagnostic": compact(text),
    }


def classify_candidate(path, lane_name, lane_state, sample_seconds, duration_tolerance):
    expected_duration = float(lane_state.get("duration") or 0)
    expected_proxy_path = lane_state.get("playbackPath", "")
    readable, read_error = first_byte_readable(path)
    probe = {}
    probe_error = ""
    volume = {}
    duration = None
    has_audio = False
    if readable:
        probe, probe_error = ffprobe_audio(path)
        streams = probe.get("streams", []) if isinstance(probe, dict) else []
        has_audio = any(stream.get("codec_type") == "audio" for stream in streams)
        try:
            duration = float(probe.get("format", {}).get("duration"))
        except Exception:
            duration = None
        if has_audio:
            volume = volumedetect(path, sample_seconds)

    duration_ok = duration is not None and expected_duration > 0 and duration + duration_tolerance >= expected_duration
    max_volume = volume.get("maxVolumeDb")
    likely_silent = max_volume is not None and max_volume <= -80
    wrong_expected_path = bool(expected_proxy_path and str(path) != expected_proxy_path)

    if not readable:
        verdict = "unreadable"
    elif not has_audio:
        verdict = "not_audio"
    elif not duration_ok:
        verdict = "too_short"
    elif likely_silent:
        verdict = "silent_fixture_rejected"
    else:
        verdict = "attachable_real_candidate"

    return {
        "laneName": lane_name,
        "path": str(path),
        "exists": path.is_file(),
        "readable": readable,
        "readError": read_error,
        "probeError": probe_error,
        "durationSeconds": duration,
        "expectedDurationSeconds": expected_duration,
        "durationOk": duration_ok,
        "hasAudioStream": has_audio,
        "volume": volume,
        "likelySilent": likely_silent,
        "expectedProxyPath": expected_proxy_path,
        "isExpectedProxyPath": not wrong_expected_path,
        "verdict": verdict,
    }


def main():
    parser = argparse.ArgumentParser(description="Find and vet real Episode 1 audio/proxy candidates.")
    parser.add_argument("--agent-url", default=os.environ.get("QUIPSLY_AGENT_URL", "http://127.0.0.1:8080"))
    parser.add_argument("--media-dir", default=os.environ.get("EPISODE1_MEDIA_DIR", "/Volumes/My Passport/Episode 1"))
    parser.add_argument("--attach", action="store_true", help="Attach candidates only when they are non-silent, full-length audio.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--sample-seconds", type=float, default=30)
    parser.add_argument("--duration-tolerance", type=float, default=2)
    parser.add_argument("--candidate", action="append", default=[], help="Explicit candidate audio/proxy path to vet, can be repeated.")
    parser.add_argument("--spotlight", action="store_true", help="Use Spotlight/mdfind to discover extra candidates. Off by default because it can stall.")
    parser.add_argument("--extra-root", action="append", default=[], help="Additional folder to search, can be repeated.")
    parser.add_argument("--search-roots", action="store_true", help="Traverse configured folders with find. Off by default because media/iCloud/external folders can hang.")
    parser.add_argument("--deep-search", action="store_true", help="When --search-roots is enabled, also traverse external-volume roots. Use only when the drive is behaving.")
    args = parser.parse_args()

    lane_state = current_audio_lane_state(args.agent_url)
    roots = [
        args.media_dir,
        str(Path.home() / "Desktop" / "Podcast"),
        str(Path.home() / "Movies"),
        str(Path.home() / "Downloads"),
        str(Path.home() / "Library" / "Application Support" / "Quipsly" / "MediaVault" / "proxy"),
    ] + args.extra_root

    if args.spotlight:
        spotlight_hits, spotlight_error = mdfind_candidates()
    else:
        spotlight_hits = []
        spotlight_error = "skipped_by_default"
    if args.search_roots:
        find_roots, skipped_roots = safe_find_roots(roots, include_external=args.deep_search)
        find_hits, find_diagnostics = targeted_find_candidates(find_roots)
    else:
        find_roots = []
        find_hits = []
        find_diagnostics = []
        skipped_roots = [
            {"root": str(Path(root).expanduser()), "reason": "folder_traversal_opt_in"}
            for root in roots
        ]
    all_paths = []
    seen = set()
    explicit_candidates = [Path(path).expanduser() for path in args.candidate]
    for path in exact_candidate_paths(args.media_dir, lane_state) + explicit_candidates + spotlight_hits + find_hits:
        normalized = str(path)
        if normalized in seen:
            continue
        seen.add(normalized)
        all_paths.append(path)

    results = []
    attach_results = []
    for lane in AUDIO_LANES:
        name = lane["laneName"]
        state = lane_state.get(name, {})
        matching = [
            path
            for path in all_paths
            if path.name in {lane["sourceFile"], lane["proxyFile"]}
        ]
        lane_results = [
            classify_candidate(path, name, state, args.sample_seconds, args.duration_tolerance)
            for path in matching
        ]
        results.extend(lane_results)

        attachable = [item for item in lane_results if item["verdict"] == "attachable_real_candidate"]
        if args.attach and attachable:
            # Prefer expected proxy path if somehow already valid; otherwise first non-silent full-length candidate.
            attachable.sort(key=lambda item: (not item["isExpectedProxyPath"], item["path"]))
            selected = attachable[0]
            try:
                response = request_json(
                    args.agent_url,
                    f"/attach_proxy?lane_id={quote(name)}&path={quote(selected['path'])}",
                    timeout=12,
                )
            except Exception as error:
                response = {"error": f"{type(error).__name__}: {error}"}
            attach_results.append({
                "laneName": name,
                "selectedPath": selected["path"],
                "response": response,
            })

    by_lane = {}
    for lane in AUDIO_LANES:
        lane_results = [item for item in results if item["laneName"] == lane["laneName"]]
        by_lane[lane["laneName"]] = {
            "candidateCount": len(lane_results),
            "attachableCount": sum(1 for item in lane_results if item["verdict"] == "attachable_real_candidate"),
            "rejectedSilentCount": sum(1 for item in lane_results if item["verdict"] == "silent_fixture_rejected"),
            "unreadableCount": sum(1 for item in lane_results if item["verdict"] == "unreadable"),
            "candidates": lane_results,
        }

    summary = {
        "mediaDir": args.media_dir,
        "searchedRoots": roots,
        "findSearchedRoots": find_roots,
        "skippedRoots": skipped_roots,
        "findDiagnostics": find_diagnostics,
        "spotlightError": spotlight_error,
        "attachRequested": args.attach,
        "allRealAudioCandidatesReady": all(value["attachableCount"] > 0 for value in by_lane.values()),
        "byLane": by_lane,
        "attachResults": attach_results,
        "nextActions": [],
    }
    if not summary["allRealAudioCandidatesReady"]:
        summary["nextActions"].extend([
            "Do not attach silent fixture proxies as real episode audio.",
            "Recover/export real full-length audio as .m4a or place readable WAV copies somewhere local, then rerun this script.",
            "When both lanes show attachable_real_candidate, rerun with --attach and then run ./script/export_episode1_production_package.sh --proof-duration 30 --json.",
        ])

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print("Episode 1 audio candidate audit")
        print()
        for lane_name, value in by_lane.items():
            print(f"{lane_name}:")
            print(f"  candidates: {value['candidateCount']}")
            print(f"  attachable real candidates: {value['attachableCount']}")
            print(f"  rejected silent fixtures: {value['rejectedSilentCount']}")
            print(f"  unreadable: {value['unreadableCount']}")
            for item in value["candidates"]:
                print(f"  - {item['verdict']}: {item['path']}")
                if item.get("durationSeconds") is not None:
                    print(f"    duration: {item['durationSeconds']:.3f}s / expected {item['expectedDurationSeconds']:.3f}s")
                if item.get("volume"):
                    print(f"    max volume: {item['volume'].get('maxVolumeDb')} dB")
                if item.get("readError"):
                    print(f"    read: {item['readError']}")
        if attach_results:
            print()
            print("Attach results:")
            for item in attach_results:
                print(f"  - {item['laneName']}: {item['selectedPath']} -> {item['response']}")
        if summary["nextActions"]:
            print()
            print("Next actions:")
            for action in summary["nextActions"]:
                print(f"  - {action}")

    return 0 if summary["allRealAudioCandidatesReady"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
