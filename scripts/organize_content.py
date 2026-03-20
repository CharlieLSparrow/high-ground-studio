import os
import shutil
import re
import json
import argparse
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)

BASE = os.path.join(REPO_ROOT, "apps", "web", "content")
INBOX = os.path.join(BASE, "_inbox")
STAGING = os.path.join(BASE, "_staging")

DRY_RUN = False


def log(msg):
    print(msg)


def safe_copy(src, dst):
    if DRY_RUN:
        log(f"[DRY] COPY {src} -> {dst}")
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def slugify(text):
    text = text.lower()
    text = re.sub(r"[’']", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def slugify_stem(filename):
    stem = Path(filename).stem
    return slugify(stem)


def preserve_slugged_filename(filename):
    ext = Path(filename).suffix.lower()
    stem = slugify_stem(filename)
    return f"{stem}{ext}"


def is_junk(path):
    return (
        ".obsidian" in path
        or ".DS_Store" in path
    )


def is_blank_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return len(f.read().strip()) < 20
    except Exception:
        return True


def is_asset(filename):
    ext = Path(filename).suffix.lower()
    return ext in {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}


def is_probably_extra(filename):
    name = filename.lower()
    return any(
        token in name
        for token in [
            "title sequence",
            "intro song",
            "sidebars",
            "full chapter",
            "unformatted",
            "new formatting",
            "old",
            "untitled",
        ]
    )


def parse_episode_folder(name):
    # Example: "1 - March 25 - Pilot"
    match = re.match(r"(\d+)\s*-\s*(.*?)\s*-\s*(.*)", name)
    if not match:
        return None

    num = int(match.group(1))
    date_str = match.group(2).strip()
    title = match.group(3).strip()

    try:
        date = datetime.strptime(f"{date_str} 2026", "%B %d %Y")
    except Exception:
        date = None

    return {
        "episodeNumber": num,
        "title": title,
        "slug": slugify(title),
        "plannedReleaseDate": date.isoformat() if date else None,
        "needsReview": num <= 5,
    }


def classify_file(filename):
    name = filename.lower()

    if name.startswith("charlie"):
        return "charlie"

    if "research" in name:
        return "research"

    if "perspective" in name:
        return "perspectives"

    if name == "draft.md":
        return "draft"

    if name.startswith("untitled") or "old" in name:
        return "junk"

    return "main"


def pick_episode_main_file(files, folder_title):
    candidates = []
    folder_slug = slugify(folder_title)

    for f in files:
        name = f.lower()

        if is_asset(f):
            continue
        if name.startswith("charlie"):
            continue
        if "research" in name:
            continue
        if is_probably_extra(f):
            continue

        score = 0
        f_slug = slugify_stem(f)

        if f_slug == folder_slug:
            score += 100
        if name.startswith("week "):
            score += 80
        if "phase " in name:
            score += 40
        if "chapter" in name:
            score += 30
        if Path(f).suffix.lower() == ".md":
            score += 10

        candidates.append((score, f))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def pick_wtr_main_file(files, folder_name):
    candidates = []
    folder_slug = slugify(folder_name)

    for f in files:
        name = f.lower()

        if is_asset(f):
            continue
        if "perspective" in name:
            continue
        if name == "draft.md":
            continue

        score = 0
        f_slug = slugify_stem(f)

        if f_slug == folder_slug:
            score += 100
        if f_slug in {"preface", "introduction", "risk", "acknowledgements"}:
            score += 80
        if name == "maybe.md":
            score += 20
        if Path(f).suffix.lower() == ".md":
            score += 10

        candidates.append((score, f))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def write_json(path, data):
    if DRY_RUN:
        log(f"[DRY] WRITE JSON {path}")
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


def process_podcast_year():
    root = os.path.join(INBOX, "Podcast Year 1")
    if not os.path.isdir(root):
        log(f"⚠️ Podcast Year 1 folder not found: {root}")
        return

    for folder in sorted(os.listdir(root)):
        folder_path = os.path.join(root, folder)

        if not os.path.isdir(folder_path):
            continue

        meta = parse_episode_folder(folder)
        if not meta:
            continue

        slug = meta["slug"]
        dest = os.path.join(STAGING, "learning-to-lead", "episodes", slug)

        folder_files = [
            f
            for f in os.listdir(folder_path)
            if os.path.isfile(os.path.join(folder_path, f))
            and not is_junk(os.path.join(folder_path, f))
        ]

        main_file = pick_episode_main_file(folder_files, meta["title"])

        manifest = {
            "type": "episode",
            "meta": meta,
            "files": [],
            "issues": [],
            "confidence": "medium" if meta["needsReview"] else "high",
        }

        if main_file is None:
            manifest["issues"].append("No main file confidently identified")

        for file in sorted(folder_files):
            file_path = os.path.join(folder_path, file)
            category = classify_file(file)

            if category == "junk":
                manifest["files"].append({
                    "file": file,
                    "category": "junk",
                    "skipped": True,
                })
                continue

            if category == "charlie" and is_blank_file(file_path):
                manifest["files"].append({
                    "file": file,
                    "category": "charlie",
                    "empty": True,
                    "skipped": True,
                })
                continue

            if is_asset(file):
                target = os.path.join(dest, "assets", preserve_slugged_filename(file))

            elif category == "charlie":
                if file.lower() == "charlie.md":
                    target = os.path.join(dest, "charlie.md")
                else:
                    target = os.path.join(dest, "extras", preserve_slugged_filename(file))

            elif category == "research":
                target = os.path.join(dest, "research", preserve_slugged_filename(file))

            elif file == main_file:
                target = os.path.join(dest, "scott_main.md")

            else:
                target = os.path.join(dest, "extras", preserve_slugged_filename(file))

            safe_copy(file_path, target)

            manifest["files"].append({
                "file": file,
                "category": category,
                "target": target,
                "selectedAsMain": file == main_file,
            })

            if category in ["research", "perspectives"]:
                lib_target = os.path.join(
                    STAGING,
                    "research-library",
                    "learning-to-lead",
                    slug,
                    preserve_slugged_filename(file),
                )
                safe_copy(file_path, lib_target)

        manifest_path = os.path.join(dest, "manifest.json")
        write_json(manifest_path, manifest)


def process_worth_the_risk():
    root = os.path.join(INBOX, "Worth The Risk")
    if not os.path.isdir(root):
        log(f"⚠️ Worth The Risk folder not found: {root}")
        return

    for section in sorted(os.listdir(root)):
        section_path = os.path.join(root, section)

        if not os.path.isdir(section_path):
            continue

        slug = slugify(section)
        dest = os.path.join(STAGING, "worth-the-risk", "sections", slug)

        section_files = [
            f
            for f in os.listdir(section_path)
            if os.path.isfile(os.path.join(section_path, f))
            and not is_junk(os.path.join(section_path, f))
        ]

        main_file = None if section.lower() == "others" else pick_wtr_main_file(section_files, section)

        manifest = {
            "type": "worth-the-risk",
            "section": section,
            "slug": slug,
            "files": [],
            "issues": [],
            "confidence": "medium",
        }

        if section.lower() != "others" and main_file is None:
            manifest["issues"].append("No main file confidently identified")

        for file in sorted(section_files):
            file_path = os.path.join(section_path, file)
            category = classify_file(file)

            if category == "junk":
                manifest["files"].append({
                    "file": file,
                    "category": "junk",
                    "skipped": True,
                })
                continue

            if is_asset(file):
                target = os.path.join(dest, "assets", preserve_slugged_filename(file))

            elif category == "research":
                target = os.path.join(dest, "research", preserve_slugged_filename(file))

            elif category == "perspectives":
                target = os.path.join(dest, "perspectives", preserve_slugged_filename(file))

            elif section.lower() == "others":
                target = os.path.join(dest, "profiles", preserve_slugged_filename(file))

            elif file == main_file:
                target = os.path.join(dest, "main.md")

            else:
                target = os.path.join(dest, "alternates", preserve_slugged_filename(file))

            safe_copy(file_path, target)

            manifest["files"].append({
                "file": file,
                "category": category,
                "target": target,
                "selectedAsMain": file == main_file,
            })

            if category in ["research", "perspectives"]:
                lib_target = os.path.join(
                    STAGING,
                    "research-library",
                    "worth-the-risk",
                    slug,
                    preserve_slugged_filename(file),
                )
                safe_copy(file_path, lib_target)

        manifest_path = os.path.join(dest, "manifest.json")
        write_json(manifest_path, manifest)


def main():
    global DRY_RUN

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    DRY_RUN = args.dry_run

    log("\n🔥 ORGANIZING CONTENT 🔥\n")

    process_podcast_year()
    process_worth_the_risk()

    log("\n✅ DONE\n")


if __name__ == "__main__":
    main()