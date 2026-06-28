#!/usr/bin/env python3
"""Build one Studio next-review card for Episode package review.

This reads the latest Studio review work session and writes a tiny local card
for the next safest reviewer action. It never repairs, exports, approves,
publishes, uploads, schedules, mutates source media, overwrites versions, or
creates receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_WORK_SESSION = "review-board/studio-review-work-sessions/latest-studio-review-work-session.json"
LATEST_NEXT_CARD = "review-board/studio-next-review-card/latest-studio-next-review-card.json"
LATEST_SYNC_DECISION_AID = "review-board/latest-studio-sync-decision-aid.json"
SCHEMA = "quipsly.studio.next-review-card.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-next-review-card")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def path_from_open_command(command: str) -> str:
    try:
        parts = shlex.split(command)
    except ValueError:
        return ""
    if not parts or parts[0] != "open":
        return ""
    for part in parts[1:]:
        if part.startswith("-"):
            continue
        return part
    return ""


def evidence_context_for(first_evidence_path: str) -> dict[str, Any]:
    if not first_evidence_path:
        return {}
    evidence_path = Path(first_evidence_path)
    evidence_dir = evidence_path.parent if evidence_path.suffix else evidence_path
    sync_path = evidence_dir / "sync-investigation.json"
    sync_packet = load_json(sync_path)
    has_sync_investigation = bool(sync_packet and sync_path.exists())
    worksheet_path = str(sync_packet.get("worksheetPath") or sync_packet.get("reviewWorksheetPath") or "")
    if not worksheet_path:
        candidate = evidence_dir / "SYNC-REVIEW-WORKSHEET.md"
        worksheet_path = str(candidate) if candidate.exists() else ""
    snippet_dir = evidence_dir / "snippets"
    evidence_snippets = sorted(snippet_dir.glob("*")) if snippet_dir.exists() else []
    evidence_snippet_paths = [str(path) for path in evidence_snippets if path.is_file()]
    sync_snippet_paths = evidence_snippet_paths if has_sync_investigation else []
    return {
        "evidenceSnippetDirPath": str(snippet_dir) if snippet_dir.exists() else "",
        "evidenceSnippetCount": len(evidence_snippet_paths),
        "evidenceSnippetPaths": evidence_snippet_paths,
        "syncInvestigationJsonPath": str(sync_path) if sync_path.exists() else "",
        "syncInvestigationStatus": str(sync_packet.get("status") or ""),
        "syncReviewWorksheetPath": worksheet_path,
        "syncReviewWorksheetExists": Path(worksheet_path).exists() if worksheet_path else False,
        "syncSnippetDirPath": str(snippet_dir) if has_sync_investigation and snippet_dir.exists() else "",
        "syncSnippetCount": len(sync_snippet_paths),
        "syncSnippetPaths": sync_snippet_paths,
        "syncHumanAsk": str(sync_packet.get("humanAsk") or ""),
        "syncNextSafestAction": str(sync_packet.get("nextSafestAction") or ""),
    }


def load_pointer_target(pointer_path: Path) -> dict[str, Any]:
    pointer = load_json(pointer_path)
    json_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(json_path) if json_path else {}
    return {**pointer, **target} if target else pointer


def sync_decision_aid_context_for(root: Path, evidence_context: dict[str, Any]) -> dict[str, Any]:
    aid = load_pointer_target(root / LATEST_SYNC_DECISION_AID)
    if not aid:
        return {}
    html_path = str(aid.get("htmlPath") or aid.get("syncDecisionAidPath") or "")
    json_path = str(aid.get("jsonPath") or "")
    markdown_path = str(aid.get("markdownPath") or "")
    source_investigation = str(aid.get("syncInvestigationJsonPath") or "")
    current_investigation = str(evidence_context.get("syncInvestigationJsonPath") or "")
    relation = "matching-current-evidence" if source_investigation and current_investigation and source_investigation == current_investigation else "separate-sync-review-door"
    return {
        "syncDecisionAidRelation": relation,
        "syncDecisionAidStatus": str(aid.get("status") or ""),
        "syncDecisionAidHtmlPath": html_path,
        "syncDecisionAidJsonPath": json_path,
        "syncDecisionAidMarkdownPath": markdown_path,
        "syncDecisionAidExists": Path(html_path).exists() if html_path else False,
        "syncDecisionAidMatchesInvestigation": relation == "matching-current-evidence",
        "syncDecisionAidHumanAsk": str(aid.get("humanAsk") or ""),
        "syncDecisionAidNextSafestAction": str(aid.get("nextSafestAction") or ""),
        "syncDecisionAidCounts": aid.get("counts") if isinstance(aid.get("counts"), dict) else {},
        "syncDecisionAidTruth": aid.get("truth") if isinstance(aid.get("truth"), dict) else {},
    }


def append_unique_open_command(commands: list[dict[str, str]], label: str, path: str) -> None:
    if not path:
        return
    if any(str(item.get("path") or "") == path for item in commands):
        return
    commands.append({"label": label, "command": f"open {shell_quote(path)}", "path": path})


def load_work_session(root: Path) -> tuple[dict[str, Any], Path]:
    pointer_path = root / LATEST_WORK_SESSION
    pointer = load_json(pointer_path)
    packet_path_value = str(pointer.get("jsonPath") or "")
    packet_path = Path(packet_path_value) if packet_path_value else pointer_path
    packet = load_json(packet_path)
    return ({**pointer, **packet} if packet else pointer), pointer_path


def severity_rank(card: dict[str, Any]) -> tuple[int, int]:
    severity = str(card.get("durationSeverity") or "").lower()
    candidate = str(card.get("candidateStatus") or "").lower()
    episode = int(card.get("episode") or 999)
    if "major" in severity or "sync-investigation" in candidate:
        return (0, episode)
    if "duration" in severity or "warning" in severity:
        return (1, episode)
    return (2, episode)


def choose_review_target(session: dict[str, Any], episode: int | None) -> tuple[str, dict[str, Any]]:
    duration_deck = session.get("durationWarningCards") if isinstance(session.get("durationWarningCards"), dict) else {}
    duration_cards = [card for card in duration_deck.get("cards", []) if isinstance(card, dict)]
    checklist = session.get("reviewerDailyChecklist") if isinstance(session.get("reviewerDailyChecklist"), dict) else {}
    checklist_items = [item for item in checklist.get("items", []) if isinstance(item, dict)]
    if episode is not None:
        for card in duration_cards:
            if int(card.get("episode") or -1) == episode:
                return ("duration-warning", card)
        for item in checklist_items:
            if int(item.get("episode") or -1) == episode:
                return ("daily-review", item)
    if duration_cards:
        return ("duration-warning", sorted(duration_cards, key=severity_rank)[0])
    if checklist_items:
        return ("daily-review", checklist_items[0])
    return ("missing-review-session", {})


def open_commands_for(target: dict[str, Any], session: dict[str, Any]) -> list[dict[str, str]]:
    commands: list[dict[str, str]] = []
    first_path = str(target.get("firstOpenPath") or target.get("candidateReviewHtmlPath") or "")
    first_command = str(target.get("firstOpenCommand") or (f"open {shell_quote(first_path)}" if first_path else ""))
    if first_command and not first_path:
        first_path = path_from_open_command(first_command)
    if first_command:
        commands.append({"label": "Open first evidence", "command": first_command, "path": first_path})
    for label, key in [
        ("Open reviewer checklist", "reviewerDailyChecklistPath"),
        ("Open duration warning cards", "durationWarningCardsPath"),
        ("Open review decisions", "reviewDecisionCardsPath"),
        ("Open reviewer handoff", "reviewerReturnHandoffPath"),
        ("Open worksheet", "reviewWorksheetPath"),
        ("Open full work session", "htmlPath"),
    ]:
        path = str(session.get(key) or "")
        if path:
            commands.append({"label": label, "command": f"open {shell_quote(path)}", "path": path})
    return commands


def build_payload(root: Path, episode: int | None = None) -> dict[str, Any]:
    session, pointer_path = load_work_session(root)
    target_kind, target = choose_review_target(session, episode)
    counts = session.get("counts") if isinstance(session.get("counts"), dict) else {}
    episode_number = target.get("episode") or episode or ""
    current_version = str(target.get("currentVersion") or target.get("version") or "")
    candidate_version = str(target.get("candidateVersion") or "")
    version = f"{current_version} -> {candidate_version}" if current_version and candidate_version and current_version != candidate_version else (candidate_version or current_version)
    label = f"Episode {episode_number} {version}".strip() if episode_number else "Studio package review"
    open_commands = open_commands_for(target, session)
    first_evidence_path = str(target.get("firstOpenPath") or target.get("candidateReviewHtmlPath") or "")
    if not first_evidence_path and open_commands:
        first_evidence_path = str(open_commands[0].get("path") or "")
    evidence_context = evidence_context_for(first_evidence_path)
    evidence_context.update(sync_decision_aid_context_for(root, evidence_context))
    if evidence_context.get("syncDecisionAidRelation") == "matching-current-evidence":
        append_unique_open_command(open_commands, "Open sync decision aid", str(evidence_context.get("syncDecisionAidHtmlPath") or ""))
    append_unique_open_command(open_commands, "Open sync review worksheet", str(evidence_context.get("syncReviewWorksheetPath") or ""))
    append_unique_open_command(open_commands, "Open sync snippets folder", str(evidence_context.get("syncSnippetDirPath") or ""))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio-next-review-card-ready" if target else "studio-next-review-card-needs-work-session",
        "releaseRoot": str(root),
        "sourceWorkSessionPointerPath": str(pointer_path),
        "sourceWorkSessionJsonPath": str(session.get("jsonPath") or ""),
        "sourceWorkSessionHtmlPath": str(session.get("htmlPath") or ""),
        "targetKind": target_kind,
        "episode": episode_number,
        "version": version,
        "label": label,
        "durationSeverity": str(target.get("durationSeverity") or target.get("route") or target.get("candidateStatus") or "unknown"),
        "durationSpreadLabel": str(target.get("durationSpreadLabel") or target.get("spreadLabel") or ""),
        "publishGate": str(target.get("publishGate") or "Needs review decision"),
        "recommendedLocalDecision": str(target.get("defaultLocalDecision") or ("sync-investigate" if str(target.get("route") or "").startswith("sync") else "needs-more-evidence")),
        "decisionPrompt": str(target.get("decisionPrompt") or "Does this episode package need approve/refine/hold/more-evidence as a local next step?"),
        "humanQuestion": str(target.get("humanQuestion") or target.get("decisionPrompt") or "What should happen next locally, without approving publication?"),
        "codexSafeMove": str(target.get("codexSafeMove") or "Open local evidence, summarize risks, improve review clarity, and keep publication blocked until explicit human approval."),
        "firstEvidencePath": first_evidence_path,
        "firstEvidenceExists": Path(first_evidence_path).exists() if first_evidence_path else False,
        "evidenceContext": evidence_context,
        "artifactSummary": [str(item) for item in target.get("artifactSummary", [])] if isinstance(target.get("artifactSummary"), list) else [],
        "copyableDecisionTemplate": str(target.get("copyableDecisionTemplate") or ""),
        "localDurationWarningNoteYaml": str(target.get("localDurationWarningNoteYaml") or ""),
        "openCommands": open_commands,
        "reviewerDailyChecklistPath": str(session.get("reviewerDailyChecklistPath") or ""),
        "durationWarningCardsPath": str(session.get("durationWarningCardsPath") or ""),
        "reviewerReturnHandoffPath": str(session.get("reviewerReturnHandoffPath") or ""),
        "reviewDecisionCardsPath": str(session.get("reviewDecisionCardsPath") or ""),
        "humanReviewerRunwayPath": str(session.get("humanReviewerRunwayPath") or ""),
        "reviewWorksheetPath": str(session.get("reviewWorksheetPath") or ""),
        "workSessionHtmlPath": str(session.get("htmlPath") or ""),
        "countsContext": {
            "currentBestPackages": counts.get("currentBestPackages", 0),
            "reviewablePackages": counts.get("reviewablePackages", 0),
            "readyShorts": counts.get("readyShorts", 0),
            "warningEpisodes": counts.get("warningEpisodes", 0),
            "durationWarningCards": counts.get("durationWarningCards", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
        },
        "firstSafeAction": {
            "label": "Open this Studio review card",
            "command": "",
            "path": "",
            "safety": "Opens one local Studio review card. No repair, export, upload, publish, schedule, approval, account mutation, source mutation, overwrite, delete, or receipt truth.",
        },
        "truth": {
            "description": "Studio next-review card only. It reads local review-session evidence and writes a local operator card.",
            "repairsExecuted": False,
            "exportsCreated": False,
            "approvalsChanged": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    evidence_context = payload.get("evidenceContext") if isinstance(payload.get("evidenceContext"), dict) else {}
    lines = [
        "# Studio next review card",
        "",
        f"**Target:** {payload.get('label')}",
        f"**Kind:** `{payload.get('targetKind')}`",
        f"**Duration:** `{payload.get('durationSeverity')}` `{payload.get('durationSpreadLabel')}`",
        f"**Gate:** `{payload.get('publishGate')}`",
        f"**Suggested local decision:** `{payload.get('recommendedLocalDecision')}`",
        "",
        "## Decision prompt",
        str(payload.get("decisionPrompt") or ""),
        "",
        "## Human question",
        str(payload.get("humanQuestion") or ""),
        "",
        "## Codex-safe move",
        str(payload.get("codexSafeMove") or ""),
        "",
        "## Open local evidence",
    ]
    for item in payload.get("openCommands") or []:
        lines.append(f"- {item.get('label')}: `{item.get('command')}`")
    if evidence_context.get("syncReviewWorksheetPath") or evidence_context.get("syncSnippetCount"):
        lines.extend([
            "",
            "## Sync review aid",
            f"- Decision aid: `{evidence_context.get('syncDecisionAidHtmlPath') or ''}`",
            f"- Decision aid status: `{evidence_context.get('syncDecisionAidStatus') or ''}`",
            f"- Decision aid relation: `{evidence_context.get('syncDecisionAidRelation') or ''}`",
            f"- Decision aid matches investigation: `{evidence_context.get('syncDecisionAidMatchesInvestigation')}`",
            f"- Worksheet: `{evidence_context.get('syncReviewWorksheetPath') or ''}`",
            f"- Snippets: `{evidence_context.get('syncSnippetDirPath') or ''}` ({evidence_context.get('syncSnippetCount') or 0} files)",
            f"- Human ask: {evidence_context.get('syncDecisionAidHumanAsk') or evidence_context.get('syncHumanAsk') or ''}",
            f"- Next safest action: {evidence_context.get('syncDecisionAidNextSafestAction') or evidence_context.get('syncNextSafestAction') or ''}",
        ])
    elif evidence_context.get("evidenceSnippetCount"):
        lines.extend([
            "",
            "## Local evidence snippets",
            f"- Snippets: `{evidence_context.get('evidenceSnippetDirPath') or ''}` ({evidence_context.get('evidenceSnippetCount') or 0} files)",
            "- Note: these are review snippets for this card, not sync-investigation snippets.",
        ])
    lines.extend(["", "## Artifact summary"])
    for item in payload.get("artifactSummary") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Copyable decision template",
        "",
        "```yaml",
        str(payload.get("copyableDecisionTemplate") or payload.get("localDurationWarningNoteYaml") or "studio_review_note: {}"),
        "```",
        "",
        "## Safety",
        "- Does not repair or export.",
        "- Does not approve, publish, upload, schedule, mutate accounts, or create receipt truth.",
        "- Does not mutate original media or overwrite previous versions.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    evidence_context = payload.get("evidenceContext") if isinstance(payload.get("evidenceContext"), dict) else {}
    opens = "".join(f"<li><b>{esc(item.get('label'))}</b><code>{esc(item.get('command'))}</code></li>" for item in payload.get("openCommands") or [])
    artifacts = "".join(f"<li>{esc(item)}</li>" for item in payload.get("artifactSummary") or [])
    sync_review_aid = ""
    if evidence_context.get("syncReviewWorksheetPath") or evidence_context.get("syncSnippetCount"):
        sync_review_aid = f"""
    <section><h2>Sync review aid</h2>
      <p><b>Decision aid:</b><code>{esc(evidence_context.get('syncDecisionAidHtmlPath'))}</code></p>
      <p><b>Decision aid status:</b> {esc(evidence_context.get('syncDecisionAidStatus'))}</p>
      <p><b>Decision aid relation:</b> {esc(evidence_context.get('syncDecisionAidRelation'))}</p>
      <p><b>Matches source investigation:</b> {esc(evidence_context.get('syncDecisionAidMatchesInvestigation'))}</p>
      <p><b>Worksheet:</b><code>{esc(evidence_context.get('syncReviewWorksheetPath'))}</code></p>
      <p><b>Snippets:</b><code>{esc(evidence_context.get('syncSnippetDirPath'))}</code></p>
      <p><b>Snippet files:</b> {esc(evidence_context.get('syncSnippetCount'))}</p>
      <p><b>Human ask:</b> {esc(evidence_context.get('syncDecisionAidHumanAsk') or evidence_context.get('syncHumanAsk'))}</p>
      <p><b>Next safest action:</b> {esc(evidence_context.get('syncDecisionAidNextSafestAction') or evidence_context.get('syncNextSafestAction'))}</p>
    </section>"""
    elif evidence_context.get("evidenceSnippetCount"):
        sync_review_aid = f"""
    <section><h2>Local evidence snippets</h2>
      <p><b>Snippets:</b><code>{esc(evidence_context.get('evidenceSnippetDirPath'))}</code></p>
      <p><b>Snippet files:</b> {esc(evidence_context.get('evidenceSnippetCount'))}</p>
      <p>These snippets belong to the current review card. They are not labeled as sync-investigation evidence unless a sync investigation packet exists beside them.</p>
    </section>"""
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio next review card</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f6f0df; --paper:#16221d; --leaf:#80b486; --line:#345147; --gold:#e2b94a; --clay:#d77848; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 20% 0%, #30443a, #101614 48%, #201915); color:var(--ink); }}
    main {{ max-width: 1080px; margin: 34px auto; padding: 0 22px 56px; }}
    .card {{ background: rgba(22,34,29,.94); border:1px solid var(--line); border-radius:30px; padding:28px; box-shadow:0 24px 80px rgba(0,0,0,.34); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.28em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font: 900 clamp(36px,5vw,64px)/.96 ui-serif, Georgia, serif; margin:12px 0; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }}
    .meta span {{ border:1px solid var(--line); background:rgba(255,255,255,.06); padding:8px 12px; border-radius:999px; font-weight:900; font-size:12px; }}
    .grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }}
    section {{ border:1px solid var(--line); background:rgba(255,255,255,.045); border-radius:18px; padding:18px; }}
    h2 {{ margin:0 0 10px; color:var(--leaf); font-size:16px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.24); border:1px solid var(--line); border-radius:12px; padding:10px; color:#fff6d8; }}
    .warn {{ color:var(--clay); font-weight:900; }}
    .safety {{ color:#c3cabd; font-size:14px; }}
    @media(max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main><div class="card">
  <div class="eyebrow">Quipsly Studio</div>
  <h1>Review one episode truth gap.</h1>
  <p>Open one local evidence target, make one local review decision, and keep publishing blocked until a real human approval and real receipt exist.</p>
  <div class="meta"><span>{esc(payload.get('label'))}</span><span>{esc(payload.get('targetKind'))}</span><span class="warn">{esc(payload.get('durationSeverity'))} {esc(payload.get('durationSpreadLabel'))}</span><span>{esc(payload.get('recommendedLocalDecision'))}</span></div>
  <div class="grid">
    <section><h2>Decision prompt</h2><p>{esc(payload.get('decisionPrompt'))}</p></section>
    <section><h2>Codex-safe move</h2><p>{esc(payload.get('codexSafeMove'))}</p></section>
    <section><h2>Open local evidence</h2><ul>{opens}</ul></section>
    {sync_review_aid}
    <section><h2>Artifact summary</h2><ul>{artifacts}</ul></section>
  </div>
  <section style="margin-top:16px"><h2>Copyable local note</h2><pre>{esc(payload.get('copyableDecisionTemplate') or payload.get('localDurationWarningNoteYaml'))}</pre></section>
  <p class="safety">Safety: local review card only. No repair/export/approval/publishing/upload/schedule/account mutation/source mutation/overwrite/delete/receipt truth.</p>
</div></main></body></html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Studio next review card.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--episode", type=int, default=None)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build_payload(root, args.episode)
    out_dir = root / "review-board" / "studio-next-review-card" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio-next-review-card.json"
    markdown_path = out_dir / "START-HERE-studio-next-review-card.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "nextStudioReviewCardPath": str(html_path),
        "firstSafeAction": {
            "label": "Open this Studio review card",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens one local Studio review card. No repair, export, upload, publish, schedule, approval, account mutation, source mutation, overwrite, delete, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_json(root / LATEST_NEXT_CARD, payload)
    write_json(root / "review-board" / "latest-studio-next-review-card.json", payload)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
