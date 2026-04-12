import os
import json
from pathlib import Path

def audit():
    report = {
        "structure": {},
        "configs": {},
        "env_check": [],
        "prisma_check": None
    }
    
    # 1. Map the File Tree (Focusing on the trouble spots)
    paths_to_scan = ['apps/web/src/app', 'apps/web/src/components', 'prisma']
    for p in paths_to_scan:
        report["structure"][p] = [str(path) for path in Path(p).rglob('*') if path.is_file()]

    # 2. Grab Config Files
    configs = [
        'package.json', 
        'apps/web/package.json', 
        'apps/web/tsconfig.json',
        'apps/web/next.config.mjs'
    ]
    for cfg in configs:
        if os.path.exists(cfg):
            with open(cfg, 'r') as f:
                try:
                    report["configs"][cfg] = json.load(f)
                except:
                    report["configs"][cfg] = "Error reading file"

    # 3. Check for .env variables (Names only, no values!)
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            report["env_check"] = [line.split('=')[0] for line in f if '=' in line]

    # 4. Check Prisma Schema
    prisma_path = 'prisma/schema.prisma'
    if os.path.exists(prisma_path):
        with open(prisma_path, 'r') as f:
            report["prisma_check"] = f.read()

    # Save the report
    with open('project_audit.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print("✅ Audit Complete! Send 'project_audit.json' to Skippy.")

if __name__ == "__main__":
    audit()