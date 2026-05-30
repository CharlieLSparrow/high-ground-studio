import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";

export async function renderVideoFromEDL(jobId: string, edlPayload: any) {
  try {
    const rootDir = process.cwd();
    const compositionId = "HighGroundFinalCut";
    const serveUrl = await bundle({
      entryPoint: path.resolve(rootDir, "src/remotion/Root.tsx"),
      webpackOverride: (config) => config,
    });

    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: edlPayload,
    });

    const outputLocation = path.resolve(rootDir, `public/renders/${jobId}.mp4`);
    if (!fs.existsSync(path.resolve(rootDir, "public/renders"))) {
      fs.mkdirSync(path.resolve(rootDir, "public/renders"), { recursive: true });
    }

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: edlPayload,
      onProgress: ({ progress }) => {
        console.log(`[Job ${jobId}] Rendering progress: ${Math.round(progress * 100)}%`);
      },
    });

    console.log(`[Job ${jobId}] Render successfully completed at ${outputLocation}`);
    return { success: true, outputLocation };
  } catch (error) {
    console.error(`[Job ${jobId}] Render failed:`, error);
    throw error;
  }
}
