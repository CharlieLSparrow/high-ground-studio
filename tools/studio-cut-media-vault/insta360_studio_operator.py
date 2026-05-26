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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_NAME = "Insta360 Studio"
DEFAULT_PROJECT_ID = "episode-004"
DEFAULT_COLLECTION_ID = "homer-insta360"


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


def doctor_command(_: argparse.Namespace) -> int:
    app_path = find_app()
    report = {
        "status": "ready" if app_path and osascript_available() else "blocked",
        "platform": platform.platform(),
        "appName": APP_NAME,
        "appPath": str(app_path) if app_path else None,
        "osascriptPath": shutil.which("osascript"),
        "openPath": shutil.which("open"),
        "gcloudPath": shutil.which("gcloud"),
        "accessibility": accessibility_status(),
        "warnings": [],
    }
    if not app_path:
        report["warnings"].append("Install Insta360 Studio or move it to /Applications.")
    if not report["accessibility"]["enabled"]:
        report["warnings"].append("UI automation commands need macOS Accessibility permission.")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ready" else 1


def prepare_session_command(args: argparse.Namespace) -> int:
    download_dir = Path(args.download_dir).expanduser() if args.download_dir else default_download_dir(args.project_id)
    operator_dir = Path(args.operator_dir).expanduser() if args.operator_dir else default_operator_dir(args.project_id)
    operator_dir.mkdir(parents=True, exist_ok=True)
    download_dir.mkdir(parents=True, exist_ok=True)

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
                "Remote Insta360 Cloud deletion remains manual after ledger verification.",
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
        "runDrainScript": str(run_drain_path),
        "readme": str(readme_path),
        "dryRunCommand": dry_run_command,
        "drainCommand": drain_command,
    }
    print(json.dumps(result, indent=2))
    return 0


def ui_snapshot_applescript(app_name: str, max_depth: int) -> str:
    return f'''
on replaceText(findText, replaceText, sourceText)
  set AppleScript's text item delimiters to findText
  set textItems to text items of sourceText
  set AppleScript's text item delimiters to replaceText
  set replacedText to textItems as text
  set AppleScript's text item delimiters to ""
  return replacedText
end replaceText

on cleanText(valueText)
  try
    set outputText to valueText as text
  on error
    set outputText to ""
  end try
  set outputText to my replaceText(linefeed, " ", outputText)
  set outputText to my replaceText(return, " ", outputText)
  set outputText to my replaceText(tab, " ", outputText)
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
    script = ui_snapshot_applescript(APP_NAME, args.max_depth)
    status, stdout, stderr = run_osascript(script)
    if status != 0:
        print(stderr or stdout, file=sys.stderr)
        return status
    payload = {
        "createdAt": utc_now_iso(),
        "appName": APP_NAME,
        "appPath": str(app_path),
        "elements": parse_snapshot_tsv(stdout),
    }
    if args.out:
        out_path = Path(args.out).expanduser()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote UI snapshot: {out_path}")
    else:
        print(json.dumps(payload, indent=2))
    return 0


def click_control_applescript(app_name: str, label: str, max_depth: int, execute: bool) -> str:
    return f'''
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
    drain_command = build_drain_command(
        download_dir=download_dir,
        project_id="episode-004",
        collection_id="homer-insta360",
        execute=True,
        delete_local_after_upload=True,
    )
    assertions = [
        "drain-folder" in drain_command,
        "--execute" in drain_command,
        "--delete-local-after-upload" in drain_command,
        "Insta360 Studio" in ui_snapshot_applescript(APP_NAME, 2),
        "Download" in click_control_applescript(APP_NAME, "Download", 2, False),
    ]
    result = {
        "status": "pass" if all(assertions) else "fail",
        "assertionsPassed": sum(1 for assertion in assertions if assertion),
        "assertionCount": len(assertions),
        "sampleDrainCommand": drain_command,
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
