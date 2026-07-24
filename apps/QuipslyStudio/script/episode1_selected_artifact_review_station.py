#!/usr/bin/env python3
"""Generate a focused review station for the selected Episode 1 artifact set.

This station is for the post-promotion state: the tail-trim candidate has been
selected for full watch/listen review, but has not been approved.

It intentionally narrows the operator experience to the current selected files:
the full 16:9 episode, the full 9:16 episode, and the podcast audio copy.
It also links the focused ending evidence that justified selecting the candidate.
It does not record a decision, approve artifacts, publish, upload, schedule, or
capture receipts.
"""

from __future__ import annotations

import html
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: str) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {}
    try:
        return load_json(path)
    except Exception as error:
        return {
            "_loadError": str(error),
            "_path": path,
            "truth": "Optional generated evidence could not be parsed. The selected review station can continue, but this evidence must be regenerated or repaired before it is trusted.",
        }


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def media_tag(artifact_id: str, path: str | None) -> str:
    if not path:
        return '<div class="missing">Missing artifact path.</div>'
    url = file_url(path)
    if artifact_id == "podcast-audio-master" or path.lower().endswith((".m4a", ".mp3", ".wav", ".aac")):
        return f'<audio controls preload="metadata" src="{url}"></audio>'
    return f'<video controls preload="metadata" src="{url}"></video>'


def maybe_open(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": path, "opened": False, "reason": "missing path"}
    if not os.path.exists(path):
        return {"path": path, "opened": False, "reason": "file does not exist"}
    result = subprocess.run(["open", path], capture_output=True, text=True, check=False)
    return {
        "path": path,
        "opened": result.returncode == 0,
        "exitCode": result.returncode,
        "stderrTail": result.stderr[-1000:],
    }


def normalize_selected_artifacts(promotion: dict[str, Any]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for item in promotion.get("selectedArtifactSet") or []:
        path = item.get("path")
        sample_path = item.get("endingReviewSamplePath")
        artifacts.append(
            {
                "artifactId": item.get("artifactId"),
                "path": path,
                "exists": bool(path and os.path.exists(path)),
                "durationSeconds": item.get("durationSeconds"),
                "sourcePath": item.get("sourcePath"),
                "trimmedTailSeconds": item.get("trimmedTailSeconds"),
                "targetDurationSeconds": item.get("targetDurationSeconds"),
                "endingReviewSamplePath": sample_path,
                "endingReviewSampleExists": bool(sample_path and os.path.exists(sample_path)),
                "endingReviewSampleDurationSeconds": item.get("endingReviewSampleDurationSeconds"),
            }
        )
    return artifacts


def ending_evidence_by_artifact(evidence: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for item in evidence.get("sampleReviews") or []:
        artifact_id = item.get("artifactId")
        if artifact_id:
            by_id[artifact_id] = item
    return by_id


def artifact_card(artifact: dict[str, Any], evidence: dict[str, Any]) -> str:
    artifact_id = artifact.get("artifactId")
    full_path = artifact.get("path")
    sample_path = artifact.get("endingReviewSamplePath")
    volume = (evidence.get("audioVolume") or {}) if evidence else {}
    still = (evidence.get("endingStill") or {}) if evidence else {}
    still_path = still.get("path")
    still_link = ""
    if still_path and os.path.exists(still_path):
        still_link = f'<a class="still-link" href="{file_url(still_path)}"><img src="{file_url(still_path)}" alt="{esc(artifact_id)} ending still"></a>'
    evidence_bits = [
        f"full exists: {artifact.get('exists')}",
        f"sample exists: {artifact.get('endingReviewSampleExists')}",
        f"mean audio: {volume.get('meanVolumeDb')} dB" if volume else "mean audio: n/a",
        f"max audio: {volume.get('maxVolumeDb')} dB" if volume else "max audio: n/a",
    ]
    return f"""
    <article class="artifact-card">
      <div class="artifact-head">
        <div>
          <h2>{esc(artifact_id)}</h2>
          <p>{esc(round(float(artifact.get("durationSeconds") or 0), 3))}s selected artifact</p>
        </div>
        <span class="pill {'ok' if artifact.get('exists') else 'danger'}">{'exists' if artifact.get('exists') else 'missing'}</span>
      </div>
      <div class="full-media">
        {media_tag(str(artifact_id), full_path)}
      </div>
      <details open>
        <summary>Focused ending sample</summary>
        <div class="sample-media">
          {media_tag(str(artifact_id), sample_path)}
        </div>
        {still_link}
      </details>
      <ul class="evidence-list">
        {''.join(f'<li>{esc(bit)}</li>' for bit in evidence_bits)}
      </ul>
      <label>Full selected artifact</label>
      <code>{esc(full_path)}</code>
      <label>Ending review sample</label>
      <code>{esc(sample_path)}</code>
      <label>Original source artifact</label>
      <code>{esc(artifact.get("sourcePath"))}</code>
    </article>
    """


def decision_cards() -> str:
    commands = {
        "Pass selected artifact review": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected tail-trim artifact set; ready for destination-copy review, not publication receipt."',
        "Needs Studio fix": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-fix "Reviewer Name" "Issue found during full watch/listen review; route exact artifact/time/problem back to Studio."',
        "Needs more review": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-review "Reviewer Name" "Selected artifact review started; full watch/listen still needs completion."',
        "Reject selected artifacts": 'script/agentctl.sh episode1-artifact-watch-review-decision reject "Reviewer Name" "Selected artifacts are not usable; replacement export required."',
    }
    return "\n".join(
        f"""
        <article class="decision-card">
          <strong>{esc(label)}</strong>
          <code>{esc(command)}</code>
          <button type="button" data-copy="{esc(command)}">Copy command</button>
        </article>
        """
        for label, command in commands.items()
    )


def html_page(packet: dict[str, Any], promotion: dict[str, Any], handoff: dict[str, Any], evidence: dict[str, Any]) -> str:
    by_id = ending_evidence_by_artifact(evidence)
    cards = "\n".join(artifact_card(item, by_id.get(str(item.get("artifactId")), {})) for item in packet["selectedArtifacts"])
    blocked = "\n".join(f"<li>{esc(item)}</li>" for item in packet["blockedClaims"])
    selected_by = promotion.get("actor") or "unknown"
    selected_note = promotion.get("note") or ""
    truth = packet["truth"]
    current_state = handoff.get("currentState") or packet.get("status")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Artifact Review</title>
  <style>
    :root {{
      --bg: #f4efe2;
      --paper: #fffaf0;
      --ink: #36281f;
      --muted: #756758;
      --line: rgba(73, 53, 37, 0.16);
      --moss: #476240;
      --fern: #2f7657;
      --gold: #d4a62e;
      --clay: #9d4d37;
      --sky: #2f6f84;
      --shadow: 0 22px 70px rgba(42, 32, 22, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% -8%, rgba(212, 166, 46, 0.26), transparent 34rem),
        radial-gradient(circle at 88% 0%, rgba(47, 118, 87, 0.18), transparent 32rem),
        linear-gradient(135deg, #fbf6e9, var(--bg));
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header, main {{ padding-inline: clamp(22px, 5vw, 78px); }}
    header {{ padding-top: 52px; padding-bottom: 24px; }}
    .hero, .panel, .artifact-card {{
      background: rgba(255, 250, 240, 0.88);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
    }}
    .hero {{ padding: 36px; }}
    .kicker {{
      color: #b17b27;
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }}
    h1 {{ margin: 10px 0 12px; font-size: clamp(2rem, 5vw, 4.8rem); line-height: 0.95; letter-spacing: -0.06em; }}
    h2 {{ margin: 0; font-size: 1.25rem; }}
    p {{ color: var(--muted); line-height: 1.55; }}
    main {{ padding-bottom: 80px; }}
    .status-strip, .decision-grid, .artifact-grid {{
      display: grid;
      gap: 16px;
    }}
    .status-strip {{ grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 24px; }}
    .status-card {{
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.44);
    }}
    .status-card strong {{ display: block; margin-bottom: 4px; }}
    .artifact-grid {{ margin-top: 24px; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); align-items: start; }}
    .artifact-card {{ padding: 20px; overflow: hidden; }}
    .artifact-head {{ display: flex; justify-content: space-between; gap: 16px; align-items: start; }}
    .pill {{
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 0.74rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #fff;
      background: var(--sky);
    }}
    .pill.ok {{ background: var(--fern); }}
    .pill.warn {{ background: var(--gold); color: #2f2618; }}
    .pill.danger {{ background: var(--clay); }}
    video, audio {{ display: block; width: 100%; margin: 14px 0; border-radius: 18px; background: #111; }}
    video {{ max-height: 58vh; }}
    audio {{ min-height: 44px; }}
    details {{ border-top: 1px solid var(--line); margin-top: 16px; padding-top: 14px; }}
    summary {{ cursor: pointer; font-weight: 900; color: var(--moss); }}
    .still-link img {{ width: 100%; border-radius: 16px; border: 1px solid var(--line); }}
    label {{ display: block; margin-top: 12px; color: var(--muted); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; }}
    code {{
      display: block;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 11px 12px;
      border-radius: 14px;
      color: #274235;
      background: rgba(47, 118, 87, 0.10);
      border: 1px solid rgba(47, 118, 87, 0.16);
      font-size: 0.82rem;
    }}
    .panel {{ margin-top: 24px; padding: 24px; }}
    .decision-grid {{ grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }}
    .decision-card {{
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.45);
    }}
    button {{
      margin-top: 12px;
      border: 0;
      border-radius: 999px;
      padding: 11px 15px;
      color: #fffaf0;
      background: #4b3528;
      font-weight: 900;
      cursor: pointer;
    }}
    .truth {{ border-left: 5px solid var(--gold); }}
    li {{ margin: 8px 0; }}
    .copied {{
      position: fixed;
      right: 20px;
      bottom: 20px;
      padding: 12px 16px;
      border-radius: 999px;
      background: #274235;
      color: #fffaf0;
      box-shadow: var(--shadow);
      opacity: 0;
      transform: translateY(10px);
      transition: all 160ms ease;
    }}
    .copied.show {{ opacity: 1; transform: translateY(0); }}
  </style>
</head>
<body>
  <header>
    <section class="hero">
      <div class="kicker">Quipsly Studio selected artifact review</div>
      <h1>Watch the chosen Episode 1 files before Tower moves.</h1>
      <p>The tail-trim candidate has been selected by <strong>{esc(selected_by)}</strong>, but it has not passed full watch/listen review. This page is the calm review bench for the current selected 16:9 master, 9:16 master, and podcast audio.</p>
      <div class="status-strip">
        <div class="status-card"><strong>Current state</strong><span>{esc(current_state)}</span></div>
        <div class="status-card"><strong>Selected artifacts</strong><span>{esc(len(packet["selectedArtifacts"]))}</span></div>
        <div class="status-card"><strong>Selected at</strong><span>{esc(promotion.get("createdAt"))}</span></div>
        <div class="status-card"><strong>Review note</strong><span>{esc(selected_note)}</span></div>
      </div>
    </section>
  </header>
  <main>
    <section class="artifact-grid">
      {cards}
    </section>
    <section class="panel">
      <h2>Record the watch/listen decision</h2>
      <p>Use these only after reviewing the full selected artifact set. Passing here means artifact review passed, not that anything is published.</p>
      <div class="decision-grid">{decision_cards()}</div>
    </section>
    <section class="panel truth">
      <h2>Blocked claims</h2>
      <ul>{blocked}</ul>
      <p>{esc(truth)}</p>
    </section>
  </main>
  <div id="copied" class="copied">Copied command</div>
  <script>
    const copied = document.getElementById('copied');
    document.querySelectorAll('[data-copy]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        await navigator.clipboard.writeText(button.getAttribute('data-copy'));
        copied.classList.add('show');
        setTimeout(() => copied.classList.remove('show'), 1200);
      }});
    }});
  </script>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 selected artifact review station",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        f"HTML: `{packet['reviewStationHtml']}`",
        "",
        "## Selected artifacts",
        "",
    ]
    for artifact in packet["selectedArtifacts"]:
        lines.extend(
            [
                f"### {artifact['artifactId']}",
                f"- Full artifact: `{artifact['path']}`",
                f"- Exists: `{artifact['exists']}`",
                f"- Duration: `{artifact['durationSeconds']}`",
                f"- Ending sample: `{artifact['endingReviewSamplePath']}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Decision commands",
            "",
            '- Pass: `script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected tail-trim artifact set; ready for destination-copy review, not publication receipt."`',
            '- Needs fix: `script/agentctl.sh episode1-artifact-watch-review-decision needs-fix "Reviewer Name" "Issue found during full watch/listen review; route exact artifact/time/problem back to Studio."`',
            '- Needs review: `script/agentctl.sh episode1-artifact-watch-review-decision needs-review "Reviewer Name" "Selected artifact review started; full watch/listen still needs completion."`',
            '- Reject: `script/agentctl.sh episode1-artifact-watch-review-decision reject "Reviewer Name" "Selected artifacts are not usable; replacement export required."`',
            "",
            "## Truth boundary",
            "",
            packet["truth"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_selected_artifact_review_station.py promotion-current.json handoff.json ending-evidence.json output.html output.json output.md --plan|--open",
            file=sys.stderr,
        )
        return 2

    promotion_path, handoff_path, evidence_path, output_html, output_json, output_md, mode = sys.argv[1:8]
    if mode not in {"--plan", "--open"}:
        print("mode must be --plan or --open", file=sys.stderr)
        return 2

    promotion = load_json(promotion_path)
    handoff = load_optional_json(handoff_path)
    evidence = load_optional_json(evidence_path)
    selected = normalize_selected_artifacts(promotion)
    missing = [item for item in selected if not item.get("exists")]
    status = promotion.get("status") or "unknown"
    packet = {
        "packetType": "quipsly-episode1-selected-artifact-review-station",
        "version": "2026-06-20.selected-artifact-review-station.v1",
        "projectSlug": promotion.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": promotion.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "status": status,
        "mode": mode,
        "sourcePromotionDecision": promotion_path,
        "sourceHandoff": handoff_path if handoff else None,
        "sourceEndingEvidence": evidence_path if evidence else None,
        "reviewStationHtml": output_html,
        "reviewStationMarkdown": output_md,
        "selectedArtifacts": selected,
        "missingSelectedArtifactCount": len(missing),
        "blockedClaims": [
            "Do not claim artifact-ready until full watch/listen review passes against these selected artifacts.",
            "Do not claim publication-ready until destination copy, writing/canon state, selected shorts, schedule/queue state, and receipt targets are reviewed.",
            "Do not claim published until external URLs or provider ids are captured as receipts.",
            "Do not treat candidate selection, this station, machine sanity, ending stills, or sample clips as approval.",
        ],
        "safeCommands": {
            "openSelectedReviewStation": "script/agentctl.sh episode1-selected-artifact-review-station --open",
            "passSelectedArtifactReview": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected tail-trim artifact set; ready for destination-copy review, not publication receipt."',
            "markNeedsFix": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-fix "Reviewer Name" "Issue found during full watch/listen review; route exact artifact/time/problem back to Studio."',
            "markNeedsReview": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-review "Reviewer Name" "Selected artifact review started; full watch/listen still needs completion."',
            "rejectSelectedArtifacts": 'script/agentctl.sh episode1-artifact-watch-review-decision reject "Reviewer Name" "Selected artifacts are not usable; replacement export required."',
        },
        "openResults": [],
        "truth": "This selected review station opens the current selected artifact set for full watch/listen review. It does not approve artifacts, publish, upload, schedule, or capture receipts.",
    }

    if promotion.get("decision") != "promote-for-review":
        raise SystemExit("Tail-trim candidate is not currently promoted for review.")
    if not selected:
        raise SystemExit("No selected artifact set found in promotion decision.")

    os.makedirs(os.path.dirname(output_html) or ".", exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet, promotion, handoff, evidence))
    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))

    if mode == "--open":
        packet["openResults"].append(maybe_open(output_html))
        write_json(output_json, packet)

    print(
        json.dumps(
            {
                "packetType": "quipsly-episode1-selected-artifact-review-station-result",
                "status": status,
                "selectedArtifactCount": len(selected),
                "missingSelectedArtifactCount": len(missing),
                "html": output_html,
                "json": output_json,
                "markdown": output_md,
                "openedCount": sum(1 for item in packet["openResults"] if item.get("opened")),
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
