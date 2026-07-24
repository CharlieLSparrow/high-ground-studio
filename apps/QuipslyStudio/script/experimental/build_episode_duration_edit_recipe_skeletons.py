#!/usr/bin/env python3
"""Build versioned edit-recipe skeletons from duration work orders.

A skeleton is structured editorial intent for a future timeline recipe. It is not
an export and it does not modify media, timeline state, source files, approvals,
accounts, schedules, or receipt truth.
"""
from __future__ import annotations

import html
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
WORKORDERS_POINTER = RELEASE_ROOT / "review-board" / "duration-version-workorders" / "latest-duration-version-workorders.json"
OUT_ROOT = RELEASE_ROOT / "review-board" / "duration-edit-recipes"
SCHEMA = "quipsly.episode-duration-edit-recipe-skeletons.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-duration-edit-recipes")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def slug(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "recipe"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    json_path = str(pointer.get("jsonPath") or "")
    target = load_json(Path(json_path)) if json_path and Path(json_path).exists() else {}
    return {**pointer, **target} if target else pointer


def parse_target_minutes(workorder: dict[str, Any]) -> dict[str, Any]:
    hint = workorder.get("targetMinutesHint") if isinstance(workorder.get("targetMinutesHint"), dict) else {}
    center = hint.get("center")
    min_value = hint.get("min")
    max_value = hint.get("max")
    return {"min": min_value, "max": max_value, "center": center}


def pacing_strategy(workorder: dict[str, Any]) -> dict[str, Any]:
    family = str(workorder.get("versionFamily") or "")
    minutes = parse_target_minutes(workorder).get("center")
    if family == "lean-public-cut" or (isinstance(minutes, (int, float)) and minutes <= 35):
        return {
            "label": "Lean public cut",
            "density": "high",
            "editBias": "Remove repeated setup, long pauses, off-topic loops, and unclear transitions first. Preserve the clearest thesis and emotional turns.",
            "reviewQuestion": "Does this still feel honest, or did the cut become a trailer pretending to be an episode?",
        }
    if family == "archive-complete-cut" or (isinstance(minutes, (int, float)) and minutes >= 70):
        return {
            "label": "Archive/complete cut",
            "density": "low",
            "editBias": "Preserve context, conversational texture, and source truth. Remove only technical dead air, obvious mistakes, and broken capture sections.",
            "reviewQuestion": "Is this complete because it is valuable, or complete because we avoided deciding?",
        }
    return {
        "label": "Standard public cut",
        "density": "medium",
        "editBias": "Keep the main argument, the human moments, and useful examples. Trim drift and repeated points while preserving trust.",
        "reviewQuestion": "Would a new viewer understand why this episode mattered and want the next one?",
    }


def make_recipe(workorder: dict[str, Any]) -> dict[str, Any]:
    workorder_id = str(workorder.get("workOrderId") or "unknown-workorder")
    recipe_id = f"recipe-{workorder_id}-skeleton"
    episode = int(workorder.get("episode") or 0)
    strategy = pacing_strategy(workorder)
    caution = list(workorder.get("operatorCautions") or [])
    if workorder.get("durationSeverity") not in {"aligned", "none", "ok", "unknown"}:
        caution.append("Before rendering, resolve whether video, 9:16, and podcast audio should share the same boundary or intentionally diverge.")
    return {
        "recipeId": recipe_id,
        "workOrderId": workorder_id,
        "episode": episode,
        "episodeLabel": workorder.get("episodeLabel") or f"Episode {episode}",
        "variantName": workorder.get("variantName") or "Duration candidate",
        "priority": int(workorder.get("priority") or 0),
        "versionFamily": workorder.get("versionFamily") or "standard-public-cut",
        "targetDuration": workorder.get("targetDuration") or "needs-duration-target",
        "targetMinutesHint": parse_target_minutes(workorder),
        "platformFocus": workorder.get("platformFocus") or [],
        "intendedUse": workorder.get("intendedUse") or "Review candidate",
        "editorialTradeoff": workorder.get("editorialTradeoff") or "Needs review.",
        "pacingStrategy": strategy,
        "currentEvidence": workorder.get("evidence") or {},
        "currentDurations": workorder.get("currentDurations") or {},
        "sourcePrinciple": "Whole synced sources remain intact. SHOW/SKIP and short-pullout decisions live as transparent metadata over the episode spine.",
        "recipeState": "skeleton-created",
        "renderStatus": "not-rendered",
        "approvalState": "not-approved",
        "publicationState": "not-published",
        "receiptState": "empty-local-planning-only",
        "decisionPasses": [
            {
                "order": 1,
                "name": "Boundary and sync check",
                "goal": "Confirm the episode spine, current A/V durations, and any known mismatch before cutting toward this target.",
                "output": "boundaryDecision: preserve-current | trim-video-tail | trim-audio-tail | create-platform-specific-boundaries | needs-human-review",
                "status": "not-started",
            },
            {
                "order": 2,
                "name": "Transcript/story spine pass",
                "goal": "Mark thesis, turns, repeated loops, unclear sections, quotable moments, and sections that should become shorts.",
                "output": "storyMap with keep/trim/short-candidate tags",
                "status": "not-started",
            },
            {
                "order": 3,
                "name": "SHOW/SKIP timeline pass",
                "goal": "Create non-destructive decisions over whole synced lanes to match the target duration family.",
                "output": "sequence-time decisions; no chopped source media",
                "status": "not-started",
            },
            {
                "order": 4,
                "name": "Shorts extraction pass",
                "goal": "Pull social candidates from high-signal sections created or preserved by this recipe.",
                "output": "short recipes linked back to this long-form recipe",
                "status": "not-started",
            },
            {
                "order": 5,
                "name": "Human review pass",
                "goal": "Charlie/Mako/Homer can decide whether the target runtime tradeoff feels right before rendering.",
                "output": "keep/refine/hold decision notes; no publication claim",
                "status": "not-started",
            },
        ],
        "suggestedDecisionHeuristics": [
            "Favor the clearest statement of the episode promise early.",
            "Cut technical dead air before cutting personality.",
            "Preserve moments that reveal relationship, vulnerability, or useful examples.",
            "When in doubt, tag as review-needed rather than forcing a bad cut.",
            "If a section becomes a great short but weakens long-form pacing, pull it as a short and consider trimming it in the episode.",
        ],
        "operatorCautions": caution,
        "safeNextAction": "Run the boundary and transcript/story spine pass, then create a draft SHOW/SKIP decision map for this recipe.",
        "truth": {
            "reviewOnly": True,
            "editRecipeSkeletonCreated": True,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def build() -> dict[str, Any]:
    workorders_packet = load_pointer_target(WORKORDERS_POINTER)
    workorders = [w for w in (workorders_packet.get("workOrders") or []) if isinstance(w, dict)]
    recipes = [make_recipe(workorder) for workorder in workorders]
    by_episode: dict[int, list[dict[str, Any]]] = {}
    for recipe in recipes:
        by_episode.setdefault(int(recipe.get("episode") or 0), []).append(recipe)
    episodes = [
        {
            "episode": episode,
            "recipeCount": len(items),
            "firstPriorityRecipeId": items[0].get("recipeId") if items else "",
            "recipes": items,
        }
        for episode, items in sorted(by_episode.items())
    ]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "duration-edit-recipe-skeletons-ready" if recipes else "duration-edit-recipe-skeletons-empty",
        "releaseRoot": str(RELEASE_ROOT),
        "sourceWorkordersJson": str(workorders_packet.get("jsonPath") or WORKORDERS_POINTER),
        "sourceWorkordersHtml": str(workorders_packet.get("htmlPath") or ""),
        "counts": {
            "episodes": len(episodes),
            "recipes": len(recipes),
            "firstPriorityRecipes": len([r for r in recipes if int(r.get("priority") or 0) == 1]),
            "recipesWithCautions": len([r for r in recipes if r.get("operatorCautions")]),
            "timelineDecisionsWritten": 0,
            "exportsRendered": 0,
            "receiptTruthCreated": 0,
        },
        "truth": {
            "reviewOnly": True,
            "editRecipeSkeletonsCreated": True,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
        "nextSafestAction": "Pick one recipe skeleton and run the boundary/transcript pass before writing timeline decisions or rendering files.",
        "episodes": episodes,
        "recipes": recipes,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Episode duration edit-recipe skeletons",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "These are editable recipe skeletons for alternate duration versions. They are not rendered files and do not write timeline decisions yet.",
        "",
        f"Source work orders: `{payload.get('sourceWorkordersHtml') or payload.get('sourceWorkordersJson')}`",
        "",
        "## Recommended next move",
        "",
        payload.get("nextSafestAction") or "Review one recipe skeleton.",
        "",
        "## Recipe index",
        "",
        "| Recipe | Target | Strategy | Use | Tradeoff | Next |",
        "|---|---:|---|---|---|---|",
    ]
    for recipe in payload.get("recipes") or []:
        lines.append(
            f"| `{recipe['recipeId']}` | {recipe['targetDuration']} | {recipe['pacingStrategy']['label']} | {recipe['intendedUse']} | {recipe['editorialTradeoff']} | {recipe['safeNextAction']} |"
        )
    lines.extend([
        "",
        "## Safety boundary",
        "",
        "- No source media, original photos, manuscripts, timeline decisions, existing exports, external accounts, schedules, approvals, publications, or receipts were mutated.",
        "- These skeletons are the bridge from duration work order to future edit recipe. They are not renders.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    episode_sections = []
    for episode in payload.get("episodes") or []:
        cards = []
        for recipe in episode.get("recipes") or []:
            passes = "".join(f"<li><b>{esc(p.get('name'))}</b>: {esc(p.get('goal'))}</li>" for p in recipe.get("decisionPasses") or [])
            cautions = "".join(f"<li>{esc(c)}</li>" for c in recipe.get("operatorCautions") or [])
            cards.append(f"""
            <article class="recipe">
              <p class="eyebrow">{esc(recipe.get('recipeId'))}</p>
              <h3>{esc(recipe.get('variantName'))} <span>{esc(recipe.get('targetDuration'))}</span></h3>
              <p><b>{esc((recipe.get('pacingStrategy') or {}).get('label'))}</b>: {esc((recipe.get('pacingStrategy') or {}).get('editBias'))}</p>
              <p><b>Tradeoff:</b> {esc(recipe.get('editorialTradeoff'))}</p>
              <p><b>Review question:</b> {esc((recipe.get('pacingStrategy') or {}).get('reviewQuestion'))}</p>
              <details><summary>Decision passes</summary><ol>{passes}</ol></details>
              {f'<details open><summary>Cautions</summary><ul>{cautions}</ul></details>' if cautions else ''}
              <p class="next">{esc(recipe.get('safeNextAction'))}</p>
            </article>
            """)
        episode_sections.append(f"""
        <section class="episode">
          <p class="eyebrow">Episode {esc(episode.get('episode'))}</p>
          <h2>{esc(episode.get('recipeCount'))} recipe skeletons</h2>
          <div class="grid">{''.join(cards)}</div>
        </section>
        """)
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Episode duration edit-recipe skeletons</title>
<style>
:root {{ color-scheme:dark; --bg:#0f1712; --panel:#1c2a20; --panel2:#243720; --ink:#fff1d4; --muted:#c8bda1; --gold:#edcb58; --leaf:#83dc90; --water:#63c6dc; --line:#3b5137; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(131,220,144,.18),transparent 30%),linear-gradient(135deg,#0f1712,#1d2018); color:var(--ink); }}
main {{ max-width:1280px; margin:0 auto; padding:36px 24px 80px; }}
header,.episode {{ border:1px solid var(--line); border-radius:28px; background:rgba(28,42,32,.94); padding:24px; margin:18px 0; box-shadow:0 18px 50px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,76px); line-height:.92; margin:0 0 12px; }}
h2,h3 {{ margin:.2rem 0 .7rem; }}
h3 span {{ color:var(--gold); float:right; font-size:.9rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-weight:900; font-size:12px; }}
.muted {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:14px; }}
.recipe {{ border:1px solid var(--line); border-radius:20px; background:linear-gradient(180deg,rgba(36,55,32,.98),rgba(20,29,22,.98)); padding:16px; }}
.recipe details {{ margin-top:10px; color:var(--muted); }}
.next {{ color:var(--leaf); font-weight:800; }}
code {{ color:var(--gold); }}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Studio · Metadata-first</p><h1>Duration edit-recipe skeletons</h1><p>These skeletons define how to start building lean, standard, and archive episode cuts without chopping source media or rendering premature files.</p><p><b>Next safest action:</b> {esc(payload.get('nextSafestAction'))}</p></header>
{''.join(episode_sections)}
<section class="episode"><p class="eyebrow">Safety</p><p>No timeline decisions, exports, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth were created.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def main() -> None:
    payload = build()
    session_dir = OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "duration-edit-recipe-skeletons.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-duration-edit-recipes.md"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open duration edit-recipe skeletons",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local recipe skeleton evidence only. It does not write timeline decisions, render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    latest = OUT_ROOT / "latest-duration-edit-recipe-skeletons.json"
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": payload["status"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload.get("counts") or {},
        "firstSafeAction": payload.get("firstSafeAction") or {},
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
