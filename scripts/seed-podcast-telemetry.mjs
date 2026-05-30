import { prisma } from "../apps/web/src/lib/prisma.ts";
import crypto from "crypto";

async function main() {
  console.log("⚡ Starting database sync seeder for high-ground-studio...");
  console.log("DATABASE_URL present:", !!process.env.DATABASE_URL);

  // 1. Seed Podcast Episodes
  console.log("📻 Seeding Podcast Episodes...");
  const episodes = [
    {
      slug: "the-autonomy-paradox",
      title: "Episode 1: The Autonomy Paradox",
      description: "Malcolm Gladwell and Daniel Pink discuss the surprising science of motivation. Why standard corporate incentives fail, and why true creative momentum requires absolute self-direction.",
      audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_1.mp3",
      audioSizeBytes: 14500320, // ~14MB
      durationSeconds: 1800, // 30 mins
      episodeType: "full",
      season: 1,
      episodeNumber: 1,
      publishedAt: new Date(Date.now() - 7 * 86400000) // 7 days ago
    },
    {
      slug: "dopamine-timelines-spatial-engines",
      title: "Episode 2: Dopamine Timelines & Spatial Task Engines",
      description: "A deep dive into high-stimulus organization workflows built for neurodivergent minds. How to ditch linear task calendars for high-interest momentum.",
      audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_2.mp3",
      audioSizeBytes: 20120400, // ~20MB
      durationSeconds: 2400, // 40 mins
      episodeType: "full",
      season: 1,
      episodeNumber: 2,
      publishedAt: new Date(Date.now() - 3 * 86400000) // 3 days ago
    },
    {
      slug: "reframing-spherical-perspectives",
      title: "Episode 3: Reframing Spherical Perspectives",
      description: "How to edit and publish 360 spatial videos without losing context or narrative control. Replicating Riverside FM parity on the desktop workspace.",
      audioUrl: "https://storage.googleapis.com/high-ground-studio/episodes/take_3.mp3",
      audioSizeBytes: 18500200, // ~18.5MB
      durationSeconds: 2100, // 35 mins
      episodeType: "full",
      season: 1,
      episodeNumber: 3,
      publishedAt: new Date(Date.now() - 1 * 86400000) // 1 day ago
    }
  ];

  for (const ep of episodes) {
    await prisma.podcastEpisode.upsert({
      where: { slug: ep.slug },
      update: {},
      create: ep
    });
  }
  console.log("✔ Podcast Episodes seeded successfully.");

  // Fetch created episodes to link logs
  const dbEpisodes = await prisma.podcastEpisode.findMany();

  // 2. Seed Podcast Download Logs (Demographics & Analytics)
  console.log("📊 Seeding Podcast Download Logs (Analytics Engine)...");
  
  const userAgents = [
    "ApplePodcasts/4024.310.4.1 CFNetwork/1494.0.7 Darwin/23.4.0",
    "Spotify/8.9.22.454 iOS/17.4.1 CFNetwork/1494.0.7",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Overcast/3042 CFNetwork/1494.0.7",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
  ];

  const regions = [
    { country: "US", city: "Denver" },
    { country: "US", city: "San Francisco" },
    { country: "US", city: "New York" },
    { country: "GB", city: "London" },
    { country: "CA", city: "Toronto" },
    { country: "DE", city: "Berlin" },
    { country: "AU", city: "Sydney" }
  ];

  // Clear existing logs to avoid duplicate overload
  await prisma.podcastDownloadLog.deleteMany();

  const downloadLogs = [];
  const totalLogs = 150; // High count for premium graphs

  for (let i = 0; i < totalLogs; i++) {
    const episode = dbEpisodes[i % dbEpisodes.length];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const region = regions[Math.floor(Math.random() * regions.length)];
    const rawIp = `192.168.1.${Math.floor(Math.random() * 255)}`;
    const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");
    
    // Distribute timestamps over past 30 days
    const timestamp = new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000 - Math.random() * 86400000);

    downloadLogs.push({
      episodeId: episode.id,
      userAgent,
      ipHash,
      country: region.country,
      city: region.city,
      timestamp
    });
  }

  await prisma.podcastDownloadLog.createMany({
    data: downloadLogs
  });
  console.log(`✔ Seeding complete: Created ${totalLogs} compliant analytical download logs.`);

  // 3. Seed RetentionTelemetry (WebGL Engine)
  console.log("🌐 Seeding WebGL Retention Telemetry data...");
  const videoIds = ["AI-Revolution-01", "Leadership-Cohort-01", "Studio-NLE-Demo"];

  await prisma.retentionTelemetry.deleteMany();

  const telemetryData = [];
  for (const videoId of videoIds) {
    for (let segmentIndex = 0; segmentIndex < 40; segmentIndex++) {
      let retention = 100 - (segmentIndex * 0.7); // Natural decay curve
      
      // Introduce sharp dramatic drops for structural alerts
      if (videoId === "AI-Revolution-01" && segmentIndex >= 15) {
        retention -= 24; // 24% drop at segment 15
      } else if (videoId === "Leadership-Cohort-01" && segmentIndex >= 22) {
        retention -= 18; // 18% drop at segment 22
      }

      // Add a little realistic variance noise
      const finalRetention = Math.max(8, retention + (Math.random() * 4));

      telemetryData.push({
        videoId,
        segmentIndex,
        timestamp: segmentIndex * 15, // 15-second chunks
        retentionRate: finalRetention
      });
    }
  }

  await prisma.retentionTelemetry.createMany({
    data: telemetryData
  });
  console.log(`✔ Seeding complete: Configured WebGL cohort metrics for ${videoIds.length} video streams.`);

  console.log("🚀 Sync seeding completed successfully! The High Ground database is fully populated.");
}

main()
  .catch((err) => {
    console.error("❌ Seeding task encountered an error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
