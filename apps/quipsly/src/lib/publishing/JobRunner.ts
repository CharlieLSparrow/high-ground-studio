import { getPrismaClient } from "@/lib/prisma";
import { PublishingDispatcher, mapQuipslyPackageToHgoPacket } from "./DestinationAdapters";
import { revalidatePath } from "next/cache";

/**
 * Asynchronous job runner that leverages the existing WorldHubProviderSyncJob model
 * to queue and process publishing actions out-of-band.
 * 
 * Conceptually mirrors GCP Cloud Tasks or a serverless worker queue:
 * 1. Enqueue: Write jobs to the database with a "queued" status (low latency return).
 * 2. Process: Run jobs asynchronously (non-blocking).
 * 3. Audit: Log status shifts ("processing", "success", "failed") and error details in DB.
 */

export async function enqueuePublishJobs(
  candidateId: string,
  destinations: string[],
  requestedByEmail: string = "system@quipsly.com"
) {
  const prisma = getPrismaClient();

  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found.`);
  }

  const quipslyPkg = (candidate.draftPacketJson || candidate.packetJson) as any;

  // 1. Create a WorldHubProviderSyncJob for each destination
  const scheduledAtRaw = quipslyPkg.scheduledAt;
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;

  const jobs = [];
  for (const dest of destinations) {
    const job = await prisma.worldHubProviderSyncJob.create({
      data: {
        providerKey: dest,
        jobType: "publish",
        subjectType: "episode-candidate",
        subjectId: candidateId,
        status: "queued",
        payloadJson: quipslyPkg || {},
        requestedByEmail,
        scheduledAt,
      },
    });
    jobs.push(job);
  }

  // 2. Spawn the execution in the background (non-blocking)
  // We do not await this promise, returning control to the caller immediately.
  processSyncJobsBackground(candidateId, jobs.map(j => j.id)).catch(err => {
    console.error(`[Background Job Dispatch Fail] candidateId: ${candidateId}`, err);
  });

  return jobs;
}

export async function processSyncJobsBackground(
  candidateId: string,
  jobIds: string[]
) {
  const prisma = getPrismaClient();
  const dispatcher = new PublishingDispatcher();

  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) return;

  const quipslyPkg = (candidate.draftPacketJson || candidate.packetJson) as any;
  if (!quipslyPkg) return;

  const destinationsMap = quipslyPkg.destinations || [];

  for (const jobId of jobIds) {
    const job = await prisma.worldHubProviderSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== "queued") continue;
    if (job.scheduledAt && job.scheduledAt > new Date()) {
      console.log(`[Adapter Job Runner] Job ${jobId} is scheduled for future (${job.scheduledAt}). Skipping for now.`);
      continue;
    }

    // Mark job as processing
    await prisma.worldHubProviderSyncJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    });

    try {
      console.log(`[Adapter Job Runner] Processing job ${jobId} for provider ${job.providerKey}`);
      
      const dispatchResults = await dispatcher.dispatch(quipslyPkg, [job.providerKey]);
      const result = dispatchResults[job.providerKey];

      if (result && result.success) {
        await prisma.worldHubProviderSyncJob.update({
          where: { id: jobId },
          data: {
            status: "success",
            completedAt: new Date(),
            resultJson: result as any,
          },
        });

        // Update destinations status list
        updateDestinationState(destinationsMap, job.providerKey, "published", result.url 
          ? `Sync succeeded. External Ref: ${result.externalRefId || ""}, URL: ${result.url}`
          : "Sync succeeded."
        );
      } else {
        const errorMsg = result?.error || "Unknown error occurred during dispatch.";
        const nextAttempts = job.attempts + 1;
        
        if (nextAttempts >= 3) {
          await prisma.worldHubProviderSyncJob.update({
            where: { id: jobId },
            data: {
              status: "failed",
              completedAt: new Date(),
              errorMessage: errorMsg,
              attempts: nextAttempts,
            },
          });
          updateDestinationState(destinationsMap, job.providerKey, "failed", `Failed after 3 attempts: ${errorMsg}`);
        } else {
          const backoffMinutes = Math.pow(2, nextAttempts);
          const nextRun = new Date(Date.now() + backoffMinutes * 60000);
          await prisma.worldHubProviderSyncJob.update({
            where: { id: jobId },
            data: {
              status: "queued",
              startedAt: null,
              errorMessage: errorMsg,
              attempts: nextAttempts,
              scheduledAt: nextRun,
            },
          });
          updateDestinationState(destinationsMap, job.providerKey, "queued", `Retrying at ${nextRun.toLocaleTimeString()} (Attempt ${nextAttempts}/3)`);
        }
      }
    } catch (e: any) {
      console.error(`[Adapter Job Runner] Exception during job ${jobId}:`, e);
      const nextAttempts = job.attempts + 1;
      if (nextAttempts >= 3) {
        await prisma.worldHubProviderSyncJob.update({
          where: { id: jobId },
          data: {
            status: "failed",
            completedAt: new Date(),
            errorMessage: e.message || "Adapter execution threw an exception.",
            attempts: nextAttempts,
          },
        });
        updateDestinationState(destinationsMap, job.providerKey, "failed", `Failed after 3 attempts: ${e.message || "Exception thrown"}`);
      } else {
         const backoffMinutes = Math.pow(2, nextAttempts); 
         const nextRun = new Date(Date.now() + backoffMinutes * 60000);
         await prisma.worldHubProviderSyncJob.update({
           where: { id: jobId },
           data: {
             status: "queued",
             startedAt: null,
             errorMessage: e.message || "Adapter execution threw an exception.",
             attempts: nextAttempts,
             scheduledAt: nextRun,
           },
         });
         updateDestinationState(destinationsMap, job.providerKey, "queued", `Retrying at ${nextRun.toLocaleTimeString()} (Attempt ${nextAttempts}/3)`);
      }
    }
  }

  // 3. Keep HGO status synced with the index
  const hasHgoDest = destinationsMap.some((d: any) => d.destination === "high-ground-odyssey");
  if (!hasHgoDest) {
    destinationsMap.push({
      destination: "high-ground-odyssey",
      status: "published",
      notes: "Approved public episode page is live on High Ground Odyssey."
    });
  }

  quipslyPkg.destinations = destinationsMap;

  // 4. Map and write canonical HGO Public Packet to disk
  const hgoPublicPacket = mapQuipslyPackageToHgoPacket(
    quipslyPkg,
    candidate.projectionSlug,
    "4",
    candidate.sourceArtifactHash
  );

  // Write packet to apps/web filesystem
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const contentDir = path.join(process.cwd(), "../web/content/publish/hgo-episodes");
  const filePath = path.join(contentDir, `${candidate.projectionSlug}.json`);
  const indexPath = path.join(contentDir, `episodes-index.json`);

  try {
    await fs.mkdir(contentDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(hgoPublicPacket, null, 2), "utf8");

    let index: Record<string, any> = {};
    try {
      const indexContent = await fs.readFile(indexPath, "utf8");
      index = JSON.parse(indexContent);
    } catch (e) {
      // Ignore if file doesn't exist
    }

    index[hgoPublicPacket.slug] = {
      id: hgoPublicPacket.id,
      slug: hgoPublicPacket.slug,
      title: hgoPublicPacket.title,
      episodeNumber: hgoPublicPacket.episodeNumber,
      summary: hgoPublicPacket.summary,
      publishedAt: hgoPublicPacket.provenance.publishedAt,
    };

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  } catch (fsError) {
    console.error("Failed to write package to disk during async background processing:", fsError);
  }

  // 5. Update Candidate
  const allJobs = await prisma.worldHubProviderSyncJob.findMany({
    where: { subjectType: "episode-candidate", subjectId: candidate.id }
  });
  const anyPending = allJobs.some(j => j.status === "queued" || j.status === "processing");
  const nextCandidateStatus = anyPending ? "publishing" : "published";

  await prisma.hgoEpisodePublishCandidate.update({
    where: { id: candidate.id },
    data: {
      candidateStatus: nextCandidateStatus,
      approvedAt: nextCandidateStatus === "published" ? new Date() : candidate.approvedAt,
      packetJson: hgoPublicPacket as any,
      draftPacketJson: quipslyPkg as any,
    },
  });

  // Trigger path revalidations
  revalidatePath("/publishing-suite");
  revalidatePath("/publishing-suite/package-builder");
  revalidatePath("/create");
}

function updateDestinationState(
  destinations: any[],
  providerKey: string,
  status: string,
  notes: string
) {
  const mapKey: Record<string, string> = {
    podcast_rss: "podcast-rss",
    youtube_v3: "youtube",
    patreon_v2: "patreon",
    quiplore: "quiplore"
  };

  const domainDest = mapKey[providerKey] || providerKey;
  const existing = destinations.find(d => d.destination === domainDest);
  
  if (existing) {
    existing.status = status;
    existing.notes = notes;
  } else {
    destinations.push({
      destination: domainDest,
      status,
      notes
    });
  }
}

export async function enqueueRollbackJobs(
  candidateId: string,
  destinations: string[],
  requestedByEmail: string = "system@quipsly.com"
) {
  const prisma = getPrismaClient();

  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found.`);
  }

  const quipslyPkg = (candidate.draftPacketJson || candidate.packetJson) as any;
  const destinationsMap = quipslyPkg?.destinations || [];

  const mapKeyInverse: Record<string, string> = {
    "podcast-rss": "podcast_rss",
    "youtube": "youtube_v3",
    "patreon": "patreon_v2",
    "quiplore": "quiplore",
    "high-ground-odyssey": "high_ground_odyssey"
  };

  const jobs = [];
  for (const dest of destinations) {
    const providerKey = mapKeyInverse[dest] || dest;
    const state = destinationsMap.find((d: any) => d.destination === dest);
    let refId = candidateId;
    if (state && state.notes) {
      const match = state.notes.match(/External Ref:\s*([^\s,]+)/);
      if (match) {
        refId = match[1];
      }
    }

    const job = await prisma.worldHubProviderSyncJob.create({
      data: {
        providerKey,
        jobType: "rollback",
        subjectType: "episode-candidate",
        subjectId: candidateId,
        status: "queued",
        payloadJson: { ...quipslyPkg, externalRefId: refId } as any,
        requestedByEmail,
      },
    });
    jobs.push(job);

    updateDestinationState(destinationsMap, providerKey, "queued", "Retraction queued in background.");
  }

  quipslyPkg.destinations = destinationsMap;
  
  await prisma.hgoEpisodePublishCandidate.update({
    where: { id: candidateId },
    data: {
      draftPacketJson: quipslyPkg as any
    }
  });

  processRollbackJobsBackground(candidateId, jobs.map(j => j.id)).catch(err => {
    console.error(`[Background Job Rollback Fail] candidateId: ${candidateId}`, err);
  });

  return jobs;
}

export async function processRollbackJobsBackground(
  candidateId: string,
  jobIds: string[]
) {
  const prisma = getPrismaClient();
  const dispatcher = new PublishingDispatcher();

  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) return;

  const quipslyPkg = (candidate.draftPacketJson || candidate.packetJson) as any;
  if (!quipslyPkg) return;

  const destinationsMap = quipslyPkg.destinations || [];

  for (const jobId of jobIds) {
    const job = await prisma.worldHubProviderSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== "queued") continue;

    await prisma.worldHubProviderSyncJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    });

    try {
      console.log(`[Adapter Rollback Runner] Processing rollback job ${jobId} for provider ${job.providerKey}`);

      const refId = (job.payloadJson as any)?.externalRefId || candidateId;
      
      if (job.providerKey === "high_ground_odyssey") {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const contentDir = path.join(process.cwd(), "../web/content/publish/hgo-episodes");
        const filePath = path.join(contentDir, `${candidate.projectionSlug}.json`);
        const indexPath = path.join(contentDir, `episodes-index.json`);

        try {
          await fs.unlink(filePath);
        } catch (e) {}

        try {
          const indexContent = await fs.readFile(indexPath, "utf8");
          const index = JSON.parse(indexContent);
          delete index[candidate.projectionSlug];
          await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
        } catch (e) {}

        await prisma.worldHubProviderSyncJob.update({
          where: { id: jobId },
          data: {
            status: "success",
            completedAt: new Date(),
          },
        });

        updateDestinationState(destinationsMap, "high_ground_odyssey", "draft", "Episode page removed from High Ground Odyssey.");
      } else {
        const dispatchResults = await dispatcher.retract(quipslyPkg, { [job.providerKey]: refId });
        const result = dispatchResults[job.providerKey];

        if (result && result.success) {
          await prisma.worldHubProviderSyncJob.update({
            where: { id: jobId },
            data: {
              status: "success",
              completedAt: new Date(),
              resultJson: result as any,
            },
          });

          updateDestinationState(destinationsMap, job.providerKey, "draft", "Retraction succeeded. Content removed.");
        } else {
          const errorMsg = result?.error || "Unknown error occurred during rollback.";
          await prisma.worldHubProviderSyncJob.update({
            where: { id: jobId },
            data: {
              status: "failed",
              completedAt: new Date(),
              errorMessage: errorMsg,
            },
          });

          updateDestinationState(destinationsMap, job.providerKey, "failed", `Rollback failed: ${errorMsg}`);
        }
      }
    } catch (e: any) {
      console.error(`[Adapter Rollback Runner] Exception during job ${jobId}:`, e);
      await prisma.worldHubProviderSyncJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: e.message || "Rollback execution threw an exception.",
        },
      });

      updateDestinationState(destinationsMap, job.providerKey, "failed", `Rollback failed: ${e.message || "Exception thrown"}`);
    }
  }

  quipslyPkg.destinations = destinationsMap;

  const allRetracted = destinationsMap.every((d: any) => d.status === "draft" || d.destination === "quipsly");
  const nextCandidateStatus = allRetracted ? "draft" : "published";

  await prisma.hgoEpisodePublishCandidate.update({
    where: { id: candidate.id },
    data: {
      candidateStatus: nextCandidateStatus,
      approvedAt: allRetracted ? null : candidate.approvedAt,
      approvedByEmail: allRetracted ? null : candidate.approvedByEmail,
      draftPacketJson: quipslyPkg as any,
    },
  });

  revalidatePath("/publishing-suite");
  revalidatePath("/publishing-suite/package-builder");
  revalidatePath("/create");
}
