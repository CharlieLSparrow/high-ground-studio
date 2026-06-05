import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(process.cwd(), 'docs', 'coordination', 'BETA-MANIFEST.md');

function runScan() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ ERROR: BETA-MANIFEST.md not found. Are you running this from the workspace root?');
    process.exit(1);
  }

  const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  const lines = content.split('\n');

  let inTable = false;
  const statuses = [];
  const blockers = [];

  // Parse the table and blockers
  for (const line of lines) {
    if (line.trim().startsWith('| **AG-')) {
      inTable = true;
      const cols = line.split('|').map(c => c.trim());
      if (cols.length >= 7) {
        const lane = cols[1].replace(/\*\*/g, '');
        const status = cols[6].replace(/\*\*/g, '');
        statuses.push({ lane, status });
      }
    }

    if (line.trim().startsWith('- **AG-Release-Captain**:')) {
      if (!line.includes('RESOLVED')) {
         blockers.push('Release Captain deployment blocker is active: ' + line.trim());
      }
    }
  }

  console.log('🛡️  Quipsly Beta Pre-Deploy Scan 🛡️\n');
  let hasError = false;
  let hasPending = false;

  for (const { lane, status } of statuses) {
    if (status.toLowerCase().includes('blocked')) {
      console.error(`❌ BLOCKED: ${lane} is currently blocked.`);
      hasError = true;
    } else if (status.toLowerCase().includes('pending')) {
      console.warn(`⚠️  PENDING: ${lane} has not completed its beta execution pass.`);
      hasPending = true;
    } else if (status.toLowerCase().includes('ready')) {
      console.log(`✅ READY: ${lane}`);
    }
  }

  if (blockers.length > 0) {
    console.log('\n🚨 Active Global Blockers:');
    for (const b of blockers) {
      console.error(b);
    }
    hasError = true;
  }

  console.log('\n--- Scan Summary ---');
  if (hasError) {
    console.error('❌ DEPLOY BLOCKED. Resolve blocked lanes and global blockers before deploying.');
    process.exit(1);
  } else if (hasPending) {
    console.warn('⚠️  DEPLOY WARN. Some lanes are still pending. Proceed only if those lanes are intentionally omitted from this beta patch.');
    process.exit(0);
  } else {
    console.log('✅ ALL CLEAR. Beta Manifest validates cleanly. Safe to deploy.');
    process.exit(0);
  }
}

runScan();
