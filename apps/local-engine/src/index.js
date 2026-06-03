"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const IngestService_1 = require("./IngestService");
const RenderService_1 = require("./RenderService");
const CloudSync_1 = require("./CloudSync");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.join(__dirname, '..', '..', '..', '.env') });
const PORT = 4000;
const wss = new ws_1.WebSocketServer({ port: PORT });
const ingestService = new IngestService_1.IngestService();
const renderService = new RenderService_1.RenderService();
const cloudSync = new CloudSync_1.CloudSyncDaemon(path_1.default.join(process.cwd(), '..', '..', 'HighGroundMedia'));
console.log(`🚀 Unified Local Engine started on ws://localhost:${PORT}`);
wss.on('connection', (ws) => {
    console.log('✅ Studio Web UI connected to Local Engine');
    // Broadcast function to send updates back to the UI
    const broadcast = (type, payload) => {
        ws.send(JSON.stringify({ type, payload }));
    };
    // Wire up service events to broadcast back to the UI
    ingestService.onProgress = (jobs) => broadcast('INGEST_PROGRESS', jobs);
    renderService.onProgress = (jobs) => broadcast('RENDER_PROGRESS', jobs);
    ws.on('message', async (message) => {
        try {
            const { type, payload } = JSON.parse(message);
            console.log(`📥 Received Command: ${type}`);
            switch (type) {
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
                    const scriptPath = path_1.default.join(process.cwd(), 'scripts', 'insta360-scraper-agent.py');
                    const uvPath = path_1.default.join(process.env.HOME || '/Users/wall-e', '.local', 'bin', 'uv');
                    exec(`"${uvPath}" run --with google-genai --with pillow python3 "${scriptPath}"`, { env: process.env }, (error, stdout, stderr) => {
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
                            if (jsonStr.startsWith('```json'))
                                jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
                            if (jsonStr.startsWith('```'))
                                jsonStr = jsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
                            try {
                                const videos = JSON.parse(jsonStr);
                                broadcast('INSTA360_SCAN_RESULT', { success: true, videos });
                            }
                            catch (parseError) {
                                console.error(`❌ Failed to parse JSON: ${jsonStr}`);
                                broadcast('INSTA360_SCAN_RESULT', { error: 'Agent payload was not valid JSON.' });
                            }
                        }
                        else {
                            broadcast('INSTA360_SCAN_RESULT', { error: 'Failed to parse agent output.' });
                        }
                    });
                    break;
                case 'EXECUTE_INSTA360_CLICK':
                    console.log(`🖱️ Executing UI Automation click...`);
                    const { box } = payload;
                    const { exec: clickExec } = require('node:child_process');
                    const clickScriptPath = path_1.default.join(process.cwd(), 'scripts', 'insta360-click-agent.py');
                    const uvExecPath = path_1.default.join(process.env.HOME || '/Users/wall-e', '.local', 'bin', 'uv');
                    clickExec(`"${uvExecPath}" run --with pyautogui python3 "${clickScriptPath}" ${box.x} ${box.y} ${box.w} ${box.h}`, (error, stdout) => {
                        if (error)
                            console.error(`❌ Click Agent Error: ${error.message}`);
                        else
                            console.log(stdout);
                    });
                    break;
                case 'PUSH_LOCAL_TO_VAULT':
                    console.log(`☁️ Pushing ${payload.fileName} to GCS Vault...`);
                    const fsPush = require('node:fs');
                    const cryptoPush = require('node:crypto');
                    const osPush = require('node:os');
                    let pushBaseRoot = osPush.homedir();
                    if (payload.root === 'icloud')
                        pushBaseRoot = path_1.default.join(osPush.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
                    else if (payload.root === 'desktop')
                        pushBaseRoot = path_1.default.join(osPush.homedir(), 'Desktop');
                    else if (payload.root === 'downloads')
                        pushBaseRoot = path_1.default.join(osPush.homedir(), 'Downloads');
                    const pushTargetPath = path_1.default.join(pushBaseRoot, payload.subpath || '', payload.fileName);
                    broadcast('SYNC_PROGRESS', { progress: 10, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: true } });
                    const { Storage: PushStorage } = require('@google-cloud/storage');
                    const { OAuth2Client: PushOAuth2Client } = require('google-auth-library');
                    const { execSync: pushExecSync } = require('child_process');
                    const pushToken = pushExecSync('gcloud auth print-access-token').toString().trim();
                    const pushAuthClient = new PushOAuth2Client();
                    pushAuthClient.setCredentials({ access_token: pushToken });
                    const pushStorage = new PushStorage({ projectId: 'high-ground-odyssey', authClient: pushAuthClient });
                    const pushBucket = pushStorage.bucket('high-ground-raw-footage');
                    const gcsFile = pushBucket.file(payload.fileName);
                    const fsStat = fsPush.statSync(pushTargetPath);
                    const fileSize = fsStat.size;
                    const readStream = fsPush.createReadStream(pushTargetPath);
                    const writeStream = gcsFile.createWriteStream({ resumable: true });
                    let uploadedBytes = 0;
                    readStream.on('data', (chunk) => {
                        uploadedBytes += chunk.length;
                        const progress = Math.min(99, Math.floor((uploadedBytes / fileSize) * 100));
                        broadcast('FILE_PUSH_PROGRESS', { fileName: payload.fileName, progress });
                    });
                    readStream.pipe(writeStream);
                    writeStream.on('finish', () => {
                        broadcast('FILE_PUSH_PROGRESS', { fileName: payload.fileName, progress: 100 });
                        broadcast('SYNC_PROGRESS', { progress: 100, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: false } });
                    });
                    writeStream.on('error', (err) => {
                        console.error(`❌ GCS Push error: ${err.message}`);
                        broadcast('SYNC_PROGRESS', { progress: 0, status: { pendingFiles: [], cloudVault: cloudSync.getStatus().cloudVault, isSyncing: false } });
                    });
                    readStream.on('error', (err) => {
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
                    if (!global.offloadedClips)
                        global.offloadedClips = [];
                    broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 0, status: 'STARTING' });
                    offloadMgr.offload(payload.sourcePath, payload.destinations, (prog) => {
                        broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: prog, status: 'RUNNING' });
                    }).then(async (result) => {
                        console.log(`✅ Offload complete. Hash: ${result.hash}`);
                        broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 100, status: 'PROXYING', hash: result.hash });
                        try {
                            // Now generate Proxy + Thumbnail
                            const { proxyPath, thumbnailPath } = await proxyGen.generateProxyAndThumbnail(payload.sourcePath);
                            broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 100, status: 'AI_LOGGING', hash: result.hash, proxy: proxyPath });
                            // Now call Gemini for AI Auto-logging
                            const { tags, smartName } = await aiLogger.extractTagsAndRename(thumbnailPath, path_1.default.basename(payload.sourcePath));
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
                            global.offloadedClips.push(newClip);
                            // Generate the Daily Report HTML file
                            reportGen.generateDailyReport(global.offloadedClips);
                            broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 100, status: 'COMPLETE', hash: result.hash, proxy: proxyPath, tags, smartName });
                            broadcast('REPORTS_UPDATED', global.offloadedClips);
                        }
                        catch (err) {
                            console.error('❌ Proxy/Report error:', err);
                            broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 100, status: 'ERROR', hash: result.hash, error: err.message });
                        }
                    }).catch((err) => {
                        console.error(`❌ Offload error:`, err);
                        broadcast('OFFLOAD_PROGRESS', { file: path_1.default.basename(payload.sourcePath), progress: 0, status: 'ERROR', error: err.message });
                    });
                    break;
                case 'VERIFY_FILE_CHECKSUM':
                    console.log(`🔍 Verifying checksum for ${payload.fileName}...`);
                    const fsVerify = require('node:fs');
                    const cryptoVerify = require('node:crypto');
                    const osVerify = require('node:os');
                    let verifyBaseRoot = osVerify.homedir();
                    if (payload.root === 'icloud')
                        verifyBaseRoot = path_1.default.join(osVerify.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
                    else if (payload.root === 'desktop')
                        verifyBaseRoot = path_1.default.join(osVerify.homedir(), 'Desktop');
                    else if (payload.root === 'downloads')
                        verifyBaseRoot = path_1.default.join(osVerify.homedir(), 'Downloads');
                    const verifyTargetPath = path_1.default.join(verifyBaseRoot, payload.subpath || '', payload.fileName);
                    const vHashStream = cryptoVerify.createHash('md5');
                    const vReadStream = fsVerify.createReadStream(verifyTargetPath);
                    vReadStream.on('data', (chunk) => vHashStream.update(chunk));
                    vReadStream.on('end', () => {
                        const md5 = vHashStream.digest('hex');
                        broadcast('FILE_CHECKSUM_RESULT', { fileName: payload.fileName, md5 });
                    });
                    vReadStream.on('error', (err) => {
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
                        if (payload.root === 'icloud')
                            delBaseRoot = path_1.default.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
                        else if (payload.root === 'desktop')
                            delBaseRoot = path_1.default.join(os.homedir(), 'Desktop');
                        else if (payload.root === 'downloads')
                            delBaseRoot = path_1.default.join(os.homedir(), 'Downloads');
                        const delTargetPath = path_1.default.join(delBaseRoot, payload.subpath || '', payload.fileName);
                        await fs.unlink(delTargetPath);
                        console.log(`✅ Successfully deleted ${delTargetPath}`);
                        // Trigger a re-read of the directory to refresh UI
                        const dirents = await fs.readdir(path_1.default.join(delBaseRoot, payload.subpath || ''), { withFileTypes: true });
                        const files = dirents.filter((d) => !d.name.startsWith('.')).map((d) => ({
                            id: crypto.randomUUID(), name: d.name, isDirectory: d.isDirectory(), size: d.isDirectory() ? null : 'Unknown', date: new Date().toISOString().split('T')[0]
                        }));
                        broadcast('LOCAL_DIR_RESULT', { files, currentPath: payload.subpath, root: payload.root });
                    }
                    catch (e) {
                        console.error(`❌ Failed to delete file: ${e.message}`);
                    }
                    break;
                case 'SLICE_TO_VERTICAL':
                    console.log(`✂️ Slicing to vertical: ${payload.sourceFile}`);
                    try {
                        const { AutoCropper } = require('./AutoCropper');
                        const cropper = new AutoCropper();
                        broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: 0, status: 'SLICING' });
                        const outPath = await cropper.sliceToVertical(payload.sourceFile, (prog) => {
                            broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: prog, status: 'SLICING' });
                        });
                        broadcast('CROP_PROGRESS', { file: payload.sourceFile, progress: 100, status: 'COMPLETE', outPath });
                    }
                    catch (e) {
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
                        baseRoot = path_1.default.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs');
                    }
                    else if (payload.root === 'desktop') {
                        baseRoot = path_1.default.join(os.homedir(), 'Desktop');
                    }
                    else if (payload.root === 'downloads') {
                        baseRoot = path_1.default.join(os.homedir(), 'Downloads');
                    }
                    const targetPath = path_1.default.join(baseRoot, payload.subpath || '');
                    try {
                        const dirents = await fs.readdir(targetPath, { withFileTypes: true });
                        const files = [];
                        for (const dirent of dirents) {
                            if (dirent.name === '.DS_Store')
                                continue;
                            const fullPath = path_1.default.join(targetPath, dirent.name);
                            try {
                                const stats = await fs.stat(fullPath);
                                let sizeStr = '';
                                if (dirent.isFile()) {
                                    const mb = stats.size / (1024 * 1024);
                                    if (mb > 1024)
                                        sizeStr = (mb / 1024).toFixed(1) + ' GB';
                                    else
                                        sizeStr = mb.toFixed(1) + ' MB';
                                }
                                files.push({
                                    id: dirent.name,
                                    name: dirent.name,
                                    isDirectory: dirent.isDirectory(),
                                    size: sizeStr,
                                    date: stats.mtime.toLocaleDateString()
                                });
                            }
                            catch (e) {
                                // Skip files we can't stat
                            }
                        }
                        files.sort((a, b) => {
                            if (a.isDirectory && !b.isDirectory)
                                return -1;
                            if (!a.isDirectory && b.isDirectory)
                                return 1;
                            return a.name.localeCompare(b.name);
                        });
                        broadcast('LOCAL_DIR_RESULT', { success: true, files, currentPath: payload.subpath || '', root: payload.root });
                    }
                    catch (err) {
                        broadcast('LOCAL_DIR_RESULT', { error: `Failed to read directory: ${err.message}`, root: payload.root });
                    }
                    break;
                case 'OPEN_GCS_BUCKET':
                    console.log(`🌐 Opening GCS Vault in browser...`);
                    const { exec: execGcs } = require('node:child_process');
                    // Bucket derived from scripts
                    const bucketUrl = 'https://console.cloud.google.com/storage/browser/high-ground-raw-footage';
                    let openCmd = 'open'; // macOS
                    if (process.platform === 'win32')
                        openCmd = 'start';
                    if (process.platform === 'linux')
                        openCmd = 'xdg-open';
                    execGcs(`${openCmd} "${bucketUrl}"`, (err) => {
                        if (err)
                            console.error(`Failed to open browser: ${err.message}`);
                    });
                    break;
                case 'GET_STATUS':
                    broadcast('INGEST_PROGRESS', ingestService.getJobs());
                    broadcast('RENDER_PROGRESS', renderService.getJobs());
                    broadcast('SYNC_STATUS', cloudSync.getStatus());
                    break;
                case 'FETCH_PROJECTS':
                    console.log(`📋 Fetching active StudioProjects...`);
                    // Mock data for Phase 12 prototype. In the future this will query Prisma or the Next.js API.
                    const mockProjects = [
                        { id: 'proj_cl123', name: 'Episode 42: The Awakening' },
                        { id: 'proj_cl456', name: 'Episode 43: Rebirth' },
                        { id: 'proj_cl789', name: 'Shared Master Assets' }
                    ];
                    broadcast('PROJECTS_LIST', mockProjects);
                    break;
                default:
                    console.warn(`Unknown command type: ${type}`);
            }
        }
        catch (err) {
            console.error(`Error processing message: ${err.message}`);
        }
    });
    ws.on('close', () => {
        console.log('❌ Studio Web UI disconnected');
    });
});
