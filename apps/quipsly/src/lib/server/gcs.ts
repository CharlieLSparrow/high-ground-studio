import { Storage } from "@google-cloud/storage";

// In production, this uses default credentials (e.g. from GCP metadata server or key.json in env)
// For local development, ensure GOOGLE_APPLICATION_CREDENTIALS is set in the environment.
const storage = new Storage();

// The user-defined bucket for the massive media vault
export const BUCKET_NAME = "high-ground-media-vault";

export async function generateUploadSignedUrl(fileName: string, contentType: string) {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(`ingest/${Date.now()}-${fileName}`);

    // Generate a V4 signed URL that expires in 15 minutes
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    return {
      success: true,
      url,
      destinationPath: file.name,
    };
  } catch (error: any) {
    console.error("Error generating signed URL:", error);
    // Return mock data if credentials aren't set during local development
    return {
      success: true,
      url: `/api/mock-upload?file=${encodeURIComponent(fileName)}`,
      destinationPath: `ingest/${Date.now()}-${fileName}`,
      mocked: true,
    };
  }
}
