import "server-only";

import type { PrismaClient } from "@prisma/client";

import { planGoogleDriveSourceUnitConform } from "@/lib/server/google-drive-source-conform";

export const GOOGLE_DRIVE_LIBRARY_CONFORM_PLAN_SCHEMA =
  "quipsly-google-drive-library-conform-plan-v1" as const;

const MAX_LIBRARY_CONFORM_SEGMENTS = 50;
const PLAN_CONCURRENCY = 4;

type SourceConformPlan = Awaited<
  ReturnType<typeof planGoogleDriveSourceUnitConform>
>;

export class GoogleDriveLibraryConformError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleDriveLibraryConformError";
  }
}

function cleanId(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(result)) {
    throw new GoogleDriveLibraryConformError(
      "invalid-id",
      `${field} is malformed.`,
    );
  }
  return result;
}

function bytes(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

function dateKey(value: string | null) {
  return value?.slice(0, 10) || null;
}

export function summarizeGoogleDriveLibraryConformPlans(input: {
  library: {
    id: string;
    name: string;
    heldSegmentCount: number;
  };
  plans: SourceConformPlan[];
  inventoryTruncated: boolean;
}) {
  const totalRemainingBytes = input.plans.reduce(
    (total, plan) => total + bytes(plan.storage.remainingBytes),
    0n,
  );
  const totalOriginalBytes = input.plans.reduce(
    (total, plan) => total + bytes(plan.storage.originalBytes),
    0n,
  );
  const executor = input.plans.find(
    (plan) => plan.storage.executor.status === "measured",
  )?.storage.executor ?? {
    status: "unavailable" as const,
    safeAvailableBytes: null,
    availableBytes: null,
    reserveBytes: null,
    measuredAt: null,
    workspaceMode: "unknown" as const,
    localPathWithheld: true as const,
  };
  const aggregateShortfallBytes =
    executor.status === "measured" && executor.safeAvailableBytes
      ? totalRemainingBytes > bytes(executor.safeAvailableBytes)
        ? totalRemainingBytes - bytes(executor.safeAvailableBytes)
        : 0n
      : 0n;
  const days = new Map<
    string,
    {
      date: string | null;
      segmentCount: number;
      renderReadyCount: number;
      heldCount: number;
      remainingBytes: bigint;
      originalBytes: bigint;
      segments: Array<{
        sourceUnitId: string;
        title: string;
        captureKey: string | null;
        status: SourceConformPlan["status"];
        remainingBytes: string;
        originalBytes: string;
        holds: string[];
      }>;
    }
  >();
  for (const plan of input.plans) {
    const date = dateKey(plan.sourceUnit.capturedAt);
    const key = date ?? "unknown";
    const day = days.get(key) ?? {
      date,
      segmentCount: 0,
      renderReadyCount: 0,
      heldCount: 0,
      remainingBytes: 0n,
      originalBytes: 0n,
      segments: [],
    };
    day.segmentCount += 1;
    if (plan.status === "render-ready") day.renderReadyCount += 1;
    if (plan.status === "held") day.heldCount += 1;
    day.remainingBytes += bytes(plan.storage.remainingBytes);
    day.originalBytes += bytes(plan.storage.originalBytes);
    day.segments.push({
      sourceUnitId: plan.sourceUnit.id,
      title: plan.sourceUnit.title,
      captureKey: plan.sourceUnit.captureKey,
      status: plan.status,
      remainingBytes: plan.storage.remainingBytes,
      originalBytes: plan.storage.originalBytes,
      holds: plan.holds,
    });
    days.set(key, day);
  }
  const statusCounts = {
    renderReady: input.plans.filter((plan) => plan.status === "render-ready")
      .length,
    readyToBind: input.plans.filter((plan) => plan.status === "ready-to-bind")
      .length,
    preparing: input.plans.filter((plan) => plan.status === "preparing").length,
    needsPreparation: input.plans.filter(
      (plan) => plan.status === "needs-preparation",
    ).length,
    held: input.plans.filter((plan) => plan.status === "held").length,
  };
  return {
    schema: GOOGLE_DRIVE_LIBRARY_CONFORM_PLAN_SCHEMA,
    library: {
      id: input.library.id,
      name: input.library.name,
      unattachedHeldSegmentCount: input.library.heldSegmentCount,
    },
    summary: {
      segmentCount: input.plans.length,
      ...statusCounts,
      totalOriginalBytes: totalOriginalBytes.toString(),
      remainingBytes: totalRemainingBytes.toString(),
      aggregateShortfallBytes: aggregateShortfallBytes.toString(),
      inventoryTruncated: input.inventoryTruncated,
    },
    executor,
    days: [...days.values()]
      .sort((left, right) =>
        left.date === null
          ? 1
          : right.date === null
            ? -1
            : right.date.localeCompare(left.date),
      )
      .map((day) => ({
        ...day,
        remainingBytes: day.remainingBytes.toString(),
        originalBytes: day.originalBytes.toString(),
        segments: day.segments.sort(
          (left, right) =>
            (left.captureKey ?? left.title).localeCompare(
              right.captureKey ?? right.title,
            ) || left.sourceUnitId.localeCompare(right.sourceUnitId),
        ),
      })),
    boundaries: {
      inspectionOnly: true as const,
      originalsRemainInDrive: true as const,
      preparationRequiresOneExplicitSegment: true as const,
      providerLocatorsWithheld: true as const,
      localPathsWithheld: true as const,
    },
  };
}

export async function planGoogleDriveLibraryConform(input: {
  prisma: PrismaClient;
  projectId: string;
  libraryId: string;
  actorUserId: string;
  executorNodeId?: string | null;
}) {
  const projectId = cleanId(input.projectId, "projectId");
  const libraryId = cleanId(input.libraryId, "libraryId");
  const actorUserId = cleanId(input.actorUserId, "actorUserId");
  const library = await input.prisma.studioExternalMediaLibrary.findFirst({
    where: { id: libraryId, projectId, provider: "google-drive" },
    select: { id: true, name: true, heldSegmentCount: true },
  });
  if (!library) {
    throw new GoogleDriveLibraryConformError(
      "library-not-found",
      "That Drive library is unavailable in this Nest.",
      404,
    );
  }
  const rows = await input.prisma.studioExternalMediaLibraryItem.findMany({
    where: {
      libraryId,
      state: "present",
      sourceUnitId: { not: null },
      sourceUnit: { kind: "insta360-drive-segment" },
    },
    select: { sourceUnitId: true },
    distinct: ["sourceUnitId"],
    orderBy: { sourceUnitId: "asc" },
    take: MAX_LIBRARY_CONFORM_SEGMENTS + 1,
  });
  const sourceUnitIds = rows
    .slice(0, MAX_LIBRARY_CONFORM_SEGMENTS)
    .flatMap((row) => (row.sourceUnitId ? [row.sourceUnitId] : []));
  const plans: SourceConformPlan[] = [];
  for (
    let offset = 0;
    offset < sourceUnitIds.length;
    offset += PLAN_CONCURRENCY
  ) {
    plans.push(
      ...(await Promise.all(
        sourceUnitIds
          .slice(offset, offset + PLAN_CONCURRENCY)
          .map((sourceUnitId) =>
            planGoogleDriveSourceUnitConform({
              prisma: input.prisma,
              projectId,
              sourceUnitId,
              actorUserId,
              executorNodeId: input.executorNodeId,
            }),
          ),
      )),
    );
  }
  return summarizeGoogleDriveLibraryConformPlans({
    library,
    plans,
    inventoryTruncated: rows.length > MAX_LIBRARY_CONFORM_SEGMENTS,
  });
}
