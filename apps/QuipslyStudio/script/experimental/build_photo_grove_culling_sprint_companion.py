#!/usr/bin/env python3
"""Build a calm Photo Grove culling sprint companion.

This joins the current first-keeper candidates, cull suggestions, decision desk,
and client-proof truth into one short review session. It does not execute any
metadata commands, copy files, create deliveries, or mutate originals.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import shlex
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-culling-sprint-companion.json"
LATEST_ALIAS_POINTERS = [
    "latest-photo-grove-culling-sprint.json",
    "latest-photo-culling-sprint.json",
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).as_uri()
    except Exception:
        return ""


def pointer(photo_root: Path, name: str) -> dict[str, Any]:
    return load_json(photo_root / name)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(pointer_payload.get("jsonPath") or ""))
    return load_json(path) if path else {}


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def command_pair(candidate: dict[str, Any], key: str, fallback: str = "") -> dict[str, str]:
    commands = candidate.get("safeLocalCommands")
    if isinstance(commands, dict) and commands.get(key):
        live = str(commands.get(key) or "")
    else:
        live = fallback
    return {
        "liveMetadataCommand": live,
        "dryRunCommand": live.replace(" photo-grove-decision ", " photo-grove-decision-dry-run ").replace(
            " photo-grove-group-decision ", " photo-grove-group-decision-dry-run "
        )
        if live
        else "",
    }


def candidate_row(candidate: dict[str, Any], index: int) -> dict[str, Any]:
    photo_id = str(candidate.get("id") or candidate.get("photoId") or "")
    filename = str(candidate.get("filename") or photo_id or f"candidate-{index}")
    mark_keep = command_pair(candidate, "markKeep")
    mark_favorite = command_pair(candidate, "markFavorite")
    route_group = command_pair(candidate, "routeGroupReview")
    return {
        "rank": candidate.get("rank") or index,
        "photoId": photo_id,
        "filename": filename,
        "groupId": candidate.get("groupId") or candidate.get("reviewGroupId") or "",
        "groupPosition": candidate.get("groupPosition") or candidate.get("reviewGroupPosition") or "",
        "groupSize": candidate.get("groupSize") or candidate.get("reviewGroupSize") or "",
        "sourcePath": candidate.get("sourcePath") or "",
        "thumbnailPath": candidate.get("thumbnailPath") or "",
        "thumbnailUri": candidate.get("thumbnailUri") or "",
        "reviewStatus": candidate.get("reviewStatus") or candidate.get("status") or "pending",
        "qualityFlags": candidate.get("qualityFlags") or candidate.get("flags") or [],
        "reasons": candidate.get("reasons") or [],
        "reviewPrompt": candidate.get("reviewPrompt") or "Inspect source/thumbnail evidence before making any metadata decision.",
        "markKeepDryRun": mark_keep["dryRunCommand"],
        "markKeepCommand": mark_keep["liveMetadataCommand"],
        "markFavoriteDryRun": mark_favorite["dryRunCommand"],
        "markFavoriteCommand": mark_favorite["liveMetadataCommand"],
        "routeGroupReviewDryRun": route_group["dryRunCommand"],
        "routeGroupReviewCommand": route_group["liveMetadataCommand"],
        "revealSourceCommand": (candidate.get("safeLocalCommands") or {}).get("revealSource", "") if isinstance(candidate.get("safeLocalCommands"), dict) else "",
        "truth": candidate.get("truth") or "Candidate only. Not a keep/reject verdict.",
    }


def group_row(row: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "rank": index,
        "groupId": row.get("groupId") or "",
        "firstFilename": row.get("firstFilename") or "",
        "size": row.get("size") or 0,
        "pending": row.get("pending") or 0,
        "review": row.get("review") or 0,
        "keep": row.get("keep") or 0,
        "favorite": row.get("favorite") or 0,
        "reject": row.get("reject") or 0,
        "topFlags": row.get("topFlags") or [],
        "nextSafestAction": row.get("nextSafestAction") or "Open source evidence, compare the group, then record metadata only.",
        "truth": row.get("truth") or "Group summary only. No original photo is changed.",
    }


def comparison_sample(sample: dict[str, Any], index: int) -> dict[str, Any]:
    thumb_path = str(sample.get("thumbnailPath") or "")
    return {
        "rank": index,
        "photoId": sample.get("id") or "",
        "filename": sample.get("filename") or "",
        "score": sample.get("score") or "",
        "sourcePath": sample.get("sourcePath") or "",
        "sourceRelativePath": sample.get("sourceRelativePath") or "",
        "thumbnailPath": thumb_path,
        "thumbnailUri": file_uri(thumb_path),
        "qualityFlags": sample.get("qualityFlags") or [],
        "revealSourceCommand": sample.get("revealSourceCommand") or "",
    }


def comparison_row(group: dict[str, Any], index: int) -> dict[str, Any]:
    samples = group.get("samples") if isinstance(group.get("samples"), list) else []
    commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
    return {
        "rank": index,
        "groupId": group.get("groupId") or "",
        "priority": group.get("priority") or "",
        "recommendedReviewMode": group.get("recommendedReviewMode") or "",
        "flaggedCount": group.get("flaggedCount") or 0,
        "qualityFlags": group.get("qualityFlags") or [],
        "samples": [comparison_sample(sample, idx + 1) for idx, sample in enumerate(samples[:8])],
        "nextSafestAction": group.get("nextSafestAction") or "Compare thumbnails/source files before recording metadata-only review intent.",
        "commands": {
            "routeGroupReview": commands.get("routeGroupReview") or "",
            "keepGroup4": commands.get("keepGroup4") or "",
            "rejectGroup": commands.get("rejectGroup") or "",
        },
        "truth": "Comparison row only. It reads thumbnail/source evidence and does not decide, copy, export, delete, or mutate originals.",
    }


def first_six_review_rows(candidate_rows: list[dict[str, Any]], comparison_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    comparison_by_group = {
        str(row.get("groupId") or ""): row
        for row in comparison_rows
        if row.get("groupId")
    }
    rows: list[dict[str, Any]] = []
    for idx, candidate in enumerate(candidate_rows[:6], start=1):
        group_id = str(candidate.get("groupId") or "")
        comparison = comparison_by_group.get(group_id, {})
        rows.append({
            "position": idx,
            "photoId": candidate.get("photoId") or "",
            "filename": candidate.get("filename") or "",
            "groupId": group_id,
            "thumbnailUri": candidate.get("thumbnailUri") or "",
            "sourcePath": candidate.get("sourcePath") or "",
            "reviewQuestion": "Is this better than the surrounding frames for expression, sharpness, composition, and story value?",
            "compareAgainst": [
                sample.get("filename")
                for sample in (comparison.get("samples") or [])[:6]
                if sample.get("filename") and sample.get("filename") != candidate.get("filename")
            ],
            "recommendedFirstMove": "Open contact sheet, inspect this source if uncertain, then dry-run keep/favorite/review/reject.",
            "dryRunKeep": candidate.get("markKeepDryRun") or "",
            "dryRunFavorite": candidate.get("markFavoriteDryRun") or "",
            "dryRunReview": candidate.get("routeGroupReviewDryRun") or "",
            "revealSource": candidate.get("revealSourceCommand") or "",
            "truth": "First-six guide only. It makes a small review loop visible but does not choose or write metadata.",
        })
    return rows


def build_comparison_rows(photo_root: Path, candidate_rows: list[dict[str, Any]], limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    review_batch_pointer = pointer(photo_root, "latest-photo-grove-review-batch.json")
    review_batch = packet_from_pointer(review_batch_pointer)
    groups = review_batch.get("groups") if isinstance(review_batch.get("groups"), list) else []
    candidate_group_ids = [str(row.get("groupId") or "") for row in candidate_rows if row.get("groupId")]
    candidate_group_set = set(candidate_group_ids)
    prioritized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group_id in candidate_group_ids:
        for group in groups:
            if str(group.get("groupId") or "") == group_id and group_id not in seen:
                prioritized.append(group)
                seen.add(group_id)
                break
    for group in groups:
        group_id = str(group.get("groupId") or "")
        if group_id and group_id not in seen:
            prioritized.append(group)
            seen.add(group_id)
        if len(prioritized) >= limit:
            break
    rows = [comparison_row(group, idx + 1) for idx, group in enumerate(prioritized[:limit])]
    return rows, review_batch_pointer


def build_packet(photo_root: Path, limit: int) -> dict[str, Any]:
    first_keepers_pointer = pointer(photo_root, "latest-photo-grove-first-keepers.json")
    cull_pointer = pointer(photo_root, "latest-photo-grove-cull-suggestions.json")
    decision_pointer = pointer(photo_root, "latest-photo-grove-decision-desk.json")
    client_pointer = pointer(photo_root, "latest-photo-grove-client-proof-packet.json")
    proof_pointer = pointer(photo_root, "latest-photo-grove-proof-desk.json")
    contact_pointer = pointer(photo_root, "latest-photo-grove-contact-sheet.json")

    first_keepers = packet_from_pointer(first_keepers_pointer)
    decision_desk = packet_from_pointer(decision_pointer)

    candidates = first_keepers.get("candidates") if isinstance(first_keepers.get("candidates"), list) else []
    candidate_rows = [candidate_row(candidate, idx + 1) for idx, candidate in enumerate(candidates[:limit])]
    comparison_rows, review_batch_pointer = build_comparison_rows(photo_root, candidate_rows, max(4, min(limit, 12)))
    first_six_rows = first_six_review_rows(candidate_rows, comparison_rows)

    decision_groups = decision_desk.get("groupRows") if isinstance(decision_desk.get("groupRows"), list) else []
    group_rows = [group_row(row, idx + 1) for idx, row in enumerate(decision_groups[: max(4, min(limit, 12))])]

    first_counts = first_keepers_pointer.get("counts") if isinstance(first_keepers_pointer.get("counts"), dict) else {}
    decision_counts = decision_pointer.get("counts") if isinstance(decision_pointer.get("counts"), dict) else {}
    client_counts = client_pointer.get("counts") if isinstance(client_pointer.get("counts"), dict) else {}
    contact_counts = contact_pointer.get("counts") if isinstance(contact_pointer.get("counts"), dict) else {}
    contact_html = str(contact_pointer.get("htmlPath") or "")
    contact_json = str(contact_pointer.get("jsonPath") or "")
    contact_first_action = {
        "label": "Open Photo Grove contact sheet" if contact_html else "Build Photo Grove contact sheet",
        "command": f"open {shell_quote(contact_html)}" if contact_html else "./script/agentctl.sh photo-grove-contact-sheet 12",
        "path": contact_html,
        "safety": "Starts with visual grouped comparison only. No originals, metadata decisions, exports, delivery, upload, publication, delete, or overwrite occurs.",
    }

    counts = {
        "sprintCandidateRows": len(candidate_rows),
        "firstSixRows": len(first_six_rows),
        "firstSixDryRunCommands": len(first_six_rows) * 3,
        "comparisonGroups": len(comparison_rows),
        "comparisonSamples": sum(len(row.get("samples") or []) for row in comparison_rows),
        "contactSheetGroups": as_int(contact_counts.get("contactSheetGroups")),
        "contactSheetSamples": as_int(contact_counts.get("contactSheetSamples")),
        "sprintGroupRows": len(group_rows),
        "sourcePhotos": as_int(first_counts.get("sourcePhotos") or decision_counts.get("total") or client_counts.get("total")),
        "pending": as_int(decision_counts.get("pending") or first_counts.get("pending") or client_counts.get("pending")),
        "review": as_int(decision_counts.get("review") or client_counts.get("review")),
        "selectedForClientProof": as_int(decision_counts.get("selectedForClientProof") or client_counts.get("selected")),
        "keep": as_int(decision_counts.get("keep") or client_counts.get("keep")),
        "favorite": as_int(decision_counts.get("favorite") or client_counts.get("favorite")),
        "reject": as_int(decision_counts.get("reject") or client_counts.get("reject")),
        "externalPublishing": False,
        "clientDeliveryCreated": False,
        "metadataChanged": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }
    review_output_plan = {
        "currentStage": "culling-sprint",
        "stageTruth": "This sprint chooses attention and metadata intent. It is not a client proof, delivery, export, upload, or publication event.",
        "primaryVisualSurface": contact_first_action,
        "readyForClientProof": counts["selectedForClientProof"] > 0 and counts["pending"] == 0,
        "proofPrepBlockedBy": [
            "Pending photos still need cull decisions.",
            "Selected proof count is zero." if counts["selectedForClientProof"] == 0 else "",
            "A human should approve the proof packet before any client-facing delivery is created.",
        ],
        "safeOutputs": [
            {
                "label": "Visual contact sheet",
                "means": "Compare grouped frames side-by-side before making metadata decisions from isolated thumbnails.",
                "mutates": "nothing",
            },
            {
                "label": "Dry-run metadata decisions",
                "means": "Preview keep/favorite/review/reject routing commands before writing sidecar metadata.",
                "mutates": "nothing",
            },
            {
                "label": "Sidecar review metadata",
                "means": "Record intentional cull decisions in Quipsly metadata ledgers after review.",
                "mutates": "Quipsly metadata only; original photos remain untouched",
            },
            {
                "label": "Client proof prep packet",
                "means": "Build a local proof-prep artifact only after enough keep/favorite selections exist.",
                "mutates": "no originals; creates local packet files",
            },
        ],
        "doNotDo": [
            "Do not deliver a client gallery from this sprint.",
            "Do not copy, edit, rename, delete, or move source photos.",
            "Do not treat quality hints as final decisions without visual review.",
            "Do not use one thumbnail in isolation when a nearby sequence comparison is available.",
        ],
        "nextIfReady": "Open the client proof packet and prepare a human approval checklist.",
        "nextIfBlocked": "Keep culling comparison groups until selected proof photos exist and pending review is materially reduced.",
    }
    review_output_plan["proofPrepBlockedBy"] = [item for item in review_output_plan["proofPrepBlockedBy"] if item]
    review_rhythm = [
        {
            "shortcut": "1",
            "label": "Keep",
            "meaning": "This frame belongs in the proof candidate set after source-aware review.",
            "writes": "metadata sidecar only when a live command is explicitly executed",
        },
        {
            "shortcut": "2",
            "label": "Favorite",
            "meaning": "This is a hero/standout candidate worth surfacing first.",
            "writes": "metadata sidecar only when a live command is explicitly executed",
        },
        {
            "shortcut": "3",
            "label": "Review hold",
            "meaning": "The frame or group needs human/source comparison instead of a rushed reject.",
            "writes": "metadata sidecar only when a live command is explicitly executed",
        },
        {
            "shortcut": "4",
            "label": "Reject metadata",
            "meaning": "Only after visual comparison confirms it should leave the candidate path.",
            "writes": "metadata sidecar only when a live command is explicitly executed",
        },
        {
            "shortcut": "Space",
            "label": "Next image",
            "meaning": "Move attention forward without deciding when uncertain.",
            "writes": "nothing",
        },
        {
            "shortcut": "R",
            "label": "Reveal source",
            "meaning": "Open Finder at the preserved original when thumbnail evidence is not enough.",
            "writes": "nothing",
        },
    ]
    first_six_review_loop = {
        "name": "First-six culling loop",
        "goal": "Make six calm comparative decisions before touching the full backlog.",
        "whyItExists": "Photo culling gets scary when the tool shows every pending image at once. This loop creates a small, finishable review rep that can become a native keyboard workflow.",
        "keyboardRhythm": "Open the first card, compare nearby frames, then choose 1 Keep, 2 Favorite, 3 Review hold, 4 Reject metadata, Space Next, or R Reveal source.",
        "doneWhen": "All six rows have either a trusted dry-run action ready for live sidecar metadata or an explicit review-hold reason.",
        "doNotDo": [
            "Do not treat the six rows as final client proof selections.",
            "Do not mutate originals.",
            "Do not run live metadata writes until the dry-run command and visual comparison both make sense.",
        ],
        "agentUse": "Agents should report the six filenames, the recommended first move, and any ambiguity before proposing live sidecar writes.",
        "truth": "This is a review loop and intent packet only. It creates no client gallery, mutates no originals, and publishes nothing.",
    }

    packet = {
        "schema": "quipsly.photo-grove.culling-sprint-companion.v1",
        "status": "photo-grove-culling-sprint-ready",
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "counts": counts,
        "humanAsk": (
            "Run one focused culling sprint: start with the contact sheet when available, inspect the first-keeper candidates at review size, "
            "compare nearby group frames, then record only the metadata-sidecar decisions you genuinely trust."
        ),
        "nextSafestAction": "Open this culling sprint companion first, then use its contact sheet and comparison rows before any live keep/favorite decision.",
        "firstSafeAction": {
            **contact_first_action,
        },
        "sprintPlan": [
            "Start with the first 6-12 keeper candidates, not the full 160-photo backlog.",
            "Use source reveal when a thumbnail is ambiguous; thumbnail hints are routing evidence, not truth.",
            "Use the contact sheet as the first visual comparison surface before isolated cull cards.",
            "Compare each candidate beside nearby sequence frames before deciding keep/favorite/review.",
            "Run dry-run commands first if an agent is operating; live metadata commands are still sidecar-only.",
            "Stop before client delivery. This sprint produces clearer review metadata, not a proof gallery promise.",
        ],
        "reviewRhythm": review_rhythm,
        "firstSixReviewLoop": first_six_review_loop,
        "firstSixReviewRows": first_six_rows,
        "candidateRows": candidate_rows,
        "comparisonRows": comparison_rows,
        "groupRows": group_rows,
        "reviewOutputPlan": review_output_plan,
        "sourcePointers": {
            "firstKeepersHtml": first_keepers_pointer.get("htmlPath") or "",
            "firstKeepersJson": first_keepers_pointer.get("jsonPath") or "",
            "cullSuggestionsHtml": cull_pointer.get("htmlPath") or "",
            "cullSuggestionsJson": cull_pointer.get("jsonPath") or "",
            "reviewBatchHtml": review_batch_pointer.get("htmlPath") or "",
            "reviewBatchJson": review_batch_pointer.get("jsonPath") or "",
            "contactSheetHtml": contact_html,
            "contactSheetJson": contact_json,
            "decisionDeskHtml": decision_pointer.get("htmlPath") or "",
            "decisionDeskJson": decision_pointer.get("jsonPath") or "",
            "clientProofHtml": client_pointer.get("htmlPath") or "",
            "clientProofJson": client_pointer.get("jsonPath") or "",
            "proofDeskHtml": proof_pointer.get("htmlPath") or "",
            "proofDeskJson": proof_pointer.get("jsonPath") or "",
        },
        "agentSafeParallelWork": (
            "Prepare comparison notes, check source paths, create or improve contact sheets, or improve packets. "
            "Do not execute live metadata decisions unless explicitly instructed."
        ),
        "truth": (
            "Culling sprint companion only. It reads current Photo Grove evidence and suggested metadata commands; "
            "it does not execute commands, change metadata, mutate originals, copy deliverables, upload, publish, schedule, or create client-delivery truth."
        ),
    }
    return packet


def render_candidate(row: dict[str, Any]) -> str:
    thumb = str(row.get("thumbnailUri") or "")
    image = f"<img src='{esc(thumb)}' alt='{esc(row.get('filename'))}'>" if thumb else "<div class='empty'>No thumbnail</div>"
    reasons = "".join(f"<li>{esc(reason)}</li>" for reason in row.get("reasons") or [])
    flags = ", ".join(str(flag) for flag in row.get("qualityFlags") or []) or "none"
    return f"""
    <article class="card candidate">
      <div class="rank">#{esc(row.get('rank'))}</div>
      {image}
      <h3>{esc(row.get('filename'))}</h3>
      <p class="muted">Group {esc(row.get('groupId'))} / position {esc(row.get('groupPosition'))} of {esc(row.get('groupSize'))}</p>
      <p><strong>Quality flags:</strong> {esc(flags)}</p>
      <p>{esc(row.get('reviewPrompt'))}</p>
      <ul>{reasons}</ul>
      <details><summary>Commands</summary><pre>{esc(json.dumps({
        "revealSource": row.get("revealSourceCommand"),
        "markKeepDryRun": row.get("markKeepDryRun"),
        "markKeepCommand": row.get("markKeepCommand"),
        "markFavoriteDryRun": row.get("markFavoriteDryRun"),
        "markFavoriteCommand": row.get("markFavoriteCommand"),
        "routeGroupReviewDryRun": row.get("routeGroupReviewDryRun"),
        "routeGroupReviewCommand": row.get("routeGroupReviewCommand"),
      }, indent=2))}</pre></details>
      <p class="truth">{esc(row.get('truth'))}</p>
    </article>
    """


def render_group(row: dict[str, Any]) -> str:
    flags = ", ".join(str(flag) for flag in row.get("topFlags") or []) or "none"
    return f"""
    <article class="card group">
      <h3>{esc(row.get('groupId'))}</h3>
      <p class="muted">Starts at {esc(row.get('firstFilename'))}; {esc(row.get('size'))} photo(s)</p>
      <p>pending {esc(row.get('pending'))} / review {esc(row.get('review'))} / keep {esc(row.get('keep'))} / favorite {esc(row.get('favorite'))} / reject {esc(row.get('reject'))}</p>
      <p><strong>Flags:</strong> {esc(flags)}</p>
      <p>{esc(row.get('nextSafestAction'))}</p>
      <p class="truth">{esc(row.get('truth'))}</p>
    </article>
    """


def render_comparison(row: dict[str, Any]) -> str:
    flags = ", ".join(str(flag) for flag in row.get("qualityFlags") or []) or "none"
    sample_html = ""
    for sample in row.get("samples") or []:
        thumb = str(sample.get("thumbnailUri") or "")
        image = f"<img src='{esc(thumb)}' alt='{esc(sample.get('filename'))}'>" if thumb else "<div class='empty'>No thumbnail</div>"
        sample_flags = ", ".join(str(flag) for flag in sample.get("qualityFlags") or []) or "none"
        sample_html += f"""
        <article class="sample">
          {image}
          <h4>{esc(sample.get('filename'))}</h4>
          <p class="muted">score {esc(sample.get('score'))} · {esc(sample_flags)}</p>
          <details><summary>Reveal source</summary><pre>{esc(sample.get('revealSourceCommand'))}</pre></details>
        </article>
        """
    return f"""
    <article class="card comparison">
      <h3>{esc(row.get('groupId'))}</h3>
      <p class="muted">{esc(row.get('priority'))} · {esc(row.get('recommendedReviewMode'))} · {esc(row.get('flaggedCount'))} flagged</p>
      <p><strong>Flags:</strong> {esc(flags)}</p>
      <p>{esc(row.get('nextSafestAction'))}</p>
      <div class="sample-strip">{sample_html or '<p>No comparison samples available.</p>'}</div>
      <details><summary>Group commands</summary><pre>{esc(json.dumps(row.get('commands') or {}, indent=2))}</pre></details>
      <p class="truth">{esc(row.get('truth'))}</p>
    </article>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") or {}
    first_six_loop = packet.get("firstSixReviewLoop") if isinstance(packet.get("firstSixReviewLoop"), dict) else {}
    candidate_html = "".join(render_candidate(row) for row in packet.get("candidateRows") or [])
    comparison_html = "".join(render_comparison(row) for row in packet.get("comparisonRows") or [])
    group_html = "".join(render_group(row) for row in packet.get("groupRows") or [])
    sprint_steps = "".join(f"<li>{esc(step)}</li>" for step in packet.get("sprintPlan") or [])
    rhythm_html = "".join(
        f"<article class='mini'><h3>{esc(row.get('shortcut'))} · {esc(row.get('label'))}</h3><p>{esc(row.get('meaning'))}</p><p class='truth'>Writes: {esc(row.get('writes'))}</p></article>"
        for row in packet.get("reviewRhythm") or []
    )
    first_six_html = ""
    for row in packet.get("firstSixReviewRows") or []:
        thumb = str(row.get("thumbnailUri") or "")
        image = f"<img src='{esc(thumb)}' alt='{esc(row.get('filename'))}'>" if thumb else "<div class='empty'>No thumbnail</div>"
        compare = ", ".join(str(item) for item in row.get("compareAgainst") or []) or "open group comparison"
        first_six_html += f"""
        <article class="card candidate loop-card">
          <div class="rank">#{esc(row.get('position'))}</div>
          {image}
          <h3>{esc(row.get('filename'))}</h3>
          <p class="muted">Group {esc(row.get('groupId'))}</p>
          <p class="question">{esc(row.get('reviewQuestion'))}</p>
          <p><strong>Recommended first move:</strong> {esc(row.get('recommendedFirstMove'))}</p>
          <p><strong>Compare against:</strong> {esc(compare)}</p>
          <div class="command-grid">
            <code class="command-chip">1 keep dry-run</code>
            <code class="command-chip">2 favorite dry-run</code>
            <code class="command-chip">3 review dry-run</code>
            <code class="command-chip">R reveal source</code>
          </div>
          <details><summary>First commands</summary><pre>{esc(json.dumps({
            "revealSource": row.get("revealSource"),
            "dryRunKeep": row.get("dryRunKeep"),
            "dryRunFavorite": row.get("dryRunFavorite"),
            "dryRunReview": row.get("dryRunReview"),
          }, indent=2))}</pre></details>
          <p class="truth">{esc(row.get('truth'))}</p>
        </article>
        """
    output_plan = packet.get("reviewOutputPlan") if isinstance(packet.get("reviewOutputPlan"), dict) else {}
    blocked_by = "".join(f"<li>{esc(item)}</li>" for item in output_plan.get("proofPrepBlockedBy") or [])
    safe_outputs = "".join(
        f"<article class='mini'><h3>{esc(row.get('label'))}</h3><p>{esc(row.get('means'))}</p><p class='truth'>Mutates: {esc(row.get('mutates'))}</p></article>"
        for row in output_plan.get("safeOutputs") or []
    )
    do_not = "".join(f"<li>{esc(item)}</li>" for item in output_plan.get("doNotDo") or [])
    workspace_path = str(packet.get("firstSixWorkspacePath") or "")
    workspace_link = (
        f"<a class='workspace-link' href='{esc(file_uri(workspace_path))}'>Open first-six cull workspace</a>"
        if workspace_path
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove culling sprint</title>
  <style>
    :root {{
      --bg:#101914; --panel:#17241d; --card:#1e2f25; --ink:#f8f1df; --muted:#b6c5b8;
      --leaf:#76d672; --gold:#e8c75d; --water:#76d5d6; --clay:#d97957; --line:#355143;
    }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background:radial-gradient(circle at top left, #254632, var(--bg) 42rem); color:var(--ink); }}
    main {{ max-width:1280px; margin:0 auto; padding:32px; }}
    header, section {{ background:rgba(23,36,29,.88); border:1px solid var(--line); border-radius:24px; padding:24px; margin-bottom:20px; box-shadow:0 20px 80px rgba(0,0,0,.28); }}
    h1 {{ margin:.1rem 0 .4rem; font-size:clamp(2rem, 5vw, 4.5rem); line-height:.95; }}
    h2 {{ margin-top:0; }}
    .kicker {{ color:var(--gold); font-weight:900; letter-spacing:.22em; text-transform:uppercase; }}
    .summary {{ color:var(--muted); font-size:1.05rem; max-width:72rem; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin:18px 0; }}
    .metric {{ background:rgba(255,255,255,.06); border:1px solid var(--line); border-radius:16px; padding:12px; }}
    .metric strong {{ display:block; color:var(--leaf); font-size:1.5rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; }}
    .hero-loop {{ display:grid; grid-template-columns:minmax(0, .9fr) minmax(0, 1.4fr); gap:18px; align-items:start; }}
    .mini-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; }}
    .mini {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:16px; padding:12px; }}
    .comparison-grid {{ display:grid; grid-template-columns:1fr; gap:14px; }}
    .card {{ background:var(--card); border:1px solid var(--line); border-radius:18px; padding:14px; position:relative; overflow:hidden; }}
    .loop-card {{ border-color:rgba(232,199,93,.48); background:linear-gradient(180deg, rgba(232,199,93,.08), rgba(30,47,37,.94)); }}
    .card img {{ width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:14px; border:1px solid var(--line); background:#0a0d0b; }}
    .question {{ font-size:1.02rem; color:#fff8d8; }}
    .command-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px; margin:10px 0; }}
    .command-chip {{ display:block; white-space:normal; background:rgba(118,214,114,.12); border:1px solid rgba(118,214,114,.32); border-radius:999px; padding:7px 9px; color:var(--leaf); font-weight:800; }}
    .workspace-link {{ display:inline-block; background:var(--leaf); color:#08110d; text-decoration:none; border-radius:999px; padding:10px 14px; font-weight:900; margin:8px 0 14px; }}
    .sample-strip {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:12px; }}
    .sample {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:14px; padding:10px; }}
    .sample h4 {{ margin:.55rem 0 .2rem; font-size:.9rem; }}
    .sample p {{ font-size:.8rem; }}
    .rank {{ position:absolute; top:20px; left:20px; background:rgba(0,0,0,.64); color:var(--gold); border-radius:999px; padding:5px 10px; font-weight:900; }}
    .muted {{ color:var(--muted); }}
    .truth {{ color:var(--water); font-size:.9rem; }}
    .danger {{ color:var(--clay); }}
    .empty {{ aspect-ratio:4/3; display:grid; place-items:center; background:#0d120f; border-radius:14px; color:var(--muted); }}
    pre {{ white-space:pre-wrap; background:#0b110e; padding:12px; border-radius:12px; overflow:auto; }}
    a {{ color:var(--water); }}
    @media (max-width: 850px) {{ .hero-loop {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <div class="kicker">Photo Grove sprint companion</div>
    <h1>One calm culling sprint.</h1>
    <p class="summary">{esc(packet.get('humanAsk'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(counts.get('sprintCandidateRows'))}</strong> sprint candidates</div>
      <div class="metric"><strong>{esc(counts.get('firstSixRows'))}</strong> first-six loop</div>
      <div class="metric"><strong>{esc(counts.get('comparisonGroups'))}</strong> comparison groups</div>
      <div class="metric"><strong>{esc(counts.get('sprintGroupRows'))}</strong> groups</div>
      <div class="metric"><strong>{esc(counts.get('pending'))}</strong> pending</div>
      <div class="metric"><strong>{esc(counts.get('selectedForClientProof'))}</strong> selected</div>
      <div class="metric"><strong>{esc(counts.get('originalsMutated'))}</strong> originals mutated</div>
    </div>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <ol>{sprint_steps}</ol>
    <p class="danger">This is not a client delivery packet. It is a decision aid.</p>
  </header>
  <section>
    <h2>First six: small enough to start</h2>
    <div class="hero-loop">
      <div>
        <p class="summary">{esc(first_six_loop.get('goal'))}</p>
        <p>{esc(first_six_loop.get('whyItExists'))}</p>
        <p><strong>Rhythm:</strong> {esc(first_six_loop.get('keyboardRhythm'))}</p>
        <p><strong>Done when:</strong> {esc(first_six_loop.get('doneWhen'))}</p>
        {workspace_link}
        <p class="truth">{esc(first_six_loop.get('truth'))}</p>
      </div>
      <div class="grid">{first_six_html or '<p>No first-six rows were available.</p>'}</div>
    </div>
  </section>
  <section>
    <h2>What this sprint can produce</h2>
    <p class="summary">{esc(output_plan.get('stageTruth'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(output_plan.get('readyForClientProof'))}</strong> ready for client proof</div>
      <div class="metric"><strong>{esc(counts.get('selectedForClientProof'))}</strong> selected</div>
      <div class="metric"><strong>{esc(counts.get('pending'))}</strong> pending</div>
      <div class="metric"><strong>{esc(counts.get('metadataChanged'))}</strong> metadata changed here</div>
    </div>
    <div class="mini-grid">{safe_outputs}</div>
    <h3>If blocked</h3>
    <ul>{blocked_by}</ul>
    <h3>Do not do</h3>
    <ul>{do_not}</ul>
  </section>
  <section>
    <h2>Review rhythm</h2>
    <p class="summary">The future native app should make this feel like keyboard culling, not paperwork. Today these shortcuts describe the intended motion while commands stay explicit and sidecar-only.</p>
    <div class="mini-grid">{rhythm_html}</div>
  </section>
  <section>
    <h2>Compare before deciding</h2>
    <p class="summary">Culling is comparative. These rows put each suggested direction beside nearby sequence frames so keep/review/favorite decisions are based on context, not one lonely thumbnail.</p>
    <div class="comparison-grid">{comparison_html or '<p>No comparison rows were available.</p>'}</div>
  </section>
  <section>
    <h2>First candidates</h2>
    <div class="grid">{candidate_html or '<p>No candidate rows were available.</p>'}</div>
  </section>
  <section>
    <h2>Group map</h2>
    <div class="grid">{group_html or '<p>No group rows were available.</p>'}</div>
  </section>
  <section>
    <h2>Source pointers</h2>
    <pre>{esc(json.dumps(packet.get('sourcePointers') or {{}}, indent=2))}</pre>
  </section>
  <section>
    <h2>Safety truth</h2>
    <p>{esc(packet.get('truth'))}</p>
  </section>
</main>
</body>
</html>
"""


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Photo Grove culling sprint companion",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Current truth",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Candidate rows: `{counts.get('sprintCandidateRows')}`",
        f"- First-six review rows: `{counts.get('firstSixRows')}`",
        f"- First-six dry-run commands: `{counts.get('firstSixDryRunCommands')}`",
        f"- Comparison groups: `{counts.get('comparisonGroups')}`",
        f"- Comparison samples: `{counts.get('comparisonSamples')}`",
        f"- Group rows: `{counts.get('sprintGroupRows')}`",
        f"- Pending: `{counts.get('pending')}`",
        f"- Selected for client proof: `{counts.get('selectedForClientProof')}`",
        f"- First-six workspace: `{packet.get('firstSixWorkspacePath') or ''}`",
        f"- Originals mutated: `{counts.get('originalsMutated')}`",
        f"- Metadata changed by this packet: `{counts.get('metadataChanged')}`",
        "",
        "## What this sprint can produce",
        "",
        (packet.get("reviewOutputPlan") or {}).get("stageTruth") or "",
        "",
        f"- Ready for client proof: `{(packet.get('reviewOutputPlan') or {}).get('readyForClientProof')}`",
        f"- Next if ready: {(packet.get('reviewOutputPlan') or {}).get('nextIfReady')}",
        f"- Next if blocked: {(packet.get('reviewOutputPlan') or {}).get('nextIfBlocked')}",
        "",
        "### Safe outputs",
        "",
    ]
    for output in (packet.get("reviewOutputPlan") or {}).get("safeOutputs") or []:
        lines.extend([
            f"- **{output.get('label')}**: {output.get('means')} Mutates: `{output.get('mutates')}`",
        ])
    first_six_loop = packet.get("firstSixReviewLoop") or {}
    lines.extend([
        "",
        "## First-six culling loop",
        "",
        first_six_loop.get("goal") or "",
        "",
        f"- Why it exists: {first_six_loop.get('whyItExists')}",
        f"- Keyboard rhythm: {first_six_loop.get('keyboardRhythm')}",
        f"- Done when: {first_six_loop.get('doneWhen')}",
        f"- Agent use: {first_six_loop.get('agentUse')}",
        f"- Truth: {first_six_loop.get('truth')}",
        "",
        "### Do not do",
        "",
    ])
    for warning in first_six_loop.get("doNotDo") or []:
        lines.append(f"- {warning}")
    lines.extend([
        "",
        "### Proof prep blockers",
        "",
    ])
    for blocker in (packet.get("reviewOutputPlan") or {}).get("proofPrepBlockedBy") or []:
        lines.append(f"- {blocker}")
    lines.extend([
        "",
        "### Do not do",
        "",
    ])
    for warning in (packet.get("reviewOutputPlan") or {}).get("doNotDo") or []:
        lines.append(f"- {warning}")
    lines.extend([
        "",
        "## Sprint plan",
        "",
    ])
    lines.extend(f"{idx}. {step}" for idx, step in enumerate(packet.get("sprintPlan") or [], start=1))
    lines.extend([
        "",
        "## Review rhythm",
        "",
    ])
    for row in packet.get("reviewRhythm") or []:
        lines.append(f"- `{row.get('shortcut')}` **{row.get('label')}**: {row.get('meaning')} Writes: `{row.get('writes')}`")
    lines.extend([
        "",
        "## First six review loop",
        "",
    ])
    for row in packet.get("firstSixReviewRows") or []:
        lines.extend([
            f"### {row.get('position')}. {row.get('filename')}",
            "",
            f"- Group: `{row.get('groupId')}`",
            f"- Review question: {row.get('reviewQuestion')}",
            f"- Recommended first move: {row.get('recommendedFirstMove')}",
            f"- Compare against: {', '.join(row.get('compareAgainst') or []) or 'open group comparison'}",
            f"- Reveal source: `{row.get('revealSource')}`",
            f"- Dry-run keep: `{row.get('dryRunKeep')}`",
            f"- Dry-run favorite: `{row.get('dryRunFavorite')}`",
            f"- Dry-run review: `{row.get('dryRunReview')}`",
            "",
        ])
    lines.extend([
        "",
        "## Compare before deciding",
        "",
        "Culling is comparative. Open the HTML companion for visual group rows, then use dry-run commands before any live metadata-sidecar decision.",
        "",
    ])
    for row in packet.get("comparisonRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('groupId')}",
            "",
            f"- Priority: `{row.get('priority')}`",
            f"- Review mode: `{row.get('recommendedReviewMode')}`",
            f"- Samples: `{len(row.get('samples') or [])}`",
            f"- Prompt: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "",
        "## First candidates",
        "",
    ])
    for row in packet.get("candidateRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('filename')}",
            "",
            f"- Group: `{row.get('groupId')}` position `{row.get('groupPosition')}` of `{row.get('groupSize')}`",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Prompt: {row.get('reviewPrompt')}",
            f"- Reveal source: `{row.get('revealSourceCommand')}`",
            f"- Dry-run keep: `{row.get('markKeepDryRun')}`",
            f"- Live metadata keep: `{row.get('markKeepCommand')}`",
            "",
        ])
    lines.extend([
        "## Safety",
        "",
        packet.get("truth") or "",
        "",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_first_six_workspace(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove first-six cull workspace",
        "",
        "> Sidecar workspace only. This is not a client delivery, export, upload, publication, metadata write, delete, move, rename, or original mutation.",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Photo root: `{packet.get('photoRoot')}`",
        "",
        "## Loop contract",
        "",
    ]
    loop = packet.get("firstSixReviewLoop") if isinstance(packet.get("firstSixReviewLoop"), dict) else {}
    if loop:
        lines.extend([
            f"- Goal: {loop.get('goal')}",
            f"- Rhythm: {loop.get('keyboardRhythm')}",
            f"- Done when: {loop.get('doneWhen')}",
            f"- Truth: {loop.get('truth')}",
            "",
        ])
    lines.extend([
        "## Decisions",
        "",
        "Use dry-run commands first. Only run live metadata commands after a human confirms the visual comparison.",
        "",
    ])
    for row in packet.get("firstSixReviewRows") or []:
        if not isinstance(row, dict):
            continue
        compare = ", ".join(str(item) for item in row.get("compareAgainst") or []) or "open group comparison"
        lines.extend([
            f"### {row.get('position')}. {row.get('filename')}",
            "",
            f"- Group: `{row.get('groupId')}`",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Compare against: {compare}",
            f"- Question: {row.get('reviewQuestion')}",
            f"- Recommended first move: {row.get('recommendedFirstMove')}",
            "",
            "Decision:",
            "",
            "- [ ] Keep",
            "- [ ] Favorite",
            "- [ ] Review hold",
            "- [ ] Reject metadata",
            "- [ ] Skip for now",
            "",
            "Reason:",
            "",
            "- ",
            "",
            "Dry-run commands:",
            "",
            "```bash",
            str(row.get("dryRunKeep") or ""),
            str(row.get("dryRunFavorite") or ""),
            str(row.get("dryRunReview") or ""),
            "```",
            "",
            "Reveal source:",
            "",
            "```bash",
            str(row.get("revealSource") or ""),
            "```",
            "",
        ])
    lines.extend([
        "## Promotion rule",
        "",
        "This workspace can guide live sidecar metadata writes, but it does not write metadata by itself. Originals stay preserved.",
        "",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    rows = packet.get("candidateRows") or []
    fieldnames = [
        "rank",
        "photoId",
        "filename",
        "groupId",
        "groupPosition",
        "groupSize",
        "sourcePath",
        "reviewStatus",
        "markKeepDryRun",
        "markKeepCommand",
        "markFavoriteDryRun",
        "markFavoriteCommand",
        "routeGroupReviewDryRun",
        "routeGroupReviewCommand",
        "revealSourceCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Photo Grove culling sprint companion.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()

    photo_root = Path(args.photo_root)
    packet = build_packet(photo_root, max(1, args.limit))
    out_dir = photo_root / "CullingSprints" / f"{stamp()}-photo-grove-culling-sprint"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "index.html"
    json_path = out_dir / "photo-grove-culling-sprint-companion.json"
    markdown_path = out_dir / "START-HERE-photo-grove-culling-sprint.md"
    csv_path = out_dir / "photo-grove-culling-sprint-candidates.csv"
    workspace_path = out_dir / "first-six-cull-workspace.md"

    packet.update({
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSixWorkspacePath": str(workspace_path),
    })
    packet["counts"]["firstSixWorkspaceRows"] = len(packet.get("firstSixReviewRows") or [])
    packet["firstContactSheetAction"] = packet.get("firstSafeAction") or {}
    packet["firstSafeAction"] = {
        "label": "Open Photo Grove culling sprint companion",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens the local sprint companion only. It does not execute metadata decisions, mutate originals, copy deliverables, upload, publish, schedule, delete, or overwrite.",
    }

    write_json(json_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)
    write_first_six_workspace(workspace_path, packet)
    write_csv(csv_path, packet)

    pointer_payload = {
        "schema": packet["schema"],
        "status": packet["status"],
        "generatedAt": packet["generatedAt"],
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSixWorkspacePath": str(workspace_path),
        "counts": packet["counts"],
        "nextSafestAction": packet["nextSafestAction"],
        "humanAsk": packet["humanAsk"],
        "firstSafeAction": packet["firstSafeAction"],
        "firstContactSheetAction": packet["firstContactSheetAction"],
        "reviewOutputPlan": packet["reviewOutputPlan"],
        "reviewRhythm": packet.get("reviewRhythm", []),
        "firstSixReviewLoop": packet.get("firstSixReviewLoop", {}),
        "firstSixReviewRows": packet.get("firstSixReviewRows", []),
        "candidateRows": packet.get("candidateRows", [])[:12],
        "comparisonRows": packet.get("comparisonRows", [])[:8],
        "groupRows": packet.get("groupRows", [])[:12],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "truth": packet["truth"],
    }
    write_json(photo_root / LATEST_POINTER, pointer_payload)
    for alias in LATEST_ALIAS_POINTERS:
        write_json(photo_root / alias, pointer_payload)
    print(json.dumps(pointer_payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
