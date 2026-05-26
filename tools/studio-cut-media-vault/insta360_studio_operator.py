#!/usr/bin/env python3
"""Local Insta360 Studio operator helper for Studio Cut.

This script uses macOS app launching and Accessibility UI scripting to help an
operator initiate Insta360 Studio downloads into a local buffer folder. It does
not store credentials and does not delete cloud files.
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import media_vault


APP_NAME = "Insta360 Studio"
DEFAULT_PROJECT_ID = "episode-004"
DEFAULT_COLLECTION_ID = "homer-insta360"
ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def default_download_dir(project_id: str) -> Path:
    return Path.home() / "Movies" / "StudioCut" / project_id / "insta360-downloads"


def default_operator_dir(project_id: str) -> Path:
    return Path.home() / "Movies" / "StudioCut" / project_id / "insta360-operator"


def app_candidates() -> list[Path]:
    return [
        Path("/Applications/Insta360 Studio.app"),
        Path.home() / "Applications" / "Insta360 Studio.app",
    ]


def find_app() -> Path | None:
    for candidate in app_candidates():
        if candidate.exists():
            return candidate
    return None


def run_capture(command: list[str], timeout_seconds: int = 20) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", f"Command timed out after {timeout_seconds}s: {' '.join(command)}"


def osascript_available() -> bool:
    return shutil.which("osascript") is not None


def run_osascript(script: str, timeout_seconds: int = 20) -> tuple[int, str, str]:
    osascript_path = shutil.which("osascript")
    if not osascript_path:
        return 127, "", "osascript is not available on PATH."
    return run_capture([osascript_path, "-e", script], timeout_seconds=timeout_seconds)


def applescript_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def accessibility_status() -> dict[str, Any]:
    if platform.system() != "Darwin":
        return {
            "available": False,
            "enabled": False,
            "message": "macOS Accessibility UI scripting is only available on Darwin/macOS.",
        }
    if not osascript_available():
        return {
            "available": False,
            "enabled": False,
            "message": "osascript is not available.",
        }
    status, stdout, stderr = run_osascript(
        'tell application "System Events" to return UI elements enabled',
        timeout_seconds=5,
    )
    enabled = stdout.lower() == "true"
    return {
        "available": status == 0,
        "enabled": enabled,
        "stdout": stdout,
        "stderr": stderr,
        "message": (
            "Accessibility is enabled."
            if enabled
            else "Enable Terminal/Codex under System Settings > Privacy & Security > Accessibility, or approve the macOS prompt."
        ),
    }


def build_doctor_report() -> dict[str, Any]:
    app_path = find_app()
    access = accessibility_status()
    report = {
        "status": "ready" if app_path and osascript_available() and access["enabled"] else "blocked",
        "platform": platform.platform(),
        "appName": APP_NAME,
        "appPath": str(app_path) if app_path else None,
        "osascriptPath": shutil.which("osascript"),
        "openPath": shutil.which("open"),
        "gcloudPath": shutil.which("gcloud"),
        "accessibility": access,
        "accessibilitySettingsUrl": ACCESSIBILITY_SETTINGS_URL,
        "warnings": [],
    }
    if not app_path:
        report["warnings"].append("Install Insta360 Studio or move it to /Applications.")
    if not report["accessibility"]["enabled"]:
        report["warnings"].append("UI automation commands need macOS Accessibility permission.")
    return report


def build_drain_command(
    *,
    download_dir: Path,
    project_id: str,
    collection_id: str,
    execute: bool,
    delete_local_after_upload: bool,
) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "drain-folder",
        "--source-dir",
        str(download_dir),
        "--project-id",
        project_id,
        "--collection-id",
        collection_id,
        "--watch",
    ]
    if execute:
        parts.append("--execute")
    if delete_local_after_upload:
        parts.append("--delete-local-after-upload")
    return " ".join(shell_quote(part) for part in parts)


def default_ledger_path(download_dir: Path) -> Path:
    return download_dir / ".studio-cut-media-vault-ledger.jsonl"


def build_storage_preflight_command(*, download_dir: Path) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "storage-preflight",
        "--source-dir",
        str(download_dir),
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_open_accessibility_settings_command() -> str:
    parts = [
        "pnpm",
        "studio-cut:insta360-operator",
        "open-accessibility-settings",
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_ledger_summary_command(*, ledger_path: Path) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "ledger-summary",
        "--ledger",
        str(ledger_path),
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_verify_ledger_cloud_command(*, ledger_path: Path) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "verify-ledger-cloud",
        "--ledger",
        str(ledger_path),
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_vault_receipt_command(*, ledger_path: Path) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "vault-receipt",
        "--ledger",
        str(ledger_path),
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_cloud_prefix_inventory_command(
    *,
    operator_dir: Path,
    project_id: str,
    collection_id: str,
) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "cloud-prefix-inventory",
        "--project-id",
        project_id,
        "--collection-id",
        collection_id,
        "--out",
        str(operator_dir / "cloud-prefix-inventory.json"),
        "--csv-out",
        str(operator_dir / "cloud-prefix-inventory.csv"),
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_migration_report_command(
    *,
    download_dir: Path,
    project_id: str,
    collection_id: str,
) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "migration-report",
        "--source-dir",
        str(download_dir),
        "--project-id",
        project_id,
        "--collection-id",
        collection_id,
        "--include-cloud",
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_status_page_command(
    *,
    download_dir: Path,
    operator_dir: Path,
    project_id: str,
    collection_id: str,
) -> str:
    parts = [
        "pnpm",
        "studio-cut:media-vault",
        "--",
        "migration-status-page",
        "--source-dir",
        str(download_dir),
        "--project-id",
        project_id,
        "--collection-id",
        collection_id,
        "--out-dir",
        str(operator_dir / "status-page"),
        "--include-cloud",
        "--watch",
        "--open",
        "--continue-on-error",
    ]
    return " ".join(shell_quote(part) for part in parts)


def build_operator_dashboard_command(
    *,
    download_dir: Path,
    operator_dir: Path,
    project_id: str,
    collection_id: str,
) -> str:
    parts = [
        "pnpm",
        "studio-cut:insta360-operator",
        "operator-dashboard",
        "--project-id",
        project_id,
        "--collection-id",
        collection_id,
        "--download-dir",
        str(download_dir),
        "--operator-dir",
        str(operator_dir),
        "--include-cloud",
        "--watch",
        "--open",
        "--continue-on-error",
        "--allow-blocked",
    ]
    return " ".join(shell_quote(part) for part in parts)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def open_studio_command(args: argparse.Namespace) -> int:
    app_path = find_app()
    if not app_path:
        print("Insta360 Studio.app was not found in /Applications or ~/Applications.", file=sys.stderr)
        return 1
    status = subprocess.run(["open", "-a", APP_NAME], check=False).returncode
    print(json.dumps({"status": "ready" if status == 0 else "blocked", "appPath": str(app_path)}, indent=2))
    return status


def open_accessibility_settings_command(_: argparse.Namespace) -> int:
    open_path = shutil.which("open")
    if not open_path:
        print("open is not available on PATH.", file=sys.stderr)
        return 1
    status = subprocess.run([open_path, ACCESSIBILITY_SETTINGS_URL], check=False).returncode
    print(
        json.dumps(
            {
                "status": "ready" if status == 0 else "blocked",
                "settingsUrl": ACCESSIBILITY_SETTINGS_URL,
                "nextStep": "Enable Terminal/Codex under Privacy & Security > Accessibility, then rerun `pnpm studio-cut:insta360-operator doctor`.",
            },
            indent=2,
        )
    )
    return status


def doctor_command(_: argparse.Namespace) -> int:
    report = build_doctor_report()
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ready" else 1


def operator_dashboard_html(*, report_file_name: str, refresh_seconds: int) -> str:
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Studio Cut Insta360 Operator</title>
  <style>
    :root {{
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;
      background: #f6f3ef;
      color: #1e2528;
    }}
    body {{
      margin: 0;
      padding: 28px;
      background: #f6f3ef;
    }}
    main {{
      max-width: 1180px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      border-bottom: 1px solid #d9d1c7;
      padding-bottom: 16px;
    }}
    h1 {{
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }}
    .subtle {{
      color: #626b70;
      font-size: 13px;
    }}
    .grid {{
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }}
    .panel {{
      background: #fffdfa;
      border: 1px solid #d9d1c7;
      border-radius: 8px;
      padding: 16px;
      min-width: 0;
    }}
    .wide {{
      grid-column: 1 / -1;
    }}
    .label {{
      color: #626b70;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .value {{
      font-size: 28px;
      font-weight: 750;
      line-height: 1;
      margin-bottom: 6px;
    }}
    .status {{
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 700;
      background: #e9efe7;
      color: #24552b;
    }}
    .status.blocked {{
      background: #f8e4df;
      color: #7e2e1f;
    }}
    .status.active {{
      background: #e5edf7;
      color: #274e7a;
    }}
    pre {{
      margin: 0;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }}
    ul {{
      margin: 0;
      padding-left: 18px;
    }}
    li + li {{
      margin-top: 6px;
    }}
    code {{
      font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1ede7;
      border-radius: 4px;
      padding: 1px 4px;
    }}
    @media (prefers-color-scheme: dark) {{
      :root, body {{
        background: #151819;
        color: #f4eee7;
      }}
      header, .panel {{
        border-color: #343b40;
      }}
      .panel {{
        background: #1f2427;
      }}
      .subtle, .label {{
        color: #aeb8bd;
      }}
      code {{
        background: #2a3034;
      }}
    }}
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Studio Cut Insta360 Operator</h1>
      <div class=\"subtle\" id=\"createdAt\">Waiting for report...</div>
    </div>
    <div id=\"overallStatus\" class=\"status\">Loading</div>
  </header>

  <section class=\"grid\">
    <article class=\"panel\">
      <div class=\"label\">Migration State</div>
      <div class=\"value\" id=\"migrationState\">...</div>
      <div class=\"subtle\" id=\"migrationDetail\"></div>
    </article>
    <article class=\"panel\">
      <div class=\"label\">Local Buffer</div>
      <div class=\"value\" id=\"localFileCount\">...</div>
      <div class=\"subtle\" id=\"localBytes\"></div>
    </article>
    <article class=\"panel\">
      <div class=\"label\">Cloud Prefix</div>
      <div class=\"value\" id=\"cloudObjectCount\">...</div>
      <div class=\"subtle\" id=\"cloudBytes\"></div>
    </article>
    <article class=\"panel\">
      <div class=\"label\">Free Disk</div>
      <div class=\"value\" id=\"freeGb\">...</div>
      <div class=\"subtle\">download buffer disk space</div>
    </article>
  </section>

  <section class=\"grid\">
    <article class=\"panel\">
      <div class=\"label\">UI Automation</div>
      <div id=\"accessibilityStatus\" class=\"status\">...</div>
      <p class=\"subtle\" id=\"accessibilityMessage\"></p>
    </article>
    <article class=\"panel\">
      <div class=\"label\">Next Actions</div>
      <ul id=\"nextActions\"></ul>
    </article>
    <article class=\"panel wide\">
      <div class=\"label\">Current Paths</div>
      <pre id=\"paths\"></pre>
    </article>
    <article class=\"panel wide\">
      <div class=\"label\">Useful Commands</div>
      <pre id=\"commands\"></pre>
    </article>
    <article class=\"panel wide\">
      <div class=\"label\">Warnings And Errors</div>
      <ul id=\"warnings\"></ul>
    </article>
  </section>
</main>
<script>
const reportUrl = {json.dumps(report_file_name)};
const refreshSeconds = {int(refresh_seconds)};
function bytes(value) {{
  if (value === null || value === undefined) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value || 0);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {{
    size = size / 1024;
    unit += 1;
  }}
  return `${{size.toFixed(unit === 0 ? 0 : 2)}} ${{units[unit]}}`;
}}
function setText(id, value) {{
  document.getElementById(id).textContent = value;
}}
function renderList(id, values) {{
  const node = document.getElementById(id);
  node.innerHTML = "";
  if (!values || values.length === 0) {{
    const item = document.createElement("li");
    item.textContent = "None";
    node.appendChild(item);
    return;
  }}
  for (const value of values) {{
    const item = document.createElement("li");
    item.textContent = value;
    node.appendChild(item);
  }}
}}
function statusClass(status, state) {{
  if (status === "blocked") return "status blocked";
  if (state === "pending-local-files") return "status active";
  return "status";
}}
async function refresh() {{
  try {{
    const response = await fetch(reportUrl + "?t=" + Date.now());
    const report = await response.json();
    const migration = report.migrationReport || {{}};
    const progress = migration.progress || {{}};
    const doctor = report.doctor || {{}};
    const accessibility = doctor.accessibility || {{}};
    const cloud = migration.cloudSummary || null;
    const localBuffer = migration.localBuffer || {{}};
    const overall = document.getElementById("overallStatus");
    overall.className = statusClass(report.status, report.state);
    overall.textContent = report.status === "blocked" ? "Needs attention" : "Ready";
    setText("createdAt", `Updated ${{report.createdAt || "unknown"}}`);
    setText("migrationState", migration.state || report.state || "unknown");
    setText("migrationDetail", `${{report.projectId || ""}} / ${{report.collectionId || ""}}`);
    setText("localFileCount", `${{progress.localFileCount ?? "n/a"}} files`);
    setText("localBytes", `${{bytes(localBuffer.totalBytes)}} local buffer`);
    setText("cloudObjectCount", cloud ? `${{cloud.objectCount}} objects` : "not listed");
    setText("cloudBytes", cloud ? `${{bytes(cloud.totalBytes)}} in bucket prefix` : "run with --include-cloud");
    setText("freeGb", `${{progress.freeGb ?? "n/a"}} GB`);
    const accessNode = document.getElementById("accessibilityStatus");
    accessNode.className = accessibility.enabled ? "status" : "status blocked";
    accessNode.textContent = accessibility.enabled ? "Enabled" : "Blocked";
    setText("accessibilityMessage", accessibility.message || "");
    renderList("nextActions", report.nextActions || []);
    renderList("warnings", [...(report.warnings || []), ...(report.errors || [])]);
    setText("paths", [
      `Download buffer: ${{report.downloadDir || ""}}`,
      `Operator dir: ${{report.operatorDir || ""}}`,
      `Ledger: ${{report.ledgerPath || ""}}`,
      `Cloud: ${{migration.cloudPrefix || ""}}`
    ].join("\\n"));
    setText("commands", Object.entries(report.commands || {{}})
      .map(([name, command]) => `${{name}}:\\n${{command}}`)
      .join("\\n\\n"));
  }} catch (error) {{
    const overall = document.getElementById("overallStatus");
    overall.className = "status blocked";
    overall.textContent = "Report unavailable";
    renderList("warnings", [String(error)]);
  }}
}}
refresh();
setInterval(refresh, refreshSeconds * 1000);
</script>
</body>
</html>
"""


def build_operator_dashboard_payload(args: argparse.Namespace) -> dict[str, Any]:
    download_dir = Path(args.download_dir).expanduser() if args.download_dir else default_download_dir(args.project_id)
    operator_dir = Path(args.operator_dir).expanduser() if args.operator_dir else default_operator_dir(args.project_id)
    ledger_path = Path(args.ledger).expanduser() if args.ledger else default_ledger_path(download_dir)
    doctor = build_doctor_report()
    migration_report = media_vault.build_migration_report_payload(
        source_dir=download_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
        bucket=args.bucket,
        storage_prefix=args.storage_prefix,
        ledger_path=ledger_path,
        settle_seconds=args.settle_seconds,
        min_free_gb=args.min_free_gb,
        allow_icloud=args.allow_icloud,
        max_files=args.max_files,
        include_cloud=args.include_cloud,
        cloud_max_objects=args.cloud_max_objects,
    )
    blockers: list[str] = []
    warnings = list(doctor.get("warnings", [])) + list(migration_report.get("warnings", []))
    errors = list(migration_report.get("errors", []))
    if doctor["status"] != "ready":
        blockers.append("Mac Accessibility is not enabled, so Codex cannot click Insta360 Studio controls yet.")
    if migration_report["status"] != "ready":
        blockers.append("Migration report is blocked; inspect errors before trusting the watcher.")

    progress = migration_report["progress"]
    state = migration_report["state"]
    next_actions: list[str] = []
    if blockers:
        next_actions.extend(blockers)
    if state == "watching-empty-buffer":
        next_actions.append("In Insta360 Studio, select cloud files and start downloading originals into the watched buffer.")
    elif state == "pending-local-files":
        next_actions.append("Leave the watcher running until local files settle, upload, verify, and clear.")
    elif state == "drained":
        next_actions.append("Run the vault receipt and manually delete matching remote Insta360 files only after verification.")
    if progress["manualRemoteDeletionPendingCount"] > 0:
        next_actions.append("Review manual remote deletion queue before deleting anything from Insta360 Cloud.")

    commands = {
        "openAccessibilitySettings": build_open_accessibility_settings_command(),
        "openInsta360Studio": "pnpm studio-cut:insta360-operator open-studio",
        "migrationReport": build_migration_report_command(
            download_dir=download_dir,
            project_id=args.project_id,
            collection_id=args.collection_id,
        ),
        "statusPage": build_status_page_command(
            download_dir=download_dir,
            operator_dir=operator_dir,
            project_id=args.project_id,
            collection_id=args.collection_id,
        ),
        "operatorDashboard": build_operator_dashboard_command(
            download_dir=download_dir,
            operator_dir=operator_dir,
            project_id=args.project_id,
            collection_id=args.collection_id,
        ),
        "drainWatcher": build_drain_command(
            download_dir=download_dir,
            project_id=args.project_id,
            collection_id=args.collection_id,
            execute=True,
            delete_local_after_upload=True,
        ),
        "vaultReceipt": build_vault_receipt_command(ledger_path=ledger_path),
    }
    return {
        "command": "operator-dashboard",
        "status": "blocked" if blockers or errors else "ready",
        "state": "blocked" if blockers or errors else state,
        "createdAt": utc_now_iso(),
        "projectId": args.project_id,
        "collectionId": args.collection_id,
        "downloadDir": str(download_dir),
        "operatorDir": str(operator_dir),
        "ledgerPath": str(ledger_path),
        "doctor": doctor,
        "migrationReport": migration_report,
        "commands": commands,
        "nextActions": next_actions,
        "warnings": warnings,
        "errors": errors,
    }


def write_operator_dashboard(args: argparse.Namespace) -> dict[str, Any]:
    operator_dir = Path(args.operator_dir).expanduser() if args.operator_dir else default_operator_dir(args.project_id)
    out_dir = Path(args.out_dir).expanduser() if args.out_dir else operator_dir / "operator-dashboard"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "operator-status.json"
    html_path = out_dir / "index.html"
    payload = build_operator_dashboard_payload(args)
    report_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    html_path.write_text(
        operator_dashboard_html(
            report_file_name=report_path.name,
            refresh_seconds=args.refresh_seconds,
        ),
        encoding="utf-8",
    )
    return {
        "status": payload["status"],
        "state": payload["state"],
        "htmlPath": str(html_path),
        "reportPath": str(report_path),
        "progress": payload["migrationReport"]["progress"],
        "nextActions": payload["nextActions"],
        "warnings": payload["warnings"],
        "errors": payload["errors"],
    }


def operator_dashboard_command(args: argparse.Namespace) -> int:
    result = write_operator_dashboard(args)
    html_path = Path(result["htmlPath"])
    if args.open:
        webbrowser.open(html_path.resolve().as_uri())
    print(json.dumps(result, indent=2))
    if not args.watch:
        return 0 if result["status"] == "ready" or args.allow_blocked else 1
    while True:
        time.sleep(max(1, args.poll_seconds))
        result = write_operator_dashboard(args)
        print(json.dumps(result, indent=2))
        if result["status"] == "blocked" and not args.continue_on_error:
            return 1


def prepare_session_command(args: argparse.Namespace) -> int:
    download_dir = Path(args.download_dir).expanduser() if args.download_dir else default_download_dir(args.project_id)
    operator_dir = Path(args.operator_dir).expanduser() if args.operator_dir else default_operator_dir(args.project_id)
    operator_dir.mkdir(parents=True, exist_ok=True)
    download_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = default_ledger_path(download_dir)

    drain_command = build_drain_command(
        download_dir=download_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
        execute=True,
        delete_local_after_upload=True,
    )
    dry_run_command = build_drain_command(
        download_dir=download_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
        execute=False,
        delete_local_after_upload=False,
    )
    accessibility_command_text = build_open_accessibility_settings_command()
    preflight_command = build_storage_preflight_command(download_dir=download_dir)
    ledger_summary_command_text = build_ledger_summary_command(ledger_path=ledger_path)
    verify_ledger_cloud_command_text = build_verify_ledger_cloud_command(ledger_path=ledger_path)
    vault_receipt_command_text = build_vault_receipt_command(ledger_path=ledger_path)
    cloud_prefix_inventory_command_text = build_cloud_prefix_inventory_command(
        operator_dir=operator_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
    )
    migration_report_command_text = build_migration_report_command(
        download_dir=download_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
    )
    status_page_command_text = build_status_page_command(
        download_dir=download_dir,
        operator_dir=operator_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
    )
    operator_dashboard_command_text = build_operator_dashboard_command(
        download_dir=download_dir,
        operator_dir=operator_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
    )

    run_preflight_path = operator_dir / "run-preflight.sh"
    run_preflight_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                preflight_command,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_preflight_path.chmod(0o755)

    run_accessibility_path = operator_dir / "run-open-accessibility-settings.sh"
    run_accessibility_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                accessibility_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_accessibility_path.chmod(0o755)

    run_drain_path = operator_dir / "run-drain.sh"
    run_drain_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                drain_command,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_drain_path.chmod(0o755)

    run_ledger_summary_path = operator_dir / "run-ledger-summary.sh"
    run_ledger_summary_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                ledger_summary_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_ledger_summary_path.chmod(0o755)

    run_migration_report_path = operator_dir / "run-migration-report.sh"
    run_migration_report_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                migration_report_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_migration_report_path.chmod(0o755)

    run_status_page_path = operator_dir / "run-status-page.sh"
    run_status_page_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                status_page_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_status_page_path.chmod(0o755)

    run_operator_dashboard_path = operator_dir / "run-operator-dashboard.sh"
    run_operator_dashboard_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                operator_dashboard_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_operator_dashboard_path.chmod(0o755)

    run_verify_cloud_path = operator_dir / "run-verify-ledger-cloud.sh"
    run_verify_cloud_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                verify_ledger_cloud_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_vault_receipt_path = operator_dir / "run-vault-receipt.sh"
    run_vault_receipt_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                vault_receipt_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_vault_receipt_path.chmod(0o755)
    run_verify_cloud_path.chmod(0o755)

    run_cloud_prefix_inventory_path = operator_dir / "run-cloud-prefix-inventory.sh"
    run_cloud_prefix_inventory_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "cd " + shell_quote(str(Path.cwd())),
                cloud_prefix_inventory_command_text,
                "",
            ]
        ),
        encoding="utf-8",
    )
    run_cloud_prefix_inventory_path.chmod(0o755)

    readme_path = operator_dir / "README.md"
    readme_path.write_text(
        "\n".join(
            [
                "# Studio Cut Insta360 Download Operator",
                "",
                "This folder is local operator state. Do not commit it.",
                "",
                "## Download Buffer",
                "",
                f"`{download_dir}`",
                "",
                "Configure Insta360 Studio cloud downloads to save originals here when possible.",
                "",
                "## UI Automation Setup",
                "",
                "If `doctor` reports Accessibility disabled, run:",
                "",
                "```bash",
                accessibility_command_text,
                "```",
                "",
                "Enable Terminal/Codex for Accessibility, then rerun `pnpm studio-cut:insta360-operator doctor`.",
                "",
                "## Preflight",
                "",
                "```bash",
                preflight_command,
                "```",
                "",
                "## Dry Run Drain",
                "",
                "```bash",
                dry_run_command,
                "```",
                "",
                "## Upload, Verify, And Clear Local Copies",
                "",
                "```bash",
                drain_command,
                "```",
                "",
                "## Round Progress Report",
                "",
                "```bash",
                migration_report_command_text,
                "```",
                "",
                "## Live Status Page",
                "",
                "```bash",
                status_page_command_text,
                "```",
                "",
                "## Operator Dashboard",
                "",
                "```bash",
                operator_dashboard_command_text,
                "```",
                "",
                "## Audit Before Manual Remote Cleanup",
                "",
                "```bash",
                ledger_summary_command_text,
                verify_ledger_cloud_command_text,
                "```",
                "",
                "",
                "## Emit Vault Receipt",
                "",
                "```bash",
                vault_receipt_command_text,
                "```",
                "",
                "Keep this JSON receipt as a handoff artifact and do not commit it.",
                "",
                "## Export Cloud Prefix Inventory",
                "",
                "```bash",
                cloud_prefix_inventory_command_text,
                "```",
                "",
                "Keep generated inventory JSON/CSV out of git if object names reveal private episode details.",
                "`ledger-summary` redacts local source paths by default. Remote Insta360 Cloud deletion remains manual after ledger verification.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    result = {
        "status": "ready",
        "projectId": args.project_id,
        "collectionId": args.collection_id,
        "downloadDir": str(download_dir),
        "operatorDir": str(operator_dir),
        "ledgerPath": str(ledger_path),
        "runAccessibilitySettingsScript": str(run_accessibility_path),
        "runPreflightScript": str(run_preflight_path),
        "runDrainScript": str(run_drain_path),
        "runLedgerSummaryScript": str(run_ledger_summary_path),
        "runMigrationReportScript": str(run_migration_report_path),
        "runStatusPageScript": str(run_status_page_path),
        "runOperatorDashboardScript": str(run_operator_dashboard_path),
        "runVerifyLedgerCloudScript": str(run_verify_cloud_path),
        "runVaultReceiptScript": str(run_vault_receipt_path),
        "runCloudPrefixInventoryScript": str(run_cloud_prefix_inventory_path),
        "readme": str(readme_path),
        "accessibilitySettingsCommand": accessibility_command_text,
        "preflightCommand": preflight_command,
        "dryRunCommand": dry_run_command,
        "drainCommand": drain_command,
        "ledgerSummaryCommand": ledger_summary_command_text,
        "migrationReportCommand": migration_report_command_text,
        "statusPageCommand": status_page_command_text,
        "operatorDashboardCommand": operator_dashboard_command_text,
        "verifyLedgerCloudCommand": verify_ledger_cloud_command_text,
        "vaultReceiptCommand": vault_receipt_command_text,
        "cloudPrefixInventoryCommand": cloud_prefix_inventory_command_text,
    }
    print(json.dumps(result, indent=2))
    return 0


def ui_snapshot_applescript(app_name: str, max_depth: int) -> str:
    return f'''
using terms from application "System Events"
on replaceTextValue(findText, replacementText, sourceText)
  set AppleScript's text item delimiters to findText
  set textItems to text items of sourceText
  set AppleScript's text item delimiters to replacementText
  set replacedText to textItems as text
  set AppleScript's text item delimiters to ""
  return replacedText
end replaceTextValue

on cleanText(valueText)
  try
    set outputText to valueText as text
  on error
    set outputText to ""
  end try
  set outputText to my replaceTextValue(linefeed, " ", outputText)
  set outputText to my replaceTextValue(return, " ", outputText)
  set outputText to my replaceTextValue(tab, " ", outputText)
  return outputText
end cleanText

on walkElement(theElement, pathLabel, depthLevel, maxDepth)
  if depthLevel > maxDepth then return ""
  set roleText to ""
  set nameText to ""
  set descriptionText to ""
  set valueText to ""
  try
    set roleText to my cleanText(role of theElement)
  end try
  try
    set nameText to my cleanText(name of theElement)
  end try
  try
    set descriptionText to my cleanText(description of theElement)
  end try
  try
    set valueText to my cleanText(value of theElement)
  end try
  set outputText to pathLabel & tab & roleText & tab & nameText & tab & descriptionText & tab & valueText & linefeed
  try
    set childElements to UI elements of theElement
    set childIndex to 1
    repeat with childElement in childElements
      set outputText to outputText & my walkElement(childElement, pathLabel & "/" & childIndex, depthLevel + 1, maxDepth)
      set childIndex to childIndex + 1
    end repeat
  end try
  return outputText
end walkElement
end using terms from

tell application {applescript_quote(app_name)} to activate
delay 0.5
tell application "System Events"
  tell process {applescript_quote(app_name)}
    set frontmost to true
    set outputText to ""
    try
      set outputText to outputText & my walkElement(window 1, "window1", 0, {max_depth})
    end try
    try
      set outputText to outputText & my walkElement(menu bar 1, "menu-bar", 0, {max_depth})
    end try
    return outputText
  end tell
end tell
'''


def parse_snapshot_tsv(tsv: str) -> list[dict[str, str]]:
    elements: list[dict[str, str]] = []
    for line in tsv.splitlines():
        parts = line.split("\t")
        while len(parts) < 5:
            parts.append("")
        path, role, name, description, value = parts[:5]
        elements.append(
            {
                "path": path,
                "role": role,
                "name": name,
                "description": description,
                "value": value,
            }
        )
    return elements


def ui_snapshot_command(args: argparse.Namespace) -> int:
    app_path = find_app()
    if not app_path:
        print("Insta360 Studio.app was not found.", file=sys.stderr)
        return 1
    access = accessibility_status()
    if not access["enabled"]:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "appName": APP_NAME,
                    "appPath": str(app_path),
                    "accessibility": access,
                    "settingsUrl": ACCESSIBILITY_SETTINGS_URL,
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1
    script = ui_snapshot_applescript(APP_NAME, args.max_depth)
    status, stdout, stderr = run_osascript(script)
    if status != 0:
        print(stderr or stdout, file=sys.stderr)
        return status
    elements = parse_snapshot_tsv(stdout)
    payload = {
        "status": "ready" if elements else "blocked",
        "createdAt": utc_now_iso(),
        "appName": APP_NAME,
        "appPath": str(app_path),
        "elementCount": len(elements),
        "elements": elements,
        "warnings": [] if elements else ["No UI elements were exposed by Insta360 Studio. Confirm the app window is open and Accessibility permission is enabled."],
    }
    if args.out:
        out_path = Path(args.out).expanduser()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote UI snapshot: {out_path}")
    else:
        print(json.dumps(payload, indent=2))
    return 0 if elements else 1


def click_control_applescript(app_name: str, label: str, max_depth: int, execute: bool) -> str:
    return f'''
using terms from application "System Events"
on normalizedText(valueText)
  try
    set outputText to valueText as text
  on error
    set outputText to ""
  end try
  return outputText
end normalizedText

on elementMatches(theElement, targetText)
  set targetLower to do shell script "printf %s " & quoted form of targetText & " | tr '[:upper:]' '[:lower:]'"
  set fieldsToCheck to {{}}
  try
    set end of fieldsToCheck to name of theElement as text
  end try
  try
    set end of fieldsToCheck to description of theElement as text
  end try
  try
    set end of fieldsToCheck to value of theElement as text
  end try
  repeat with fieldValue in fieldsToCheck
    set fieldLower to do shell script "printf %s " & quoted form of (fieldValue as text) & " | tr '[:upper:]' '[:lower:]'"
    if fieldLower contains targetLower then return true
  end repeat
  return false
end elementMatches

on findAndMaybeClick(theElement, targetText, depthLevel, maxDepth, shouldClick)
  if depthLevel > maxDepth then return ""
  try
    if my elementMatches(theElement, targetText) then
      set roleText to ""
      set nameText to ""
      set descriptionText to ""
      try
        set roleText to role of theElement as text
      end try
      try
        set nameText to name of theElement as text
      end try
      try
        set descriptionText to description of theElement as text
      end try
      if shouldClick then click theElement
      return roleText & tab & nameText & tab & descriptionText
    end if
  end try
  try
    set childElements to UI elements of theElement
    repeat with childElement in childElements
      set resultText to my findAndMaybeClick(childElement, targetText, depthLevel + 1, maxDepth, shouldClick)
      if resultText is not "" then return resultText
    end repeat
  end try
  return ""
end findAndMaybeClick
end using terms from

tell application {applescript_quote(app_name)} to activate
delay 0.5
tell application "System Events"
  tell process {applescript_quote(app_name)}
    set frontmost to true
    set resultText to ""
    try
      set resultText to my findAndMaybeClick(window 1, {applescript_quote(label)}, 0, {max_depth}, {str(execute).lower()})
    end try
    if resultText is "" then
      try
        set resultText to my findAndMaybeClick(menu bar 1, {applescript_quote(label)}, 0, {max_depth}, {str(execute).lower()})
      end try
    end if
    if resultText is "" then error "No UI control matched: {label}"
    return resultText
  end tell
end tell
'''


def click_control_command(args: argparse.Namespace) -> int:
    app_path = find_app()
    if not app_path:
        print("Insta360 Studio.app was not found.", file=sys.stderr)
        return 1
    access = accessibility_status()
    if not access["enabled"]:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "appName": APP_NAME,
                    "label": args.label,
                    "executed": bool(args.execute),
                    "accessibility": access,
                    "settingsUrl": ACCESSIBILITY_SETTINGS_URL,
                },
                indent=2,
            )
        )
        return 1
    script = click_control_applescript(APP_NAME, args.label, args.max_depth, args.execute)
    status, stdout, stderr = run_osascript(script)
    result = {
        "status": "ready" if status == 0 else "blocked",
        "appName": APP_NAME,
        "label": args.label,
        "executed": bool(args.execute),
        "matched": stdout,
        "error": stderr if status != 0 else None,
    }
    print(json.dumps(result, indent=2))
    return status


def download_selected_command(args: argparse.Namespace) -> int:
    access = accessibility_status()
    if not access["enabled"]:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "executed": bool(args.execute),
                    "accessibility": access,
                    "settingsUrl": ACCESSIBILITY_SETTINGS_URL,
                },
                indent=2,
            )
        )
        return 1
    labels = args.label or ["Download", "Start Export"]
    attempts: list[dict[str, Any]] = []
    for label in labels:
        script = click_control_applescript(APP_NAME, label, args.max_depth, args.execute)
        status, stdout, stderr = run_osascript(script)
        attempts.append(
            {
                "label": label,
                "status": "ready" if status == 0 else "blocked",
                "matched": stdout,
                "error": stderr if status != 0 else None,
            }
        )
        if status == 0:
            print(
                json.dumps(
                    {
                        "status": "ready",
                        "executed": bool(args.execute),
                        "matchedLabel": label,
                        "attempts": attempts,
                    },
                    indent=2,
                )
            )
            return 0
    print(json.dumps({"status": "blocked", "executed": bool(args.execute), "attempts": attempts}, indent=2))
    return 1


def self_test_command(_: argparse.Namespace) -> int:
    download_dir = Path("/tmp/studio-cut-insta360-operator-test/downloads")
    ledger_path = default_ledger_path(download_dir)
    drain_command = build_drain_command(
        download_dir=download_dir,
        project_id="episode-004",
        collection_id="homer-insta360",
        execute=True,
        delete_local_after_upload=True,
    )
    preflight_command = build_storage_preflight_command(download_dir=download_dir)
    accessibility_command_text = build_open_accessibility_settings_command()
    ledger_summary_command_text = build_ledger_summary_command(ledger_path=ledger_path)
    verify_ledger_cloud_command_text = build_verify_ledger_cloud_command(ledger_path=ledger_path)
    vault_receipt_command_text = build_vault_receipt_command(ledger_path=ledger_path)
    cloud_prefix_inventory_command_text = build_cloud_prefix_inventory_command(
        operator_dir=Path("/tmp/studio-cut-insta360-operator-test/operator"),
        project_id="episode-004",
        collection_id="homer-insta360",
    )
    migration_report_command_text = build_migration_report_command(
        download_dir=download_dir,
        project_id="episode-004",
        collection_id="homer-insta360",
    )
    status_page_command_text = build_status_page_command(
        download_dir=download_dir,
        operator_dir=Path("/tmp/studio-cut-insta360-operator-test/operator"),
        project_id="episode-004",
        collection_id="homer-insta360",
    )
    operator_dashboard_command_text = build_operator_dashboard_command(
        download_dir=download_dir,
        operator_dir=Path("/tmp/studio-cut-insta360-operator-test/operator"),
        project_id="episode-004",
        collection_id="homer-insta360",
    )
    assertions = [
        "drain-folder" in drain_command,
        "--execute" in drain_command,
        "--delete-local-after-upload" in drain_command,
        "storage-preflight" in preflight_command,
        "open-accessibility-settings" in accessibility_command_text,
        "ledger-summary" in ledger_summary_command_text,
        "migration-report" in migration_report_command_text,
        "migration-status-page" in status_page_command_text,
        "operator-dashboard" in operator_dashboard_command_text,
        "--include-cloud" in operator_dashboard_command_text,
        "--allow-blocked" in operator_dashboard_command_text,
        "verify-ledger-cloud" in verify_ledger_cloud_command_text,
        "vault-receipt" in vault_receipt_command_text,
        "cloud-prefix-inventory" in cloud_prefix_inventory_command_text,
        "Insta360 Studio" in ui_snapshot_applescript(APP_NAME, 2),
        "Download" in click_control_applescript(APP_NAME, "Download", 2, False),
        ACCESSIBILITY_SETTINGS_URL.startswith("x-apple.systempreferences:"),
    ]
    result = {
        "status": "pass" if all(assertions) else "fail",
        "assertionsPassed": sum(1 for assertion in assertions if assertion),
        "assertionCount": len(assertions),
        "samplePreflightCommand": preflight_command,
        "sampleAccessibilitySettingsCommand": accessibility_command_text,
        "sampleDrainCommand": drain_command,
        "sampleLedgerSummaryCommand": ledger_summary_command_text,
        "sampleMigrationReportCommand": migration_report_command_text,
        "sampleStatusPageCommand": status_page_command_text,
        "sampleOperatorDashboardCommand": operator_dashboard_command_text,
        "sampleVerifyLedgerCloudCommand": verify_ledger_cloud_command_text,
        "sampleVaultReceiptCommand": vault_receipt_command_text,
        "sampleCloudPrefixInventoryCommand": cloud_prefix_inventory_command_text,
    }
    print(json.dumps(result, indent=2))
    return 0 if all(assertions) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Studio Cut local Insta360 Studio operator")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="Check local Insta360 Studio automation readiness")
    doctor.set_defaults(func=doctor_command)

    open_studio = subparsers.add_parser("open-studio", help="Open Insta360 Studio")
    open_studio.set_defaults(func=open_studio_command)

    open_accessibility = subparsers.add_parser(
        "open-accessibility-settings",
        help="Open the macOS Accessibility settings pane for enabling UI automation",
    )
    open_accessibility.set_defaults(func=open_accessibility_settings_command)

    dashboard = subparsers.add_parser(
        "operator-dashboard",
        help="Write a local dashboard combining Insta360 automation and migration progress",
    )
    dashboard.add_argument("--project-id", default=DEFAULT_PROJECT_ID)
    dashboard.add_argument("--collection-id", default=DEFAULT_COLLECTION_ID)
    dashboard.add_argument("--download-dir")
    dashboard.add_argument("--operator-dir")
    dashboard.add_argument("--out-dir")
    dashboard.add_argument("--bucket", default=media_vault.DEFAULT_BUCKET)
    dashboard.add_argument("--storage-prefix", default="media-vault/raw")
    dashboard.add_argument("--ledger")
    dashboard.add_argument("--settle-seconds", type=int, default=30)
    dashboard.add_argument("--min-free-gb", type=float, default=media_vault.DEFAULT_MIN_FREE_GB)
    dashboard.add_argument("--allow-icloud", action="store_true")
    dashboard.add_argument("--max-files", type=int, default=20)
    dashboard.add_argument("--include-cloud", action="store_true")
    dashboard.add_argument("--cloud-max-objects", type=int, default=50)
    dashboard.add_argument("--refresh-seconds", type=int, default=5)
    dashboard.add_argument("--watch", action="store_true")
    dashboard.add_argument("--poll-seconds", type=int, default=10)
    dashboard.add_argument("--open", action="store_true")
    dashboard.add_argument("--continue-on-error", action="store_true")
    dashboard.add_argument("--allow-blocked", action="store_true")
    dashboard.set_defaults(func=operator_dashboard_command)

    prepare = subparsers.add_parser("prepare-session", help="Create local download buffer and drain runner")
    prepare.add_argument("--project-id", default=DEFAULT_PROJECT_ID)
    prepare.add_argument("--collection-id", default=DEFAULT_COLLECTION_ID)
    prepare.add_argument("--download-dir")
    prepare.add_argument("--operator-dir")
    prepare.set_defaults(func=prepare_session_command)

    snapshot = subparsers.add_parser("ui-snapshot", help="Capture visible Insta360 Studio UI elements")
    snapshot.add_argument("--out")
    snapshot.add_argument("--max-depth", type=int, default=8)
    snapshot.set_defaults(func=ui_snapshot_command)

    click = subparsers.add_parser("click-control", help="Find and optionally click a visible/menu control by label")
    click.add_argument("--label", required=True)
    click.add_argument("--execute", action="store_true")
    click.add_argument("--max-depth", type=int, default=10)
    click.set_defaults(func=click_control_command)

    download = subparsers.add_parser(
        "download-selected",
        help="Try visible Download/Start Export controls for the currently selected Insta360 Studio media",
    )
    download.add_argument("--label", action="append", default=[])
    download.add_argument("--execute", action="store_true")
    download.add_argument("--max-depth", type=int, default=10)
    download.set_defaults(func=download_selected_command)

    self_test = subparsers.add_parser("self-test", help="Run non-GUI command generation checks")
    self_test.set_defaults(func=self_test_command)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
