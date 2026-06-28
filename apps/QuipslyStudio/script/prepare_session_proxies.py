#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_AGENT_URL = "http://127.0.0.1:8080"
DEFAULT_VAULT = Path.home() / "Library/Application Support/Quipsly/MediaVault"
SESSION_SUFFIX = ".quipsly-session.json"


def session_path(name: str, vault_root: Path) -> Path:
    clean = name
    if clean.endswith(SESSION_SUFFIX):
        return Path(clean).expanduser()
    return vault_root / "sessions" / f"{clean}{SESSION_SUFFIX}"


def session_name_from_argument(value: str) -> str:
    name = Path(value).name
    if name.endswith(SESSION_SUFFIX):
        return name[: -len(SESSION_SUFFIX)]
    return value


def file_url_to_path(value: str | None) -> Path | None:
    if not value:
        return None
    if value.startswith("file://"):
        return Path(urllib.parse.unquote(value.removeprefix("file://")))
    return Path(urllib.parse.unquote(value))


def load_active_sequence(payload: dict) -> dict:
    project = payload.get("project") or {}
    sequences = project.get("sequences") or []
    if not sequences:
        raise SystemExit("Session has no project.sequences.")
    active_id = payload.get("activeSequenceId")
    for sequence in sequences:
        if sequence.get("id") == active_id:
            return sequence
    return sequences[0]


def lane_kind(lane: dict, source_path: Path | None) -> str:
    metadata = lane.get("metadata") or {}
    kind = (metadata.get("mediaKind") or "").lower()
    if kind:
        return kind
    ext = (source_path.suffix.lower().lstrip(".") if source_path else "")
    if ext in {"wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"}:
        return "audio"
    return "video"


def command_output(args: list[str]) -> tuple[int, str, str]:
    completed = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    return completed.returncode, completed.stdout, completed.stderr


def get_agent(path: str, agent_url: str) -> tuple[bool, str]:
    url = agent_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return True, response.read().decode("utf-8", errors="replace")
    except Exception as error:
        return False, f"{type(error).__name__}: {error}"


def get_agent_json(path: str, agent_url: str) -> tuple[bool, dict | str]:
    ok, body = get_agent(path, agent_url)
    if not ok:
        return False, body
    try:
        return True, json.loads(body)
    except Exception:
        return False, body


def agent_path(endpoint: str, **params: str) -> str:
    return endpoint + "?" + urllib.parse.urlencode(params)


def compact(value: str, limit: int = 700) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[: limit - 3] + "..."


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True))
    tmp.replace(path)


def proxy_file_sizes(proxy_path: Path | None) -> dict:
    if proxy_path is None:
        return {"proxyBytes": None, "partialBytes": None, "partialPath": ""}
    partials = sorted(proxy_path.parent.glob(f".{proxy_path.stem}.partial-*"), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)
    partial = partials[0] if partials else None
    return {
        "proxyBytes": proxy_path.stat().st_size if proxy_path.is_file() else None,
        "partialBytes": partial.stat().st_size if partial and partial.is_file() else None,
        "partialPath": str(partial) if partial else "",
    }


def write_job_state(job_paths: list[Path], report: dict, status: str, phase: str, current: dict | None = None) -> None:
    payload = {
        "model": "quipsly-proxy-recovery-job",
        "version": "2026-06-17.proxy-recovery-job.v1",
        "status": status,
        "phase": phase,
        "session": report.get("session", ""),
        "sessionName": report.get("sessionName", ""),
        "sequenceTitle": report.get("sequenceTitle", ""),
        "dryRun": report.get("dryRun", False),
        "attach": report.get("attach", False),
        "startedAt": report.get("startedAt", ""),
        "updatedAt": iso_now(),
        "processedCount": len(report.get("processed", [])),
        "skippedCount": len(report.get("skipped", [])),
        "failedCount": len(report.get("failed", [])),
        "attachFailedCount": len(report.get("attachFailed", [])),
        "current": current or {},
        "lastProcessed": (report.get("processed") or [])[-1] if report.get("processed") else {},
        "lastSkipped": (report.get("skipped") or [])[-1] if report.get("skipped") else {},
        "lastFailure": (report.get("failed") or [])[-1] if report.get("failed") else {},
        "lastAttachFailure": (report.get("attachFailed") or [])[-1] if report.get("attachFailed") else {},
        "sourcePolicy": "Whole source lanes stay whole. This job generates or attaches full-length proxies; it never creates chopped timeline clips.",
    }
    for path in job_paths:
        try:
            write_json_atomic(path, payload)
        except Exception:
            pass


def command_output_with_heartbeat(args: list[str], job_paths: list[Path], report: dict, current: dict, proxy_path: Path | None) -> tuple[int, str, str]:
    process = subprocess.Popen(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    started = time.monotonic()
    last_heartbeat = 0.0
    while True:
        code = process.poll()
        now = time.monotonic()
        if now - last_heartbeat >= 2.0:
            heartbeat_current = dict(current)
            heartbeat_current.update(proxy_file_sizes(proxy_path))
            heartbeat_current["elapsedSeconds"] = round(now - started, 1)
            write_job_state(job_paths, report, "running", "generating_proxy", heartbeat_current)
            last_heartbeat = now
        if code is not None:
            out, err = process.communicate()
            if out:
                stdout_chunks.append(out)
            if err:
                stderr_chunks.append(err)
            heartbeat_current = dict(current)
            heartbeat_current.update(proxy_file_sizes(proxy_path))
            heartbeat_current["elapsedSeconds"] = round(time.monotonic() - started, 1)
            write_job_state(job_paths, report, "running", "proxy_command_finished", heartbeat_current)
            return code, "".join(stdout_chunks), "".join(stderr_chunks)
        time.sleep(0.5)


def planned_proxy_path(helper: Path, source_path: Path, vault_root: Path, probe_timeout: str) -> Path | None:
    code, stdout, stderr = command_output([
        sys.executable,
        str(helper),
        str(source_path),
        "--root",
        str(vault_root),
        "--probe-timeout",
        str(probe_timeout),
        "--dry-run",
        "--json",
    ])
    raw = stdout if stdout.strip() else stderr
    if code != 0:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    proxy = payload.get("proxy")
    return Path(proxy) if proxy else None


def wait_for_active_session(agent_url: str, session_name: str, timeout_seconds: float) -> tuple[bool, str]:
    deadline = time.monotonic() + max(timeout_seconds, 0)
    while time.monotonic() <= deadline:
        ok, payload = get_agent_json("/state", agent_url)
        if ok and isinstance(payload, dict):
            active = payload.get("activeSessionName", "")
            if active == session_name:
                return True, f"active session is {session_name}"
            last = f"active session is {active or '<none>'}"
        else:
            last = str(payload)
        time.sleep(0.25)
    return False, last if "last" in locals() else "timed out waiting for app state"


def wait_for_lane_proxy(agent_url: str, lane_id: str, proxy_path: str, timeout_seconds: float) -> tuple[bool, str]:
    deadline = time.monotonic() + max(timeout_seconds, 0)
    while time.monotonic() <= deadline:
        ok, payload = get_agent_json("/state", agent_url)
        if ok and isinstance(payload, dict):
            for lane in payload.get("lanes", []):
                if lane.get("id") == lane_id:
                    playback = lane.get("playbackPath", "")
                    if playback == proxy_path:
                        return True, "proxy visible in app state"
                    last = f"lane playbackPath is {playback or '<empty>'}"
                    break
            else:
                last = "lane not found in app state"
        else:
            last = str(payload)
        time.sleep(0.25)
    return False, last if "last" in locals() else "timed out waiting for lane proxy"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate deterministic MediaVault proxies for reachable whole-lane session sources and optionally attach them to the running Quipsly app."
    )
    parser.add_argument("--session", required=True, help="Native session name or absolute .quipsly-session.json path.")
    parser.add_argument("--vault-root", default=os.environ.get("QUIPSLY_MEDIA_VAULT", str(DEFAULT_VAULT)))
    parser.add_argument("--agent-url", default=os.environ.get("QUIPSLY_AGENT_URL", DEFAULT_AGENT_URL))
    parser.add_argument("--kind", choices=["all", "video", "audio"], default="all")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--attach", action="store_true", help="Attach generated/existing proxies to the running app through AgentServer.")
    parser.add_argument("--load-first", action="store_true", help="Load the target session into the running app before attaching proxies.")
    parser.add_argument("--save-session", default="", help="Save the running app session under this name after attachments.")
    parser.add_argument("--force", action="store_true", help="Regenerate proxies even when deterministic output already exists.")
    parser.add_argument("--timeout", default=os.environ.get("QUIPSLY_PROXY_TIMEOUT_SECONDS", "0"), help="Per-file ffmpeg timeout seconds. 0 means no timeout.")
    parser.add_argument("--probe-timeout", default=os.environ.get("QUIPSLY_SOURCE_PROBE_TIMEOUT_SECONDS", "8"))
    parser.add_argument("--limit", type=int, default=0, help="Optional maximum reachable lanes to process.")
    parser.add_argument("--short-first", action="store_true", help="Process reachable lanes by declared source duration ascending.")
    parser.add_argument("--skip-existing", action="store_true", help="Skip lanes whose attached deterministic proxy already exists.")
    parser.add_argument("--production-only", action="store_true", help="Skip lanes marked ignoreForProduction so held recovery/context media does not block the main edit lane.")
    parser.add_argument("--max-source-bytes", type=int, default=0, help="Skip reachable sources larger than this many bytes. 0 means no byte cap.")
    parser.add_argument("--max-source-gb", type=float, default=0, help="Skip reachable sources larger than this many GB. 0 means no GB cap.")
    parser.add_argument("--max-duration", type=float, default=0, help="Skip sources with declared duration longer than this many seconds. 0 means no duration cap.")
    parser.add_argument("--wait-seconds", type=float, default=20, help="Seconds to wait for app load/attach commands to be reflected in /state.")
    args = parser.parse_args()

    vault_root = Path(args.vault_root).expanduser()
    target_session = session_path(args.session, vault_root)
    if not target_session.is_file():
        raise SystemExit(f"Session not found: {target_session}")

    payload = json.loads(target_session.read_text())
    sequence = load_active_sequence(payload)
    lanes = sequence.get("lanes") or []
    helper = Path(__file__).resolve().parent / "create_proxy_for_file.py"
    if not helper.is_file():
        raise SystemExit(f"Proxy helper not found: {helper}")

    target_session_name = session_name_from_argument(args.session)
    safe_session = Path(target_session_name).name.replace("/", "-")
    job_paths = [
        Path.cwd() / "reports" / "proxy-job-current.json",
        Path.cwd() / "reports" / f"{safe_session}-proxy-job-current.json",
    ]
    report = {
        "session": str(target_session),
        "sessionName": target_session_name,
        "sequenceTitle": sequence.get("title", ""),
        "dryRun": args.dry_run,
        "attach": args.attach,
        "startedAt": iso_now(),
        "processed": [],
        "skipped": [],
        "failed": [],
        "attachFailed": [],
        "saved": None,
    }
    write_job_state(job_paths, report, "running", "starting")

    if args.attach and args.load_first and not args.dry_run:
        ok, body = get_agent(agent_path("/load_session", name=target_session_name), args.agent_url)
        report["loaded"] = {"name": target_session_name, "ok": ok, "response": compact(body)}
        if not ok:
            report["failed"].append({"error": f"load-session failed: {compact(body)}"})
            print(json.dumps(report, indent=2, sort_keys=True))
            return 1
        ready, detail = wait_for_active_session(args.agent_url, target_session_name, args.wait_seconds)
        report["loaded"]["ready"] = ready
        report["loaded"]["detail"] = detail
        if not ready:
            report["failed"].append({"error": f"load-session did not become active: {detail}"})
            write_job_state(job_paths, report, "failed", "load_session_failed")
            print(json.dumps(report, indent=2, sort_keys=True))
            return 1
        write_job_state(job_paths, report, "running", "loaded_session")

    processed_count = 0
    if args.short_first:
        lanes = sorted(lanes, key=lambda lane: float(((lane.get("sourceVideo") or {}).get("duration") or 0)))

    max_source_bytes = args.max_source_bytes
    if args.max_source_gb and args.max_source_gb > 0:
        max_source_bytes = max(max_source_bytes, int(args.max_source_gb * 1024 * 1024 * 1024))

    def record_skip(item: dict) -> None:
        report["skipped"].append(item)
        write_job_state(job_paths, report, "running", "skipped_lane", item)

    def record_failure(item: dict) -> None:
        report["failed"].append(item)
        write_job_state(job_paths, report, "running", "failed_lane", item)

    def record_attach_failure(item: dict) -> None:
        report["attachFailed"].append(item)
        write_job_state(job_paths, report, "running", "attach_failed_lane", item)

    for lane in lanes:
        source = lane.get("sourceVideo") or {}
        source_path = file_url_to_path(source.get("mediaURL"))
        proxy_path = file_url_to_path(source.get("proxyURL"))
        kind = lane_kind(lane, source_path)
        lane_name = lane.get("name") or lane.get("id") or "Unnamed lane"
        lane_id = lane.get("id") or lane_name
        declared_duration = float(source.get("duration") or 0)

        if args.production_only and (lane.get("metadata") or {}).get("ignoreForProduction") == True:
            record_skip({"lane": lane_name, "reason": "held lane excluded by --production-only"})
            continue
        if args.kind != "all" and kind != args.kind:
            record_skip({"lane": lane_name, "reason": f"kind {kind} excluded"})
            continue
        if source_path is None:
            record_skip({"lane": lane_name, "reason": "no sourceVideo.mediaURL"})
            continue
        if "__quipsly_missing_media__" in str(source_path):
            record_skip({"lane": lane_name, "source": str(source_path), "reason": "Premiere missing-media placeholder"})
            continue
        if not source_path.is_file():
            record_skip({"lane": lane_name, "source": str(source_path), "reason": "source file not available"})
            continue
        source_size = source_path.stat().st_size
        if args.skip_existing and proxy_path is not None and proxy_path.is_file():
            record_skip({
                "lane": lane_name,
                "source": str(source_path),
                "proxy": str(proxy_path),
                "sourceBytes": source_size,
                "durationSeconds": declared_duration,
                "reason": "attached proxy already exists",
            })
            continue
        if max_source_bytes and source_size > max_source_bytes:
            record_skip({
                "lane": lane_name,
                "source": str(source_path),
                "sourceBytes": source_size,
                "durationSeconds": declared_duration,
                "reason": f"source exceeds max-source-bytes {max_source_bytes}",
            })
            continue
        if args.max_duration and declared_duration > args.max_duration:
            record_skip({
                "lane": lane_name,
                "source": str(source_path),
                "sourceBytes": source_size,
                "durationSeconds": declared_duration,
                "reason": f"source exceeds max-duration {args.max_duration:g}s",
            })
            continue
        if args.limit and processed_count >= args.limit:
            record_skip({"lane": lane_name, "source": str(source_path), "reason": "limit reached"})
            continue

        cmd = [
            sys.executable,
            str(helper),
            str(source_path),
            "--root",
            str(vault_root),
            "--timeout",
            str(args.timeout),
            "--probe-timeout",
            str(args.probe_timeout),
            "--json",
        ]
        if args.force:
            cmd.append("--force")
        if args.dry_run:
            cmd.append("--dry-run")

        planned_proxy = proxy_path if proxy_path is not None else planned_proxy_path(helper, source_path, vault_root, str(args.probe_timeout))
        current_item = {
            "lane": lane_name,
            "laneId": lane_id,
            "kind": kind,
            "source": str(source_path),
            "proxy": str(planned_proxy) if planned_proxy else "",
            "sourceBytes": source_size,
            "durationSeconds": declared_duration,
        }
        write_job_state(job_paths, report, "running", "starting_proxy", current_item)
        code, stdout, stderr = command_output_with_heartbeat(cmd, job_paths, report, current_item, planned_proxy)
        raw_json = stdout if stdout.strip() else stderr
        try:
            proxy_result = json.loads(raw_json)
        except Exception:
            proxy_result = {"rawOutput": compact(stdout + "\n" + stderr)}

        if code != 0:
            record_failure({
                "lane": lane_name,
                "laneId": lane_id,
                "kind": kind,
                "source": str(source_path),
                "error": compact((proxy_result.get("error") if isinstance(proxy_result, dict) else "") or stderr or stdout),
                "diagnostic": compact((proxy_result.get("diagnostic") if isinstance(proxy_result, dict) else "") or ""),
            })
            continue

        generated_proxy = Path(proxy_result.get("proxy") or "")
        item = {
            "lane": lane_name,
            "laneId": lane_id,
            "kind": kind,
            "source": str(source_path),
            "proxy": str(generated_proxy),
            "generated": bool(proxy_result.get("generated", False)),
            "proxyExists": generated_proxy.is_file(),
            "proxyBytes": generated_proxy.stat().st_size if generated_proxy.is_file() else None,
            "sourceBytes": source_size,
            "durationSeconds": declared_duration,
        }

        if args.attach and not args.dry_run:
            if not generated_proxy.is_file():
                item["attach"] = "skipped: proxy not found after generation"
            else:
                ok, body = get_agent(agent_path("/attach_proxy", lane_id=lane_id, path=str(generated_proxy)), args.agent_url)
                item["attach"] = "ok" if ok else "failed"
                item["attachResponse"] = compact(body)
                if not ok:
                    record_attach_failure({
                        "lane": lane_name,
                        "laneId": lane_id,
                        "kind": kind,
                        "source": str(source_path),
                        "proxy": str(generated_proxy),
                        "error": compact(body),
                    })
                else:
                    ready, detail = wait_for_lane_proxy(args.agent_url, lane_id, str(generated_proxy), args.wait_seconds)
                    item["attachReady"] = ready
                    item["attachReadyDetail"] = detail
                    if not ready:
                        record_attach_failure({
                            "lane": lane_name,
                            "laneId": lane_id,
                            "kind": kind,
                            "source": str(source_path),
                            "proxy": str(generated_proxy),
                            "error": f"attach did not appear in app state: {detail}",
                        })

        report["processed"].append(item)
        processed_count += 1
        write_job_state(job_paths, report, "running", "processed_lane", item)

    if args.attach and args.save_session and not args.dry_run:
        ok, body = get_agent(agent_path("/save_session", name=args.save_session), args.agent_url)
        report["saved"] = {"name": args.save_session, "ok": ok, "response": compact(body)}
        if not ok:
            record_failure({"error": f"save-session failed: {compact(body)}"})

    final_status = "failed" if report["failed"] else ("completed_with_attach_warnings" if report["attachFailed"] else "completed")
    write_job_state(job_paths, report, final_status, "finished")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
