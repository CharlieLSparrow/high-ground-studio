"use server";

export type CloudAsset = {
  id: string;
  name: string;
  url: string;
  bucket: string;
  size: string;
  uploadDate: string;
  metadata: {
    spatial: boolean;
    duration?: string;
    resolution?: string;
    camera?: string;
  };
};

export async function fetchCloudAssets(bucketName: string = "Insta360_Raw"): Promise<CloudAsset[]> {
  // Simulating GCS SDK fetch delay
  await new Promise(resolve => setTimeout(resolve, 600));

  if (bucketName === "Insta360_Raw") {
    return [
      { id: "1", name: "VID_20260528_114500_00_001.insv", url: "#", bucket: "Insta360_Raw", size: "4.2 GB", uploadDate: "2026-05-28", metadata: { spatial: true, duration: "12:04", resolution: "5.7K", camera: "Insta360 X3" } },
      { id: "2", name: "VID_20260528_114500_10_002.insv", url: "#", bucket: "Insta360_Raw", size: "4.1 GB", uploadDate: "2026-05-28", metadata: { spatial: true, duration: "11:59", resolution: "5.7K", camera: "Insta360 X3" } },
      { id: "3", name: "VID_20260529_090000_00_001.insv", url: "#", bucket: "Insta360_Raw", size: "800 MB", uploadDate: "2026-05-29", metadata: { spatial: true, duration: "02:15", resolution: "5.7K", camera: "Insta360 X3" } },
    ];
  }

  if (bucketName === "Final_Renders") {
    return [
      { id: "4", name: "TikTok_AI_News_01.mp4", url: "#", bucket: "Final_Renders", size: "45 MB", uploadDate: "2026-05-29", metadata: { spatial: false, duration: "00:58", resolution: "1080x1920" } },
      { id: "5", name: "Leadership_Hub_Welcome.mp4", url: "#", bucket: "Final_Renders", size: "120 MB", uploadDate: "2026-05-28", metadata: { spatial: false, duration: "03:45", resolution: "4K" } },
    ];
  }

  return [];
}
