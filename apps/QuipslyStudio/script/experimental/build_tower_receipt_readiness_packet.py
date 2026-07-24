#!/usr/bin/env python3
"""Build a local Tower receipt-readiness packet.

This packet is a handoff map between local review readiness, explicit human
approval, manual external posting, and receipt capture. It never publishes,
uploads, schedules, approves, or records a live receipt. Its job is to make the
next safe publishing move obvious without flattening "ready" into "posted".
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower-receipt-readiness-packet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-receipt-readiness")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                resolved = load_json(target, _depth=1)
                if resolved:
                    return {**payload, **resolved}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_open_command(path: str) -> str:
    return f"open {shell_quote(path)}" if path else ""


def handoff_state(item: dict[str, Any]) -> tuple[str, str, str]:
    stage = str(item.get("stage") or "")
    if stage == "receipt-captured":
        return (
            "receipt-captured",
            "Receipt captured",
            "Verify the real URL/provider ID, then wait for analytics instead of inventing performance.",
        )
    if stage == "ready-for-approval":
        return (
            "ready-for-explicit-approval",
            "Ready for explicit approval",
            "Human approval may be requested for this exact row. External posting and receipt capture still require the real platform action.",
        )
    if bool(item.get("localMetadataReady")):
        return (
            "review-blocked-with-local-packet",
            "Review blocked, packet ready",
            "Open the local metadata/checklist, clear review/warning gates, then ask for explicit approval.",
        )
    return (
        "packet-needs-repair",
        "Packet needs repair",
        "Repair platform metadata/checklist before asking for approval or preparing receipts.",
    )


def required_proof_for(platform: str) -> list[str]:
    lowered = platform.lower()
    base = ["real public or private platform URL", "provider id if the platform exposes one", "posted-at timestamp", "captured-by reviewer"]
    if "podcast" in lowered or "rss" in lowered:
        return ["RSS item URL or hosting dashboard URL", "episode guid/provider id if available", "published-at timestamp", "captured-by reviewer"]
    if "youtube" in lowered:
        return ["YouTube watch/short URL", "video id", "published or scheduled timestamp", "captured-by reviewer"]
    if "instagram" in lowered or "facebook" in lowered or "linkedin" in lowered:
        return ["post/reel URL", "post id if available", "posted or scheduled timestamp", "captured-by reviewer"]
    if "patreon" in lowered:
        return ["Patreon post URL", "post id if available", "publish/schedule timestamp", "captured-by reviewer"]
    return base


def normalize_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    state, label, next_action = handoff_state(item)
    platform = str(item.get("platform") or "Unknown platform")
    episode = str(item.get("episode") or "unknown")
    review_command = str(item.get("reviewCommandTemplate") or "")
    review_dry_run = str(item.get("reviewDryRunCommandTemplate") or "")
    receipt_command = str(item.get("receiptCommandTemplate") or "")
    receipt_dry_run = str(item.get("receiptDryRunCommandTemplate") or "")
    url = str(item.get("url") or "")
    provider_id = str(item.get("providerId") or "")
    return {
        "id": f"tower-receipt-{index:03d}-episode-{episode}-{platform.lower().replace('/', '-').replace(' ', '-')}",
        "episode": episode,
        "platform": platform,
        "version": str(item.get("version") or ""),
        "stage": str(item.get("stage") or ""),
        "stageLabel": str(item.get("stageLabel") or ""),
        "handoffState": state,
        "handoffLabel": label,
        "nextSafestAction": next_action,
        "localMetadataReady": bool(item.get("localMetadataReady")),
        "receiptCaptured": bool(url or provider_id),
        "url": url,
        "providerId": provider_id,
        "metadataPath": str(item.get("metadataPath") or ""),
        "checklistPath": str(item.get("checklistPath") or ""),
        "uploadJobPath": str(item.get("uploadJobPath") or ""),
        "openMetadataCommand": str(item.get("openMetadataCommand") or file_open_command(str(item.get("metadataPath") or ""))),
        "openChecklistCommand": str(item.get("openChecklistCommand") or file_open_command(str(item.get("checklistPath") or ""))),
        "reviewDryRunCommandTemplate": review_dry_run,
        "reviewCommandTemplate": review_command,
        "receiptDryRunCommandTemplate": receipt_dry_run,
        "receiptCommandTemplate": receipt_command,
        "receiptCommandSafety": str(
            item.get("receiptCommandSafety")
            or "Dry-run first. Capture a receipt only after explicit approval and real external proof."
        ),
        "requiredExternalProof": required_proof_for(platform),
        "notAllowedHere": [
            "publishing",
            "uploading",
            "scheduling",
            "account mutation",
            "fake receipt creation",
            "claiming publication from local readiness",
        ],
        "truth": "This row is local readiness guidance only. It is not approval, publication, schedule truth, upload truth, or receipt truth.",
    }


def load_social_packet(release_root: Path) -> dict[str, Any]:
    pointer = release_root / "tower-social-command-center" / "latest-tower-social-command-center.json"
    packet = load_json(pointer)
    if not packet:
        raise SystemExit("No Tower social command center packet found. Run ./script/agentctl.sh tower-social-command-center first.")
    return packet


def build_packet(release_root: Path) -> dict[str, Any]:
    social = load_social_packet(release_root)
    manual = load_json(release_root / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json")
    control = load_json(release_root / "latest-tower-publication-control-room.json")
    source_items = social.get("items") if isinstance(social.get("items"), list) else []
    items = [normalize_item(item, index + 1) for index, item in enumerate(source_items) if isinstance(item, dict)]
    by_state: dict[str, int] = {}
    by_platform: dict[str, int] = {}
    for item in items:
        by_state[item["handoffState"]] = by_state.get(item["handoffState"], 0) + 1
        by_platform[item["platform"]] = by_platform.get(item["platform"], 0) + 1
    ready_rows = [item for item in items if item["handoffState"] == "ready-for-explicit-approval"]
    review_rows = [item for item in items if item["handoffState"].startswith("review-blocked")]
    repair_rows = [item for item in items if item["handoffState"] == "packet-needs-repair"]
    captured_rows = [item for item in items if item["handoffState"] == "receipt-captured"]
    start_here = (review_rows or repair_rows or ready_rows or captured_rows)[:12]
    counts = {
        "items": len(items),
        "platforms": len(by_platform),
        "readyForExplicitApproval": len(ready_rows),
        "reviewBlockedWithPacket": len(review_rows),
        "packetNeedsRepair": len(repair_rows),
        "receiptCaptured": len(captured_rows),
        "receiptSlots": len(items),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "status": "tower-receipt-readiness-ready",
        "humanAsk": "Use this packet after review work to decide what can be manually posted, what proof is required, and where receipt truth still does not exist.",
        "agentSafeParallelWork": "Codex may inspect packets, validate local files, prepare approval requests, and dry-run receipt command syntax. Do not publish, upload, schedule, mutate accounts, or create live receipts.",
        "nextSafestAction": (
            "Clear review-blocked packet rows before asking for approval."
            if review_rows
            else "Ask for explicit approval on ready rows; after real external posting, capture receipts with a dry-run first."
        ),
        "truth": "Local readiness packet only. Approval, external posting, schedule state, and receipt truth remain separate.",
        "publicationTruthContract": {
            "localReadinessIsNotPublication": True,
            "humanApprovalIsNotReceipt": True,
            "receiptRequiresRealExternalProof": True,
            "analyticsRequireRealPlatformData": True,
        },
        "counts": counts,
        "byHandoffState": by_state,
        "byPlatform": by_platform,
        "startHereRows": start_here,
        "firstReviewBlockedRow": review_rows[0] if review_rows else {},
        "firstReadyForExplicitApprovalRow": ready_rows[0] if ready_rows else {},
        "firstPacketRepairRow": repair_rows[0] if repair_rows else {},
        "firstCapturedReceiptRow": captured_rows[0] if captured_rows else {},
        "manualPublishingWorkflow": social.get("manualPublishingWorkflow") or [],
        "sourceSocialCommandCenter": {
            "jsonPath": str(social.get("jsonPath") or ""),
            "htmlPath": str(social.get("htmlPath") or ""),
            "markdownPath": str(social.get("markdownPath") or ""),
            "counts": social.get("counts") if isinstance(social.get("counts"), dict) else {},
        },
        "sourceManualPacketBoard": {
            "jsonPath": str(manual.get("jsonPath") or ""),
            "htmlPath": str(manual.get("htmlPath") or ""),
            "markdownPath": str(manual.get("markdownPath") or ""),
            "counts": manual.get("counts") if isinstance(manual.get("counts"), dict) else {},
        },
        "sourcePublicationControlRoom": {
            "jsonPath": str(control.get("jsonPath") or ""),
            "htmlPath": str(control.get("htmlPath") or ""),
            "markdownPath": str(control.get("markdownPath") or ""),
            "counts": control.get("counts") if isinstance(control.get("counts"), dict) else {},
        },
        "items": items,
    }


def write_csv(packet: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "id",
        "episode",
        "platform",
        "version",
        "handoffState",
        "stage",
        "localMetadataReady",
        "receiptCaptured",
        "metadataPath",
        "checklistPath",
        "reviewDryRunCommandTemplate",
        "receiptDryRunCommandTemplate",
        "nextSafestAction",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in packet["items"]:
            writer.writerow({field: item.get(field, "") for field in fields})


def write_markdown(packet: dict[str, Any], path: Path) -> None:
    lines = [
        "# Tower receipt readiness packet",
        "",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Status: `{packet['status']}`",
        f"- Receipt slots: `{packet['counts']['receiptSlots']}`",
        f"- Ready for explicit approval: `{packet['counts']['readyForExplicitApproval']}`",
        f"- Review blocked with local packet: `{packet['counts']['reviewBlockedWithPacket']}`",
        f"- Packet needs repair: `{packet['counts']['packetNeedsRepair']}`",
        f"- Receipt captured: `{packet['counts']['receiptCaptured']}`",
        "",
        packet["truth"],
        "",
        "## Start here",
        "",
    ]
    for item in packet["startHereRows"]:
        lines.extend([
            f"### Episode {item['episode']} - {item['platform']}",
            "",
            f"- Handoff: `{item['handoffLabel']}`",
            f"- Stage: `{item['stage']}`",
            f"- Next safest action: {item['nextSafestAction']}",
            f"- Metadata: `{item['metadataPath'] or 'missing'}`",
            f"- Checklist: `{item['checklistPath'] or 'missing'}`",
            f"- Review dry-run: `{item['reviewDryRunCommandTemplate']}`",
            f"- Receipt dry-run template: `{item['receiptDryRunCommandTemplate']}`",
            f"- Receipt command safety: {item['receiptCommandSafety']}",
            "- Required proof: " + ", ".join(item["requiredExternalProof"]),
            "",
        ])
    lines.extend([
        "## Non-negotiable truth boundary",
        "",
        "- Local metadata ready does not mean published.",
        "- Human approval does not mean posted.",
        "- A receipt requires real external URL/provider proof.",
        "- Analytics require real platform data.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def write_html(packet: dict[str, Any], path: Path) -> None:
    rows = "\n".join(
        f"""
        <article class="card {esc(item['handoffState'])}">
          <p class="eyebrow">Episode {esc(item['episode'])} · {esc(item['platform'])}</p>
          <h2>{esc(item['handoffLabel'])}</h2>
          <p>{esc(item['nextSafestAction'])}</p>
          <dl>
            <dt>Stage</dt><dd>{esc(item['stage'])}</dd>
            <dt>Metadata</dt><dd>{esc(item['metadataPath'] or 'missing')}</dd>
            <dt>Checklist</dt><dd>{esc(item['checklistPath'] or 'missing')}</dd>
          </dl>
          <details><summary>Review dry-run</summary><pre><code>{esc(item['reviewDryRunCommandTemplate'])}</code></pre></details>
          <details><summary>Receipt dry-run template</summary><pre><code>{esc(item['receiptDryRunCommandTemplate'])}</code></pre></details>
          <p class="truth">{esc(item['receiptCommandSafety'])}</p>
        </article>
        """
        for item in packet["startHereRows"]
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower receipt readiness</title>
  <style>
    :root {{ color-scheme: dark; --bg:#121713; --panel:#1b241c; --ink:#f8efd9; --muted:#baa98c; --honey:#f3c75f; --leaf:#8dbb73; --clay:#d56b52; --line:rgba(255,255,255,.12); }}
    body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; background:radial-gradient(circle at top left,rgba(141,187,115,.18),transparent 36rem),var(--bg); color:var(--ink); }}
    main {{ max-width:1180px; margin:0 auto; padding:40px 22px 70px; }}
    .hero {{ border:1px solid var(--line); background:rgba(27,36,28,.88); border-radius:28px; padding:28px; box-shadow:0 24px 70px rgba(0,0,0,.28); }}
    .eyebrow {{ color:var(--honey); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
    h1 {{ margin:.1rem 0 1rem; font-size:clamp(36px,6vw,72px); line-height:.92; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:20px 0; }}
    .metric {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.05); }}
    .metric b {{ display:block; font-size:28px; color:var(--honey); }}
    .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin-top:24px; }}
    .card {{ border:1px solid var(--line); background:rgba(255,255,255,.045); border-radius:22px; padding:18px; }}
    .card.ready-for-explicit-approval {{ border-color:rgba(141,187,115,.65); }}
    .card.packet-needs-repair {{ border-color:rgba(213,107,82,.65); }}
    h2 {{ margin:.1rem 0 .4rem; }}
    dl {{ display:grid; grid-template-columns:90px 1fr; gap:6px 12px; color:var(--muted); }}
    dt {{ color:var(--honey); font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow:auto; background:#0c100d; padding:12px; border-radius:12px; }}
    .truth {{ color:var(--muted); font-weight:800; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Tower</p>
    <h1>Receipt readiness without fake done.</h1>
    <p>{esc(packet['humanAsk'])}</p>
    <div class="grid">
      <div class="metric"><b>{packet['counts']['receiptSlots']}</b><span>receipt slots</span></div>
      <div class="metric"><b>{packet['counts']['reviewBlockedWithPacket']}</b><span>review blocked</span></div>
      <div class="metric"><b>{packet['counts']['readyForExplicitApproval']}</b><span>approval-ready</span></div>
      <div class="metric"><b>{packet['counts']['receiptCaptured']}</b><span>receipts captured</span></div>
    </div>
    <p class="truth">{esc(packet['truth'])}</p>
  </section>
  <section class="cards">{rows}</section>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def write_outputs(packet: dict[str, Any], release_root: Path) -> dict[str, Any]:
    session_dir = release_root / "tower-receipt-readiness" / stamp()
    json_path = session_dir / "tower-receipt-readiness-packet.json"
    markdown_path = session_dir / "START-HERE-tower-receipt-readiness.md"
    html_path = session_dir / "tower-receipt-readiness-packet.html"
    csv_path = session_dir / "tower-receipt-readiness-packet.csv"
    packet = {
        **packet,
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Tower receipt readiness packet",
            "command": file_open_command(str(html_path)),
            "path": str(html_path),
            "safety": "Opens a local handoff packet only. No publication, schedule, upload, approval, account mutation, or receipt capture.",
        },
    }
    write_json(json_path, packet)
    write_markdown(packet, markdown_path)
    write_html(packet, html_path)
    write_csv(packet, csv_path)
    pointer = release_root / "tower-receipt-readiness" / "latest-tower-receipt-readiness-packet.json"
    write_json(pointer, {
        "schema": SCHEMA,
        "generatedAt": packet["generatedAt"],
        "status": packet["status"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "counts": packet["counts"],
        "firstSafeAction": packet["firstSafeAction"],
        "truth": packet["truth"],
    })
    root_pointer = release_root / "latest-tower-receipt-readiness-packet.json"
    write_json(root_pointer, load_json(pointer))
    return packet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    release_root = Path(args.release_root)
    packet = write_outputs(build_packet(release_root), release_root)
    print(json.dumps({
        "ok": True,
        "status": packet["status"],
        "jsonPath": packet["jsonPath"],
        "htmlPath": packet["htmlPath"],
        "counts": packet["counts"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
