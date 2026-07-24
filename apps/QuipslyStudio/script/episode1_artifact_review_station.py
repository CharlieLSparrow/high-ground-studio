#!/usr/bin/env python3
"""Generate a local Episode 1 artifact review station.

This collects sample clips, audio samples, known warnings, and decision commands
into one calm local HTML page. It is a review aid, not artifact approval.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: str) -> dict[str, Any] | None:
    if not path or not os.path.exists(path):
        return None
    return load_json(path)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def sample_card(sample: dict[str, Any], kind: str) -> str:
    path = sample.get("path")
    url = file_url(path)
    media = ""
    if kind == "audio":
        media = f'<audio controls preload="metadata" src="{url}"></audio>'
    else:
        media = f'<video controls preload="metadata" src="{url}"></video>'
    exists = "yes" if sample.get("exists") else "no"
    return f"""
      <article class="sample-card">
        <div class="sample-meta">
          <strong>{esc(sample.get("label"))}</strong>
          <span>{esc(sample.get("sourceStartTimecode"))} · {esc(sample.get("durationSeconds"))}s · exists: {exists}</span>
        </div>
        {media}
        <code>{esc(path)}</code>
      </article>
    """


def artifact_section(artifact: dict[str, Any]) -> str:
    artifact_id = artifact.get("artifactId")
    kind = "audio" if artifact_id == "podcast-audio-master" else "video"
    cards = "\n".join(sample_card(sample, kind) for sample in artifact.get("samples") or [])
    return f"""
    <section class="artifact">
      <h2>{esc(artifact_id)}</h2>
      <p class="source">Source: <code>{esc(artifact.get("sourcePath"))}</code></p>
      <div class="sample-grid">{cards}</div>
    </section>
    """


def warning_list(sanity: dict[str, Any]) -> str:
    rows: list[str] = []
    for artifact in sanity.get("artifacts") or []:
        for warning in artifact.get("warnings") or []:
            rows.append(f"<li><strong>{esc(artifact.get('artifactId'))}</strong>: {esc(warning)}</li>")
    if not rows:
        rows.append("<li>No machine warnings recorded.</li>")
    return "\n".join(rows)


def contact_sheet_links(contact_packet: dict[str, Any]) -> str:
    links = []
    for artifact in contact_packet.get("artifacts") or []:
        path = artifact.get("contactSheetPath")
        if path:
            links.append(
                f'<li><a href="{file_url(path)}">{esc(artifact.get("artifactId"))} contact sheet</a></li>'
            )
    return "\n".join(links) if links else "<li>No contact sheets found.</li>"


def tail_trim_candidate_section(tail_candidate: dict[str, Any] | None) -> str:
    if not tail_candidate:
        return """
    <section class="panel">
      <h2>Tail-trim candidate</h2>
      <p>No tail-trim candidate packet was found. If the near-end warning still matters, generate one with <code>script/agentctl.sh episode1-tail-trim-candidate</code>.</p>
    </section>
    """

    artifact_cards: list[str] = []
    for artifact in tail_candidate.get("artifacts") or []:
        full_path = artifact.get("outputPath")
        artifact_id = artifact.get("artifactId")
        kind = "audio" if artifact_id == "podcast-audio-master" else "video"
        sample = artifact.get("candidateEndingSample") or {}
        sample_path = sample.get("path")
        media = ""
        if sample.get("exists") and sample_path:
            if kind == "audio":
                media = f'<audio controls preload="metadata" src="{file_url(sample_path)}"></audio>'
            else:
                media = f'<video controls preload="metadata" src="{file_url(sample_path)}"></video>'
        else:
            media = '<p class="missing">Candidate ending sample missing. Full candidate artifact still listed below.</p>'
        artifact_cards.append(
            f"""
        <article class="candidate-card">
          <strong>{esc(artifact_id)}</strong>
          <span>duration: {esc(artifact.get("outputDurationSeconds"))}s · exit: {esc(artifact.get("exitCode"))} · exists: {esc(artifact.get("exists"))}</span>
          {media}
          <span>ending sample: {esc(sample.get("startSeconds"))}s · {esc(sample.get("durationSeconds"))}s · sample exists: {esc(sample.get("exists"))}</span>
          <code>{esc(sample_path)}</code>
          <span>full candidate artifact</span>
          <code>{esc(full_path)}</code>
        </article>
            """
        )

    promote_command = 'script/agentctl.sh episode1-tail-trim-promote promote-for-review "Reviewer Name" "Tail-trim candidate ending samples reviewed; select candidate artifact set for full watch/listen review."'
    reject_command = 'script/agentctl.sh episode1-tail-trim-promote reject-candidate "Reviewer Name" "Tail-trim candidate did not resolve the ending cleanly; regenerate replacement artifacts."'
    return f"""
    <section class="panel candidate-panel">
      <h2>Tail-trim candidate: review before replacing originals</h2>
      <p>The original video masters run about <strong>{esc(round(float(tail_candidate.get("trimmedTailSeconds") or 0), 3))} seconds</strong> past the longest program audio. Studio generated non-destructive candidate replacements trimmed to about <strong>{esc(tail_candidate.get("targetDurationSeconds"))} seconds</strong>. This is a proposed fix, not an approval.</p>
      <div class="status-row">
        <span class="pill warn">{esc(tail_candidate.get("status"))}</span>
        <span class="pill">{esc(tail_candidate.get("failedArtifactCount"))} failed candidate artifact(s)</span>
        <span class="pill">{esc(tail_candidate.get("failedCandidateSampleCount"))} failed ending sample(s)</span>
      </div>
      <div class="candidate-grid">{''.join(artifact_cards)}</div>
      <p>If these candidates fix the ending cleanly, select them for full watch/listen review. This still does not approve final artifacts or make Tower publication-ready.</p>
      <div class="decision-grid">
        <article class="decision-card">
          <strong>Select candidate for review</strong>
          <code>{esc(promote_command)}</code>
          <button type="button" data-copy="{esc(promote_command)}">Copy command</button>
        </article>
        <article class="decision-card">
          <strong>Reject candidate</strong>
          <code>{esc(reject_command)}</code>
          <button type="button" data-copy="{esc(reject_command)}">Copy command</button>
        </article>
      </div>
    </section>
    """


def tail_trim_sanity_section(tail_sanity: dict[str, Any] | None) -> str:
    if not tail_sanity:
        command = "script/agentctl.sh episode1-tail-trim-candidate-sanity"
        return f"""
    <section class="panel">
      <h2>Tail-trim machine preflight</h2>
      <p>No tail-trim candidate machine sanity packet was found yet. Generate it before review if you want stream, duration, and ending-sample audio checks.</p>
      <code>{esc(command)}</code>
    </section>
    """

    rows = []
    for artifact in tail_sanity.get("artifacts") or []:
        warnings = artifact.get("warnings") or []
        errors = artifact.get("errors") or []
        volume = artifact.get("endingSampleVolume") or {}
        contact_sheet = artifact.get("endingSampleContactSheet") or {}
        contact_sheet_path = contact_sheet.get("path")
        contact_sheet_html = (
            f'<a href="{file_url(contact_sheet_path)}"><img class="contact-sheet" src="{file_url(contact_sheet_path)}" alt="{esc(artifact.get("artifactId"))} ending contact sheet"></a>'
            if contact_sheet.get("exists") and contact_sheet_path
            else '<span>No visual contact sheet for this artifact.</span>'
        )
        rows.append(
            f"""
        <article class="sanity-card {esc(artifact.get("status"))}">
          <strong>{esc(artifact.get("artifactId"))}</strong>
          <span>status: {esc(artifact.get("status"))}</span>
          <span>candidate: {esc(artifact.get("candidateDurationSeconds"))}s · streams V{esc(artifact.get("candidateVideoStreamCount"))}/A{esc(artifact.get("candidateAudioStreamCount"))}</span>
          <span>ending sample: {esc(artifact.get("endingSampleDurationSeconds"))}s · max volume {esc(volume.get("maxVolumeDb"))} dB</span>
          {contact_sheet_html}
          <span>warnings: {esc(len(warnings))} · errors: {esc(len(errors))}</span>
          <code>{esc(artifact.get("endingSamplePath"))}</code>
        </article>
            """
        )
    return f"""
    <section class="panel sanity-panel">
      <h2>Tail-trim machine preflight</h2>
      <p>Machine sanity status: <strong>{esc(tail_sanity.get("status"))}</strong>. Errors: <strong>{esc(tail_sanity.get("errorCount"))}</strong>. Warnings: <strong>{esc(tail_sanity.get("warningCount"))}</strong>. This is evidence for review, not approval.</p>
      <div class="sanity-grid">{''.join(rows)}</div>
      <p>Truth boundary: machine preflight checks that the candidate files and ending samples are structurally sane. It does not decide whether the ending feels right.</p>
    </section>
    """


def html_page(packet: dict[str, Any], samples: dict[str, Any], sanity: dict[str, Any], contact_packet: dict[str, Any], tail_candidate: dict[str, Any] | None, tail_sanity: dict[str, Any] | None) -> str:
    sections = "\n".join(artifact_section(artifact) for artifact in samples.get("artifacts") or [])
    warnings = warning_list(sanity)
    contacts = contact_sheet_links(contact_packet)
    tail_section = tail_trim_candidate_section(tail_candidate)
    tail_sanity_html = tail_trim_sanity_section(tail_sanity)
    generated = packet["generatedAt"]
    decision_commands = {
        "Needs more review": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-review "Reviewer Name" "Sample review started; full watch/listen still needed."',
        "Needs Studio fix": 'script/agentctl.sh episode1-artifact-watch-review-decision needs-fix "Reviewer Name" "Issue found during review; route exact artifact/time/problem back to Studio."',
        "Reject artifacts": 'script/agentctl.sh episode1-artifact-watch-review-decision reject "Reviewer Name" "Artifacts are not usable; replacement export required."',
        "Pass selected artifact review": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected artifact set; ready for destination-copy review, not publication receipt."',
    }
    command_cards = "\n".join(
        f"""
        <article class="decision-card">
          <strong>{esc(label)}</strong>
          <code>{esc(command)}</code>
          <button type="button" data-copy="{esc(command)}">Copy command</button>
        </article>
        """
        for label, command in decision_commands.items()
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Artifact Review Station</title>
  <style>
    :root {{
      --bg: #f5efe1;
      --paper: #fffaf0;
      --ink: #38281f;
      --muted: #756657;
      --moss: #556b43;
      --fern: #2f7a55;
      --gold: #d6a637;
      --warn: #a45c2f;
      --line: rgba(77, 54, 38, 0.16);
      --shadow: 0 20px 70px rgba(47, 38, 28, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 0%, rgba(214, 166, 55, 0.22), transparent 32rem),
        radial-gradient(circle at 90% 8%, rgba(47, 122, 85, 0.18), transparent 30rem),
        linear-gradient(135deg, #fbf6e9, var(--bg));
    }}
    header {{
      padding: 56px clamp(24px, 6vw, 88px) 28px;
    }}
    main {{
      padding: 0 clamp(24px, 6vw, 88px) 80px;
    }}
    .hero, .panel, .artifact {{
      background: rgba(255, 250, 240, 0.84);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
    }}
    .hero {{
      padding: clamp(28px, 5vw, 56px);
    }}
    .eyebrow {{
      color: var(--fern);
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-size: 0.78rem;
    }}
    h1 {{
      margin: 12px 0 14px;
      font-size: clamp(2.25rem, 6vw, 5rem);
      line-height: 0.95;
      letter-spacing: -0.06em;
    }}
    h2 {{
      margin: 0 0 10px;
      font-size: clamp(1.35rem, 2vw, 2rem);
    }}
    p {{
      color: var(--muted);
      font-size: 1.05rem;
      line-height: 1.55;
    }}
    code {{
      display: block;
      overflow-wrap: anywhere;
      color: #5c4637;
      background: rgba(85, 107, 67, 0.08);
      border: 1px solid rgba(85, 107, 67, 0.12);
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 0.78rem;
    }}
    .status-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 22px;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 10px 14px;
      font-weight: 800;
      background: rgba(47, 122, 85, 0.1);
      color: var(--fern);
      border: 1px solid rgba(47, 122, 85, 0.18);
    }}
    .pill.warn {{
      background: rgba(164, 92, 47, 0.11);
      color: var(--warn);
      border-color: rgba(164, 92, 47, 0.22);
    }}
    .panel {{
      padding: 26px;
      margin: 22px 0;
    }}
    .review-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }}
    .check {{
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px;
      border-radius: 16px;
      background: rgba(85, 107, 67, 0.08);
      border: 1px solid rgba(85, 107, 67, 0.12);
      color: var(--ink);
      font-weight: 750;
    }}
    .check input {{
      margin-top: 4px;
      transform: scale(1.15);
      accent-color: var(--fern);
    }}
    .decision-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }}
    .decision-card {{
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.54);
      border: 1px solid var(--line);
    }}
    button {{
      width: fit-content;
      cursor: pointer;
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      color: white;
      background: linear-gradient(135deg, var(--fern), var(--moss));
      font-weight: 900;
      box-shadow: 0 8px 20px rgba(47, 122, 85, 0.18);
    }}
    .saved-note {{
      margin-top: 10px;
      color: var(--fern);
      font-weight: 850;
      min-height: 1.4em;
    }}
    .artifact {{
      margin-top: 26px;
      padding: 26px;
    }}
    .source {{
      margin: 0 0 18px;
    }}
    .sample-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }}
    .sample-card {{
      padding: 16px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.55);
      border: 1px solid var(--line);
    }}
    .candidate-panel {{
      border-color: rgba(164, 92, 47, 0.28);
      background:
        linear-gradient(135deg, rgba(255, 250, 240, 0.92), rgba(244, 225, 192, 0.72));
    }}
    .candidate-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin: 18px 0;
    }}
    .candidate-card {{
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.62);
      border: 1px solid rgba(164, 92, 47, 0.18);
    }}
    .candidate-card span, .missing {{
      color: var(--muted);
      font-size: 0.9rem;
    }}
    .sanity-panel {{
      border-color: rgba(47, 122, 85, 0.2);
    }}
    .sanity-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
      margin-top: 16px;
    }}
    .sanity-card {{
      display: grid;
      gap: 7px;
      padding: 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.52);
      border: 1px solid rgba(47, 122, 85, 0.14);
    }}
    .sanity-card.warning {{
      border-color: rgba(214, 166, 55, 0.4);
      background: rgba(214, 166, 55, 0.08);
    }}
    .sanity-card.error {{
      border-color: rgba(164, 92, 47, 0.4);
      background: rgba(164, 92, 47, 0.08);
    }}
    .sanity-card span {{
      color: var(--muted);
      font-size: 0.9rem;
    }}
    .contact-sheet {{
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(47, 122, 85, 0.14);
      background: rgba(0, 0, 0, 0.08);
    }}
    .sample-meta {{
      display: grid;
      gap: 3px;
      margin-bottom: 12px;
    }}
    .sample-meta span {{
      color: var(--muted);
      font-size: 0.9rem;
    }}
    video, audio {{
      width: 100%;
      border-radius: 18px;
      background: #1f241f;
      border: 1px solid rgba(0, 0, 0, 0.2);
      margin-bottom: 12px;
    }}
    video {{
      max-height: 360px;
    }}
    ul {{
      line-height: 1.6;
      color: var(--muted);
    }}
    a {{
      color: var(--fern);
      font-weight: 800;
    }}
    .decision {{
      white-space: pre-wrap;
      color: var(--ink);
    }}
  </style>
  <script>
    const storagePrefix = "quipsly-episode-1-review-station:";
    function restoreChecks() {{
      document.querySelectorAll("[data-review-check]").forEach((box) => {{
        box.checked = localStorage.getItem(storagePrefix + box.id) === "true";
        box.addEventListener("change", () => {{
          localStorage.setItem(storagePrefix + box.id, box.checked ? "true" : "false");
          const note = document.querySelector("#save-note");
          if (note) note.textContent = "Checklist saved locally in this browser.";
        }});
      }});
    }}
    async function copyText(value) {{
      await navigator.clipboard.writeText(value);
      const note = document.querySelector("#save-note");
      if (note) note.textContent = "Copied command to clipboard.";
    }}
    window.addEventListener("DOMContentLoaded", () => {{
      restoreChecks();
      document.querySelectorAll("[data-copy]").forEach((button) => {{
        button.addEventListener("click", () => copyText(button.dataset.copy));
      }});
    }});
  </script>
</head>
<body>
  <header>
    <section class="hero">
      <div class="eyebrow">Quipsly Studio Review Station</div>
      <h1>Episode 1 artifact review starts here.</h1>
      <p>Generated {esc(generated)}. This page gathers the opening, middle, and near-end review samples for the full-length 16:9 master, 9:16 master, and podcast audio. It lowers uncertainty. It does not approve publication.</p>
      <div class="status-row">
        <span class="pill">{esc(samples.get("status"))}</span>
        <span class="pill warn">{esc(sanity.get("warningCount"))} machine warning(s)</span>
        <span class="pill">{esc(samples.get("failedSampleCount"))} failed sample(s)</span>
      </div>
    </section>
  </header>
  <main>
    <section class="panel">
      <h2>Review worksheet</h2>
      <p>The worksheet remains the canonical place to record the actual review state. This station is the watching/listening surface.</p>
      <ul>
        <li><a href="{esc(packet.get("worksheetUrl"))}">Open the Episode 1 watch/listen worksheet</a></li>
      </ul>
    </section>
    <section class="panel">
      <h2>Known warnings to check</h2>
      <ul>{warnings}</ul>
    </section>
    {tail_section}
    {tail_sanity_html}
    <section class="panel">
      <h2>Review checklist</h2>
      <p>These checkboxes save locally in this browser. They are a convenience, not the official ledger. The official state changes only when a decision command is recorded.</p>
      <div class="review-grid">
        <label class="check"><input id="check-16x9-start" data-review-check type="checkbox"> 16:9 opening sample plays and starts intentionally.</label>
        <label class="check"><input id="check-16x9-middle" data-review-check type="checkbox"> 16:9 middle sample has usable picture/audio.</label>
        <label class="check"><input id="check-16x9-audio-boundary" data-review-check type="checkbox"> 16:9 audio-end boundary sample has an intentional transition.</label>
        <label class="check"><input id="check-16x9-tail" data-review-check type="checkbox"> 16:9 tail sample explains or resolves the near-end audio warning.</label>
        <label class="check"><input id="check-9x16-start" data-review-check type="checkbox"> 9:16 opening sample plays and crops acceptably.</label>
        <label class="check"><input id="check-9x16-middle" data-review-check type="checkbox"> 9:16 middle sample has usable picture/audio.</label>
        <label class="check"><input id="check-9x16-audio-boundary" data-review-check type="checkbox"> 9:16 audio-end boundary sample has an intentional transition.</label>
        <label class="check"><input id="check-9x16-tail" data-review-check type="checkbox"> 9:16 tail sample explains or resolves the near-end audio warning.</label>
        <label class="check"><input id="check-podcast-start" data-review-check type="checkbox"> Podcast opening audio is intelligible and intentional.</label>
        <label class="check"><input id="check-podcast-middle" data-review-check type="checkbox"> Podcast middle audio is intelligible.</label>
        <label class="check"><input id="check-podcast-tail" data-review-check type="checkbox"> Podcast tail audio has an intentional ending.</label>
      </div>
      <div id="save-note" class="saved-note"></div>
    </section>
    <section class="panel">
      <h2>Visual contact sheets</h2>
      <ul>{contacts}</ul>
    </section>
    {sections}
    <section class="panel">
      <h2>Record the review decision</h2>
      <p>After sample review and, if needed, full watch/listen review, record the state explicitly. If a sane tail-trim candidate exists, pass should normally happen after selecting that candidate for review. Passing the original long-tail masters requires an explicit <code>accept-originals-with-tail-warning</code> note. The pass option moves the episode toward destination-copy review, not publication receipts.</p>
      <code class="decision">cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject "Reviewer Name" "Short evidence-backed note"</code>
      <div class="decision-grid">{command_cards}</div>
    </section>
    <section class="panel">
      <h2>Truth boundary</h2>
      <p>This page is a local review aid. It does not upload, schedule, publish, approve canon, approve artifacts, or capture external receipts. Tower remains blocked until a real review decision is recorded.</p>
    </section>
  </main>
</body>
</html>
"""


def main() -> int:
    if len(sys.argv) != 10:
        print(
            "usage: episode1_artifact_review_station.py samples.json sanity.json contact-sheets.json output.html output.json action-queue.json studio-queue.json writing-status.json worksheet.md",
            file=sys.stderr,
        )
        return 2

    samples_path, sanity_path, contact_path, output_html, output_json, action_queue_path, studio_queue_path, writing_status_path, worksheet_path = sys.argv[1:10]
    samples = load_json(samples_path)
    sanity = load_json(sanity_path)
    contact_packet = load_json(contact_path)
    tail_candidate_path = str(Path(output_json).with_name("episode-1-tail-trim-candidate.json"))
    tail_candidate = load_optional_json(tail_candidate_path)
    tail_sanity_path = str(Path(output_json).with_name("episode-1-tail-trim-candidate-sanity.json"))
    tail_sanity = load_optional_json(tail_sanity_path)
    packet = {
        "packetType": "quipsly-artifact-review-station",
        "version": "2026-06-20.artifact-review-station.v1",
        "projectSlug": samples.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": samples.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "status": "review-station-generated-needs-watch-listen-review",
        "reviewStationHtml": output_html,
        "reviewStationUrl": file_url(output_html),
        "worksheetPath": worksheet_path,
        "worksheetUrl": file_url(worksheet_path),
        "sourceSamplesPacket": samples_path,
        "sourceSanityPacket": sanity_path,
        "sourceContactSheetPacket": contact_path,
        "tailTrimCandidatePacket": tail_candidate_path if tail_candidate else None,
        "tailTrimCandidateStatus": tail_candidate.get("status") if tail_candidate else None,
        "tailTrimCandidateOutputDir": tail_candidate.get("outputDir") if tail_candidate else None,
        "tailTrimCandidateSanityPacket": tail_sanity_path if tail_sanity else None,
        "tailTrimCandidateSanityStatus": tail_sanity.get("status") if tail_sanity else None,
        "failedSampleCount": samples.get("failedSampleCount"),
        "machineWarningCount": sanity.get("warningCount"),
        "truth": "This local review station gathers review evidence in one page. It does not perform full watch/listen review, approve, publish, upload, schedule, or capture receipts.",
    }
    os.makedirs(os.path.dirname(output_html) or ".", exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet, samples, sanity, contact_packet, tail_candidate, tail_sanity))
    write_json(output_json, packet)

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = packet["generatedAt"]
        if path == action_queue_path:
            payload["currentArtifactReviewStation"] = output_json
            payload["currentArtifactReviewStationHtml"] = output_html
            if tail_candidate:
                payload["currentTailTrimCandidate"] = tail_candidate_path
                payload["currentTailTrimCandidateOutputDir"] = tail_candidate.get("outputDir")
            payload.setdefault("operatorCommands", {})["generateArtifactReviewStation"] = "script/agentctl.sh episode1-artifact-review-station"
        elif path == studio_queue_path:
            payload["currentArtifactReviewStation"] = output_json
            payload["currentArtifactReviewStationHtml"] = output_html
            if tail_candidate:
                payload["currentTailTrimCandidate"] = tail_candidate_path
                payload["currentTailTrimCandidateOutputDir"] = tail_candidate.get("outputDir")
            payload.setdefault("operatorCommands", {})["generateArtifactReviewStation"] = "script/agentctl.sh episode1-artifact-review-station"
        else:
            payload.setdefault("authoritativeArtifacts", {})["artifactReviewStation"] = output_json
            payload.setdefault("authoritativeArtifacts", {})["artifactReviewStationHtml"] = output_html
            if tail_candidate:
                payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidate"] = tail_candidate_path
                payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidateOutputDir"] = tail_candidate.get("outputDir")
            payload.setdefault("operatorCommands", {})["generateArtifactReviewStation"] = "script/agentctl.sh episode1-artifact-review-station"
        write_json(path, payload)

    if os.path.exists(worksheet_path):
        existing_worksheet = Path(worksheet_path).read_text(encoding="utf-8")
        if output_html in existing_worksheet:
            should_append = False
        else:
            should_append = True
        should_append_tail = bool(tail_candidate and tail_candidate_path not in existing_worksheet)
    else:
        should_append = False
        should_append_tail = False
    if should_append:
        with open(worksheet_path, "a", encoding="utf-8") as handle:
            handle.write(
                "\n## Local review station\n\n"
                f"Generated review station: `{output_html}`\n\n"
                f"Open in browser: `{packet['reviewStationUrl']}`\n\n"
                "Purpose:\n\n"
                "- Watch/listen to the generated start, middle, and tail samples in one place.\n"
                "- Check the known near-end video-master audio warning.\n"
                "- Record a real watch/listen decision after review.\n\n"
                "Truth boundary: the review station is a review aid, not artifact approval or publication readiness.\n"
            )
    if should_append_tail:
        with open(worksheet_path, "a", encoding="utf-8") as handle:
            handle.write(
                "\n## Tail-trim candidate visible in review station\n\n"
                f"- Candidate packet: `{tail_candidate_path}`\n"
                f"- Candidate output folder: `{tail_candidate.get('outputDir')}`\n"
                "- Why: the original video masters run past the longest program audio by about "
                f"`{tail_candidate.get('trimmedTailSeconds')}` seconds.\n"
                "- Review instruction: compare the candidate ending against the original tail before deciding whether Studio should promote replacements.\n"
                "- Truth boundary: the candidate is a proposed Studio fix. It does not replace originals until explicitly reviewed/promoted.\n"
            )

    print(
        json.dumps(
            {
                "packetType": "quipsly-artifact-review-station-result",
                "status": packet["status"],
                "html": output_html,
                "json": output_json,
                "reviewStationUrl": packet["reviewStationUrl"],
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
