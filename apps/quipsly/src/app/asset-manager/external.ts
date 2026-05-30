"use server";

import { CloudAsset } from "./actions";

export async function fetchExternalAssets(sourceName: string): Promise<CloudAsset[]> {
  // Simulating external Google API OAuth fetch delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (sourceName === "Google_Photos") {
    return [
      { id: "gp_1", name: "IMG_3921.heic", url: "#", bucket: "Google_Photos", size: "3.2 MB", uploadDate: "2026-05-28", metadata: { spatial: false, resolution: "12MP" } },
      { id: "gp_2", name: "IMG_3922.heic", url: "#", bucket: "Google_Photos", size: "4.1 MB", uploadDate: "2026-05-28", metadata: { spatial: false, resolution: "12MP" } },
      { id: "gp_3", name: "Studio_Lighting_Test.jpg", url: "#", bucket: "Google_Photos", size: "8.5 MB", uploadDate: "2026-05-25", metadata: { spatial: false, resolution: "24MP" } },
    ];
  }

  if (sourceName === "Google_Drive") {
    return [
      { id: "gd_1", name: "Audio_Stems_Podcast_Ep12.zip", url: "#", bucket: "Google_Drive", size: "850 MB", uploadDate: "2026-05-20", metadata: { spatial: false } },
      { id: "gd_2", name: "Video_Assets_V2.rar", url: "#", bucket: "Google_Drive", size: "2.1 GB", uploadDate: "2026-05-22", metadata: { spatial: false } },
    ];
  }

  return [];
}
