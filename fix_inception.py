import os
import shutil
from pathlib import Path

def resolve_folder_inception():
    print("🚁 Launching surgical drone...")

    # 1. Define the coordinates
    base_dir = Path("apps/web/content/episodes")
    nested_dir = base_dir / "episodes"
    site_file = Path("apps/web/src/lib/site.ts")

    # 2. Move the files out of the nested folder
    if nested_dir.exists() and nested_dir.is_dir():
        print(f"\n📂 Found nested dimension: {nested_dir}")
        for item in nested_dir.iterdir():
            target_path = base_dir / item.name
            
            # Move the file up one level
            shutil.move(str(item), str(base_dir))
            print(f"  ✅ Extracted: {item.name} -> {base_dir}")
            
        # Vaporize the empty nested folder
        try:
            nested_dir.rmdir()
            print("  🗑️ Vaporized empty nested 'episodes' folder.")
        except OSError as e:
            print(f"  ⚠️ Could not remove nested folder (might not be empty): {e}")
    else:
        print("\n✨ Nested directory not found. Files might already be in place.")

    # 3. Sanitize the URLs in site.ts
    if site_file.exists():
        print(f"\n📄 Scanning {site_file} for corrupt URLs...")
        content = site_file.read_text(encoding="utf-8")
        
        # Replace the hotfix double-paths with clean paths
        new_content = content.replace('href: "/episodes/episodes/', 'href: "/episodes/')
        # Just in case there are any lingering docs paths
        new_content = new_content.replace('href: "/docs/episodes/', 'href: "/episodes/')
        
        if content != new_content:
            site_file.write_text(new_content, encoding="utf-8")
            print("  ✅ Sanitized href paths in site.ts")
        else:
            print("  ✨ site.ts paths are already mathematically perfect.")
    else:
        print(f"\n❌ Could not locate {site_file}")

    print("\n🚀 Surgery complete. Ready for deployment.")

if __name__ == "__main__":
    resolve_folder_inception()