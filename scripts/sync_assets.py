#!/usr/bin/env python3
"""Copy web-friendly assets from /assets/renders/<episode> into apps/web/public/renders/<episode>.

Usage:
  python3 scripts/sync_assets.py episode-001
"""
from pathlib import Path
import shutil
import sys

def main():
  if len(sys.argv) < 2:
    print("Usage: python3 scripts/sync_assets.py <episode-folder>")
    raise SystemExit(1)

  episode = sys.argv[1]
  root = Path(__file__).resolve().parents[1]

  src = root / "assets" / "renders" / episode
  dst = root / "apps" / "web" / "public" / "renders" / episode

  if not src.exists():
    print(f"Source does not exist: {src}")
    raise SystemExit(2)

  dst.mkdir(parents=True, exist_ok=True)

  # Copy common web deliverables
  patterns = ["intro-web.mp4", "thumb.jpg", "metadata.json"]
  for name in patterns:
    p = src / name
    if p.exists():
      shutil.copy2(p, dst / name)
      print(f"Copied: {p.name}")

  print(f"Done. Website assets at: {dst}")

if __name__ == "__main__":
  main()
