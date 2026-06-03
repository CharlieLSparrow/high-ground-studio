"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderService = void 0;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
class RenderService {
    jobs = [];
    onProgress;
    getJobs() {
        return this.jobs;
    }
    updateJob(id, updates) {
        this.jobs = this.jobs.map(job => job.id === id ? { ...job, ...updates } : job);
        if (this.onProgress)
            this.onProgress(this.jobs);
    }
    async startRender(edl, outputName) {
        console.log(`🎬 RenderService: Starting render for ${outputName}`);
        const jobId = `render_${Date.now()}`;
        this.jobs.push({
            id: jobId,
            name: outputName,
            status: "downloading_assets",
            progress: 0
        });
        if (this.onProgress)
            this.onProgress(this.jobs);
        // 1. Download Assets
        await this.simulateProgress(jobId, "downloading_assets", 100);
        // 2. [NEW] Pre-Stitch proprietary .insv files using the Python UI Automation Agent
        // We check the EDL to see if any source clips are .insv
        const requiresInsta360Agent = true; // Mocked check for prototype
        if (requiresInsta360Agent) {
            this.updateJob(jobId, { status: "stitching_insv", progress: 0 });
            console.log(`🤖 RenderService: Dispatching Python UI Agent to stitch master .INSV files...`);
            const agentScript = node_path_1.default.join(process.cwd(), "scripts", "insta360-agent.py");
            const insvPath = "/Volumes/Bender/DCIM/107CANON/mock_360_file.insv";
            try {
                // Spawning the python agent to commandeer the mouse/keyboard
                await new Promise((resolve, reject) => {
                    (0, node_child_process_1.exec)(`python3 "${agentScript}" "${insvPath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`❌ Agent Error: ${error.message}`);
                            reject(error);
                        }
                        else {
                            console.log(stdout);
                            resolve();
                        }
                    });
                });
            }
            catch (e) { }
            this.updateJob(jobId, { progress: 100 });
        }
        // 3. Hand off the perfectly stitched MP4s to Remotion for the final burn
        this.updateJob(jobId, { status: "rendering", progress: 0 });
        console.log(`🚀 RenderService: Triggering Remotion Burner for ${outputName}...`);
        const remotionDir = node_path_1.default.join(process.cwd(), "..", "render-engine");
        const outPath = node_path_1.default.join(process.cwd(), "..", "..", "out", `${jobId}.mp4`);
        // Simulate progression while the actual render happens
        const progressInterval = setInterval(() => {
            const job = this.jobs.find(j => j.id === jobId);
            if (job && job.progress < 95) {
                this.updateJob(jobId, { progress: job.progress + 2 });
            }
        }, 1000);
        try {
            await new Promise((resolve, reject) => {
                (0, node_child_process_1.exec)(`npx remotion render src/index.ts MainComposition "${outPath}"`, { cwd: remotionDir }, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Remotion Render Error: ${error.message}`);
                        reject(error);
                    }
                    else {
                        console.log(stdout);
                        resolve();
                    }
                });
            });
            clearInterval(progressInterval);
            this.updateJob(jobId, { status: "completed", progress: 100 });
            console.log(`✅ RenderService: Remotion burn completed! Saved to ${outPath}`);
        }
        catch (e) {
            clearInterval(progressInterval);
            this.updateJob(jobId, { status: "error", progress: 0 });
        }
    }
    simulateProgress(id, status, durationMs) {
        return new Promise((resolve) => {
            let prog = 0;
            const interval = setInterval(() => {
                prog += 5;
                if (prog >= 100) {
                    clearInterval(interval);
                    resolve();
                }
                else {
                    this.updateJob(id, { progress: prog });
                }
            }, durationMs);
        });
    }
}
exports.RenderService = RenderService;
