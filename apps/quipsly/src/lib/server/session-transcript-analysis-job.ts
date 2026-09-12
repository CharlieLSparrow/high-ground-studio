import "server-only";
import { randomUUID } from "node:crypto";
import {
  analyzeSessionTranscript, sessionAnalysisSourceFingerprint, SESSION_ANALYSIS_VERSION,
  restoreSessionTranscriptAnalysis,
  SessionAnalysisError, type SessionAnalysisSource, type SessionAnalysisProvider,
  type SessionTranscriptAnalysis,
} from "./session-transcript-analysis";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";

type AnalysisResult =
  | { status: "completed"; analysis: SessionTranscriptAnalysis; reused: boolean }
  | { status: "waiting" | "failed"; errorCode?: string };

/** One leased processor per Session, independent of which participant's source
 * completed first. Neither network IO nor a model wait holds a DB transaction. */
export async function prepareSessionTranscriptAnalysis(input: {
  prisma: any;
  source: SessionAnalysisSource;
  provider: SessionAnalysisProvider;
  retryFailed?: boolean;
  allowGeneration?: boolean;
  now?: () => Date;
}): Promise<AnalysisResult> {
  const now = input.now ?? (() => new Date());
  const source = structuredClone(input.source);
  const fingerprint = sessionAnalysisSourceFingerprint(source);
  const leaseId = randomUUID();
  const scope = { roomId: source.roomId };
  const claim = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `capture-transcript-follow-through-room:${scope.roomId}`);
    const current = await tx.sessionFollowThroughAnalysis.findUnique({ where: scope });
    const matches = current?.sourceFingerprint === fingerprint
      && current.version === SESSION_ANALYSIS_VERSION
      && current.provider === input.provider.name && current.model === input.provider.model;
    if (matches && ["completed", "materialized"].includes(current.status) && current.resultJson) {
      try {
        const analysis = restoreSessionTranscriptAnalysis(source, current.resultJson);
        if (analysis.provider === input.provider.name && analysis.model === input.provider.model)
          return { status: "completed" as const, analysis, reused: true };
      } catch { /* A damaged cache is regenerated, not repeatedly reapplied. */ }
    }
    if (current?.status === "running" && current.leaseUntil && current.leaseUntil > now())
      return { status: "waiting" as const };
    if (input.allowGeneration === false) return matches && current.status === "failed"
      ? { status: "failed" as const, errorCode: current.errorCode || "PROVIDER_UNAVAILABLE" }
      : { status: "waiting" as const };
    if (matches && current.status === "running" && current.attemptCount >= 3 && !input.retryFailed) {
      await tx.sessionFollowThroughAnalysis.update({ where: scope,
        data: { status: "failed", errorCode: "PROCESS_INTERRUPTED", leaseId: null, leaseUntil: null } });
      return { status: "failed" as const, errorCode: "PROCESS_INTERRUPTED" };
    }
    if (matches && current.status === "failed" && !input.retryFailed) {
      if (current.attemptCount >= 3) return { status: "failed" as const, errorCode: current.errorCode || "PROVIDER_UNAVAILABLE" };
      if (current.nextAttemptAt && current.nextAttemptAt > now()) return { status: "waiting" as const };
    }
    const attemptCount = matches && !input.retryFailed ? current.attemptCount + 1 : 1;
    const data = {
      sourceFingerprint: fingerprint, version: SESSION_ANALYSIS_VERSION,
      provider: input.provider.name, model: input.provider.model,
      status: "running", leaseId, leaseUntil: new Date(now().getTime() + 90_000),
      attemptCount, nextAttemptAt: null, errorCode: null,
    };
    await tx.sessionFollowThroughAnalysis.upsert({ where: scope,
      create: { ...scope, ...data }, update: data });
    return { status: "claimed" as const, attemptCount };
  }, { maxWait: 5_000, timeout: 10_000, isolationLevel: "ReadCommitted" });
  if (claim.status !== "claimed") return claim;

  try {
    const analysis = await analyzeSessionTranscript(source, input.provider);
    const saved = await input.prisma.sessionFollowThroughAnalysis.updateMany({
      where: { ...scope, leaseId, sourceFingerprint: fingerprint, status: "running" },
      data: { status: "completed", resultJson: analysis, leaseId: null, leaseUntil: null, errorCode: null, nextAttemptAt: null },
    });
    // An expired worker cannot overwrite a newer attempt or apply old work.
    return saved.count === 1 ? { status: "completed", analysis, reused: false } : { status: "waiting" };
  } catch (error) {
    const errorCode = error instanceof SessionAnalysisError ? error.code : "PROVIDER_UNAVAILABLE";
    await input.prisma.sessionFollowThroughAnalysis.updateMany({
      where: { ...scope, leaseId, status: "running" },
      data: { status: "failed", errorCode, leaseId: null, leaseUntil: null,
        nextAttemptAt: new Date(now().getTime() + 30_000 * 2 ** (claim.attemptCount - 1)) },
    });
    return { status: "failed", errorCode };
  }
}
