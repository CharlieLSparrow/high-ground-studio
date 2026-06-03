import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, episodeId, directory = "episodes" } = await request.json();
    
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET || process.env.GCS_BUCKET_NAME || "quipsly-studio-assets";
    
    // Determine the storage path based on context (episode vs storyboard etc)
    const storagePath = episodeId 
      ? `${directory}/${episodeId}/${Date.now()}-${filename}`
      : `${directory}/${Date.now()}-${filename}`;

    // If we have GCP credentials, generate a real signed URL
    if (projectId) {
      const storage = new Storage({ projectId });
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
        bucketPath: storagePath,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${storagePath}`
      });
    }
    
    // Graceful fallback for local development without GCP credentials
    console.warn("[GCS Upload] Missing Google Cloud credentials. Falling back to mock URL.");
    const mockSignedUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}?X-Goog-Signature=mock`;
    
    return NextResponse.json({ 
      url: mockSignedUrl,
      bucketPath: storagePath,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${storagePath}`
    });
    
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL." },
      { status: 500 }
    );
  }
}
