import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileClock,
  FileStack,
  FolderOpen,
  Link2,
  PackageCheck,
  Radio,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  getCurrentHomeNestActorEmail,
  listProjectsVisibleToEmail,
} from "@/lib/server/home-nest";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

import {
  describeArtifactEvidence,
  describeAttemptStatus,
  describePacketReadiness,
  humanizePublishingValue,
  lineageKeys,
  normalizeRecordedPublicUrl,
  type PublishingArtifactRecord,
  type PublishingRunwaySnapshot,
  type PublishingTone,
} from "./publishing-model";

export const dynamic = "force-dynamic";

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database connection is unavailable.";
  }
  if (code === "P2021" || code === "P2022") {
    return "The publishing receipt tables are not available in this database.";
  }
  return "Quipsly could not read the publishing receipt ledger.";
}

export async function loadPublishingRunway(): Promise<PublishingRunwaySnapshot> {
  const session = await auth();
  const signedInEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  const actorEmail = signedInEmail || await getCurrentHomeNestActorEmail();

  if (!actorEmail) {
    return {
      state: "signed-out",
      message: "Sign in to read private output packets and delivery receipts.",
    };
  }

  const prisma = getPrismaClient();

  try {
    const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
    const projectIds = projects.map((project) => project.id);
    const authState = signedInEmail ? "signed-in" as const : "local-operator" as const;

    if (projectIds.length === 0) {
      return {
        state: "ready",
        authState,
        accessibleNestCount: 0,
        packets: [],
        unmatchedArtifacts: [],
        attemptCount: 0,
        artifactCount: 0,
        plannedCount: 0,
      };
    }

    const [packetRows, artifactRows] = await Promise.all([
      prisma.studioOutputPacket.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          slug: true,
          kind: true,
          title: true,
          status: true,
          projectId: true,
          createdByEmail: true,
          approvedByEmail: true,
          approvedAt: true,
          publishAt: true,
          createdAt: true,
          updatedAt: true,
          lineageJson: true,
          project: { select: { name: true, slug: true } },
          document: { select: { title: true } },
          productionRoom: { select: { title: true } },
          publishAttempts: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              destination: true,
              status: true,
              error: true,
              requestedByEmail: true,
              startedAt: true,
              completedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.studioPublishedArtifact.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          projectId: true,
          outputPacketId: true,
          destination: true,
          status: true,
          externalId: true,
          publicUrl: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { name: true, slug: true } },
        },
      }),
    ]);

    const artifacts: PublishingArtifactRecord[] = artifactRows.map((artifact) => {
      const recordedUrl = normalizeRecordedPublicUrl(artifact.publicUrl);
      return {
        id: artifact.id,
        projectId: artifact.projectId,
        outputPacketId: artifact.outputPacketId,
        projectName: artifact.project.name,
        projectSlug: artifact.project.slug,
        destination: artifact.destination,
        status: artifact.status,
        externalId: artifact.externalId,
        publicUrl: recordedUrl?.url ?? null,
        publicUrlHost: recordedUrl?.host ?? null,
        publishedAt: artifact.publishedAt?.toISOString() ?? null,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt: artifact.updatedAt.toISOString(),
      };
    });

    const artifactsByPacketId = new Map<string, PublishingArtifactRecord[]>();
    for (const artifact of artifacts) {
      if (!artifact.outputPacketId) continue;
      const records = artifactsByPacketId.get(artifact.outputPacketId) ?? [];
      records.push(artifact);
      artifactsByPacketId.set(artifact.outputPacketId, records);
    }

    const packets = packetRows.map((packet) => ({
      id: packet.id,
      slug: packet.slug,
      kind: packet.kind,
      title: packet.title,
      status: packet.status,
      projectId: packet.projectId,
      projectName: packet.project.name,
      projectSlug: packet.project.slug,
      documentTitle: packet.document?.title ?? null,
      productionRoomTitle: packet.productionRoom?.title ?? null,
      createdByEmail: packet.createdByEmail,
      approvedByEmail: packet.approvedByEmail,
      approvedAt: packet.approvedAt?.toISOString() ?? null,
      publishAt: packet.publishAt?.toISOString() ?? null,
      createdAt: packet.createdAt.toISOString(),
      updatedAt: packet.updatedAt.toISOString(),
      lineageKeys: lineageKeys(packet.lineageJson),
      attempts: packet.publishAttempts.map((attempt) => ({
        id: attempt.id,
        destination: attempt.destination,
        status: attempt.status,
        requestedByEmail: attempt.requestedByEmail,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        completedAt: attempt.completedAt?.toISOString() ?? null,
        createdAt: attempt.createdAt.toISOString(),
        errorRecorded: Boolean(attempt.error),
      })),
      artifacts: artifactsByPacketId.get(packet.id) ?? [],
    }));

    const loadedPacketIds = new Set(packets.map((packet) => packet.id));

    return {
      state: "ready",
      authState,
      accessibleNestCount: projects.length,
      packets,
      unmatchedArtifacts: artifacts.filter(
        (artifact) => !artifact.outputPacketId || !loadedPacketIds.has(artifact.outputPacketId),
      ),
      attemptCount: packets.reduce((total, packet) => total + packet.attempts.length, 0),
      artifactCount: artifacts.length,
      plannedCount: packets.filter((packet) => Boolean(packet.publishAt)).length,
    };
  } catch (error) {
    console.error("[publishing] Failed to load the publishing runway", error);
    return {
      state: "unavailable",
      authState: signedInEmail ? "signed-in" : "local-operator",
      message: safeDatabaseMessage(error),
    };
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date needs review";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

const toneStyles: Record<PublishingTone, string> = {
  neutral: "border-[#ded1ba] bg-[#f8f3e9] text-[#725c40]",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

function FactBadge({ tone, children }: { tone: PublishingTone; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}

function ArtifactReceipt({ artifact }: { artifact: PublishingArtifactRecord }) {
  const evidence = describeArtifactEvidence(artifact);
  return (
    <article className="rounded-xl border border-[#e8dcc4] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a6542]">
            {humanizePublishingValue(artifact.destination)}
          </p>
          <p className="mt-1 text-sm font-black text-[#3d3122]">
            Artifact status: {humanizePublishingValue(artifact.status)}
          </p>
        </div>
        <FactBadge tone={evidence.tone}>{evidence.label}</FactBadge>
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#786247]">{evidence.detail}</p>
      <dl className="mt-3 grid gap-1 text-xs font-semibold text-[#806b4f] sm:grid-cols-2">
        <div><dt className="inline font-black">Provider ID: </dt><dd className="inline break-all">{artifact.externalId || "Not recorded"}</dd></div>
        <div><dt className="inline font-black">Published at: </dt><dd className="inline">{formatDateTime(artifact.publishedAt)}</dd></div>
      </dl>
      {artifact.publicUrl ? (
        <a
          href={artifact.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[#76522c] underline decoration-[#c9a979] underline-offset-4"
        >
          Open recorded URL <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : (
        <p className="mt-3 text-xs font-bold text-[#927d61]">No safe public HTTP(S) URL in this receipt.</p>
      )}
    </article>
  );
}

function EmptyLedger() {
  return (
    <section className="rounded-3xl border border-dashed border-[#d8c5a3] bg-white/60 p-8" role="status">
      <ReceiptText className="h-8 w-8 text-[#987443]" aria-hidden="true" />
      <h2 className="mt-4 font-serif text-3xl font-black text-[#3d3122]">No persisted publishing records yet.</h2>
      <p className="mt-3 max-w-2xl font-semibold leading-relaxed text-[#765f40]">
        This runway stays empty until an accessible Nest has a real output packet, provider attempt, or artifact receipt. It does not invent connected accounts, queued posts, schedules, or destination health.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/projects" className="rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Open Nests</Link>
        <Link href="/outputs" className="rounded-full border border-[#d9c7a5] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Browse output plans</Link>
      </div>
    </section>
  );
}

export default async function PublishingPage() {
  const snapshot = await loadPublishingRunway();

  return (
    <main className="min-h-full bg-transparent px-5 py-8 text-[#3d3122] lg:px-10">
      <header className="mx-auto max-w-[1500px]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#987443]">Publishing runway</p>
        <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-black tracking-tight lg:text-5xl">Packets, attempts, and receipts—without the theater.</h1>
            <p className="mt-3 max-w-3xl text-base font-semibold leading-relaxed text-[#765f40]">
              Read the delivery evidence Quipsly actually has. Internal packet readiness, an intended publish time, a provider request, and a public artifact are four different facts here.
            </p>
          </div>
          <nav aria-label="Publishing destinations" className="flex flex-wrap gap-2">
            <Link href="/outputs" className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f] shadow-sm hover:bg-[#fffaf0]">
              Output catalog
            </Link>
            <Link href="/projects" className="rounded-full bg-[#3e2f21] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#231a12]">
              Open Nests
            </Link>
          </nav>
        </div>
      </header>

      {snapshot.state === "signed-out" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8" role="status">
          <ShieldCheck className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <h2 className="mt-4 font-serif text-3xl font-black">The private publishing ledger is locked.</h2>
          <p className="mt-2 font-semibold text-[#765f40]">{snapshot.message}</p>
          <Link href="/login?callbackUrl=%2Fpublishing" className="mt-5 inline-flex rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link>
        </section>
      ) : snapshot.state === "unavailable" ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-amber-200 bg-amber-50/75 p-8" role="status" aria-label="Publishing ledger unavailable">
          <CircleAlert className="h-8 w-8 text-amber-700" aria-hidden="true" />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-800">Receipt data unavailable</p>
          <h2 className="mt-2 font-serif text-3xl font-black">No simulated publishing board is standing in.</h2>
          <p className="mt-3 font-semibold leading-relaxed text-[#765f40]">{snapshot.message} Your packets and source work have not been changed.</p>
          <p className="mt-2 text-sm font-semibold text-[#8a7354]">Auth state: {snapshot.authState === "signed-in" ? "signed in" : "local preview access"}. Persistence state: unavailable.</p>
          <Link href="/publishing" className="mt-5 inline-flex rounded-full border border-amber-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-amber-900">Retry read</Link>
        </section>
      ) : (
        <div className="mx-auto mt-9 max-w-[1500px] space-y-8">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="How publishing evidence is separated">
            {[
              { icon: FileStack, title: "Packet", copy: "Internal content shape, status, lineage, and approval receipt." },
              { icon: CalendarClock, title: "Plan", copy: "publishAt is a Quipsly intention—not a provider schedule." },
              { icon: Radio, title: "Attempt", copy: "A request lifecycle—not proof that anything went live." },
              { icon: Link2, title: "Artifact", copy: "An external ID or recorded URL, kept distinct from the request." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-[#e5d5b7] bg-white p-4 shadow-sm">
                  <Icon className="h-5 w-5 text-[#987443]" aria-hidden="true" />
                  <h2 className="mt-3 font-black">{item.title}</h2>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#80694a]">{item.copy}</p>
                </article>
              );
            })}
          </section>

          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-[#765f40]" aria-label="Publishing ledger source state">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">Most recent persisted records</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">Read only</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.accessibleNestCount} accessible Nest{snapshot.accessibleNestCount === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.packets.length} packet{snapshot.packets.length === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.plannedCount} internal plan{snapshot.plannedCount === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.attemptCount} attempt{snapshot.attemptCount === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-[#e2d2b4] bg-white px-3 py-1.5">{snapshot.artifactCount} artifact receipt{snapshot.artifactCount === 1 ? "" : "s"}</span>
          </div>

          <p className="text-xs font-semibold leading-5 text-[#8a7354]">
            This read is bounded to the 100 most recently updated packets, 20 recent attempts per packet, and 200 most recently updated artifact receipts across your accessible Nests.
          </p>

          {snapshot.packets.length === 0 && snapshot.unmatchedArtifacts.length === 0 ? (
            <EmptyLedger />
          ) : (
            <section className="space-y-5" aria-labelledby="packet-ledger-heading">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#987443]">Accessible Nest records</p>
                <h2 id="packet-ledger-heading" className="mt-1 font-serif text-3xl font-black">Output packet ledger</h2>
              </div>
              {snapshot.packets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d8c7a7] bg-white/55 p-5 text-sm font-semibold text-[#7a6548]">
                  Artifact receipts exist below, but no accessible output packet is linked to them.
                </div>
              ) : snapshot.packets.map((packet) => {
                const readiness = describePacketReadiness(packet.status, packet.approvedAt, packet.approvedByEmail);
                return (
                  <article key={packet.id} className="overflow-hidden rounded-3xl border border-[#e1d2b7] bg-white shadow-sm">
                    <header className="border-b border-[#eee3d1] bg-[#fffaf1] p-5 lg:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <FactBadge tone={readiness.tone}>{readiness.label}</FactBadge>
                            <span className="text-[10px] font-black uppercase tracking-[0.13em] text-[#8a7354]">{humanizePublishingValue(packet.kind)}</span>
                          </div>
                          <h3 className="mt-3 font-serif text-2xl font-black lg:text-3xl">{packet.title}</h3>
                          <p className="mt-1 text-sm font-semibold text-[#80694a]">{packet.projectName} · packet {packet.slug}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/nests/${encodeURIComponent(packet.projectSlug)}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#d8c5a3] bg-white px-3 py-2 text-xs font-black text-[#674d2e]">
                            <FolderOpen size={14} aria-hidden="true" /> Open Nest
                          </Link>
                          <Link href="/outputs" className="inline-flex items-center gap-1.5 rounded-full border border-[#d8c5a3] bg-white px-3 py-2 text-xs font-black text-[#674d2e]">
                            Output plans <ArrowUpRight size={14} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </header>

                    <div className="grid gap-0 xl:grid-cols-4">
                      <section className="border-b border-[#eee3d1] p-5 xl:border-b-0 xl:border-r" aria-label={`${packet.title} packet readiness`}>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8a6542]"><PackageCheck size={15} aria-hidden="true" /> Packet readiness</div>
                        <p className="mt-3 text-lg font-black">Stored status: {humanizePublishingValue(packet.status)}</p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-[#786247]">{readiness.detail}</p>
                        <dl className="mt-4 space-y-2 text-xs font-semibold text-[#806b4f]">
                          <div><dt className="font-black">Approval time</dt><dd>{formatDateTime(packet.approvedAt)}</dd></div>
                          <div><dt className="font-black">Created by</dt><dd className="break-all">{packet.createdByEmail || "Not recorded"}</dd></div>
                        </dl>
                      </section>

                      <section className="border-b border-[#eee3d1] p-5 xl:border-b-0 xl:border-r" aria-label={`${packet.title} internal publish plan`}>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8a6542]"><CalendarClock size={15} aria-hidden="true" /> Internal publish plan</div>
                        <p className="mt-3 text-lg font-black">{packet.publishAt ? formatDateTime(packet.publishAt) : "No publishAt recorded"}</p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-[#786247]">
                          {packet.publishAt
                            ? "This time is stored on the Quipsly packet. It does not prove a provider accepted or scheduled it."
                            : "No internal target time is stored. Quipsly does not infer a calendar slot."}
                        </p>
                      </section>

                      <section className="border-b border-[#eee3d1] p-5 xl:border-b-0 xl:border-r" aria-label={`${packet.title} provider attempts`}>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8a6542]"><FileClock size={15} aria-hidden="true" /> Provider attempts</div>
                        {packet.attempts.length === 0 ? (
                          <p className="mt-3 text-sm font-semibold leading-6 text-[#80694a]">No provider request is recorded for this packet.</p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {packet.attempts.map((attempt) => {
                              const attemptState = describeAttemptStatus(attempt.status);
                              return (
                                <article key={attempt.id} className="rounded-xl border border-[#e8dcc4] bg-[#fffdf8] p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-black">{humanizePublishingValue(attempt.destination)}</p>
                                    <FactBadge tone={attemptState.tone}>{attemptState.label}</FactBadge>
                                  </div>
                                  <p className="mt-2 text-[11px] font-semibold leading-4 text-[#786247]">{attemptState.detail}</p>
                                  <p className="mt-2 text-[11px] font-bold text-[#8a7354]">Status: {humanizePublishingValue(attempt.status)} · {formatDateTime(attempt.completedAt || attempt.startedAt || attempt.createdAt)}</p>
                                  {attempt.errorRecorded && <p className="mt-1 text-[11px] font-black text-rose-700">Error detail recorded in the attempt ledger.</p>}
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section className="p-5" aria-label={`${packet.title} external artifact receipts`}>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8a6542]"><ReceiptText size={15} aria-hidden="true" /> External artifact receipts</div>
                        {packet.artifacts.length === 0 ? (
                          <p className="mt-3 text-sm font-semibold leading-6 text-[#80694a]">No artifact receipt is linked. Attempts above are not publication proof.</p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {packet.artifacts.map((artifact) => <ArtifactReceipt key={artifact.id} artifact={artifact} />)}
                          </div>
                        )}
                      </section>
                    </div>

                    <footer className="border-t border-[#eee3d1] bg-[#fcf8f0] px-5 py-4 text-xs font-semibold text-[#80694a] lg:px-6">
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <span><strong className="text-[#5f482d]">Source document:</strong> {packet.documentTitle || "Not linked"}</span>
                        <span><strong className="text-[#5f482d]">Production room:</strong> {packet.productionRoomTitle || "Not linked"}</span>
                        <span><strong className="text-[#5f482d]">Lineage:</strong> {packet.lineageKeys.length ? packet.lineageKeys.join(", ") : "No lineage keys recorded"}</span>
                        <span><strong className="text-[#5f482d]">Updated:</strong> {formatDateTime(packet.updatedAt)}</span>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </section>
          )}

          {snapshot.unmatchedArtifacts.length > 0 && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 lg:p-6" aria-labelledby="unlinked-artifacts-heading">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-1 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Lineage gap</p>
                  <h2 id="unlinked-artifacts-heading" className="mt-1 font-serif text-2xl font-black">Artifact receipts without a packet shown above</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">These records are scoped to accessible Nests, but either have no packet link or point to a packet outside this recent-record window. They remain visible instead of being treated as complete delivery proof.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {snapshot.unmatchedArtifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                    <ArtifactReceipt artifact={artifact} />
                    <Link href={`/nests/${encodeURIComponent(artifact.projectSlug)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[#76522c] underline underline-offset-4">
                      Open {artifact.projectName} <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="flex items-center gap-2 text-xs font-semibold leading-5 text-[#8a7354]">
            <Clock3 size={14} aria-hidden="true" /> Recorded URLs are opened as external links, but this read-only page does not ping providers or certify current service availability.
          </p>
        </div>
      )}
    </main>
  );
}
