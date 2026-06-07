import { exec } from "node:child_process";
import path from "node:path";

export type RenderJob = {
  id: string;
  name: string;
  status: "pending" | "downloading_assets" | "stitching_insv" | "rendering" | "completed" | "error";
  progress: number;
};

export class RenderService {
  private jobs: RenderJob[] = [];
  public onProgress?: (jobs: RenderJob[]) => void;

  public getJobs() {
    return this.jobs;
  }

  private updateJob(id: string, updates: Partial<RenderJob>) {
    this.jobs = this.jobs.map(job => job.id === id ? { ...job, ...updates } : job);
    if (this.onProgress) this.onProgress(this.jobs);
  }

  public async startRender(edl: any, outputName: string) {
    console.log(`🎬 RenderService: Starting render for ${outputName}`);

    const jobId = `render_${Date.now()}`;
    this.jobs.push({
      id: jobId,
      name: outputName,
      status: "downloading_assets",
      progress: 0
    });

    if (this.onProgress) this.onProgress(this.jobs);

    // 1. Resolve source assets. This service no longer pretends that assets were downloaded.
    const sourceClips = this.extractSourceClips(edl);
    this.updateJob(jobId, { progress: 100 });

    // 2. Pre-stitch proprietary .insv files only when the EDL actually names them.
    const insvPath = sourceClips.find((source) => source.toLowerCase().endsWith(".insv"));
    const requiresInsta360Agent = Boolean(insvPath);

    if (requiresInsta360Agent) {
       this.updateJob(jobId, { status: "stitching_insv", progress: 0 });
       console.log(`🤖 RenderService: Dispatching Python UI Agent to stitch master .INSV files...`);

       const agentScript = path.join(process.cwd(), "scripts", "insta360-agent.py");
       try {
         // Spawning the python agent to commandeer the mouse/keyboard
         await new Promise<void>((resolve, reject) => {
           exec(`python3 "${agentScript}" "${insvPath}"`, (error, stdout, stderr) => {
             if (error) {
               console.error(`❌ Agent Error: ${error.message}`);
               reject(error);
             } else {
               console.log(stdout);
               resolve();
             }
           });
         });
       } catch(e: any) {
         console.error(`❌ Insta360 stitch agent failed: ${e.message}`);
         this.updateJob(jobId, { status: "error", progress: 0 });
         return;
       }

       this.updateJob(jobId, { progress: 100 });
    }

    // 3. Hand off the perfectly stitched MP4s to Remotion for the final burn
    this.updateJob(jobId, { status: "rendering", progress: 0 });

    console.log(`🚀 RenderService: Triggering Remotion Burner for ${outputName}...`);
    const remotionDir = path.join(process.cwd(), "..", "render-engine");
    const outPath = path.join(process.cwd(), "..", "..", "out", `${jobId}.mp4`);

    // Simulate progression while the actual render happens
    const progressInterval = setInterval(() => {
      const job = this.jobs.find(j => j.id === jobId);
      if (job && job.progress < 95) {
        this.updateJob(jobId, { progress: job.progress + 2 });
      }
    }, 1000);

    try {
      await new Promise<void>((resolve, reject) => {
        exec(`npx remotion render src/index.ts MainComposition "${outPath}"`, { cwd: remotionDir }, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Remotion Render Error: ${error.message}`);
            reject(error);
          } else {
            console.log(stdout);
            resolve();
          }
        });
      });
      clearInterval(progressInterval);
      this.updateJob(jobId, { status: "completed", progress: 100 });
      console.log(`✅ RenderService: Remotion burn completed! Saved to ${outPath}`);
    } catch (e) {
      clearInterval(progressInterval);
      this.updateJob(jobId, { status: "error", progress: 0 });
    }
  }

  private extractSourceClips(edl: any): string[] {
    const clips = Array.isArray(edl?.clips) ? edl.clips : Array.isArray(edl?.timelineClips) ? edl.timelineClips : [];
    return clips
      .map((clip: any) => clip?.sourcePath || clip?.sourceFile || clip?.src || clip?.url)
      .filter((source: unknown): source is string => typeof source === "string" && source.trim().length > 0);
  }
}
