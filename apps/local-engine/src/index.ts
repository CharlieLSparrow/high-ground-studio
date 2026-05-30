import { WebSocketServer, WebSocket } from 'ws';
import { IngestService } from './IngestService.ts';
import { RenderService } from './RenderService.ts';
import { CloudSyncDaemon } from './CloudSync.ts';
import path from 'path';

const PORT = 4000;
const wss = new WebSocketServer({ port: PORT });

const ingestService = new IngestService();
const renderService = new RenderService();
const cloudSync = new CloudSyncDaemon(path.join(process.cwd(), '..', '..', 'HighGroundMedia'));

console.log(`🚀 Unified Local Engine started on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('✅ Studio Web UI connected to Local Engine');

  // Broadcast function to send updates back to the UI
  const broadcast = (type: string, payload: any) => {
    ws.send(JSON.stringify({ type, payload }));
  };

  // Wire up service events to broadcast back to the UI
  ingestService.onProgress = (jobs) => broadcast('INGEST_PROGRESS', jobs);
  renderService.onProgress = (jobs) => broadcast('RENDER_PROGRESS', jobs);

  ws.on('message', async (message: string) => {
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
          const scriptPath = path.join(process.cwd(), 'scripts', 'insta360-scraper-agent.py');
          
          exec(`python3 "${scriptPath}"`, (error: any, stdout: string, stderr: string) => {
             if (error) {
               console.error(`❌ Agent Error: ${error.message}`);
               broadcast('INSTA360_SCAN_RESULT', { error: error.message });
               return;
             }
             
             // Extract JSON payload
             const match = stdout.match(/===AGENT_PAYLOAD_START===\n(.*)\n===AGENT_PAYLOAD_END===/m);
             if (match && match[1]) {
                const videos = JSON.parse(match[1]);
                broadcast('INSTA360_SCAN_RESULT', { success: true, videos });
             } else {
                broadcast('INSTA360_SCAN_RESULT', { error: 'Failed to parse agent output.' });
             }
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
    } catch (err: any) {
      console.error(`Error processing message: ${err.message}`);
    }
  });

  ws.on('close', () => {
    console.log('❌ Studio Web UI disconnected');
  });
});
