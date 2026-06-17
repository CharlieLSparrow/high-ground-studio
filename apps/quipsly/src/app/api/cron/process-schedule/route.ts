import { getPrismaClient } from "@/lib/prisma";
import { processSyncJobsBackground } from "@/lib/publishing/JobRunner";
import { NextResponse } from "next/server";

// This endpoint is meant to be called by an external scheduler (e.g., Google Cloud Scheduler) every minute.
export async function POST(request: Request) {
  try {
    // In a real production environment, you would verify an authorization header here 
    // to ensure only the authorized cron scheduler can hit this endpoint.
    
    const prisma = getPrismaClient();

    // Find jobs that are queued and whose scheduled time has arrived or passed
    const ripeJobs = await prisma.worldHubProviderSyncJob.findMany({
      where: {
        status: "queued",
        scheduledAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
        subjectId: true,
      },
    });

    if (ripeJobs.length === 0) {
      return NextResponse.json({ success: true, message: "No ripe jobs found." });
    }

    // Group jobs by candidate/subject
    const jobsByCandidate = ripeJobs.reduce((acc, job) => {
      const cId = job.subjectId;
      if (!cId) return acc;
      if (!acc[cId]) {
        acc[cId] = [];
      }
      acc[cId].push(job.id);
      return acc;
    }, {} as Record<string, string[]>);

    // Dispatch background processing for each candidate
    for (const [candidateId, jobIds] of Object.entries(jobsByCandidate)) {
      // Process out-of-band to not block the HTTP response
      processSyncJobsBackground(candidateId, jobIds).catch(err => {
        console.error(`[Cron] Background Job Dispatch Fail for candidateId: ${candidateId}`, err);
      });
    }

    return NextResponse.json({
      success: true,
      message: `Dispatched ${ripeJobs.length} jobs across ${Object.keys(jobsByCandidate).length} candidates.`,
    });
  } catch (error: any) {
    console.error("[Cron process-schedule error]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Support GET as well for easy manual triggering during development
  return POST(request);
}
