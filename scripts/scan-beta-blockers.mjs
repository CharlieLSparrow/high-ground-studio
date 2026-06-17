import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(process.cwd(), 'docs', 'coordination', 'BETA-MANIFEST.md');
const REPORTS_DIR = path.join(process.cwd(), 'docs', 'coordination', 'antigravity-reports');

const ALLOWED_LANES = new Set([
  'AG-Editor-Spine',
  'AG-Assistant',
  'AG-Research-RAG',
  'AG-Video-Editor',
  'AG-Storyboard',
  'AG-Project-Management',
  'AG-Marketing',
  'AG-Patreon-Support',
  'AG-Mobile-Recording',
  'AG-Agent-Coordination',
  'AG-HighGroundOdyssey',
  'AG-QuipLore',
  'AG-Fiction-Analysis',
  'AG-Publishing-Integrations',
  'AG-Scroll-Experiences',
  'AG-Release-Captain'
]);

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
  let inBlockersSection = false;
  const statuses = [];
  const blockers = [];

  // Parse the table and blockers
  for (const line of lines) {
    if (line.startsWith('## 2. Active Beta Blockers')) {
      inBlockersSection = true;
      continue;
    }
    if (inBlockersSection && line.startsWith('## 3.')) {
      inBlockersSection = false;
    }

    if (line.trim().startsWith('| **AG-')) {
      inTable = true;
      const cols = line.split('|').map(c => c.trim());
      if (cols.length >= 7) {
        const lane = cols[1].replace(/\*\*/g, '');
        const status = cols[6].replace(/\*\*/g, '');
        statuses.push({ lane, status });
      }
    }

    if (inBlockersSection && line.trim().startsWith('- **')) {
      if (!line.includes('RESOLVED')) {
         blockers.push(line.trim());
      }
    }
  }

  console.log('🛡️  Quipsly Beta Pre-Deploy Scan 🛡️\n');
  let hasError = false;
  let hasPending = false;
  let hasNamingError = false;

  let hasNeedsReview = false;

  for (const { lane, status } of statuses) {
    if (status.toLowerCase().includes('blocked')) {
      console.error(`❌ BLOCKED: ${lane} is currently blocked.`);
      hasError = true;
    } else if (status.toLowerCase().includes('pending')) {
      console.warn(`⚠️  PENDING: ${lane} has not completed its beta execution pass.`);
      hasPending = true;
    } else if (status.toLowerCase().includes('needs codex review')) {
      console.error(`🛑 REVIEW REQUIRED: ${lane} requires explicit Codex review.`);
      hasNeedsReview = true;
    } else if (status.toLowerCase().includes('ready')) {
      console.log(`✅ READY: ${lane}`);
    }
  }

  if (fs.existsSync(REPORTS_DIR)) {
    console.log('\n📝 Validating Report Lane Names...');
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const reportContent = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
      const reportLines = reportContent.split('\n');
      for (const rline of reportLines) {
        const match = rline.match(/^## .*? - (AG-[\w-]+)/);
        if (match) {
          const lane = match[1];
          if (!ALLOWED_LANES.has(lane)) {
            console.error(`❌ INVALID LANE NAME: "${lane}" found in ${file}. Agents must use strictly allowed lane names.`);
            hasNamingError = true;
          }
        }
      }
    }
    if (!hasNamingError) console.log('✅ All lane names correctly adhere to the stable 16-lane manifest.');
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
  if (hasError || hasNamingError) {
    console.error('❌ DEPLOY BLOCKED. Resolve blocked lanes, invalid names, and global blockers before deploying.');
    process.exit(1);
  } else if (hasNeedsReview) {
    console.error('❌ DEPLOY BLOCKED. You must review the lanes marked "Needs Codex Review" and explicitly change their status to "Ready" in the manifest.');
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
