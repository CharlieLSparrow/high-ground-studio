import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(process.cwd(), 'docs', 'coordination', 'BETA-MANIFEST.md');

async function checkHealthz() {
  const targetUrl = process.env.PREVIEW_URL || 'http://localhost:3000';
  console.log(`\n🩺 Checking Release Health at ${targetUrl}/api/healthz...`);

  try {
    const res = await fetch(`${targetUrl}/api/healthz`);
    if (!res.ok) {
      console.warn(`⚠️  Health check returned ${res.status}. Ensure the server is running if you expect a strict check.`);
      return false;
    }

    const data = await res.json();
    let hasMissingConfig = false;

    if (data.config) {
      for (const [key, status] of Object.entries(data.config)) {
        if (!status.configured) {
          console.error(`❌ MISSING CONFIG: ${key} is required but missing from the runtime environment.`);
          hasMissingConfig = true;
        }
      }
    } else {
      console.warn('⚠️  Health check did not return a config block. Is this the compatibility endpoint?');
    }

    if (hasMissingConfig) {
      console.error('❌ DEPLOY BLOCKED. Release health check failed due to missing required configuration.');
      process.exit(1);
    } else {
      console.log('✅ Health check passed. Runtime config is intact.');
    }
  } catch (err) {
    console.warn(`⚠️  Could not reach ${targetUrl}/api/healthz. Skipping strict config validation.`);
  }
}

async function runScan() {
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

  await checkHealthz();

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
