import { QuipslyPublicPackage, MetricSnapshot } from "@/lib/publishing/DestinationAdapters";

/**
 * Mock Data Store for the Publishing & Analytics Suite.
 */

export const mockPackages: QuipslyPublicPackage[] = [
  {
    id: "pkg-001",
    projectId: "proj-101",
    kind: "episode",
    title: "1. The Fall of the Republic",
    summary: "How do you maintain structural integrity when the galaxy around you is collapsing?",
    body: "<p>In this episode, we explore the collapse of large systems and what to do when your context shifts entirely.</p>\n<p>It's a journey into system thinking, leadership, and maintaining the high ground.</p>",
    media: {
      audioUrl: "https://storage.googleapis.com/hgo-public-media/mock/audio-001.mp3",
      videoUrl: "https://storage.googleapis.com/hgo-public-media/mock/video-001.mp4",
      thumbnailUrl: "https://storage.googleapis.com/hgo-public-media/mock/thumb-001.jpg",
    },
    beats: [
      { title: "Introduction to System Collapse", summary: "Defining what a 'republic' means in organizational terms.", timestamp: 0 },
      { title: "The Warning Signs", summary: "Three key indicators that your structural integrity is failing.", timestamp: 340 },
      { title: "Maintaining the High Ground", summary: "Strategies for personal resilience.", timestamp: 890 }
    ],
    verifiedQuotes: [
      { text: "A system doesn't fail overnight; it fails slowly, and then all at once.", attribution: "Homer", principleId: "prin-sys-1" },
      { text: "The high ground isn't a place, it's a perspective.", attribution: "Charlie", principleId: "prin-persp-2" }
    ],
    overrides: {
      youtube: {
        tags: ["leadership", "systems thinking", "resilience"],
        chapterMarkers: ["0:00 Intro", "5:40 The Warning Signs", "14:50 Maintaining the High Ground"],
        isShort: false
      },
      patreon: {
        isMembersOnly: false,
        teaser: "We're breaking down organizational collapse in this week's open episode!"
      }
    },
    metadata: {
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toUTCString(), // 7 days ago
      author: "High Ground Studio"
    }
  },
  {
    id: "pkg-002",
    projectId: "proj-101",
    kind: "clip",
    title: "The High Ground Perspective (Short)",
    summary: "A 60-second slice on why perspective matters more than positioning.",
    body: "Focus on the perspective, not just the physical or organizational position.",
    media: {
      videoUrl: "https://storage.googleapis.com/hgo-public-media/mock/short-002.mp4",
      thumbnailUrl: "https://storage.googleapis.com/hgo-public-media/mock/thumb-short-002.jpg",
    },
    beats: [],
    verifiedQuotes: [
      { text: "The high ground isn't a place, it's a perspective.", attribution: "Charlie", principleId: "prin-persp-2" }
    ],
    overrides: {
      youtube: {
        tags: ["shorts", "perspective", "mindset"],
        chapterMarkers: [],
        isShort: true
      },
      social: {
        platform: "instagram",
        aspectRatios: { "instagram": "9:16" }
      }
    },
    metadata: {
      embargoUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toUTCString(), // 2 days from now
      author: "High Ground Studio"
    }
  },
  {
    id: "pkg-003",
    projectId: "proj-102",
    kind: "post",
    title: "Behind the Scenes: Scripting the Republic",
    summary: "Exclusive look at how we outlined the systems-thinking episode.",
    body: "<h1>Writing the Republic</h1><p>Here is the raw manuscript for the intro...</p>",
    media: {
      images: ["https://storage.googleapis.com/hgo-public-media/mock/bts-1.jpg", "https://storage.googleapis.com/hgo-public-media/mock/bts-2.jpg"]
    },
    beats: [],
    verifiedQuotes: [],
    overrides: {
      patreon: {
        isMembersOnly: true,
        tierId: "tier-insider",
        teaser: "Want to see how the sausage is made? Check out our raw scripting process."
      }
    },
    metadata: {
      author: "Charlie"
    }
  }
];

export const mockPrinciples = [
  { id: "prin-sys-1", title: "Slow Failure Systems", category: "Systems" },
  { id: "prin-persp-2", title: "Perspective Over Position", category: "Leadership" },
  { id: "prin-comms-3", title: "Clarity in Crisis", category: "Communication" },
];

export const mockPublishedEvents = [
  { id: "evt-1", packageId: "pkg-001", destination: "podcast_rss", status: "published", publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), externalRefId: "rss-1" },
  { id: "evt-2", packageId: "pkg-001", destination: "youtube_v3", status: "published", publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), externalRefId: "yt-1" },
  { id: "evt-3", packageId: "pkg-002", destination: "youtube_v3", status: "scheduled", publishedAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), externalRefId: "yt-2" },
  { id: "evt-4", packageId: "pkg-003", destination: "patreon_v2", status: "draft", publishedAt: null, externalRefId: null },
];

export const getMockMetrics = (externalRefId: string): MetricSnapshot => {
  if (externalRefId === "rss-1") {
    return { views: 12500, engagement: 0, retentionScore: 92, revenueCents: 0 };
  }
  if (externalRefId === "yt-1") {
    return { views: 45000, engagement: 3200, retentionScore: 45, revenueCents: 12500 };
  }
  return { views: 0, engagement: 0, retentionScore: 0, revenueCents: 0 };
};

export const generateTimelineDays = (daysToGenerate: number = 14) => {
  const dates = [];
  const start = new Date();
  start.setDate(start.getDate() - 3); // Start 3 days ago

  for (let i = 0; i < daysToGenerate; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
};
