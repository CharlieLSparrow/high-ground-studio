#!/usr/bin/env python3
"""Generate a Quipsly YouTube thumbnail packet from a config JSON.

The script extracts configured source frames from a local episode render, uses a
small Swift/AppKit renderer for native macOS typography/compositing, then writes
thumbnail manifest + Markdown evidence. It does not upload, publish, schedule,
mutate external accounts, or alter original media.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SWIFT_RENDERER = r'''
import AppKit
import Foundation

struct FrameSpec: Codable { let id: String; let timestamp: String }
struct ThumbnailSpec: Codable {
    let id: String
    let file: String
    let layout: String
    let frame: String?
    let leftFrame: String?
    let rightFrame: String?
    let brand: String?
    let episodeBadge: String?
    let headline: [String]
    let reason: String?
    let recommended: Bool?
}
struct Config: Codable {
    let brand: String?
    let episodeBadge: String?
    let outputDir: String
    let frames: [FrameSpec]
    let thumbnails: [ThumbnailSpec]
}

let configURL = URL(fileURLWithPath: CommandLine.arguments[1])
let readyDir = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let outputDir = URL(fileURLWithPath: CommandLine.arguments[3], isDirectory: true)
let data = try Data(contentsOf: configURL)
let config = try JSONDecoder().decode(Config.self, from: data)
let size = NSSize(width: 1280, height: 720)
let framesDir = outputDir.appendingPathComponent("frames", isDirectory: true)

let gold = NSColor(calibratedRed: 0.96, green: 0.83, blue: 0.42, alpha: 1)
let white = NSColor.white
let leaf = NSColor(calibratedRed: 0.08, green: 0.16, blue: 0.12, alpha: 0.78)
let topLeaf = NSColor(calibratedRed: 0.15, green: 0.28, blue: 0.20, alpha: 0.58)
let dark = NSColor(calibratedRed: 0.02, green: 0.03, blue: 0.025, alpha: 0.36)

struct TextBlock { let text: String; let x: CGFloat; let yTop: CGFloat; let size: CGFloat; let color: NSColor }

func loadFrame(_ id: String) -> NSImage {
    let url = framesDir.appendingPathComponent("\(id).jpg")
    guard let image = NSImage(contentsOf: url) else { fatalError("Missing frame \(url.path)") }
    return image
}

func coverSourceRect(image: NSImage, target: NSRect) -> NSRect {
    let iw = image.size.width
    let ih = image.size.height
    let sourceAspect = iw / ih
    let targetAspect = target.width / target.height
    if sourceAspect > targetAspect {
        let cropW = ih * targetAspect
        return NSRect(x: (iw - cropW) / 2, y: 0, width: cropW, height: ih)
    }
    let cropH = iw / targetAspect
    return NSRect(x: 0, y: (ih - cropH) / 2, width: iw, height: cropH)
}

func drawCover(_ image: NSImage, in rect: NSRect) {
    image.draw(in: rect, from: coverSourceRect(image: image, target: rect), operation: .sourceOver, fraction: 1.0, respectFlipped: false, hints: [.interpolation: NSImageInterpolation.high])
}

func fill(_ rect: NSRect, color: NSColor) {
    color.setFill()
    rect.fill()
}

func drawText(_ block: TextBlock) {
    let font = NSFont.systemFont(ofSize: block.size, weight: .black)
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.75)
    shadow.shadowBlurRadius = 4
    shadow.shadowOffset = NSSize(width: 2, height: -2)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: block.color,
        .shadow: shadow,
        .kern: 0.8
    ]
    let y = size.height - block.yTop - block.size * 1.18
    NSAttributedString(string: block.text, attributes: attrs).draw(at: NSPoint(x: block.x, y: y))
}

func drawLabel(_ text: String, x: CGFloat, yTop: CGFloat, color: NSColor = gold) {
    let font = NSFont.systemFont(ofSize: 32, weight: .heavy)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: 3.2]
    let y = size.height - yTop - 38
    NSAttributedString(string: text, attributes: attrs).draw(at: NSPoint(x: x, y: y))
}

func imageCanvas(_ body: () -> Void) -> NSImage {
    let image = NSImage(size: size)
    image.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    fill(NSRect(origin: .zero, size: size), color: NSColor(calibratedRed: 0.08, green: 0.12, blue: 0.10, alpha: 1))
    body()
    image.unlockFocus()
    return image
}

func saveJPEG(_ image: NSImage, _ fileName: String) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.88]) else { fatalError("Could not encode JPEG") }
    try! jpg.write(to: outputDir.appendingPathComponent(fileName))
}

func renderThumbnail(_ thumb: ThumbnailSpec) {
    let brand = thumb.brand ?? config.brand ?? "HIGH GROUND ODYSSEY"
    let badge = thumb.episodeBadge ?? config.episodeBadge ?? ""
    let image = imageCanvas {
        if thumb.layout == "split" {
            drawCover(loadFrame(thumb.leftFrame ?? thumb.frame ?? config.frames[0].id), in: NSRect(x: 0, y: 0, width: 640, height: 720))
            drawCover(loadFrame(thumb.rightFrame ?? thumb.frame ?? config.frames[0].id), in: NSRect(x: 640, y: 0, width: 640, height: 720))
            fill(NSRect(x: 0, y: 0, width: 1280, height: 720), color: dark)
            fill(NSRect(x: 0, y: 0, width: 1280, height: 286), color: leaf)
        } else {
            drawCover(loadFrame(thumb.frame ?? thumb.leftFrame ?? config.frames[0].id), in: NSRect(x: 0, y: 0, width: 1280, height: 720))
            let sideWidth: CGFloat = thumb.layout == "left-panel" ? 560 : 1280
            let overlayY: CGFloat = thumb.layout == "left-panel" ? 0 : 0
            let overlayH: CGFloat = thumb.layout == "left-panel" ? 720 : 302
            fill(NSRect(x: 0, y: overlayY, width: sideWidth, height: overlayH), color: leaf)
        }
        fill(NSRect(x: 0, y: 630, width: 1280, height: 90), color: topLeaf)
        drawLabel(brand, x: 56, yTop: 28)
        if !badge.isEmpty { drawText(TextBlock(text: badge, x: 1084, yTop: 28, size: 46, color: white)) }
        let lines = thumb.headline
        if lines.count > 0 { drawText(TextBlock(text: lines[0], x: 56, yTop: 456, size: 82, color: white)) }
        if lines.count > 1 { drawText(TextBlock(text: lines[1], x: 56, yTop: 548, size: 80, color: gold)) }
        if lines.count > 2 { drawText(TextBlock(text: lines[2], x: 56, yTop: 632, size: 54, color: white)) }
    }
    saveJPEG(image, thumb.file)
}

func renderContactSheet() {
    let image = imageCanvas {
        let cols = 3
        let rows = 2
        let cellW = size.width / CGFloat(cols)
        let cellH = size.height / CGFloat(rows)
        for (index, frame) in config.frames.prefix(6).enumerated() {
            let col = index % cols
            let row = index / cols
            let rect = NSRect(x: CGFloat(col) * cellW, y: size.height - CGFloat(row + 1) * cellH, width: cellW, height: cellH)
            drawCover(loadFrame(frame.id), in: rect)
            fill(NSRect(x: rect.minX, y: rect.minY, width: rect.width, height: 46), color: NSColor.black.withAlphaComponent(0.55))
            let font = NSFont.systemFont(ofSize: 18, weight: .bold)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
            NSAttributedString(string: frame.id, attributes: attrs).draw(at: NSPoint(x: rect.minX + 14, y: rect.minY + 14))
        }
    }
    saveJPEG(image, "frame-contact-sheet.jpg")
}

for thumb in config.thumbnails { renderThumbnail(thumb) }
renderContactSheet()
print("rendered \(config.thumbnails.count) thumbnails")
'''


def load_config(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise SystemExit("Config root must be an object")
    return data


def resolve(ready_dir: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ready_dir / path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def image_info(path: Path) -> dict[str, Any]:
    result = subprocess.run(["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    info: dict[str, Any] = {}
    for line in result.stdout.splitlines():
        if "pixelWidth:" in line:
            info["width"] = int(line.rsplit(":", 1)[1].strip())
        elif "pixelHeight:" in line:
            info["height"] = int(line.rsplit(":", 1)[1].strip())
    return info


def run_checked(args: list[str]) -> None:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout).strip())


def extract_frames(config: dict[str, Any], ready_dir: Path, output_dir: Path) -> None:
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    source = resolve(ready_dir, config["sourceVideo"])
    if not source.exists():
        raise SystemExit(f"Missing source video: {source}")
    frames_dir = output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for frame in config.get("frames", []):
        frame_id = frame["id"]
        timestamp = frame["timestamp"]
        out = frames_dir / f"{frame_id}.jpg"
        run_checked([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", timestamp, "-i", str(source), "-frames:v", "1", "-vf", "scale=1280:720", "-update", "1", str(out)])


def render_with_swift(config_path: Path, ready_dir: Path, output_dir: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="quipsly-thumb-") as tmp:
        swift_path = Path(tmp) / "render.swift"
        swift_path.write_text(SWIFT_RENDERER)
        run_checked(["swift", str(swift_path), str(config_path), str(ready_dir), str(output_dir)])


def build_manifest(config: dict[str, Any], ready_dir: Path, output_dir: Path) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    missing: list[str] = []
    for thumb in config.get("thumbnails", []):
        path = output_dir / thumb["file"]
        if not path.exists():
            missing.append(str(path.relative_to(ready_dir)))
            continue
        info = image_info(path)
        entries.append({
            "id": thumb.get("id"),
            "file": thumb["file"],
            "relativePath": str(path.relative_to(ready_dir)),
            "bytes": path.stat().st_size,
            "megabytes": round(path.stat().st_size / 1024 / 1024, 3),
            "width": info.get("width"),
            "height": info.get("height"),
            "sha256": sha256(path),
            "recommended": bool(thumb.get("recommended")),
            "reason": thumb.get("reason", ""),
        })
    contact = output_dir / "frame-contact-sheet.jpg"
    if contact.exists():
        info = image_info(contact)
        entries.append({
            "id": "frame-contact-sheet",
            "file": "frame-contact-sheet.jpg",
            "relativePath": str(contact.relative_to(ready_dir)),
            "bytes": contact.stat().st_size,
            "megabytes": round(contact.stat().st_size / 1024 / 1024, 3),
            "width": info.get("width"),
            "height": info.get("height"),
            "sha256": sha256(contact),
            "recommended": False,
            "reason": "Source frame contact sheet for review.",
        })
    recommended = next((entry["file"] for entry in entries if entry.get("recommended")), entries[0]["file"] if entries else "")
    status = "ready" if not missing and entries else "needs-attention"
    return {
        "schema": "quipsly.youtube-thumbnail-packet.v1",
        "status": status,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "episodeId": config.get("episodeId", ""),
        "title": config.get("title", ""),
        "readyDir": str(ready_dir),
        "outputDir": str(output_dir),
        "recommended": recommended,
        "reason": next((entry.get("reason", "") for entry in entries if entry.get("recommended")), ""),
        "entries": entries,
        "missing": missing,
        "truth": {
            "originalMediaMutated": False,
            "externalUploadPerformedByCodex": False,
            "localDerivedArtworkOnly": True,
        },
    }


def write_markdown(path: Path, manifest: dict[str, Any]) -> None:
    lines = [
        f"# {manifest.get('title') or manifest.get('episodeId') or 'Episode'} YouTube thumbnails",
        "",
        f"Status: `{manifest['status']}`",
        "",
        f"Recommended: `{manifest['recommended']}`",
        "",
        manifest.get("reason") or "Use the recommended thumbnail unless a human picks a backup.",
        "",
        "## Upload recommendation",
        "",
        f"Use this for YouTube: `{Path(manifest['outputDir']).name}/{manifest['recommended']}`",
        "",
        "## Files",
        "",
        "| File | Dimensions | Size | SHA-256 |",
        "| --- | ---: | ---: | --- |",
    ]
    for entry in manifest.get("entries", []):
        lines.append(f"| `{entry['relativePath']}` | {entry.get('width')}x{entry.get('height')} | {entry.get('megabytes')} MB | `{entry.get('sha256')}` |")
    if manifest.get("missing"):
        lines.extend(["", "## Missing", ""])
        lines.extend(f"- `{item}`" for item in manifest["missing"])
    lines.extend([
        "",
        "## Truth",
        "",
        "- Derived from the local episode render only.",
        "- Original media was not mutated.",
        "- Codex did not upload or publish anything externally.",
        "",
    ])
    path.write_text("\n".join(lines))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    config = load_config(config_path)
    ready_dir = Path(config["readyDir"]).expanduser().resolve()
    output_dir = resolve(ready_dir, config.get("outputDir", "youtube-thumbnails"))
    output_dir.mkdir(parents=True, exist_ok=True)
    extract_frames(config, ready_dir, output_dir)
    render_with_swift(config_path, ready_dir, output_dir)
    manifest = build_manifest(config, ready_dir, output_dir)
    manifest_path = output_dir / config.get("manifestName", "YOUTUBE_THUMBNAILS.json")
    readme_path = output_dir / config.get("readmeName", "START_HERE_YOUTUBE_THUMBNAILS.md")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    write_markdown(readme_path, manifest)
    payload = {"status": manifest["status"], "recommended": manifest["recommended"], "entryCount": len(manifest["entries"]), "missing": manifest["missing"], "manifest": str(manifest_path), "readme": str(readme_path)}
    print(json.dumps(payload, indent=2) if args.json else payload)


if __name__ == "__main__":
    main()
