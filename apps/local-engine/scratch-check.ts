import { Storage } from "@google-cloud/storage";
import path from "node:path";

const keyFilename = path.join(__dirname, "gcs-key.json");
const bucketName = "high-ground-raw-assets";

async function main() {
  console.log("🔍 Checking GCP for storage bucket...");
  const storage = new Storage({ keyFilename });
  
  try {
    const [buckets] = await storage.getBuckets();
    const exists = buckets.some(b => b.name === bucketName);
    
    if (exists) {
      console.log(`✅ Success! Bucket "${bucketName}" already exists and is ready to use!`);
    } else {
      console.log(`⚠️ Bucket "${bucketName}" does not exist. Creating it now...`);
      // Create bucket with Multi-Regional storage class for maximum availability
      const [bucket] = await storage.createBucket(bucketName, {
        location: "US", // US Multi-region is great for physical uploading speed
        storageClass: "STANDARD",
      });
      console.log(`🎉 Success! Bucket "${bucketName}" has been successfully created in US location!`);
    }
  } catch (err: any) {
    console.error("❌ Error connecting to GCP Storage:", err.message);
  }
}

main();
