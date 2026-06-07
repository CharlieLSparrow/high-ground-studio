import { WebSocketServer, WebSocket } from 'ws';
import { IngestService } from './IngestService';
import { RenderService } from './RenderService';
import { CloudSyncDaemon } from './CloudSync';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import { LOCAL_ENGINE_CAPABILITIES } from './FeatureRegistry';
import { VisionLabService } from './VisionLabService';
import { probeMediaFile } from './MediaProbeService';
import { ProxyGenerator } from './ProxyGenerator';
import { uploadAndRegisterEpisodeMedia } from './EpisodeMediaRegistrationService';
import { configuredMediaBucketName } from './MediaVaultConfig';
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const PORT = 4000;
const wss = new WebSocketServer({ port: PORT });

const ingestService = new IngestService();
const renderService = new RenderService();
const cloudSync = new CloudSyncDaemon(path.join(process.cwd(), '..', '..', 'HighGroundMedia'));
const visionLab = new VisionLabService(LOCAL_ENGINE_CAPABILITIES);
const proxyGenerator = new ProxyGenerator();

console.log(`🚀 Unified Local Engine started on ws://localhost:${PORT}`);

const KNOWN_PREMIERE_EPISODES = ['episode-1', 'episode-2', 'episode-3'];

function findRepoRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'scripts', 'quipsly', 'import-known-premiere-projects.mjs'))) {
      return candidate;
    }
  }

  return process.cwd();
}

function summarizePremierePacket(repoRoot: string, episodeSlug: string) {
  const outputPath = path.join(repoRoot, 'content', 'quipsly', 'premiere-imports', `${episodeSlug}.json`);
  if (!fs.existsSync(outputPath)) {
    return {
      episodeSlug,
      outputPath,
      ok: false,
      message: 'Packet has not been generated yet.',
    };
  }

  const packet = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const patch = packet.quipslyEpisodeProductionPatch ?? {};
  const spine = patch.premiereSuggestedSpineAudioCandidates?.[0] ?? {};

  return {
    episodeSlug: packet.episodeSlug ?? episodeSlug,
    outputPath,
    ok: true,
    projectSlug: packet.projectSlug,
    mediaCount: packet.summary?.mediaCount ?? 0,
    importMediaCount: packet.summary?.importMediaCount ?? packet.summary?.mediaCount ?? 0,
    projectMediaCount: packet.summary?.projectMediaCount ?? packet.summary?.mediaCount ?? 0,
    skippedProjectMediaCount: packet.summary?.skippedProjectMediaCount ?? 0,
    missingMediaCount: packet.summary?.missingMediaCount ?? 0,
    projectMissingMediaCount: packet.summary?.projectMissingMediaCount ?? packet.summary?.missingMediaCount ?? 0,
    iCloudHistoryCount: packet.summary?.iCloudHistoryCount ?? 0,
    projectICloudHistoryCount: packet.summary?.projectICloudHistoryCount ?? packet.summary?.iCloudHistoryCount ?? 0,
    primarySequenceName: packet.summary?.primarySequenceName ?? 'none',
    primaryTimelineClipCount: packet.summary?.primaryTimelineClipCount ?? 0,
    deactivatedCandidateCount: patch.premiereDeactivatedSourceCandidates?.length ?? 0,
    topSpineName: spine.originalName ?? 'none',
    topSpineExists: spine.exists ?? null,
    topSpineUsedTimelineSeconds: spine.usedTimelineSeconds ?? 0,
    topSpineRecommendation: spine.recommendation ?? '',
  };
}

async function runKnownPremiereImports(payload: any) {
  const repoRoot = findRepoRoot();
  const scriptPath = path.join(repoRoot, 'scripts', 'quipsly', 'import-known-premiere-projects.mjs');
  const projectSlug = String(payload?.projectSlug || 'high-ground-odyssey-manuscript').trim() || 'high-ground-odyssey-manuscript';
  const only = String(payload?.only || '').trim();
  const args = [scriptPath, '--project', projectSlug];
  if (only) args.push('--only', only);

  return new Promise<any>((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: Error) => {
      resolve({
        ok: false,
        status: 'failed',
        message: error.message,
        stdout,
        stderr,
        summaries: [],
      });
    });
    child.on('close', (code: number | null) => {
      const episodes = only ? [only] : KNOWN_PREMIERE_EPISODES;
      const summaries = episodes.map((episodeSlug) => summarizePremierePacket(repoRoot, episodeSlug));
      resolve({
        ok: code === 0,
        status: code === 0 ? 'ready' : 'failed',
        message: code === 0
          ? `Generated ${summaries.filter((summary) => summary.ok).length} Premiere packet(s).`
          : `Premiere packet import exited with code ${code ?? 'unknown'}.`,
        stdout,
        stderr,
        summaries,
      });
    });
  });
}

async function runPremiereMediaRelink(payload: any) {
  const repoRoot = findRepoRoot();
  const scriptPath = path.join(repoRoot, 'scripts', 'quipsly', 'relink-premiere-packet-media.mjs');
  const packetPath = String(payload?.packetPath || '').trim();
  const searchRoot = String(payload?.searchRoot || '').trim();
  const apply = payload?.apply !== false;

  if (!packetPath) {
    return {
      ok: false,
      status: 'failed',
      message: 'Choose a Premiere packet before searching for missing media.',
    };
  }

  if (!searchRoot) {
    return {
      ok: false,
      status: 'failed',
      message: 'Choose a folder to search for the missing primary media.',
    };
  }

  const args = [
    scriptPath,
    '--packet',
    packetPath,
    '--search-root',
    searchRoot,
    '--json',
  ];
  if (apply) args.push('--apply');

  return new Promise<any>((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: Error) => {
      resolve({
        ok: false,
        status: 'failed',
        message: error.message,
        stdout,
        stderr,
      });
    });
    child.on('close', (code: number | null) => {
      const output = stdout.trim();
      let parsed: any = null;
      try {
        parsed = output ? JSON.parse(output) : null;
      } catch {
        parsed = null;
      }

      if (code === 0 && parsed?.ok) {
        resolve({
          ...parsed,
          status: 'complete',
          message: apply
            ? `Relinked ${parsed.relinkedCount ?? 0} primary media file(s); ${parsed.missingAfter ?? 0} still missing.`
            : `Found candidates for ${(parsed.relinkedCount ?? 0) + (parsed.ambiguousCount ?? 0)} primary media file(s).`,
          stdout,
          stderr,
        });
      } else {
        resolve({
          ok: false,
          status: 'failed',
          message: parsed?.error || stderr.trim() || `Premiere media relink failed with exit code ${code}`,
          stdout,
          stderr,
        });
      }
    });
  });
}

wss.on('connection', (ws: WebSocket) => {
  console.log('✅ Studio Web UI connected to Local Engine');

  // Broadcast function to send updates back to the UI
  const broadcast = (type: string, payload: any) => {
    ws.send(JSON.stringify({ type, payload }));
  };

  const publicEpisodePayload = (payload: any) => {
    if (!payload || typeof payload !== 'object') return payload;
    const { nestSessionToken: _nestSessionToken, ...safePayload } = payload;
    return safePayload;
  };

  broadcast('ENGINE_CAPABILITIES', LOCAL_ENGINE_CAPABILITIES);
  broadcast('VISION_LAB_STATUS', visionLab.getStatus());

  // Wire up service events to broadcast back to the UI
  ingestService.onProgress = (jobs) => broadcast('INGEST_PROGRESS', jobs);
  renderService.onProgress = (jobs) => broadcast('RENDER_PROGRESS', jobs);

  ws.on('message', async (message: string) => {
    try {
      const { type, payload } = JSON.parse(message);
      console.log(`📥 Received Command: ${type}`);

      switch (type) {
        case 'QUEUE_EPISODE_IMPORT':
          broadcast('EPISODE_IMPORT_QUEUED', {
            ...payload,
            status: 'queued',
            message: 'Queued in the local engine. Metadata probe will start next.'
          });
          break;
        case 'PROBE_MEDIA_FILE': {
          broadcast('EPISODE_IMPORT_PROGRESS', {
            ...payload,
            status: 'probing',
            message: 'Reading duration, streams, codecs, audio/video presence, and safe warnings.'
          });

          const probe = await probeMediaFile(String(payload?.path ?? ''));
          broadcast('MEDIA_PROBE_RESULT', {
            ...payload,
            status: probe.ok ? 'proxying' : 'held',
            probe,
            message: probe.ok
              ? 'Probe complete. Proxy and thumbnail generation can start.'
              : probe.error || 'Probe could not read this item yet.'
          });
          break;
        }
        case 'GENERATE_EPISODE_PROXY': {
          try {
            broadcast('EPISODE_IMPORT_PROGRESS', {
              ...payload,
              status: 'proxying',
              message: 'Generating Quipsly-managed proxy and thumbnail cache files.'
            });

            const proxy = await proxyGenerator.generateProxyAndThumbnail(String(payload?.path ?? ''));
            broadcast('MEDIA_PROXY_RESULT', {
              ...payload,
              status: proxy.error ? 'held' : 'uploading',
              proxy,
              message: proxy.error
                ? proxy.error
                : proxy.kind === 'audio'
                  ? 'Audio is ready for sync. No video proxy was needed.'
                  : 'Proxy and thumbnail are ready in the Quipsly media cache.'
            });
          } catch (error: any) {
            broadcast('MEDIA_PROXY_RESULT', {
              ...payload,
              status: 'held',
              proxy: error?.result ?? {
                rawPath: String(payload?.path ?? ''),
                kind: 'unknown',
                fingerprint: '',
                cacheDir: '',
                warnings: [],
                error: error?.message ?? 'Proxy generation failed.'
              },
              message: error?.message ?? 'Proxy generation failed.'
            });
          }
          break;
        }
        case 'UPLOAD_REGISTER_EPISODE_MEDIA': {
          const safePayload = publicEpisodePayload(payload);
          broadcast('EPISODE_IMPORT_PROGRESS', {
            ...safePayload,
            status: 'uploading',
            message: 'Uploading raw/proxy/thumb to the configured media vault and registering with Nest when possible.'
          });

          const registration = await uploadAndRegisterEpisodeMedia(payload ?? {});
          broadcast('MEDIA_REGISTER_RESULT', {
            ...safePayload,
            status: registration.ok ? 'registered' : 'held',
            registration,
            message: registration.ok
              ? registration.assetId
                ? 'Uploaded and registered with the Nest episode.'
                : 'Uploaded to the media vault. Nest registration still needs review.'
              : registration.error || 'Upload/register was held safely.'
          });
          break;
        }
        case 'RUN_KNOWN_PREMIERE_IMPORTS': {
          broadcast('PREMIERE_IMPORT_PROGRESS', {
            ok: true,
            status: 'running',
            message: payload?.only
              ? `Refreshing Premiere packet for ${payload.only}...`
              : 'Refreshing known Episode 1-3 Premiere packets...',
            summaries: [],
          });

          const result = await runKnownPremiereImports(payload ?? {});
          broadcast('PREMIERE_IMPORT_RESULT', result);
          break;
        }
        case 'RELINK_PREMIERE_PACKET_MEDIA': {
          broadcast('PREMIERE_RELINK_PROGRESS', {
            ok: true,
            status: 'running',
            message: 'Searching only missing primary-timeline media. Unused Premiere project references will stay untouched.',
          });

          const result = await runPremiereMediaRelink(payload ?? {});
          broadcast('PREMIERE_RELINK_RESULT', result);
          break;
        }
        case 'START_INGEST':
          await ingestService.startSmartIngest(payload?.sourceDir || '/Volumes/Bender/DCIM/107CANON');
          break;
        case 'START_RENDER':
          await renderService.startRender(payload.edl, payload.outputName);
          break;
        case 'START_CLOUD_SYNC':
          await cloudSync.triggerSync((progress) => {
             broadcast('SYNC_PROGRESS', { progress, status: cloudSync.getStatus() });
          });
          broadcast('SYNC_PROGRESS', { progress: 100, status: cloudSync.getStatus() });
          break;
        case 'SCAN_INSTA360':
          console.log(`🤖 Dispatching Antigravity UI Agent to scan Insta360 Studio...`);
          const { exec } = require('node:child_process');
          const scriptPath = path.join(process.cwd(), 'scripts', 'insta360-scraper-agent.py');
          const uvPath = path.join(process.env.HOME || '/Users/wall-e', '.local', 'bin', 'uv');

          exec(`"${uvPath}" run --with google-genai --with pillow python3 "${scriptPath}"`, { env: process.env }, (error: any, stdout: string, stderr: string) => {
             console.log("--- PYTHON STDOUT ---");
             console.log(stdout);
             console.log("--- PYTHON STDERR ---");
             console.error(stderr);
             if (error) {
               console.error(`❌ Agent Error: ${error.message}`);
               broadcast('INSTA360_SCAN_RESULT', { error: error.message });
               return;
             }

             // Extract JSON payload
             const match = stdout.match(/===AGENT_PAYLOAD_START===\n([\s\S]*?)\n===AGENT_PAYLOAD_END===/m);
             if (match && match[1]) {
                let jsonStr = match[1].trim();
                // Strip markdown block if present
                if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
                if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
                try {
                   const videos = JSON.parse(jsonStr);
                   broadcast('INSTA360_SCAN_RESULT', { success: true, videos });
                } catch (parseError) {
                   console.error(`❌ Failed to parse JSON: ${jsonStr}`);
                   broadcast('INSTA360_SCAN_RESULT', { error: 'Agent payload was not valid JSON.' });
                }
             } else {
                broadcast('INSTA360_SCAN_RESULT', { error: 'Failed to parse agent output.' });
             }
          });
          break;
        case 'EXECUTE_INSTA360_CLICK':
          console.log(`🖱️ Executing UI Automation click...`);
          const { box } = payload;
          const { exec: clickExec } = require('node:child_process');
          const clickScriptPath = path.join(process.cwd(), 'scripts', 'insta360-click-agent.py');
          const uvExecPath = path.join(process.env.HOME || '/Users/wall-e', '.local', 'bin', 'uv');
          clickExec(`"${uvExecPath}" run --with pyautogui python3 "${clickScriptPath}" ${box.x} ${box.y} ${box.w} ${box.h}`, (error: any, stdout: string) => {
             if (error) console.error(`❌ Click Agent Error: ${error.message}`);
             else console.log(stdout);
          });
          break;
        case 'PUSH_LOCAL_TO_VAULT':
          console.log(`☁️ Pushing ${payload.fileName} to GCS Vault...`);
          const fsPush = require('node:fs');
          const cryptoPush = require('node:crypto');
          const osPush = require('node:os');
          let pushBaseRoot = osPush.homedir();
          if (payload.root === 'icloud') pushBaseRoot = path.join(osPush.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
          else if (payload.root === 'desktop') pushBaseRoot = path.join(osPush.homedir(), 'Desktop');
          else if (payload.root === 'downloads') pushBaseRoot = path.join(osPush.homedir(), 'Downloads');

          const pushTargetPath = path.join(pushBaseRoot, payload.subpath || '', payload.fileName);

          broadcast('SYNC_PROGRESS', { progress: 10, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: true } });

          const { Storage: PushStorage } = require('@google-cloud/storage');
          const { OAuth2Client: PushOAuth2Client } = require('google-auth-library');
          const { execSync: pushExecSync } = require('child_process');
          const pushToken = pushExecSync('gcloud auth print-access-token').toString().trim();
          const pushAuthClient = new PushOAuth2Client();
          pushAuthClient.setCredentials({ access_token: pushToken });

          const pushStorage = new PushStorage({ projectId: 'high-ground-odyssey', authClient: pushAuthClient });
          const pushBucket = pushStorage.bucket(configuredMediaBucketName());
          const gcsFile = pushBucket.file(payload.objectName || payload.fileName);

          const fsStat = fsPush.statSync(pushTargetPath);
          const fileSize = fsStat.size;

          const readStream = fsPush.createReadStream(pushTargetPath);
          const writeStream = gcsFile.createWriteStream({ resumable: true });

          let uploadedBytes = 0;

          readStream.on('data', (chunk: any) => {
             uploadedBytes += chunk.length;
             const progress = Math.min(99, Math.floor((uploadedBytes / fileSize) * 100));
             broadcast('FILE_PUSH_PROGRESS', { fileName: payload.fileName, progress });
          });

          readStream.pipe(writeStream);

          writeStream.on('finish', () => {
             broadcast('FILE_PUSH_PROGRESS', { fileName: payload.fileName, progress: 100 });
             broadcast('SYNC_PROGRESS', { progress: 100, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: false } });
          });

          writeStream.on('error', (err: any) => {
             console.error(`❌ GCS Push error: ${err.message}`);
             broadcast('SYNC_PROGRESS', { progress: 0, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: false } });
          });

          readStream.on('error', (err: any) => {
             console.error(`❌ Local file read error: ${err.message}`);
             broadcast('SYNC_PROGRESS', { progress: 0, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: false } });
          });
          break;

        case 'START_OFFLOAD':
          console.log(`🚀 Starting offload: ${payload.sourcePath} -> ${payload.destinations.join(', ')}`);
          const { OffloadManager } = require('./OffloadManager');
          const { ProxyGenerator } = require('./ProxyGenerator');
          const { ReportGenerator } = require('./ReportGenerator');
          const { AILogger } = require('./AILogger');

          const offloadMgr = new OffloadManager();
          const proxyGen = new ProxyGenerator();
          const reportGen = new ReportGenerator();
          const aiLogger = new AILogger();

          // Keep a global array of offloaded clips for the report.
          // In a real app this would be in a DB, but for the local engine memory is fine.
          if (!(global as any).offloadedClips) (global as any).offloadedClips = [];

          broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 0, status: 'STARTING' });

          offloadMgr.offload(payload.sourcePath, payload.destinations, (prog: number) => {
            broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: prog, status: 'RUNNING' });
          }).then(async (result: any) => {
            console.log(`✅ Offload complete. Hash: ${result.hash}`);
            broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 100, status: 'PROXYING', hash: result.hash });

            try {
              // Now generate Proxy + Thumbnail
              const { proxyPath, thumbnailPath } = await proxyGen.generateProxyAndThumbnail(payload.sourcePath);
              broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 100, status: 'AI_LOGGING', hash: result.hash, proxy: proxyPath });

              // Now call Gemini for AI Auto-logging
              const { tags, smartName } = await aiLogger.extractTagsAndRename(thumbnailPath, path.basename(payload.sourcePath));

              const fs = require('fs');
              const stat = fs.statSync(payload.sourcePath);
              const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

              const newClip = {
                 sourceFile: payload.sourcePath,
                 destinations: payload.destinations,
                 hashHex: result.hash,
                 sizeMb,
                 thumbnailPath,
                 tags,
                 smartName
              };

              (global as any).offloadedClips.push(newClip);

              // Generate the Daily Report HTML file
              reportGen.generateDailyReport((global as any).offloadedClips);

              broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 100, status: 'COMPLETE', hash: result.hash, proxy: proxyPath, tags, smartName });
              broadcast('REPORTS_UPDATED', (global as any).offloadedClips);
            } catch (err: any) {
              console.error('❌ Proxy/Report error:', err);
              broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 100, status: 'ERROR', hash: result.hash, error: err.message });
            }
          }).catch((err: any) => {
            console.error(`❌ Offload error:`, err);
            broadcast('OFFLOAD_PROGRESS', { file: path.basename(payload.sourcePath), progress: 0, status: 'ERROR', error: err.message });
          });
          break;
        case 'VERIFY_FILE_CHECKSUM':
          console.log(`🔍 Verifying checksum for ${payload.fileName}...`);
          const fsVerify = require('node:fs');
          const cryptoVerify = require('node:crypto');
          const osVerify = require('node:os');
          let verifyBaseRoot = osVerify.homedir();
          if (payload.root === 'icloud') verifyBaseRoot = path.join(osVerify.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
          else if (payload.root === 'desktop') verifyBaseRoot = path.join(osVerify.homedir(), 'Desktop');
          else if (payload.root === 'downloads') verifyBaseRoot = path.join(osVerify.homedir(), 'Downloads');

          const verifyTargetPath = path.join(verifyBaseRoot, payload.subpath || '', payload.fileName);

          const vHashStream = cryptoVerify.createHash('md5');
          const vReadStream = fsVerify.createReadStream(verifyTargetPath);

          vReadStream.on('data', (chunk: any) => vHashStream.update(chunk));
          vReadStream.on('end', () => {
             const md5 = vHashStream.digest('hex');
             broadcast('FILE_CHECKSUM_RESULT', { fileName: payload.fileName, md5 });
          });
          vReadStream.on('error', (err: any) => {
             console.error(`❌ Checksum error: ${err.message}`);
             broadcast('FILE_CHECKSUM_RESULT', { fileName: payload.fileName, error: err.message });
          });
          break;
        case 'DELETE_LOCAL_FILE':
          console.log(`🗑️ Deleting local file: ${payload.fileName} from ${payload.root}`);
          try {
             const fs = require('node:fs/promises');
             const os = require('node:os');
             let delBaseRoot = os.homedir();
             if (payload.root === 'icloud') delBaseRoot = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
             else if (payload.root === 'desktop') delBaseRoot = path.join(os.homedir(), 'Desktop');
             else if (payload.root === 'downloads') delBaseRoot = path.join(os.homedir(), 'Downloads');

             const delTargetPath = path.join(delBaseRoot, payload.subpath || '', payload.fileName);
             await fs.unlink(delTargetPath);
             console.log(`✅ Successfully deleted ${delTargetPath}`);
             // Trigger a re-read of the directory to refresh UI
             const dirents = await fs.readdir(path.join(delBaseRoot, payload.subpath || ''), { withFileTypes: true });
             const files = dirents.filter((d: any) => !d.name.startsWith('.')).map((d: any) => ({
                id: crypto.randomUUID(), name: d.name, isDirectory: d.isDirectory(), size: d.isDirectory() ? null : 'Unknown', date: new Date().toISOString().split('T')[0]
             }));
             broadcast('LOCAL_DIR_RESULT', { files, currentPath: payload.subpath, root: payload.root });
          } catch (e: any) {
             console.error(`❌ Failed to delete file: ${e.message}`);
          }
          break;
        case 'SLICE_TO_VERTICAL':
          console.log(`✂️ Slicing to vertical: ${payload.sourceFile}`);
          try {
             const { AutoCropper } = require('./AutoCropper');
             const cropper = new AutoCropper();

             broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: 0, status: 'SLICING' });

             const outPath = await cropper.sliceToVertical(payload.sourceFile, (prog: number) => {
                broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: prog, status: 'SLICING' });
             });

             broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: 100, status: 'COMPLETE', outPath });
          } catch (e: any) {
             console.error(`❌ Crop error: ${e.message}`);
             broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: 0, status: 'ERROR', error: e.message });
          }
          break;
        case 'READ_LOCAL_DIR':
          console.log(`📂 Reading local directory: root=${payload.root}, path=${payload.subpath || '/'}`);
          const fs = require('node:fs/promises');
          const os = require('node:os');

          let baseRoot = os.homedir();
          if (payload.root === 'icloud') {
            baseRoot = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
          } else if (payload.root === 'desktop') {
            baseRoot = path.join(os.homedir(), 'Desktop');
          } else if (payload.root === 'downloads') {
            baseRoot = path.join(os.homedir(), 'Downloads');
          }

          const targetPath = path.join(baseRoot, payload.subpath || '');

          try {
            const dirents = await fs.readdir(targetPath, { withFileTypes: true });
            const files = [];

            for (const dirent of dirents) {
               if (dirent.name === '.DS_Store') continue;
               const fullPath = path.join(targetPath, dirent.name);
               try {
                   const stats = await fs.stat(fullPath);

                   let sizeStr = '';
                   if (dirent.isFile()) {
                      const mb = stats.size / (1024 * 1024);
                      if (mb > 1024) sizeStr = (mb / 1024).toFixed(1) + ' GB';
                      else sizeStr = mb.toFixed(1) + ' MB';
                   }

                   files.push({
                     id: dirent.name,
                     name: dirent.name,
                     isDirectory: dirent.isDirectory(),
                     size: sizeStr,
                     date: stats.mtime.toLocaleDateString()
                   });
               } catch (e) {
                   // Skip files we can't stat
               }
            }

            files.sort((a, b) => {
               if (a.isDirectory && !b.isDirectory) return -1;
               if (!a.isDirectory && b.isDirectory) return 1;
               return a.name.localeCompare(b.name);
            });

            broadcast('LOCAL_DIR_RESULT', { success: true, files, currentPath: payload.subpath || '', root: payload.root });
          } catch (err: any) {
            broadcast('LOCAL_DIR_RESULT', { error: `Failed to read directory: ${err.message}`, root: payload.root });
          }
          break;
        case 'OPEN_GCS_BUCKET':
          console.log(`🌐 Opening GCS Vault in browser...`);
          const { exec: execGcs } = require('node:child_process');
          const bucketName = configuredMediaBucketName();
          const bucketUrl = `https://console.cloud.google.com/storage/browser/${bucketName}`;

          let openCmd = 'open'; // macOS
          if (process.platform === 'win32') openCmd = 'start';
          if (process.platform === 'linux') openCmd = 'xdg-open';

          execGcs(`${openCmd} "${bucketUrl}"`, (err: any) => {
             if (err) console.error(`Failed to open browser: ${err.message}`);
          });
          break;
        case 'GET_STATUS':
          broadcast('INGEST_PROGRESS', ingestService.getJobs());
          broadcast('RENDER_PROGRESS', renderService.getJobs());
          broadcast('SYNC_STATUS', cloudSync.getStatus());
          broadcast('ENGINE_CAPABILITIES', LOCAL_ENGINE_CAPABILITIES);
          broadcast('VISION_LAB_STATUS', visionLab.getStatus());
          broadcast('VISION_MANIFESTS_LIST', await visionLab.listSavedManifests());
          break;
        case 'GET_CAPABILITIES':
          broadcast('ENGINE_CAPABILITIES', LOCAL_ENGINE_CAPABILITIES);
          break;
        case 'GET_VISION_LAB_STATUS':
          broadcast('VISION_LAB_STATUS', visionLab.getStatus());
          break;
        case 'GET_VISION_MANIFESTS':
          broadcast('VISION_MANIFESTS_LIST', await visionLab.listSavedManifests());
          break;
        case 'REGISTER_VISION_DATASET':
          if (!payload?.folderPath) {
            broadcast('VISION_LAB_STATUS', visionLab.getStatus());
            break;
          }
          broadcast('VISION_LAB_STATUS', visionLab.registerDataset(payload.folderPath));
          break;
        case 'BUILD_VISION_MANIFEST':
          broadcast('VISION_LAB_STATUS', await visionLab.buildManifest(payload?.folderPath));
          broadcast('VISION_MANIFESTS_LIST', await visionLab.listSavedManifests());
          break;
        case 'COMPUTE_VISION_CONTENT_HASHES':
          broadcast('VISION_LAB_STATUS', await visionLab.computeContentHashes());
          broadcast('VISION_MANIFESTS_LIST', await visionLab.listSavedManifests());
          break;
        case 'FETCH_PROJECTS':
          console.log(`📋 Fetching active StudioProjects...`);
          broadcast('PROJECTS_LIST_ERROR', {
            error: 'Project lists are owned by Nest now. Open the Nest projects hub or use the Mac app project slug settings instead of local mock projects.',
            nestProjectsUrl: `${String(payload?.nestBaseURL || 'https://nest.quipsly.com').replace(/\/$/, '')}/projects`
          });
          break;
        default:
          console.warn(`Unknown command type: ${type}`);
      }
    } catch (err: any) {
      console.error(`Error processing message: ${err.message}`);
    }
  });

  ws.on('close', () => {
    console.log('❌ Studio Web UI disconnected');
  });
});
