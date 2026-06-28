#!/usr/bin/env python3
"""Build the Daily Writing Desk readiness board.

This is a local planning/review artifact for deciding where Charlie should do
serious book writing now: web/Nest, native desktop, or both. It reads current
repo and NestWriting pointers, checks surface evidence, and writes a safe board.

It does not mutate manuscript prose, canonical files, source files, public
content, accounts, schedules, uploads, publications, approvals, or receipt truth.
"""
from __future__ import annotations

import html
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]
OUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingReadiness")
LATEST_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-daily-writing-desk-readiness.json")
SCHEMA = "quipsly.daily-writing-desk-readiness.v1"

POINTERS = {
    "nestControlRoom": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-control-room.json"),
    "nestAuthorDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-author-desk.json"),
    "nestReviewDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-review-desk.json"),
    "nestDailyPacket": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-daily-packet.json"),
    "nestRevisionBatch": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-next-revision-batch.json"),
}

SURFACE_PATHS = {
    "webCreateWorkspace": REPO_ROOT / "apps/quipsly/src/app/create/Workspace.tsx",
    "webCreateActions": REPO_ROOT / "apps/quipsly/src/app/create/actions.ts",
    "webManuscriptRoute": REPO_ROOT / "apps/quipsly/src/app/manuscript",
    "webKernelPackage": REPO_ROOT / "packages/quipsly-document-kernel",
    "nativeStudioSources": ROOT / "Sources",
    "nativeMacApp": ROOT / "Sources/QuipslyMac/QuipslyMacApp.swift",
    "nativeVideoWorkspace": ROOT / "Sources/SharedUI/WorkspaceView.swift",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-daily-writing-readiness")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists():
        target = load_json(target_path)
        if target:
            return {**pointer, **target}
    return pointer


def exists(path: Path) -> bool:
    try:
        return path.exists()
    except Exception:
        return False


def surface_evidence() -> dict[str, Any]:
    return {
        key: {
            "path": str(path),
            "exists": exists(path),
        }
        for key, path in SURFACE_PATHS.items()
    }


def nest_pointer_evidence() -> dict[str, Any]:
    evidence: dict[str, Any] = {}
    for key, path in POINTERS.items():
        packet = load_pointer(path)
        evidence[key] = {
            "pointerPath": str(path),
            "exists": path.exists(),
            "status": packet.get("status") or "",
            "htmlPath": packet.get("htmlPath") or "",
            "jsonPath": packet.get("jsonPath") or "",
            "counts": packet.get("counts") or {},
            "nextSafestAction": packet.get("nextSafestAction") or packet.get("nextAction") or "",
        }
    return evidence


def readiness_requirements() -> list[dict[str, Any]]:
    return [
        {"id": "calm-entry", "label": "One obvious Daily Writing Desk entry", "why": "Charlie should not hunt through production tools before writing.", "webStatus": "partial", "nativeStatus": "missing", "next": "Add a first-class Daily Writing button/card from Nest dashboard and return brief."},
        {"id": "autosave-visible", "label": "Autosave with visible saved state", "why": "Systems anxiety drops when save truth is visible.", "webStatus": "partial", "nativeStatus": "missing", "next": "Make saved/checkpoint state persistent and obvious before serious daily use."},
        {"id": "manual-snapshot", "label": "Manual snapshot before risky edits", "why": "Scrivener-style snapshots make rewrites less scary.", "webStatus": "partial", "nativeStatus": "missing", "next": "Expose one-click named snapshot and compare/restore packet."},
        {"id": "panic-export", "label": "Panic export / copy current draft", "why": "If anything feels wrong, Charlie can get the words out immediately.", "webStatus": "needs-hardening", "nativeStatus": "missing", "next": "Add Markdown/DOCX-ready local export packet from the writing desk."},
        {"id": "chapter-episode-boundaries", "label": "Chapter and episode boundaries are effortless", "why": "Structure should emerge from writing, not admin work.", "webStatus": "partial", "nativeStatus": "missing", "next": "Keep Chapter/Episode as boundary markers and make removal/repair obvious."},
        {"id": "source-trail", "label": "Source trail remains visible", "why": "Quipsly is more than a blank page: research and provenance stay nearby.", "webStatus": "ready-ish", "nativeStatus": "missing", "next": "Keep source packets/revision cards linked beside the writing surface."},
        {"id": "ai-inspectable", "label": "AI drafts are inspectable, not silent replacements", "why": "AI can write, but the human should see what changed and why.", "webStatus": "partial", "nativeStatus": "missing", "next": "Route AI output through preview cards, diff, ledger, and approve/reject."},
        {"id": "rollback", "label": "Recent changes and rollback are visible", "why": "Undo history is the difference between courage and dread.", "webStatus": "partial", "nativeStatus": "missing", "next": "Add recent-change feed and selective rollback to the writing desk."},
        {"id": "offline-local", "label": "Offline/local writing posture is explicit", "why": "Web offline is possible, but sync/profile constraints need visible truth.", "webStatus": "not-yet", "nativeStatus": "natural-fit", "next": "Use native local-first capture/draft as the durable offline path; optionally add web PWA later."},
        {"id": "same-model", "label": "Web and native share one document model", "why": "No second manuscript truth, no copy-paste drift monster.", "webStatus": "partial", "nativeStatus": "not-yet", "next": "Treat native writer as an adapter over the Quipsly document kernel/sidecar model."},
        {"id": "collaboration", "label": "Collaboration/review handoff is safe", "why": "Mako/Homer review should feel like editing, not bureaucracy.", "webStatus": "stronger", "nativeStatus": "future", "next": "Keep web as first collaboration/review surface until native sync is real."},
        {"id": "publish-packets", "label": "Publish/export packets are downstream, not accidental canon", "why": "Writing should feed Tower without pretending a draft is public truth.", "webStatus": "partial", "nativeStatus": "missing", "next": "Expose compile targets: book section, episode script, show notes, HGO draft, social excerpts."},
    ]


def count_status(requirements: list[dict[str, Any]], surface: str, values: set[str]) -> int:
    key = "webStatus" if surface == "web" else "nativeStatus"
    return sum(1 for item in requirements if str(item.get(key) or "") in values)


def build() -> dict[str, Any]:
    surfaces = surface_evidence()
    pointers = nest_pointer_evidence()
    requirements = readiness_requirements()
    web_ready = count_status(requirements, "web", {"ready", "ready-ish", "partial"})
    native_ready = count_status(requirements, "native", {"ready", "ready-ish", "partial", "natural-fit"})
    recommendation = {
        "decision": "Start daily serious book writing in the web/Nest surface first; build native local-first writing in parallel; keep one document model underneath both.",
        "why": [
            "The web/Nest side already has manuscript, tagging, source/revision packet, review, collaboration, and publishing-runway infrastructure.",
            "The native QuipslyStudio app is currently strongest for video/media production, not manuscript writing.",
            "A native local-first writer is still strategically important for offline calm, fast capture, and long sessions, but it should not become a second manuscript truth.",
        ],
        "notYet": "Do not move daily writing into native until it has autosave, manual snapshots, panic export, rollback, and kernel/sidecar persistence.",
    }
    research = [
        {"source": "Scrivener", "url": "https://www.literatureandlatte.com/scrivener/overview", "lesson": "Long-form writing needs structure, snapshots/backups, research nearby, and compile/export as a first-class workflow."},
        {"source": "Google Docs offline help", "url": "https://support.google.com/docs/answer/6388102?hl=en", "lesson": "Web writing can be offline-capable, but browser/profile/setup/storage constraints must be visible to the user."},
        {"source": "MDN Service Worker API", "url": "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", "lesson": "Web offline is powerful because service workers can mediate cache/network behavior, but that means explicit lifecycle/sync design."},
        {"source": "Apple SwiftUI document-based apps", "url": "https://developer.apple.com/documentation/swiftui/building-a-document-based-app-with-swiftui", "lesson": "Native writing should eventually use a document/local-first mental model rather than just a web wrapper if we want Mac-caliber confidence."},
    ]
    truth = {
        "readinessPlanningOnly": True,
        "manuscriptMutated": False,
        "canonicalManuscriptReplaced": False,
        "sourceFilesMutated": False,
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "daily-writing-readiness-ready",
        "surfaceEvidence": surfaces,
        "nestPointerEvidence": pointers,
        "recommendation": recommendation,
        "requirements": requirements,
        "research": research,
        "counts": {
            "requirements": len(requirements),
            "webReadyOrPartial": web_ready,
            "nativeReadyOrPartial": native_ready,
            "existingNestPointers": sum(1 for item in pointers.values() if item.get("exists")),
            "existingSurfacePaths": sum(1 for item in surfaces.values() if item.get("exists")),
            "manuscriptMutations": 0,
            "canonicalWrites": 0,
        },
        "first48HourPlan": [
            "Make one web/Nest Daily Writing Desk route/card obvious and calm.",
            "Add visible save/snapshot/export/rollback state before Charlie writes serious new prose there.",
            "Create a native local-first capture/draft pad only after the persistence boundary is explicit.",
            "Use the same document-kernel/sidecar truth so web and native do not drift.",
            "Feed Tower with export packets only after human review; do not publish or canonize by accident.",
        ],
        "firstSafeAction": {},
        "nextSafestAction": "Make the web/Nest Daily Writing Desk the immediate daily driver, then build native local-first capture/drafting without creating a second manuscript truth.",
        "truth": truth,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    recommendation = payload["recommendation"]
    counts = payload["counts"]
    lines = [
        "# Daily Writing Desk readiness",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "## Recommendation",
        "",
        recommendation["decision"],
        "",
        "Why:",
    ]
    lines.extend(f"- {item}" for item in recommendation["why"])
    lines.extend([
        "",
        f"Native caution: {recommendation['notYet']}",
        "",
        "## Counts",
        "",
        f"- Requirements: `{counts['requirements']}`",
        f"- Web ready/partial: `{counts['webReadyOrPartial']}`",
        f"- Native ready/partial/natural-fit: `{counts['nativeReadyOrPartial']}`",
        f"- Existing Nest pointers: `{counts['existingNestPointers']}`",
        f"- Existing surface paths: `{counts['existingSurfacePaths']}`",
        "",
        "## Daily writing requirements",
        "",
        "| Requirement | Web/Nest | Native | Next |",
        "|---|---|---|---|",
    ])
    for item in payload["requirements"]:
        lines.append(f"| {item['label']} | `{item['webStatus']}` | `{item['nativeStatus']}` | {item['next']} |")
    lines.extend(["", "## First 48-hour plan", ""])
    lines.extend(f"{index}. {item}" for index, item in enumerate(payload["first48HourPlan"], start=1))
    lines.extend(["", "## Safety boundary", ""])
    lines.extend([
        "- This board is planning/readiness only.",
        "- It does not mutate manuscripts, source files, canonical content, public content, accounts, schedules, uploads, approvals, publications, or receipt truth.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    req_cards = []
    for item in payload["requirements"]:
        req_cards.append(f"""
        <article class="req">
          <p class="eyebrow">{esc(item['webStatus'])} web · {esc(item['nativeStatus'])} native</p>
          <h3>{esc(item['label'])}</h3>
          <p>{esc(item['why'])}</p>
          <p class="next">{esc(item['next'])}</p>
        </article>
        """)
    sources = "".join(f"<li><a href=\"{esc(src['url'])}\">{esc(src['source'])}</a>: {esc(src['lesson'])}</li>" for src in payload["research"])
    counts = payload["counts"]
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Daily Writing Desk readiness</title>
<style>
:root {{ color-scheme:dark; --soil:#17130e; --moss:#1f3327; --leaf:#8fd694; --gold:#ecc85a; --cream:#fff2cf; --bark:#8c6d45; --clay:#c8754a; --line:#41573f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 20% 0%,rgba(143,214,148,.18),transparent 28%),linear-gradient(135deg,#111810,#241b13); color:var(--cream); }}
main {{ max-width:1240px; margin:0 auto; padding:38px 24px 88px; }}
header,.panel {{ border:1px solid var(--line); border-radius:30px; background:rgba(31,51,39,.91); box-shadow:0 20px 56px rgba(0,0,0,.28); padding:26px; margin:18px 0; }}
h1 {{ font-size:clamp(42px,7vw,82px); line-height:.9; margin:.1em 0 .25em; }}
h2,h3 {{ margin:.2rem 0 .6rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; }}
.req {{ border:1px solid rgba(143,214,148,.25); border-radius:20px; padding:16px; background:rgba(14,22,16,.74); }}
.next {{ color:var(--leaf); font-weight:700; }}
.counts {{ display:flex; flex-wrap:wrap; gap:10px; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:9px 13px; background:rgba(0,0,0,.18); }}
a {{ color:var(--leaf); }}
</style></head><body><main>
<header>
  <p class="eyebrow">Quipsly Nest · writing decision</p>
  <h1>Write in Nest web first. Build native local-first next.</h1>
  <p>{esc(payload['recommendation']['decision'])}</p>
  <div class="counts">
    <span class="pill">{counts['requirements']} requirements</span>
    <span class="pill">{counts['webReadyOrPartial']} web ready/partial</span>
    <span class="pill">{counts['nativeReadyOrPartial']} native ready/partial</span>
    <span class="pill">{counts['existingNestPointers']} Nest pointers</span>
  </div>
</header>
<section class="panel"><p class="eyebrow">Why</p><ul>{''.join(f'<li>{esc(item)}</li>' for item in payload['recommendation']['why'])}</ul><p><b>Caution:</b> {esc(payload['recommendation']['notYet'])}</p></section>
<section class="panel"><p class="eyebrow">Requirements</p><div class="grid">{''.join(req_cards)}</div></section>
<section class="panel"><p class="eyebrow">First 48 hours</p><ol>{''.join(f'<li>{esc(item)}</li>' for item in payload['first48HourPlan'])}</ol></section>
<section class="panel"><p class="eyebrow">Research signals</p><ul>{sources}</ul></section>
<section class="panel"><p class="eyebrow">Safety</p><p>Readiness/planning only. No manuscript/source/canon/publication/account/receipt mutation.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def main() -> None:
    payload = build()
    session_dir = OUT_ROOT / stamp()
    html_path = session_dir / "index.html"
    json_path = session_dir / "daily-writing-desk-readiness.json"
    markdown_path = session_dir / "START-HERE-daily-writing-readiness.md"
    payload.update({
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Daily Writing Desk readiness",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local writing-readiness board only. No manuscript, source, canon, public content, account, schedule, upload, approval, publication, overwrite, delete, or receipt mutation.",
    }
    session_dir.mkdir(parents=True, exist_ok=True)
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    write_json(LATEST_POINTER, payload)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "counts": payload["counts"],
        "firstSafeAction": payload["firstSafeAction"],
        "recommendation": payload["recommendation"]["decision"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
