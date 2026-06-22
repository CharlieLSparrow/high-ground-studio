#!/usr/bin/env python3
"""Build one operator cockpit for Quipsly shorts production.

This composes the focused shorts boards into a single low-anxiety answer:
what is real, what is promising, what is ready for platforms, and what should
happen next?
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from shorts_board_common import (
    emit_packet_outputs,
    esc,
    html_episode_coverage,
    html_platform_readiness_coverage,
    markdown_episode_coverage,
    markdown_platform_readiness_coverage,
    now_iso,
    write_json,
    write_text,
)
from shorts_growth_quality_board import build_board as build_growth_board
from shorts_improvement_plan import build_plan, severity_rank
from shorts_local_export_board import build_board as build_local_board
from shorts_platform_package_board import package_cards


SHORTS_STRATEGY_BASIS = [
    {
        "source": "Descript Underlord",
        "pattern": "AI assistant suggests edits, creates clips, rewrites for energy, adds captions, and supports feedback loops.",
        "quipslyTranslation": "Make every AI suggestion inspectable as metadata with human review prompts, not a hidden edit.",
    },
    {
        "source": "OpusClip",
        "pattern": "Long-form video is analyzed for highlight moments, rearranged into coherent vertical shorts, polished with captions, relayout, transitions, and a call to action.",
        "quipslyTranslation": "Score candidates by hook, coherence, platform fit, proof state, and explicit next edits instead of only export status.",
    },
    {
        "source": "YouTube Shorts help",
        "pattern": "Square or vertical videos up to three minutes can be Shorts, but over-one-minute Shorts with active Content ID claims are blocked globally.",
        "quipslyTranslation": "Keep duration and claim-risk warnings visible before packaging YouTube Shorts.",
    },
    {
        "source": "Creator-tool market pattern",
        "pattern": "Riverside, CapCut, Captions, Canva, Adobe Express, Instagram, and YouTube tools compete on captions, templates, reframing, quick social export, and low-friction posting.",
        "quipslyTranslation": "Use transparent recipes: proof file, crop, captions, hook, pacing, platform copy, receipt capture.",
    },
]


def top_actions(plan_packet: dict[str, Any], limit: int = 8) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for plan in plan_packet.get("plans") or []:
        action = plan.get("topAction") or {}
        if not action:
            continue
        items.append(
            {
                "shortId": plan.get("id"),
                "title": plan.get("title"),
                "episodeKey": plan.get("episodeKey"),
                "growthScore": plan.get("growthScore"),
                "severity": action.get("severity"),
                "kind": action.get("kind"),
                "label": action.get("label"),
                "why": action.get("why"),
                "humanCheck": action.get("humanCheck"),
                "command": action.get("command"),
            }
        )
    items.sort(key=lambda item: (severity_rank(str(item.get("severity"))), -float(item.get("growthScore") or 0)))
    return items[:limit]


def top_platform_cards(package_packet_cards: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    def score(card: dict[str, Any]) -> tuple[float, int]:
        readiness = card.get("platformReadiness") or {}
        counts = readiness.get("counts") or {}
        ready = int(counts.get("ready") or 0)
        blocked = int(counts.get("blocked") or 0)
        growth = float(card.get("growthScore") or 0)
        return (growth + ready * 3 - blocked * 8, ready)

    cards = sorted(package_packet_cards, key=score, reverse=True)
    return cards[:limit]


def command_for_local_short(card: dict[str, Any]) -> str:
    commands = card.get("commands") or {}
    stage = str(card.get("stage") or "")
    if stage in {"missing-export", "export-path-missing-file"}:
        return commands.get("exportLocal") or commands.get("select") or ""
    if stage == "exported-needs-visual-review":
        return commands.get("contactSheet") or commands.get("select") or ""
    if stage == "exported-needs-listen-through":
        return commands.get("audioSanity") or commands.get("select") or ""
    return commands.get("select") or ""


def execution_queue(next_short: dict[str, Any], actions: list[dict[str, Any]], platform_cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    if next_short:
        queue.append(
            {
                "lane": "local-export-review",
                "severity": "blocker" if next_short.get("stage") in {"missing-export", "export-path-missing-file"} else "high",
                "label": next_short.get("nextAction") or "Open the next short candidate",
                "targetTitle": next_short.get("title"),
                "episodeKey": next_short.get("episodeKey"),
                "why": "Shorts are not production objects until an exported file can be watched and heard.",
                "command": command_for_local_short(next_short),
                "humanCheck": "Open the result locally if this command exports or generates proof.",
                "source": "local-export-board.nextShort",
            }
        )
    for action in actions:
        queue.append(
            {
                "lane": "quality-improvement",
                "severity": action.get("severity"),
                "label": action.get("label"),
                "targetTitle": action.get("title"),
                "episodeKey": action.get("episodeKey"),
                "why": action.get("why"),
                "command": action.get("command"),
                "humanCheck": action.get("humanCheck"),
                "source": "improvement-plan.topActions",
            }
        )
    for card in platform_cards[:3]:
        queue.append(
            {
                "lane": "platform-package",
                "severity": "medium",
                "label": "Review platform package and native copy",
                "targetTitle": card.get("title"),
                "episodeKey": card.get("episodeKey"),
                "why": card.get("platformReadinessSummary") or "Platform readiness needs review.",
                "command": (card.get("commands") or {}).get("select") or "",
                "humanCheck": "Compare YouTube, Reels, Facebook, LinkedIn, Patreon, and HGO copy before posting.",
                "source": "platform-package-board.topPlatformCards",
            }
        )

    ranked = []
    seen: set[str] = set()
    for item in sorted(queue, key=lambda row: (severity_rank(str(row.get("severity"))), str(row.get("lane")), str(row.get("targetTitle")))):
        identity = "|".join([str(item.get("lane")), str(item.get("label")), str(item.get("targetTitle")), str(item.get("command"))])
        if identity in seen:
            continue
        seen.add(identity)
        item["rank"] = len(ranked) + 1
        ranked.append(item)
    return ranked[:12]


def execution_counts(queue: list[dict[str, Any]]) -> dict[str, Any]:
    lanes: dict[str, int] = {}
    severities: dict[str, int] = {}
    command_count = 0
    for item in queue:
        lane = str(item.get("lane") or "unknown")
        severity = str(item.get("severity") or "unknown")
        lanes[lane] = lanes.get(lane, 0) + 1
        severities[severity] = severities.get(severity, 0) + 1
        if str(item.get("command") or "").strip():
            command_count += 1
    return {
        "total": len(queue),
        "commandCount": command_count,
        "lanes": lanes,
        "severities": severities,
    }


def _ready_platforms(card: dict[str, Any]) -> list[str]:
    platforms = ((card.get("platformReadiness") or {}).get("platforms") or {})
    return [
        str(name)
        for name, detail in platforms.items()
        if str((detail or {}).get("status") or "") == "ready"
    ]


def _review_platforms(card: dict[str, Any]) -> list[str]:
    platforms = ((card.get("platformReadiness") or {}).get("platforms") or {})
    return [
        str(name)
        for name, detail in platforms.items()
        if str((detail or {}).get("status") or "") == "needs-review"
    ]


def _blocked_platforms(card: dict[str, Any]) -> list[str]:
    platforms = ((card.get("platformReadiness") or {}).get("platforms") or {})
    return [
        str(name)
        for name, detail in platforms.items()
        if str((detail or {}).get("status") or "") == "blocked"
    ]


def _duration_band(duration: float) -> str:
    if duration <= 0:
        return "unknown"
    if duration <= 20:
        return "quick-punch"
    if duration <= 45:
        return "standard-short"
    if duration <= 90:
        return "deep-short"
    if duration <= 180:
        return "long-short"
    return "too-long"


def creator_quality_brief(card: dict[str, Any]) -> dict[str, Any]:
    title = str(card.get("title") or card.get("id") or "Untitled short")
    duration = float(card.get("durationSeconds") or 0)
    hook = str(card.get("hookText") or "").strip()
    overlay = str(card.get("overlayText") or "").strip()
    exported = bool(card.get("primaryExportExists"))
    ready_platforms = _ready_platforms(card)
    review_platforms = _review_platforms(card)
    blocked_platforms = _blocked_platforms(card)
    growth_score = float(card.get("growthScore") or 0)
    duration_band = _duration_band(duration)

    strengths: list[str] = []
    risks: list[str] = []
    recipe: list[dict[str, str]] = []

    if growth_score >= 70:
        strengths.append("Strong candidate by current Quipsly growth score.")
    elif growth_score >= 50:
        strengths.append("Promising candidate that still needs sharper packaging.")
    else:
        risks.append("Low current growth score; polish only if the idea matters strategically.")

    if exported:
        strengths.append("A local exported file exists, so this can be watched and judged.")
    else:
        risks.append("No local export proof yet; quality claims are provisional.")
        recipe.append(
            {
                "step": "Create local export proof",
                "why": "A short is not production-ready until a real file can be watched and heard.",
                "agentAction": "Run the export/select command from the execution queue, then inspect the file path.",
            }
        )

    if hook:
        strengths.append("Hook text exists.")
    else:
        risks.append("Opening hook is missing; first-second clarity is weak.")
        recipe.append(
            {
                "step": "Write a first-second promise",
                "why": "Short-form feeds punish unclear openings immediately.",
                "agentAction": "Draft 3 hook options that name the tension, payoff, or useful idea without clickbait.",
            }
        )

    if overlay:
        strengths.append("Caption or overlay plan exists.")
    else:
        risks.append("Caption/overlay plan missing; sound-off viewing will be weaker.")
        recipe.append(
            {
                "step": "Add caption-safe overlay plan",
                "why": "Captions and readable text are table stakes for vertical feeds.",
                "agentAction": "Create a concise overlay line and note any face-safe-zone risk.",
            }
        )

    if duration_band in {"quick-punch", "standard-short"}:
        strengths.append(f"Duration band is {duration_band}, which is easy to test in vertical feeds.")
    elif duration_band == "deep-short":
        risks.append("Longer than a quick punch; needs a stronger retention arc.")
    elif duration_band == "long-short":
        risks.append("Long-short territory; use only if payoff and pacing are clearly strong.")
    elif duration_band == "too-long":
        risks.append("Too long for the current shorts target.")
    else:
        risks.append("Duration is unknown.")

    if ready_platforms:
        strengths.append(f"Ready platforms: {', '.join(ready_platforms)}.")
    if review_platforms:
        recipe.append(
            {
                "step": "Review platform-native fit",
                "why": f"Needs review for: {', '.join(review_platforms)}.",
                "agentAction": "Write platform-specific copy and call out whether the clip belongs on each destination.",
            }
        )
    if blocked_platforms:
        risks.append(f"Blocked platforms: {', '.join(blocked_platforms)}.")

    recipe.append(
        {
            "step": "Watch once like a stranger",
            "why": "The real test is whether it makes sense with no episode context.",
            "agentAction": "Summarize the first 3 seconds, payoff, confusing parts, crop risk, and whether the short earns a repost.",
        }
    )
    recipe.append(
        {
            "step": "Package for the best first destination",
            "why": "A good short still needs title/caption/context tailored to where it lands.",
            "agentAction": "Choose the first platform, write native copy, and identify the receipt needed after posting.",
        }
    )

    first_destination = "youtubeShorts"
    if "linkedin" in ready_platforms:
        first_destination = "linkedin"
    elif ready_platforms:
        first_destination = ready_platforms[0]

    return {
        "id": card.get("id") or card.get("shortId") or title,
        "title": title,
        "episodeKey": card.get("episodeKey") or "unknown-episode",
        "growthScore": growth_score,
        "growthTier": card.get("growthTier"),
        "stage": card.get("stage"),
        "durationSeconds": duration,
        "durationBand": duration_band,
        "firstDestination": first_destination,
        "strengths": strengths,
        "risks": risks,
        "recipe": recipe,
        "hookText": hook,
        "overlayText": overlay,
        "platformReadinessSummary": card.get("platformReadinessSummary"),
        "commands": card.get("commands") or {},
        "humanReviewPrompt": "Would I stop scrolling, understand the point without context, and feel rewarded by the ending?",
        "agentReviewPrompt": "Inspect exported proof if present. Improve hook, captions, crop notes, platform copy, and receipt path without publishing.",
    }


def creator_quality_pack(cards: list[dict[str, Any]], limit: int = 10) -> dict[str, Any]:
    ranked = sorted(
        cards,
        key=lambda card: (
            float(card.get("growthScore") or 0),
            len(_ready_platforms(card)),
            1 if card.get("primaryExportExists") else 0,
        ),
        reverse=True,
    )
    briefs = [creator_quality_brief(card) for card in ranked[:limit]]
    episodes: dict[str, int] = {}
    first_destinations: dict[str, int] = {}
    risk_counts: dict[str, int] = {}
    for brief in briefs:
        episode = str(brief.get("episodeKey") or "unknown-episode")
        destination = str(brief.get("firstDestination") or "unknown")
        episodes[episode] = episodes.get(episode, 0) + 1
        first_destinations[destination] = first_destinations.get(destination, 0) + 1
        for risk in brief.get("risks") or []:
            risk_key = str(risk).split(";")[0].split(".")[0][:80]
            risk_counts[risk_key] = risk_counts.get(risk_key, 0) + 1
    return {
        "packetType": "quipsly-shorts-creator-quality-pack",
        "version": "2026-06-22.shorts-creator-quality-pack.v1",
        "truth": "These briefs guide human and agent refinement. They are not publish approvals or performance guarantees.",
        "researchBasis": SHORTS_STRATEGY_BASIS,
        "briefCount": len(briefs),
        "episodeCounts": episodes,
        "firstDestinationCounts": first_destinations,
        "riskCounts": risk_counts,
        "briefs": briefs,
    }


def command_bundle(queue: list[dict[str, Any]]) -> list[str]:
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        "# Quipsly shorts Mission Control command bundle",
        "# Review each command before running. These commands do not publish or approve by themselves.",
        "cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio",
        "",
    ]
    for item in queue:
        command = str(item.get("command") or "").strip()
        if not command:
            continue
        lines.extend(
            [
                f"# {item.get('rank')}. [{item.get('lane')}] {item.get('targetTitle')} ({item.get('episodeKey')})",
                f"# {item.get('label')}",
                command,
                "",
            ]
        )
    return lines


def artifact_manifest(packet: dict[str, Any]) -> dict[str, Any]:
    return {
        "packetType": "quipsly-shorts-mission-control-artifact-manifest",
        "version": "2026-06-22.shorts-mission-control-artifact-manifest.v1",
        "generatedAt": packet.get("generatedAt"),
        "truth": "This manifest lists local proof and handoff artifacts. It is not a publication receipt.",
        "paths": {
            "missionControlJson": packet.get("json"),
            "missionControlHtml": packet.get("html"),
            "missionControlMarkdown": packet.get("markdown"),
            "agentTaskPacketJson": packet.get("agentTaskPacketJson"),
            "commandBundleShell": packet.get("commandBundleShell"),
            "creatorQualityPackJson": packet.get("creatorQualityPackJson"),
            "artifactManifestJson": packet.get("artifactManifestJson"),
        },
        "executionCounts": packet.get("executionCounts"),
        "episodeCoverage": packet.get("episodeCoverage"),
        "platformReadinessCoverage": packet.get("platformReadinessCoverage"),
        "creatorQualitySummary": {
            "briefCount": (packet.get("creatorQualityPack") or {}).get("briefCount"),
            "episodeCounts": (packet.get("creatorQualityPack") or {}).get("episodeCounts"),
            "firstDestinationCounts": (packet.get("creatorQualityPack") or {}).get("firstDestinationCounts"),
        },
        "safeUse": [
            "Open the HTML or Markdown for human context.",
            "Use the agent task packet for structured assistant handoff.",
            "Use the creator quality pack for hook, caption, crop, and platform refinement.",
            "Review command bundle contents before running anything.",
            "Do not treat this manifest as publishing proof.",
        ],
    }


def agent_task_packet(queue: list[dict[str, Any]], episode_work: list[dict[str, Any]], recipe: dict[str, Any]) -> dict[str, Any]:
    tasks: list[dict[str, Any]] = []
    for item in queue:
        rank = int(item.get("rank") or len(tasks) + 1)
        command = str(item.get("command") or "").strip()
        tasks.append(
            {
                "id": f"shorts-agent-task-{rank:02d}",
                "rank": rank,
                "lane": item.get("lane"),
                "severity": item.get("severity"),
                "episodeKey": item.get("episodeKey"),
                "targetTitle": item.get("targetTitle"),
                "objective": item.get("label"),
                "why": item.get("why"),
                "command": command,
                "mayRunCommand": bool(command),
                "preconditions": [
                    "Use only the current QuipslyStudio local state.",
                    "Do not publish, upload, schedule, approve, or mark receipts complete from this task packet.",
                    "If a command exports media, inspect the resulting file before claiming quality progress.",
                ],
                "proofWanted": [
                    "local file path or explicit missing-file reason",
                    "visual/crop/caption observation when relevant",
                    "audio/listen-through observation when relevant",
                    "episodeKey preserved in any follow-up note",
                ],
                "source": item.get("source"),
            }
        )

    return {
        "packetType": "quipsly-shorts-agent-task-packet",
        "version": "2026-06-21.shorts-agent-task-packet.v1",
        "truth": "These are safe operator tasks derived from Mission Control. They do not grant publish, schedule, upload, approve, or receipt authority.",
        "taskCount": len(tasks),
        "episodeCount": len(episode_work),
        "recipeStatus": {
            "queueBackedActionCount": (recipe or {}).get("queueBackedActionCount"),
            "episodeSteps": len((recipe or {}).get("episodeSteps") or []),
        },
        "creatorQualityPackExpected": True,
        "tasks": tasks,
    }


def episode_worklist(local_cards: list[dict[str, Any]], growth_cards: list[dict[str, Any]], queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    episode_keys = sorted(
        {
            str(card.get("episodeKey") or "unknown-episode")
            for card in [*local_cards, *growth_cards]
        }
    )
    worklist: list[dict[str, Any]] = []
    for episode_key in episode_keys:
        local_for_episode = [card for card in local_cards if str(card.get("episodeKey") or "unknown-episode") == episode_key]
        growth_for_episode = [card for card in growth_cards if str(card.get("episodeKey") or "unknown-episode") == episode_key]
        queue_for_episode = [item for item in queue if str(item.get("episodeKey") or "unknown-episode") == episode_key]
        next_local = next((card for card in local_for_episode if card.get("stage") != "rejected-learning-data"), None)
        top_growth = max(growth_for_episode, key=lambda card: float(card.get("growthScore") or 0), default=None)
        top_queue = queue_for_episode[0] if queue_for_episode else None
        blocked_platforms: list[str] = []
        needs_review_platforms: list[str] = []
        for card in growth_for_episode:
            for platform, detail in ((card.get("platformReadiness") or {}).get("platforms") or {}).items():
                status = str(detail.get("status") or "")
                if status == "blocked" and platform not in blocked_platforms:
                    blocked_platforms.append(platform)
                if status == "needs-review" and platform not in needs_review_platforms:
                    needs_review_platforms.append(platform)

        worklist.append(
            {
                "episodeKey": episode_key,
                "shortCount": len(local_for_episode) or len(growth_for_episode),
                "exportedCount": len([card for card in local_for_episode if card.get("primaryExportExists")]),
                "reviewableCount": len(
                    [
                        card
                        for card in local_for_episode
                        if card.get("stage")
                        in {
                            "exported-needs-visual-review",
                            "exported-needs-listen-through",
                            "needs-text-review",
                            "ready-for-local-quality-decision",
                            "ready-for-social-queue",
                        }
                    ]
                ),
                "nextLocalShort": next_local,
                "topGrowthShort": top_growth,
                "topQueueItem": top_queue,
                "blockedPlatforms": blocked_platforms,
                "needsReviewPlatforms": needs_review_platforms,
                "nextAction": (
                    (top_queue or {}).get("label")
                    or (next_local or {}).get("nextAction")
                    or "Create, export, or classify a short candidate for this episode."
                ),
                "command": (
                    (top_queue or {}).get("command")
                    or command_for_local_short(next_local or {})
                    or ((top_growth or {}).get("commands") or {}).get("select")
                    or ""
                ),
            }
        )
    return worklist


def quality_recipe(local: dict[str, Any], growth: dict[str, Any], episode_work: list[dict[str, Any]], queue: list[dict[str, Any]]) -> dict[str, Any]:
    missing_exports = int(local.get("missingExportCount") or 0)
    quality_review = int(local.get("qualityReviewCount") or 0)
    top_candidate = (growth.get("topCandidate") or {}).get("title") or "No top candidate yet"
    global_steps = [
        {
            "step": "Export real files",
            "status": "needs-work" if missing_exports else "ready",
            "why": f"{missing_exports} shorts still need a present local export before quality can be judged.",
        },
        {
            "step": "Inspect visual proof",
            "status": "needs-work" if quality_review else "ready",
            "why": f"{quality_review} shorts are in the watch/listen/text-review zone.",
        },
        {
            "step": "Sharpen hook and caption promise",
            "status": "always-useful",
            "why": f"Top growth candidate: {top_candidate}. Make the first second understandable without context.",
        },
        {
            "step": "Package per destination",
            "status": "always-useful",
            "why": "YouTube, Reels, LinkedIn, Patreon, and HGO embeds need related but not identical copy.",
        },
        {
            "step": "Capture receipts after publishing",
            "status": "later",
            "why": "Nothing is truly published until Tower has destination receipts or explicit manual proof.",
        },
    ]

    episode_steps: list[dict[str, Any]] = []
    for item in episode_work:
        blocked = item.get("blockedPlatforms") or []
        needs_review = item.get("needsReviewPlatforms") or []
        exported = int(item.get("exportedCount") or 0)
        short_count = int(item.get("shortCount") or 0)
        if short_count and not exported:
            status = "export-first"
            next_step = "Export at least one candidate short so this episode has real proof."
        elif blocked:
            status = "unblock-platforms"
            next_step = f"Resolve blocked destinations: {', '.join(blocked)}."
        elif needs_review:
            status = "review-platforms"
            next_step = f"Review destination fit: {', '.join(needs_review)}."
        else:
            status = "package-and-watch"
            next_step = "Watch the best export once, then package the strongest destination copy."
        episode_steps.append(
            {
                "episodeKey": item.get("episodeKey"),
                "status": status,
                "nextStep": next_step,
                "command": item.get("command") or "",
                "shortCount": short_count,
                "exportedCount": exported,
                "reviewableCount": item.get("reviewableCount"),
            }
        )

    return {
        "globalSteps": global_steps,
        "episodeSteps": episode_steps,
        "queueBackedActionCount": len(queue),
    }


def build_packet(queue_path: str, state_path: str, output_dir: str, basename: str) -> dict[str, Any]:
    local = build_local_board(queue_path, state_path, output_dir, f"{basename}-local-source")
    growth = build_growth_board(queue_path, state_path, output_dir, f"{basename}-growth-source")
    improvement = build_plan(queue_path, state_path, output_dir, f"{basename}-improvement-source")
    packaged = package_cards(growth)
    top_candidate = growth.get("topCandidate") or {}
    next_short = local.get("nextShort") or {}
    actions = top_actions(improvement)
    platform_cards = top_platform_cards(packaged)
    queue = execution_queue(next_short, actions, platform_cards)
    episode_work = episode_worklist(local.get("cards") or [], growth.get("cards") or [], queue)
    recipe = quality_recipe(local, growth, episode_work, queue)
    creator_pack = creator_quality_pack(growth.get("cards") or [])

    return {
        "packetType": "quipsly-shorts-mission-control",
        "version": "2026-06-21.shorts-mission-control.v1",
        "generatedAt": now_iso(),
        "truth": "This cockpit composes existing boards. It does not mutate Studio state, approve, publish, upload, or schedule anything.",
        "json": os.path.join(output_dir, f"{basename}.json"),
        "html": os.path.join(output_dir, f"{basename}.html"),
        "markdown": os.path.join(output_dir, f"{basename}.md"),
        "agentTaskPacketJson": os.path.join(output_dir, f"{basename}-agent-task-packet.json"),
        "commandBundleShell": os.path.join(output_dir, f"{basename}-command-bundle.sh"),
        "creatorQualityPackJson": os.path.join(output_dir, f"{basename}-creator-quality-pack.json"),
        "artifactManifestJson": os.path.join(output_dir, f"{basename}-artifact-manifest.json"),
        "operatorFocus": "Make the next useful production move obvious: export real files, improve promising shorts, package platform-native copy, and keep Episode 1-3 coverage visible.",
        "shortsStrategyBasis": SHORTS_STRATEGY_BASIS,
        "localExport": {
            "shortCount": local.get("shortCount"),
            "stageCounts": local.get("stageCounts"),
            "localExportedFileCount": local.get("localExportedFileCount"),
            "missingExportCount": local.get("missingExportCount"),
            "qualityReviewCount": local.get("qualityReviewCount"),
            "nextShort": next_short,
        },
        "growth": {
            "shortCount": growth.get("shortCount"),
            "tierCounts": growth.get("tierCounts"),
            "topCandidate": top_candidate,
        },
        "episodeCoverage": growth.get("episodeCoverage") or local.get("episodeCoverage"),
        "platformReadinessCoverage": growth.get("platformReadinessCoverage"),
        "executionQueue": queue,
        "executionCounts": execution_counts(queue),
        "episodeWorklist": episode_work,
        "qualityRecipe": recipe,
        "creatorQualityPack": creator_pack,
        "agentTaskPacket": agent_task_packet(queue, episode_work, recipe),
        "commandBundle": command_bundle(queue),
        "topActions": actions,
        "topPlatformCards": platform_cards,
        "sourceSummaries": {
            "localExportBoard": {
                "packetType": local.get("packetType"),
                "shortCount": local.get("shortCount"),
                "missingExportCount": local.get("missingExportCount"),
                "qualityReviewCount": local.get("qualityReviewCount"),
            },
            "growthQualityBoard": {
                "packetType": growth.get("packetType"),
                "shortCount": growth.get("shortCount"),
                "tierCounts": growth.get("tierCounts"),
            },
            "improvementPlan": {
                "packetType": improvement.get("packetType"),
                "candidateCount": improvement.get("candidateCount"),
                "topActionCounts": improvement.get("topActionCounts"),
            },
            "platformPackageBoard": {
                "packetType": "quipsly-shorts-platform-package-board",
                "cardCount": len(packaged),
            },
        },
    }


def html_page(packet: dict[str, Any]) -> str:
    local = packet.get("localExport") or {}
    growth = packet.get("growth") or {}
    top_candidate = growth.get("topCandidate") or {}
    next_short = local.get("nextShort") or {}
    episode_html = html_episode_coverage(packet.get("episodeCoverage"))
    platform_html = html_platform_readiness_coverage(packet.get("platformReadinessCoverage"))
    stage_cards = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(key)}</span></article>"
        for key, value in sorted((local.get("stageCounts") or {}).items())
    )
    tier_cards = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(key)}</span></article>"
        for key, value in sorted((growth.get("tierCounts") or {}).items())
    )
    action_cards = "".join(
        f"""
        <article class="action {esc(action.get('severity'))}">
          <p class="eyebrow">{esc(action.get('severity'))} / {esc(action.get('kind'))} / {esc(action.get('episodeKey'))}</p>
          <h3>{esc(action.get('label'))}</h3>
          <p><strong>{esc(action.get('title'))}</strong></p>
          <p>{esc(action.get('why'))}</p>
          <p><strong>Check:</strong> {esc(action.get('humanCheck'))}</p>
          <code>{esc(action.get('command') or '')}</code>
        </article>
        """
        for action in packet.get("topActions") or []
    )
    command_bundle_text = "\n".join(packet.get("commandBundle") or [])
    agent_task_path = packet.get("agentTaskPacketJson") or ""
    command_bundle_path = packet.get("commandBundleShell") or ""
    creator_quality_path = packet.get("creatorQualityPackJson") or ""
    artifact_manifest_path = packet.get("artifactManifestJson") or ""
    queue_cards = "".join(
        f"""
        <article class="action {esc(item.get('severity'))}">
          <p class="eyebrow">#{esc(item.get('rank'))} / {esc(item.get('lane'))} / {esc(item.get('episodeKey'))}</p>
          <h3>{esc(item.get('label'))}</h3>
          <p><strong>{esc(item.get('targetTitle'))}</strong></p>
          <p>{esc(item.get('why'))}</p>
          <p><strong>Check:</strong> {esc(item.get('humanCheck'))}</p>
          <code>{esc(item.get('command') or '')}</code>
        </article>
        """
        for item in packet.get("executionQueue") or []
    )
    platform_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(card.get('episodeKey'))} / {esc(card.get('growthTier'))}</p>
          <h3>{esc(card.get('title'))}</h3>
          <p>Score: <strong>{esc(card.get('growthScore'))}</strong></p>
          <p>{esc(card.get('platformReadinessSummary'))}</p>
        </article>
        """
        for card in packet.get("topPlatformCards") or []
    )
    creator_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(brief.get('episodeKey'))} / {esc(brief.get('growthTier'))} / {esc(brief.get('firstDestination'))}</p>
          <h3>{esc(brief.get('title'))}</h3>
          <p>Score: <strong>{esc(brief.get('growthScore'))}</strong> / {esc(brief.get('durationBand'))} / {esc(brief.get('platformReadinessSummary'))}</p>
          <p><strong>Strengths:</strong> {esc('; '.join(brief.get('strengths') or []) or 'none')}</p>
          <p><strong>Risks:</strong> {esc('; '.join(brief.get('risks') or []) or 'none')}</p>
          <p><strong>Human check:</strong> {esc(brief.get('humanReviewPrompt'))}</p>
          <code>{esc(chr(10).join(f"- {step.get('step')}: {step.get('agentAction')}" for step in (brief.get('recipe') or [])))}</code>
        </article>
        """
        for brief in (packet.get("creatorQualityPack") or {}).get("briefs") or []
    )
    episode_work_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(item.get('episodeKey'))}</p>
          <h3>{esc(item.get('nextAction'))}</h3>
          <p>{esc(item.get('shortCount'))} shorts / {esc(item.get('exportedCount'))} exported / {esc(item.get('reviewableCount'))} reviewable</p>
          <p><strong>Top growth:</strong> {esc(((item.get('topGrowthShort') or {}).get('title')) or 'none')}</p>
          <p><strong>Blocked:</strong> {esc(', '.join(item.get('blockedPlatforms') or []) or 'none')}</p>
          <p><strong>Needs review:</strong> {esc(', '.join(item.get('needsReviewPlatforms') or []) or 'none')}</p>
          <code>{esc(item.get('command') or '')}</code>
        </article>
        """
        for item in packet.get("episodeWorklist") or []
    )
    source_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(name)}</p>
          <h3>{esc(summary.get('packetType'))}</h3>
          <code>{esc(summary)}</code>
        </article>
        """
        for name, summary in (packet.get("sourceSummaries") or {}).items()
    )
    agent_task_json = json.dumps(packet.get("agentTaskPacket") or {}, indent=2, sort_keys=True)
    recipe = packet.get("qualityRecipe") or {}
    global_recipe_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(step.get('status'))}</p>
          <h3>{esc(step.get('step'))}</h3>
          <p>{esc(step.get('why'))}</p>
        </article>
        """
        for step in recipe.get("globalSteps") or []
    )
    episode_recipe_cards = "".join(
        f"""
        <article>
          <p class="eyebrow">{esc(step.get('episodeKey'))} / {esc(step.get('status'))}</p>
          <h3>{esc(step.get('nextStep'))}</h3>
          <p>{esc(step.get('shortCount'))} shorts / {esc(step.get('exportedCount'))} exported / {esc(step.get('reviewableCount'))} reviewable</p>
          <code>{esc(step.get('command') or '')}</code>
        </article>
        """
        for step in recipe.get("episodeSteps") or []
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts mission control</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101711;
      --panel: #19251b;
      --ink: #f8efd5;
      --muted: #baaf96;
      --gold: #f4d35e;
      --moss: #8fc974;
      --cyan: #5ec6d5;
      --red: #ec746c;
      --line: rgba(248,239,213,.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 10% 0%, rgba(143,201,116,.22), transparent 24rem),
        radial-gradient(circle at 92% 4%, rgba(94,198,213,.13), transparent 28rem),
        linear-gradient(180deg, #101711, #0b100c);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1280px; margin: 0 auto; padding: 42px 24px 72px; }}
    .hero, .panel, .action {{ border: 1px solid var(--line); background: rgba(25,37,27,.88); border-radius: 28px; box-shadow: 0 28px 90px rgba(0,0,0,.28); }}
    .hero {{ padding: 34px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--gold); text-transform: uppercase; letter-spacing: .22em; font-size: .72rem; font-weight: 900; }}
    h1 {{ margin: 0; font-size: clamp(2.7rem, 6vw, 5.4rem); line-height: .92; letter-spacing: -.07em; }}
    h2, h3 {{ margin: 0 0 8px; }}
    p {{ color: var(--muted); }}
    strong {{ color: var(--ink); }}
    code {{ display: block; white-space: pre-wrap; word-break: break-word; min-height: 34px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.32); color: #fff6bd; border: 1px solid rgba(244,211,94,.18); font-size: .8rem; }}
    .hero-grid, .grid, .counts, .episode-coverage-grid, .platform-readiness-grid {{ display: grid; gap: 12px; }}
    .hero-grid {{ grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 22px; }}
    .grid {{ grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 18px; }}
    .counts, .episode-coverage-grid, .platform-readiness-grid {{ grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }}
    .panel {{ padding: 20px; margin-top: 18px; box-shadow: none; }}
    .counts article, .episode-coverage article, .platform-readiness-coverage article, .grid article {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.04); }}
    .counts strong {{ display: block; color: var(--gold); font-size: 2rem; }}
    .episode-coverage, .platform-readiness-coverage {{ margin-top: 18px; }}
    .episode-coverage strong {{ display: block; color: var(--moss); text-transform: uppercase; letter-spacing: .08em; }}
    .platform-readiness-coverage strong {{ display: block; color: var(--cyan); letter-spacing: .03em; }}
    .episode-coverage span, .episode-coverage small, .platform-readiness-coverage span, .platform-readiness-coverage small, .counts span {{ display: block; color: var(--muted); }}
    .coverage-warning {{ color: var(--gold); }}
    .action {{ padding: 16px; box-shadow: none; }}
    .action.blocker, .action.high {{ border-color: rgba(236,116,108,.45); }}
    .action.medium {{ border-color: rgba(244,211,94,.42); }}
    .action.low, .action.polish {{ border-color: rgba(143,201,116,.42); }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - shorts mission control</p>
      <h1>Turn long episodes into shorts worth posting.</h1>
      <p>{esc(packet.get('operatorFocus'))}</p>
      <div class="hero-grid">
        <article><p class="eyebrow">Next export/review</p><h2>{esc(next_short.get('title') or 'No short found')}</h2><p>{esc(next_short.get('nextAction') or '')}</p></article>
        <article><p class="eyebrow">Top growth candidate</p><h2>{esc(top_candidate.get('title') or 'No candidate found')}</h2><p>Score: <strong>{esc(top_candidate.get('growthScore') or '')}</strong></p></article>
        <article><p class="eyebrow">Executable next steps</p><h2>{esc((packet.get('executionCounts') or {}).get('commandCount'))} commands</h2><p>{esc((packet.get('executionCounts') or {}).get('total'))} ranked queue items</p></article>
        <article><p class="eyebrow">Creator quality pack</p><h2>{esc((packet.get('creatorQualityPack') or {}).get('briefCount'))} briefs</h2><p>{esc(creator_quality_path)}</p></article>
      </div>
      {episode_html}
      {platform_html}
    </section>
    <section class="panel">
      <p class="eyebrow">Research-backed creator quality briefs</p>
      <p>These are Quipsly-specific recipes for making the strongest candidates more watchable, legible, and platform-native before posting.</p>
      <p><strong>Artifact:</strong> {esc(creator_quality_path)}</p>
      <div class="grid">{creator_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Episode worklist</p>
      <div class="grid">{episode_work_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Quality recipe</p>
      <div class="grid">{global_recipe_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Per-episode recipe</p>
      <div class="grid">{episode_recipe_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Local export state</p>
      <div class="counts">{stage_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Growth tiers</p>
      <div class="counts">{tier_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Execution queue</p>
      <div class="grid">{queue_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Copyable command bundle</p>
      <p>Run deliberately. These commands are review/export/proof helpers, not publication approvals.</p>
      <p><strong>Artifact:</strong> {esc(command_bundle_path)}</p>
      <code>{esc(command_bundle_text)}</code>
    </section>
    <section class="panel">
      <p class="eyebrow">Agent task packet</p>
      <p>Structured handoff for Codex, Quipsly, or another helper. It contains proof expectations and explicitly excludes publish/approval authority.</p>
      <p><strong>Artifact:</strong> {esc(agent_task_path)}</p>
      <p><strong>Manifest:</strong> {esc(artifact_manifest_path)}</p>
      <code>{esc(agent_task_json)}</code>
    </section>
    <section class="panel">
      <p class="eyebrow">Top next actions</p>
      <div class="grid">{action_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Best platform candidates</p>
      <div class="grid">{platform_cards}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">Composed from</p>
      <div class="grid">{source_cards}</div>
    </section>
  </main>
</body>
</html>
"""


def markdown_page(packet: dict[str, Any]) -> str:
    local = packet.get("localExport") or {}
    growth = packet.get("growth") or {}
    next_short = local.get("nextShort") or {}
    top_candidate = growth.get("topCandidate") or {}
    lines = [
        "# Quipsly shorts mission control",
        "",
        packet.get("truth", ""),
        "",
        packet.get("operatorFocus", ""),
        "",
        "## Immediate focus",
        "",
        f"- Next export/review: `{next_short.get('title') or 'none'}` - {next_short.get('nextAction') or ''}",
        f"- Top growth candidate: `{top_candidate.get('title') or 'none'}` score `{top_candidate.get('growthScore') or ''}`",
        f"- Execution queue: `{(packet.get('executionCounts') or {}).get('total')}` items, `{(packet.get('executionCounts') or {}).get('commandCount')}` commands",
        f"- Agent task packet: `{packet.get('agentTaskPacketJson')}`",
        f"- Command bundle: `{packet.get('commandBundleShell')}`",
        f"- Creator quality pack: `{packet.get('creatorQualityPackJson')}`",
        f"- Artifact manifest: `{packet.get('artifactManifestJson')}`",
        "",
        *markdown_episode_coverage(packet.get("episodeCoverage")),
        "",
        *markdown_platform_readiness_coverage(packet.get("platformReadinessCoverage")),
        "",
        "## Episode worklist",
        "",
    ]
    for item in packet.get("episodeWorklist") or []:
        lines.extend(
            [
                f"### {item.get('episodeKey')}",
                "",
                f"- Shorts: `{item.get('shortCount')}`",
                f"- Exported: `{item.get('exportedCount')}`",
                f"- Reviewable: `{item.get('reviewableCount')}`",
                f"- Next: {item.get('nextAction')}",
                f"- Top growth short: `{((item.get('topGrowthShort') or {}).get('title')) or 'none'}`",
                f"- Blocked platforms: `{', '.join(item.get('blockedPlatforms') or []) or 'none'}`",
                f"- Needs review platforms: `{', '.join(item.get('needsReviewPlatforms') or []) or 'none'}`",
                "",
                "```bash",
                item.get("command") or "",
                "```",
                "",
            ]
        )
    lines.extend(
        [
            "## Quality recipe",
            "",
        ]
    )
    for step in (packet.get("qualityRecipe") or {}).get("globalSteps") or []:
        lines.extend(
            [
                f"### {step.get('step')}",
                "",
                f"- Status: `{step.get('status')}`",
                f"- Why: {step.get('why')}",
                "",
            ]
        )
    lines.extend(["## Research-backed creator quality briefs", ""])
    for brief in (packet.get("creatorQualityPack") or {}).get("briefs") or []:
        lines.extend(
            [
                f"### {brief.get('title')}",
                "",
                f"- Episode: `{brief.get('episodeKey')}`",
                f"- Growth score: `{brief.get('growthScore')}`",
                f"- First destination: `{brief.get('firstDestination')}`",
                f"- Duration band: `{brief.get('durationBand')}`",
                f"- Platform readiness: {brief.get('platformReadinessSummary')}",
                f"- Strengths: {'; '.join(brief.get('strengths') or []) or 'none'}",
                f"- Risks: {'; '.join(brief.get('risks') or []) or 'none'}",
                f"- Human check: {brief.get('humanReviewPrompt')}",
                "",
                "Recipe:",
                "",
            ]
        )
        for step in brief.get("recipe") or []:
            lines.extend(
                [
                    f"- `{step.get('step')}`: {step.get('agentAction')}",
                    f"  - Why: {step.get('why')}",
                ]
            )
        lines.append("")
    lines.extend(["## Per-episode recipe", ""])
    for step in (packet.get("qualityRecipe") or {}).get("episodeSteps") or []:
        lines.extend(
            [
                f"### {step.get('episodeKey')} - {step.get('status')}",
                "",
                f"- Next: {step.get('nextStep')}",
                f"- Shorts: `{step.get('shortCount')}`",
                f"- Exported: `{step.get('exportedCount')}`",
                f"- Reviewable: `{step.get('reviewableCount')}`",
                "",
                "```bash",
                step.get("command") or "",
                "```",
                "",
            ]
        )
    lines.extend(
        [
        "## Execution queue",
        "",
        ]
    )
    for item in packet.get("executionQueue") or []:
        lines.extend(
            [
                f"### {item.get('rank')}. {item.get('lane')} - {item.get('label')}",
                "",
                f"- Short: `{item.get('targetTitle')}`",
                f"- Episode: `{item.get('episodeKey')}`",
                f"- Severity: `{item.get('severity')}`",
                f"- Why: {item.get('why')}",
                f"- Check: {item.get('humanCheck')}",
                f"- Source: `{item.get('source')}`",
                "",
                "```bash",
                item.get("command") or "",
                "```",
                "",
            ]
        )
    lines.extend(
        [
            "## Copyable command bundle",
            "",
            "Review each command before running. These commands do not publish or approve by themselves.",
            "",
            f"- Artifact: `{packet.get('commandBundleShell')}`",
            "",
            "```bash",
            *list(packet.get("commandBundle") or []),
            "```",
            "",
        ]
    )
    lines.extend(
        [
            "## Agent task packet",
            "",
            "Structured handoff for agents. It contains proof expectations and explicitly excludes publish/approval authority.",
            "",
            f"- Artifact: `{packet.get('agentTaskPacketJson')}`",
            "",
            "```json",
            json.dumps(packet.get("agentTaskPacket") or {}, indent=2, sort_keys=True),
            "```",
            "",
        ]
    )
    lines.extend(
        [
        "## Top next actions",
        "",
        ]
    )
    for action in packet.get("topActions") or []:
        lines.extend(
            [
                f"### {action.get('severity')} / {action.get('kind')} - {action.get('label')}",
                "",
                f"- Short: `{action.get('title')}`",
                f"- Episode: `{action.get('episodeKey')}`",
                f"- Growth score: `{action.get('growthScore')}`",
                f"- Why: {action.get('why')}",
                f"- Check: {action.get('humanCheck')}",
                "",
                "```bash",
                action.get("command") or "",
                "```",
                "",
            ]
        )
    lines.extend(["## Best platform candidates", ""])
    for card in packet.get("topPlatformCards") or []:
        lines.extend(
            [
                f"- `{card.get('title')}` ({card.get('episodeKey')}): score `{card.get('growthScore')}`, {card.get('platformReadinessSummary')}",
            ]
        )
    lines.extend(["", "## Composed from", ""])
    for name, summary in (packet.get("sourceSummaries") or {}).items():
        lines.extend(
            [
                f"### {name}",
                "",
                f"- Packet type: `{summary.get('packetType')}`",
                f"- Summary: `{summary}`",
                "",
            ]
        )
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_mission_control.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
            file=sys.stderr,
        )
        return 2
    queue_path, state_path, output_dir, basename = argv[1:5]
    mode = argv[5] if len(argv) > 5 else "--md"
    packet = build_packet(queue_path, state_path, output_dir, basename)
    write_json(packet["agentTaskPacketJson"], packet.get("agentTaskPacket") or {})
    write_text(packet["commandBundleShell"], "\n".join(packet.get("commandBundle") or []))
    write_json(packet["creatorQualityPackJson"], packet.get("creatorQualityPack") or {})
    write_json(packet["artifactManifestJson"], artifact_manifest(packet))
    emit_packet_outputs(packet, html_page(packet), markdown_page(packet), mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
