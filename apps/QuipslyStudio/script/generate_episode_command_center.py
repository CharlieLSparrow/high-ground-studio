#!/usr/bin/env python3
"""Generate one operator command center for QuipslyStudio episode publishing.

This is an index over existing audited tools:
- release readiness for 16:9, Patreon, podcast, and social destinations
- short review board for human/Codex keep/refine/reject decisions
- social readiness, optionally with reviewed queues for kept shorts

It does not approve shorts, upload media, publish posts, mutate source media, or
change episode edit decisions.
"""
from __future__ import annotations

import argparse
import html
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

DEFAULT_SESSIONS = [
    "episode-1-premiere-rescue",
    "episode-2-native-proof",
    "episode-3-premiere-rescue",
]


def run_json(command: list[str], cwd: Path) -> dict[str, Any]:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            "Command failed: "
            + " ".join(command)
            + "\nSTDOUT:\n"
            + completed.stdout
            + "\nSTDERR:\n"
            + completed.stderr
        )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            "Command did not return JSON: "
            + " ".join(command)
            + "\nSTDOUT:\n"
            + completed.stdout[:4000]
        ) from error


def file_url(path: str | Path) -> str:
    return Path(path).resolve().as_uri()


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "episode-command-center"


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text())


def status_counts(decisions: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for decision in decisions:
        status = decision.get("status") or "needs-review"
        counts[status] = counts.get(status, 0) + 1
    return counts


def latest_file(directory: Path, pattern: str) -> Path | None:
    matches = sorted(directory.glob(pattern), key=lambda path: path.stat().st_mtime if path.exists() else 0)
    return matches[-1] if matches else None


def report_result_from_paths(report_path: Path, html_path: Path | None = None) -> dict[str, Any]:
    return {
        "status": "reused",
        "reportPath": str(report_path),
        "htmlPath": str(html_path or report_path.with_suffix(".html")),
    }


def review_result_from_paths(json_path: Path, html_path: Path | None = None) -> dict[str, Any]:
    return {
        "status": "reused",
        "jsonPath": str(json_path),
        "htmlPath": str(html_path or json_path.with_suffix(".html")),
    }


def build_next_actions(
    session: str,
    release: dict[str, Any],
    social: dict[str, Any],
    review_json_path: str,
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    short_queue = release.get("shortQueue") or {}
    short_counts = social.get("shortReviewCounts") or short_queue.get("reviewStatusCounts") or {}
    short_count = int(short_queue.get("count") or social.get("shortCount") or sum(int(v or 0) for v in short_counts.values()))
    keep_count = int(short_counts.get("keep") or 0)
    draftish_count = sum(int(short_counts.get(key) or 0) for key in ["draft", "ready-for-human-review", "needs-captions", "refine", "needs-review"])
    reviewed_generation = social.get("reviewedQueueGeneration") or {}
    reviewed_status = reviewed_generation.get("status") or "not-run"

    if not release.get("productionReady"):
        actions.append({
            "label": "Fix production readiness before publishing",
            "detail": "At least one lane or export dependency is not production-ready. Keep this as edit/recovery work, not publication work.",
            "command": f"script/agentctl.sh load-session {session} && script/agentctl.sh state",
        })

    if short_count > 0 and keep_count == 0:
        actions.append({
            "label": "Review shorts and mark only true keeps",
            "detail": "No shorts are approved yet. Draft/refine/reject material should not enter the social upload queue.",
            "command": f"script/agentctl.sh review-shorts-import {review_json_path} --execute --save",
        })
    elif draftish_count > 0:
        actions.append({
            "label": "Finish remaining short decisions",
            "detail": f"{draftish_count} shorts are still review material. This does not block already-kept shorts, but it limits the usable social batch.",
            "command": f"script/agentctl.sh load-session {session} && script/agentctl.sh shorts-queue",
        })

    if keep_count > 0 and reviewed_status != "generated":
        actions.append({
            "label": "Generate reviewed social queue",
            "detail": f"{keep_count} kept short(s) can become a platform handoff folder.",
            "command": (
                "script/agentctl.sh reviewed-social-queue "
                f"--session {session} "
                "--output /Users/wall-e/Movies/QuipslyExports/ReviewedSocialQueues "
                f"--basename {safe_slug(session)}-reviewed-keeps "
                "--include-status keep"
            ),
        })

    destinations = release.get("destinations") or []
    ready_destinations = [item for item in destinations if item.get("status") == "ready-to-upload"]
    missing_receipts = [item for item in ready_destinations if int(item.get("receiptCapturedCount") or 0) <= 0]
    if missing_receipts:
        platforms = ", ".join(item.get("platform", "") for item in missing_receipts[:5])
        actions.append({
            "label": "Publish or capture receipts for ready artifacts",
            "detail": f"Ready artifacts exist for {platforms}. After posting/scheduling, record URLs so the release truth is durable.",
            "command": f"script/agentctl.sh load-session {session} && script/agentctl.sh missing-publication-receipts",
        })

    blocked_destinations = [item for item in destinations if item.get("status") == "needs-artifact-or-packet"]
    if blocked_destinations:
        platforms = ", ".join(item.get("platform", "") for item in blocked_destinations[:5])
        actions.append({
            "label": "Generate missing release artifacts",
            "detail": f"{platforms} still need an export, packet, or podcast artifact before publishing.",
            "command": f"script/agentctl.sh load-session {session} && script/agentctl.sh full-release-prepare /Users/wall-e/Movies/QuipslyExports/FullRelease {safe_slug(session)} 8",
        })

    if not actions:
        actions.append({
            "label": "Ready for operator review",
            "detail": "No obvious generation blocker found in this command-center snapshot. Watch/review artifacts and capture receipts after publishing.",
            "command": f"script/agentctl.sh load-session {session} && script/agentctl.sh publication-mission-control",
        })

    return actions


def command_card(title: str, command: str, body: str = "") -> str:
    return f"""
<article class="commandCard">
  <h3>{html.escape(title)}</h3>
  {f'<p>{html.escape(body)}</p>' if body else ''}
  <code>{html.escape(command)}</code>
</article>
"""


def write_index(
    output: Path,
    release_result: dict[str, Any],
    review_result: dict[str, Any],
    social_result: dict[str, Any],
    sessions: list[str],
) -> Path:
    release_report = load_json(release_result["reportPath"])
    review_report = load_json(review_result["jsonPath"])
    social_report = load_json(social_result["reportPath"])
    counts = status_counts(review_report.get("decisions") or [])

    episode_cards: list[str] = []
    release_by_session = {item.get("session"): item for item in release_report.get("sessions") or []}
    social_by_session = {item.get("session"): item for item in social_report.get("sessions") or []}
    review_by_session = {item.get("session"): item for item in review_report.get("sessions") or []}
    for session in sessions:
        release = release_by_session.get(session) or {}
        social = social_by_session.get(session) or {}
        review = review_by_session.get(session) or {}
        next_actions = build_next_actions(session, release, social, review_result["jsonPath"])
        next_action_rows = "".join(
            f"""
            <li>
              <strong>{html.escape(action['label'])}</strong>
              <span>{html.escape(action['detail'])}</span>
              <code>{html.escape(action['command'])}</code>
            </li>
            """
            for action in next_actions
        )
        social_short_counts = social.get("shortReviewCounts") or {}
        short_counts = social_short_counts or (release.get("shortQueue") or {}).get("reviewStatusCounts") or {}
        reviewed_generation = social.get("reviewedQueueGeneration") or {}
        reviewed_generation_status = reviewed_generation.get("status") or "not-run"
        reviewed_generation_output = reviewed_generation.get("outputPath") or ""
        reviewed_generation_error = reviewed_generation.get("error") or ""
        reviewed_generation_detail = reviewed_generation_output or reviewed_generation_error or reviewed_generation_status
        destinations = release.get("destinations") or []
        ready_destinations = sum(1 for item in destinations if item.get("status") == "ready-to-upload")
        captured_destinations = sum(1 for item in destinations if item.get("status") == "receipt-captured")
        episode_cards.append(f"""
<section class="episodeCard">
  <p class="eyebrow">{html.escape(session)}</p>
  <h2>{html.escape(release.get('title') or review.get('title') or session)}</h2>
  <div class="metrics">
    <span>production <strong>{'ready' if release.get('productionReady') else 'not ready'}</strong></span>
    <span>destinations ready <strong>{ready_destinations}</strong></span>
    <span>receipts <strong>{captured_destinations}</strong></span>
    <span>shorts <strong>{html.escape(str((release.get('shortQueue') or {}).get('count', social_short_counts.get('total', 0))))}</strong></span>
    <span>keep <strong>{html.escape(str(short_counts.get('keep', 0)))}</strong></span>
    <span>draft <strong>{html.escape(str(short_counts.get('draft', 0)))}</strong></span>
  </div>
  <p><strong>Reviewed queue:</strong> {html.escape(reviewed_generation_status)}</p>
  <p>{html.escape(reviewed_generation_detail)}</p>
  <ol class="nextActions">{next_action_rows}</ol>
</section>
""")

    review_commands = review_report.get("reviewedQueueCommands") or []
    queue_commands = "".join(command_card(item.get("session", ""), item.get("command", ""), "Generate approved upload queue after statuses are applied and saved.") for item in review_commands)

    refresh_command = "script/agentctl.sh production-command-center --reuse-existing --output " + str(output)
    full_refresh_command = "script/agentctl.sh production-command-center --output " + str(output) + " --generate-reviewed"
    page = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Production Command Center</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101512; --panel:#19231f; --line:#35483e; --ink:#f6efdf; --muted:#ad9f88; --gold:#f2cd45; --green:#58dc84; --blue:#67b7ff; }}
    body {{ margin:0; background:radial-gradient(circle at 10% 0%, #294638, var(--bg) 45%); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1240px; margin:0 auto; padding:44px 28px 80px; }}
    h1 {{ font-size:clamp(42px,7vw,82px); line-height:.88; letter-spacing:-.07em; margin:0 0 12px; }}
    h2 {{ margin:0; }} h3 {{ margin:0 0 8px; }}
    .lede {{ color:var(--muted); font-size:18px; max-width:900px; }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.28em; font-size:12px; font-weight:900; margin:0 0 7px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin:22px 0; }}
    .panel,.episodeCard,.commandCard {{ border:1px solid var(--line); border-radius:24px; background:color-mix(in srgb,var(--panel) 91%,transparent); box-shadow:0 22px 70px #0008; padding:20px; }}
    .metrics {{ display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }}
    .metrics span,.linkPill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:7px 10px; color:var(--muted); background:#22312a; text-transform:uppercase; letter-spacing:.08em; font-size:12px; font-weight:900; }}
    .nextActions {{ margin:14px 0 0; padding-left:20px; }}
    .nextActions li {{ margin:12px 0; }}
    .nextActions span {{ display:block; color:var(--muted); margin:3px 0 5px; }}
    .links {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0; }}
    a {{ color:#9ed2ff; }} code {{ color:#cce8ff; font-size:12px; word-break:break-all; }}
    .commandCard p {{ color:var(--muted); }}
  </style>
</head>
<body><main>
  <p class="eyebrow">Quipsly production command center</p>
  <h1>Episodes 1-3 publishing cockpit.</h1>
  <p class="lede">One generated index for the human editor and Codex operator. This does not upload, publish, approve draft shorts, or touch source media. It links the exact reports and commands that move approved work toward YouTube, Patreon, social platforms, Spotify, and Apple Podcasts.</p>

  <div class="panel">
    <h2>Open the working surfaces</h2>
    <div class="links">
      <a class="linkPill" href="{html.escape(file_url(release_result['htmlPath']))}">Release readiness</a>
      <a class="linkPill" href="{html.escape(file_url(review_result['htmlPath']))}">Short review board</a>
      <a class="linkPill" href="{html.escape(file_url(social_result['htmlPath']))}">Social readiness</a>
    </div>
    <div class="metrics">
      {''.join(f'<span>{html.escape(k)} <strong>{v}</strong></span>' for k, v in sorted(counts.items()))}
    </div>
    <div class="grid">
      {command_card('Fast redraw from existing reports', refresh_command, 'Use this after changing only this dashboard or when you need to reopen the cockpit without reloading every native session.')}
      {command_card('Full live refresh', full_refresh_command, 'Use this when episode state may have changed. It is slower because it loads sessions and asks the running native app for fresh truth.')}
    </div>
  </div>

  <div class="grid">{''.join(episode_cards)}</div>

  <div class="panel">
    <h2>After review: generate approved queues</h2>
    <p class="lede">Use these after the review JSON is applied and saved. They export only <code>keep</code> shorts into platform-ready queue folders.</p>
    <div class="grid">{queue_commands}</div>
  </div>

  <div class="panel">
    <h2>Review JSON workflow</h2>
    <div class="grid">
      {command_card('Dry-run short decisions', 'script/agentctl.sh review-shorts-import ' + review_result['jsonPath'])}
      {command_card('Apply short decisions', 'script/agentctl.sh review-shorts-import ' + review_result['jsonPath'] + ' --execute --save')}
      {command_card('Refresh this command center', 'script/agentctl.sh production-command-center --output ' + str(output))}
    </div>
  </div>
</main></body></html>"""
    path = output / "index.html"
    path.write_text(page)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(Path.home() / "Movies" / "QuipslyExports" / "CommandCenters" / "episodes-1-3"))
    parser.add_argument("--sessions", nargs="*", default=DEFAULT_SESSIONS)
    parser.add_argument("--proof-seconds", type=float, default=30)
    parser.add_argument("--generate-reviewed", action="store_true", help="Ask social readiness to generate reviewed queues for sessions with kept shorts.")
    parser.add_argument("--reuse-existing", action="store_true", help="Skip live app audits and redraw the index from reports already present under --output.")
    parser.add_argument("--open", action="store_true", help="Open the generated command center in the default browser after writing it.")
    args = parser.parse_args()

    app_root = Path(__file__).resolve().parents[1]
    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    sessions = args.sessions or DEFAULT_SESSIONS
    timestamp = time.strftime("%Y%m%d-%H%M%S")

    release_output = output / "release-readiness"
    review_output = output / "short-review"
    social_output = output / "social-readiness"

    if args.reuse_existing:
        release_report_path = release_output / "episodes-release-readiness.json"
        release_html_path = release_output / "episodes-release-readiness.html"
        review_json_path = latest_file(review_output, "short-review-*.json")
        review_html_path = latest_file(review_output, "short-review-*.html")
        social_report_path = social_output / "episodes-1-3-social-readiness.json"
        social_html_path = social_output / "episodes-1-3-social-readiness.html"
        missing = [
            str(path)
            for path in [release_report_path, release_html_path, review_json_path, review_html_path, social_report_path, social_html_path]
            if path is None or not Path(path).exists()
        ]
        if missing:
            raise RuntimeError("--reuse-existing requested, but required report artifacts are missing: " + ", ".join(missing))
        release_result = report_result_from_paths(release_report_path, release_html_path)
        review_result = review_result_from_paths(review_json_path, review_html_path)
        social_result = report_result_from_paths(social_report_path, social_html_path)
    else:
        release_result = run_json([
            sys.executable,
            str(app_root / "script" / "audit_episode_release_readiness.py"),
            "--output",
            str(release_output),
            "--proof-seconds",
            f"{args.proof_seconds:g}",
            "--sessions",
            *sessions,
        ], cwd=app_root)

        review_result = run_json([
            sys.executable,
            str(app_root / "script" / "export_short_review_decision_template.py"),
            "--output",
            str(review_output),
            "--basename",
            f"short-review-{safe_slug(timestamp)}",
            "--sessions",
            *sessions,
        ], cwd=app_root)

        social_command = [
            sys.executable,
            str(app_root / "script" / "audit_episode_social_readiness.py"),
            "--output",
            str(social_output),
            "--sessions",
            *sessions,
        ]
        if args.generate_reviewed:
            social_command.insert(2, "--generate-reviewed")
        social_result = run_json(social_command, cwd=app_root)

    index_path = write_index(output, release_result, review_result, social_result, sessions)
    if args.open:
        subprocess.run(["open", str(index_path)], check=False)
    result = {
        "status": "pass",
        "model": "quipsly-production-command-center",
        "version": "2026-06-18.production-command-center.v2.fast-redraw-next-actions",
        "indexPath": str(index_path),
        "releaseReadinessHtml": release_result.get("htmlPath"),
        "shortReviewHtml": review_result.get("htmlPath"),
        "socialReadinessHtml": social_result.get("htmlPath"),
        "sessions": sessions,
        "reuseExisting": bool(args.reuse_existing),
        "opened": bool(args.open),
        "truth": "Generated operator links and commands only. No uploads, publishing, source-media changes, or automatic approvals.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
