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
CREATE_PROXY = ROOT_DIR / "script" / "create_proxy_for_file.py"

AUDIO_LANES = [
    ("Charlie Audio - First Pod Ever.wav", "First Pod Ever.wav"),
    ("Homer Audio - HomerAudio.wav", "HomerAudio.wav"),
]


def run(command, timeout=None):
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
            "timeout": True,
            "returncode": 124,
            "stdout": error.stdout or "",
            "stderr": error.stderr or "",
        }


def completed_returncode(result):
    return result["returncode"] if isinstance(result, dict) else result.returncode


def completed_stdout(result):
    return result.get("stdout", "") if isinstance(result, dict) else result.stdout


def completed_stderr(result):
    return result.get("stderr", "") if isinstance(result, dict) else result.stderr


def parse_jsonish(text):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def request_json(base_url, path, timeout=10):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}


def quote(value):
    return urllib.parse.quote(str(value), safe="")


def proxy_plan(source):
    result = run([sys.executable, str(CREATE_PROXY), str(source), "--dry-run", "--json"], timeout=20)
    payload = parse_jsonish(completed_stdout(result)) or parse_jsonish(completed_stderr(result)) or {}
    payload.setdefault("returncode", completed_returncode(result))
    return payload


def generate_proxy(source, timeout_seconds, probe_timeout_seconds, force):
    command = [
        sys.executable,
        str(CREATE_PROXY),
        str(source),
        "--json",
        "--timeout",
        str(timeout_seconds),
        "--probe-timeout",
        str(probe_timeout_seconds),
    ]
    if force:
        command.append("--force")
    result = run(command, timeout=timeout_seconds + 10 if timeout_seconds > 0 else None)
    payload = parse_jsonish(completed_stdout(result)) or parse_jsonish(completed_stderr(result)) or {
        "source": str(source),
        "generated": False,
        "returncode": completed_returncode(result),
        "error": "Proxy helper did not return structured output.",
        "diagnostic": (completed_stderr(result) or completed_stdout(result)).strip(),
    }
    payload.setdefault("returncode", completed_returncode(result))
    return payload


def main():
    parser = argparse.ArgumentParser(
        description="Recover Episode 1 audio proxies without changing whole source lanes or edit decisions."
    )
    parser.add_argument(
        "--media-dir",
        default=os.environ.get("EPISODE1_MEDIA_DIR", "/Volumes/My Passport/Episode 1"),
        help="Folder containing Episode 1 whole media files.",
    )
    parser.add_argument(
        "--agent-url",
        default=os.environ.get("QUIPSLY_AGENT_URL", "http://127.0.0.1:8080"),
        help="Running QuipslyStudio agent URL.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("EPISODE1_AUDIO_PROXY_TIMEOUT_SECONDS", "600")),
        help="Per-audio ffmpeg timeout in seconds when --generate is used.",
    )
    parser.add_argument(
        "--probe-timeout",
        type=float,
        default=float(os.environ.get("EPISODE1_AUDIO_PROXY_PROBE_TIMEOUT_SECONDS", "45")),
        help="Per-audio first-byte source probe timeout before ffmpeg. Large external WAVs can take a while to open.",
    )
    parser.add_argument("--generate", action="store_true", help="Attempt to create missing .m4a proxies.")
    parser.add_argument("--force", action="store_true", help="Regenerate existing audio proxies.")
    parser.add_argument("--attach", action="store_true", help="Attach existing/generated proxies to the running editor.")
    args = parser.parse_args()

    media_dir = Path(args.media_dir)
    results = []

    for lane_name, filename in AUDIO_LANES:
        source = media_dir / filename
        entry = {
            "laneName": lane_name,
            "source": str(source),
            "sourceExists": source.exists(),
            "sourceBytes": source.stat().st_size if source.exists() else None,
            "plan": {},
            "generation": None,
            "attach": None,
            "ready": False,
            "nextAction": "",
        }

        if not source.exists():
            entry["nextAction"] = "Relink this whole audio lane from a readable source file."
            results.append(entry)
            continue

        plan = proxy_plan(source)
        entry["plan"] = plan
        proxy_path = Path(plan.get("proxy", ""))

        if args.generate and (args.force or not proxy_path.exists()):
            entry["generation"] = generate_proxy(source, args.timeout, args.probe_timeout, args.force)

        proxy_exists = proxy_path.exists()
        entry["ready"] = proxy_exists

        if proxy_exists and args.attach:
            try:
                entry["attach"] = request_json(
                    args.agent_url,
                    f"/attach_proxy?lane_id={quote(lane_name)}&path={quote(proxy_path)}",
                )
            except Exception as error:
                entry["attach"] = {
                    "error": f"{type(error).__name__}: {error}",
                }

        if proxy_exists:
            entry["nextAction"] = "Proxy exists. Attach it if the running editor has not picked it up."
        elif args.generate:
            diagnostic = (entry.get("generation") or {}).get("diagnostic") or (entry.get("generation") or {}).get("error") or ""
            entry["nextAction"] = f"Proxy still missing. Use a different readable source or recover/export a full-length .m4a. Last diagnostic: {diagnostic[:240]}"
        else:
            entry["nextAction"] = "Run with --generate to try creating the proxy, or attach an existing full-length .m4a proxy."

        results.append(entry)

    summary = {
        "mediaDir": str(media_dir),
        "generated": args.generate,
        "attached": args.attach,
        "timeoutSeconds": args.timeout,
        "probeTimeoutSeconds": args.probe_timeout,
        "allAudioProxiesReady": all(item["ready"] for item in results),
        "results": results,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["allAudioProxiesReady"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
