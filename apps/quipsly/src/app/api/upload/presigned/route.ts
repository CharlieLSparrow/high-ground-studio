import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { requireMediaBucketName } from "@/lib/server/gcs";

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, episodeId, directory = "episodes" } = await request.json();
    
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const bucketName = requireMediaBucketName();
    
    // Determine the storage path based on context (episode vs storyboard etc)
    const storagePath = episodeId 
      ? `${directory}/${episodeId}/${Date.now()}-${filename}`
      : `${directory}/${Date.now()}-${filename}`;

    const storage = projectId ? new Storage({ projectId }) : new Storage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(storagePath);
    
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
    });

    return NextResponse.json({ 
      url,
      bucketName,
      bucketPath: storagePath,
      gcsUri: `gcs://${bucketName}/${storagePath}`,
    });
    
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL." },
      { status: 500 }
    );
  }
}
