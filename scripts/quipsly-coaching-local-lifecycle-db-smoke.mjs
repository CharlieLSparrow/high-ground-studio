#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const rawArgs = process.argv.slice(2);
const args = new Map(
  rawArgs
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...value] = arg.slice(2).split("=");
      return [key, value.length ? value.join("=") : "1"];
    }),
);

const jsonOutput = args.has("json");
const keepArtifacts = args.has("keep-artifacts");

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function mergedEnv() {
  return {
    ...readDotEnv(path.join(repoRoot, ".env")),
    ...readDotEnv(path.join(repoRoot, ".env.local")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env")),
    ...readDotEnv(path.join(repoRoot, "apps/quipsly/.env.local")),
    ...process.env,
  };
}

function safeDatabaseLabel(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "unparseable-database-url";
  }
}

function createPrisma(databaseUrl) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: Number.parseInt(process.env.PRISMA_PG_POOL_MAX || "2", 10) || 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: Number.parseInt(process.env.PRISMA_PG_CONNECTION_TIMEOUT_MS || "20000", 10) || 20_000,
    }),
    log: ["error"],
  });
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function generatedEmail(kind, suffix) {
  return `codex-coaching-lifecycle-${kind}-${suffix}@dev.test`;
}

function consentText() {
  return "Generated smoke consent: everyone in this synthetic Quipsly session knows it is represented as recorded and transcribed test evidence.";
}

async function cleanupArtifacts(prisma, ids) {
  const cleanup = {};
  const roomIds = ids.roomIds || [];
  const bookingIds = ids.bookingIds || [];
  const paymentRecordIds = ids.paymentRecordIds || [];
  const userIds = ids.userIds || [];

  cleanup.actionItems = (await prisma.actionItem.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { bookingId: { in: bookingIds } },
        { assignedUserId: { in: userIds } },
      ],
    },
  })).count;
  cleanup.coachingNotes = (await prisma.coachingNote.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { bookingId: { in: bookingIds } },
        { authorUserId: { in: userIds } },
      ],
    },
  })).count;
  cleanup.transcriptJobs = (await prisma.transcriptJob.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { assetId: { in: ids.recordingAssetIds || [] } },
      ],
    },
  })).count;
  cleanup.recordingAssets = (await prisma.recordingAsset.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { id: { in: ids.recordingAssetIds || [] } },
      ],
    },
  })).count;
  cleanup.recordingConsents = (await prisma.recordingConsent.deleteMany({ where: { roomId: { in: roomIds } } })).count;
  cleanup.callParticipants = (await prisma.callParticipant.deleteMany({ where: { roomId: { in: roomIds } } })).count;
  cleanup.calendarEventLinks = (await prisma.calendarEventLink.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { bookingId: { in: bookingIds } },
      ],
    },
  })).count;
  cleanup.callRooms = (await prisma.callRoom.deleteMany({ where: { id: { in: roomIds } } })).count;
  cleanup.stripeCheckoutSessionLedgers = (await prisma.stripeCheckoutSessionLedger.deleteMany({
    where: {
      OR: [
        { bookingId: { in: bookingIds } },
        { paymentRecordId: { in: paymentRecordIds } },
      ],
    },
  })).count;
  cleanup.coachingBookings = (await prisma.coachingBooking.deleteMany({ where: { id: { in: bookingIds } } })).count;
  cleanup.appointments = (await prisma.appointment.deleteMany({ where: { id: { in: ids.appointmentIds || [] } } })).count;
  cleanup.paymentRecords = (await prisma.paymentRecord.deleteMany({ where: { id: { in: paymentRecordIds } } })).count;
  cleanup.stripeCustomerLinks = (await prisma.stripeCustomerLink.deleteMany({ where: { userId: { in: userIds } } })).count;
  cleanup.stripeWebhookEvents = (await prisma.stripeWebhookEvent.deleteMany({
    where: { externalEventId: { in: ids.stripeWebhookEventExternalIds || [] } },
  })).count;
  cleanup.bookingHolds = (await prisma.bookingHold.deleteMany({ where: { id: { in: ids.bookingHoldIds || [] } } })).count;
  cleanup.availabilityWindows = (await prisma.availabilityWindow.deleteMany({ where: { id: { in: ids.availabilityWindowIds || [] } } })).count;
  cleanup.serviceOfferings = (await prisma.serviceOffering.deleteMany({ where: { id: { in: ids.serviceOfferingIds || [] } } })).count;
  cleanup.coachProfiles = (await prisma.coachProfile.deleteMany({ where: { id: { in: ids.coachProfileIds || [] } } })).count;
  cleanup.userRoles = (await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } })).count;
  cleanup.users = (await prisma.user.deleteMany({ where: { id: { in: userIds } } })).count;

  return cleanup;
}

async function main() {
  const env = mergedEnv();
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the local coaching lifecycle DB smoke.");

  const suffix = args.get("suffix") || crypto.randomBytes(4).toString("hex");
  const smokeId = `quipsly-coaching-lifecycle-${suffix}`;
  const coachEmail = generatedEmail("coach", suffix);
  const clientEmail = generatedEmail("client", suffix);
  const now = new Date();
  const scheduledStart = new Date(now.getTime() + 60 * 60 * 1000);
  const scheduledEnd = new Date(scheduledStart.getTime() + 50 * 60 * 1000);
  const paidAt = new Date(now.getTime() - 5 * 60 * 1000);
  const recordedStartedAt = new Date(now.getTime() - 45 * 60 * 1000);
  const recordedStoppedAt = new Date(now.getTime() - 15 * 60 * 1000);
  const ids = {
    userIds: [],
    coachProfileIds: [],
    serviceOfferingIds: [],
    availabilityWindowIds: [],
    bookingHoldIds: [],
    paymentRecordIds: [],
    appointmentIds: [],
    bookingIds: [],
    roomIds: [],
    recordingAssetIds: [],
    stripeWebhookEventExternalIds: [],
  };

  const prisma = createPrisma(databaseUrl);
  let cleanup = null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const coach = await tx.user.create({
        data: {
          primaryEmail: coachEmail,
          name: "Codex Generated Coach",
          emailVerified: now,
          firebaseUid: `codex-coaching-lifecycle-coach-${suffix}`,
        },
      });
      const client = await tx.user.create({
        data: {
          primaryEmail: clientEmail,
          name: "Codex Generated Client",
          emailVerified: now,
          firebaseUid: `codex-coaching-lifecycle-client-${suffix}`,
        },
      });
      ids.userIds.push(coach.id, client.id);

      await tx.userRole.create({ data: { userId: coach.id, role: "OWNER" } });

      const coachProfile = await tx.coachProfile.create({
        data: {
          userId: coach.id,
          slug: `codex-lifecycle-coach-${suffix}`,
          displayName: "Codex Generated Coach",
          bio: "Generated coaching lifecycle smoke profile. Safe to delete.",
          timezone: "America/Los_Angeles",
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });
      ids.coachProfileIds.push(coachProfile.id);

      const offering = await tx.serviceOffering.create({
        data: {
          coachProfileId: coachProfile.id,
          slug: `codex-lifecycle-one-to-one-${suffix}`,
          title: "Generated one-to-one coaching smoke",
          description: "Synthetic paid one-to-one coaching offer used to prove app-owned lifecycle state.",
          kind: "ONE_TO_ONE_COACHING",
          paymentPolicy: "PAID_ONE_TO_ONE",
          durationMinutes: 50,
          priceCents: 12500,
          currency: "USD",
          stripePriceId: `price_codex_test_${suffix}`,
          metadataJson: {
            source: "codex-local-lifecycle-db-smoke",
            smokeId,
            stripeBoundary: "test-mode evidence only; no real charge was created",
          },
        },
      });
      ids.serviceOfferingIds.push(offering.id);

      const availability = await tx.availabilityWindow.create({
        data: {
          coachProfileId: coachProfile.id,
          label: "Generated smoke availability",
          timezone: "America/Los_Angeles",
          startsAt: new Date(scheduledStart.getTime() - 30 * 60 * 1000),
          endsAt: new Date(scheduledEnd.getTime() + 30 * 60 * 1000),
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });
      ids.availabilityWindowIds.push(availability.id);

      const payment = await tx.paymentRecord.create({
        data: {
          userId: client.id,
          provider: "stripe",
          status: "PAID",
          amountCents: 12500,
          currency: "USD",
          description: "Synthetic Stripe test evidence for generated one-to-one coaching smoke.",
          providerCustomerId: `cus_codex_test_${suffix}`,
          providerCheckoutSessionId: `cs_test_codex_${suffix}`,
          providerPaymentIntentId: `pi_test_codex_${suffix}`,
          paidAt,
          metadataJson: {
            source: "codex-local-lifecycle-db-smoke",
            smokeId,
            livemode: false,
            noRealCharge: true,
          },
        },
      });
      ids.paymentRecordIds.push(payment.id);

      await tx.stripeCustomerLink.create({
        data: {
          userId: client.id,
          stripeCustomerId: `cus_codex_test_${suffix}`,
          livemode: false,
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });

      const appointment = await tx.appointment.create({
        data: {
          clientUserId: client.id,
          coachUserId: coach.id,
          createdByUserId: coach.id,
          updatedByUserId: coach.id,
          scheduledStart,
          scheduledEnd,
          timezone: "America/Los_Angeles",
          status: "COMPLETED",
          locationType: "VIDEO",
          locationDetails: "Synthetic Quipsly capture room. No external calendar event created.",
          notes: "Generated lifecycle smoke appointment.",
          clientNotes: "Generated lifecycle smoke client notes.",
        },
      });
      ids.appointmentIds.push(appointment.id);

      const booking = await tx.coachingBooking.create({
        data: {
          appointmentId: appointment.id,
          offeringId: offering.id,
          clientUserId: client.id,
          coachUserId: coach.id,
          status: "COMPLETED",
          scheduledStart,
          scheduledEnd,
          timezone: "America/Los_Angeles",
          paymentPolicy: "PAID_ONE_TO_ONE",
          paymentRecordId: payment.id,
          calendarEventId: `planned-calendar-receipt-${suffix}`,
          notes: "Generated booking completed from synthetic test evidence only.",
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });
      ids.bookingIds.push(booking.id);

      const hold = await tx.bookingHold.create({
        data: {
          offeringId: offering.id,
          coachProfileId: coachProfile.id,
          clientUserId: client.id,
          contactEmail: clientEmail,
          scheduledStart,
          scheduledEnd,
          timezone: "America/Los_Angeles",
          status: "CONVERTED",
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          convertedBookingId: booking.id,
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });
      ids.bookingHoldIds.push(hold.id);

      await tx.stripeCheckoutSessionLedger.create({
        data: {
          bookingId: booking.id,
          paymentRecordId: payment.id,
          checkoutSessionId: `cs_test_codex_${suffix}`,
          mode: "payment",
          status: "complete",
          url: `https://checkout.stripe.com/c/pay/cs_test_codex_${suffix}`,
          livemode: false,
          rawJson: {
            id: `cs_test_codex_${suffix}`,
            mode: "payment",
            livemode: false,
            generated: true,
          },
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });

      const webhook = await tx.stripeWebhookEvent.create({
        data: {
          externalEventId: `evt_codex_test_${suffix}`,
          eventType: "checkout.session.completed",
          livemode: false,
          verificationStatus: "synthetic-local-smoke",
          processingStatus: "processed",
          payloadHash: crypto.createHash("sha256").update(smokeId).digest("hex"),
          payloadJson: {
            id: `evt_codex_test_${suffix}`,
            type: "checkout.session.completed",
            livemode: false,
            synthetic: true,
          },
          occurredAt: paidAt,
          processedAt: now,
        },
      });
      ids.stripeWebhookEventExternalIds.push(webhook.externalEventId);

      const room = await tx.callRoom.create({
        data: {
          bookingId: booking.id,
          createdByUserId: coach.id,
          purpose: "COACHING",
          status: "ENDED",
          provider: "local-fallback",
          providerRoomId: `codex-local-room-${suffix}`,
          title: "Generated coaching lifecycle capture room",
          scheduledStart,
          scheduledEnd,
          openedAt: scheduledStart,
          recordingStartedAt: recordedStartedAt,
          endedAt: recordedStoppedAt,
          nestSlug: "codex-generated-coaching-lifecycle",
          projectSlug: "codex-generated-coaching-lifecycle",
          recordingPolicyJson: {
            sourceTruth: "local-recording-until-server-verified",
            requiresVisibleConsent: true,
          },
          transcriptPolicyJson: {
            repairable: true,
            source: "recording-asset",
          },
          metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
        },
      });
      ids.roomIds.push(room.id);

      const coachParticipant = await tx.callParticipant.create({
        data: {
          roomId: room.id,
          userId: coach.id,
          displayName: "Codex Generated Coach",
          email: coachEmail,
          role: "COACH",
          joinedAt: scheduledStart,
          leftAt: recordedStoppedAt,
          deviceLabel: "Generated coach local recorder",
          connectionJson: { source: "codex-local-lifecycle-db-smoke", localFallback: true },
        },
      });
      const clientParticipant = await tx.callParticipant.create({
        data: {
          roomId: room.id,
          userId: client.id,
          displayName: "Codex Generated Client",
          email: clientEmail,
          role: "CLIENT",
          joinedAt: scheduledStart,
          leftAt: recordedStoppedAt,
          deviceLabel: "Generated client local recorder",
          connectionJson: { source: "codex-local-lifecycle-db-smoke", localFallback: true },
        },
      });

      for (const participant of [coachParticipant, clientParticipant]) {
        await tx.recordingConsent.create({
          data: {
            roomId: room.id,
            participantId: participant.id,
            userId: participant.userId,
            status: "GRANTED",
            consentText: consentText(),
            canRecordAudio: true,
            canRecordVideo: false,
            canTranscribe: true,
            consentedAt: scheduledStart,
            metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
          },
        });
      }

      const recording = await tx.recordingAsset.create({
        data: {
          roomId: room.id,
          participantId: clientParticipant.id,
          kind: "LOCAL_AUDIO",
          status: "VERIFIED",
          fileName: `codex-lifecycle-session-${suffix}.m4a`,
          contentType: "audio/mp4",
          byteSize: BigInt(4_250_000),
          durationSeconds: 1800,
          storageBucket: "codex-local-smoke-bucket",
          storageObjectPath: `coaching-capture/generated/${smokeId}/client-local-audio.m4a`,
          localManifestJson: {
            sourceTruth: "local-first",
            serverVerified: true,
            localDeletionAllowed: false,
          },
          segmentsJson: [
            {
              clientSegmentId: `${smokeId}-seg-0`,
              takeOrder: 1,
              segmentOrder: 0,
              startedAt: recordedStartedAt.toISOString(),
              stoppedAt: recordedStoppedAt.toISOString(),
            },
          ],
          checksum: crypto.createHash("sha256").update(`${smokeId}-audio`).digest("hex"),
          recordedStartedAt,
          recordedStoppedAt,
          uploadedAt: recordedStoppedAt,
          verifiedAt: now,
        },
      });
      ids.recordingAssetIds.push(recording.id);

      await tx.uploadChunk.createMany({
        data: [
          {
            assetId: recording.id,
            chunkIndex: 0,
            status: "VERIFIED",
            byteStart: BigInt(0),
            byteEnd: BigInt(2_124_999),
            byteSize: BigInt(2_125_000),
            checksum: crypto.createHash("sha256").update(`${smokeId}-chunk-0`).digest("hex"),
            storageObjectPath: `coaching-capture/generated/${smokeId}/chunks/0000.part`,
            uploadedAt: recordedStoppedAt,
            verifiedAt: now,
          },
          {
            assetId: recording.id,
            chunkIndex: 1,
            status: "VERIFIED",
            byteStart: BigInt(2_125_000),
            byteEnd: BigInt(4_249_999),
            byteSize: BigInt(2_125_000),
            checksum: crypto.createHash("sha256").update(`${smokeId}-chunk-1`).digest("hex"),
            storageObjectPath: `coaching-capture/generated/${smokeId}/chunks/0001.part`,
            uploadedAt: recordedStoppedAt,
            verifiedAt: now,
          },
        ],
      });

      const transcript = await tx.transcriptJob.create({
        data: {
          roomId: room.id,
          assetId: recording.id,
          status: "COMPLETED",
          provider: "synthetic-local-smoke",
          language: "en-US",
          requestedBy: coach.id,
          startedAt: recordedStoppedAt,
          completedAt: now,
          resultJson: {
            source: "codex-local-lifecycle-db-smoke",
            smokeId,
            repairable: true,
            segmentCount: 3,
          },
        },
      });

      await tx.transcriptSegment.createMany({
        data: [
          {
            transcriptJobId: transcript.id,
            speakerLabel: "Coach",
            speakerUserId: coach.id,
            startSeconds: 0,
            endSeconds: 12.5,
            text: "Welcome. Before we start, let's name what would make this session useful.",
            confidence: 0.98,
            metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
          },
          {
            transcriptJobId: transcript.id,
            speakerLabel: "Client",
            speakerUserId: client.id,
            startSeconds: 12.5,
            endSeconds: 31.2,
            text: "I need a clearer next step that does not turn into another system I avoid.",
            confidence: 0.97,
            metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
          },
          {
            transcriptJobId: transcript.id,
            speakerLabel: "Coach",
            speakerUserId: coach.id,
            startSeconds: 31.2,
            endSeconds: 48.4,
            text: "Then the action is small, visible, and reviewable before it becomes a promise.",
            confidence: 0.96,
            metadataJson: { source: "codex-local-lifecycle-db-smoke", smokeId },
          },
        ],
      });

      const summaryNote = await tx.coachingNote.create({
        data: {
          roomId: room.id,
          bookingId: booking.id,
          authorUserId: coach.id,
          kind: "SUMMARY",
          title: "Generated coaching packet summary",
          body: "Synthetic packet: the client wants a smaller next step, visible review, and less systems anxiety.",
          sourceJson: {
            source: "transcript-packet-builder",
            smokeId,
            transcriptJobId: transcript.id,
            generated: true,
          },
        },
      });

      const highlightNote = await tx.coachingNote.create({
        data: {
          roomId: room.id,
          bookingId: booking.id,
          authorUserId: coach.id,
          kind: "HIGHLIGHT",
          title: "Generated useful quote",
          body: "The action is small, visible, and reviewable before it becomes a promise.",
          sourceJson: {
            source: "transcript-packet-builder",
            smokeId,
            transcriptJobId: transcript.id,
            segmentStartSeconds: 31.2,
            generated: true,
          },
        },
      });

      await tx.actionItem.create({
        data: {
          roomId: room.id,
          bookingId: booking.id,
          noteId: summaryNote.id,
          assignedUserId: client.id,
          title: "Choose one visible next step",
          detail: "Pick one small action and review it before expanding the system.",
          status: "OPEN",
          dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          sourceJson: {
            source: "transcript-packet-builder",
            smokeId,
            transcriptJobId: transcript.id,
          },
        },
      });

      await tx.calendarEventLink.create({
        data: {
          bookingId: booking.id,
          roomId: room.id,
          provider: "google",
          providerCalendarId: "synthetic-local-smoke-calendar",
          providerEventId: `evt-calendar-codex-${suffix}`,
          status: "receipt-attached",
          title: "Generated coaching lifecycle smoke",
          scheduledStart,
          scheduledEnd,
          timezone: "America/Los_Angeles",
          htmlLink: `https://calendar.google.com/calendar/event?eid=codex-${suffix}`,
          conferenceDataJson: {
            provider: "planned",
            noExternalEventCreated: true,
          },
          rawJson: {
            source: "codex-local-lifecycle-db-smoke",
            smokeId,
          },
        },
      });

      return {
        coachId: coach.id,
        clientId: client.id,
        coachProfileId: coachProfile.id,
        offeringId: offering.id,
        bookingId: booking.id,
        roomId: room.id,
        paymentRecordId: payment.id,
        recordingAssetId: recording.id,
        transcriptJobId: transcript.id,
        summaryNoteId: summaryNote.id,
        highlightNoteId: highlightNote.id,
      };
    });

    const room = await prisma.callRoom.findUnique({
      where: { id: created.roomId },
      include: {
        booking: {
          include: {
            paymentRecord: { include: { checkoutSessionLedgers: true } },
            calendarLinks: true,
            actionItems: true,
            notesLog: true,
          },
        },
        participants: true,
        recordingConsents: true,
        recordingAssets: { include: { uploadChunks: true } },
        transcriptJobs: { include: { segments: true } },
        notes: true,
        actionItems: true,
        calendarLinks: true,
      },
    });

    assert(room, "Generated call room was not readable after creation.", { created });
    assert(room.status === "ENDED", "Generated room should be ended and review-ready.", { status: room.status });
    assert(room.booking?.status === "COMPLETED", "Generated booking should be completed for packet proof.", {
      bookingStatus: room.booking?.status,
    });
    assert(room.booking?.paymentRecord?.provider === "stripe", "Booking should retain app-owned Stripe payment evidence.", {
      provider: room.booking?.paymentRecord?.provider,
    });
    assert(room.booking?.paymentRecord?.status === "PAID", "Synthetic test payment evidence should be marked paid.", {
      paymentStatus: room.booking?.paymentRecord?.status,
    });
    assert(
      room.booking?.paymentRecord?.checkoutSessionLedgers?.some((ledger) => ledger.livemode === false),
      "Checkout ledger should prove test-mode Stripe evidence, not live money.",
    );
    assert(room.participants.length === 2, "Generated room should have coach and client participants.", {
      participantCount: room.participants.length,
    });
    assert(
      room.recordingConsents.length === 2 &&
        room.recordingConsents.every((consent) => consent.status === "GRANTED" && consent.canRecordAudio && consent.canTranscribe),
      "Every generated participant should have explicit audio/transcript consent.",
      { consents: room.recordingConsents.map((consent) => consent.status) },
    );
    assert(
      room.recordingAssets.length === 1 &&
        room.recordingAssets[0].status === "VERIFIED" &&
        room.recordingAssets[0].uploadChunks.length === 2 &&
        room.recordingAssets[0].uploadChunks.every((chunk) => chunk.status === "VERIFIED"),
      "Generated room should have a verified recording with verified chunks.",
      {
        recordingCount: room.recordingAssets.length,
        chunkCount: room.recordingAssets[0]?.uploadChunks?.length ?? 0,
      },
    );
    assert(
      room.transcriptJobs.length === 1 &&
        room.transcriptJobs[0].status === "COMPLETED" &&
        room.transcriptJobs[0].segments.length === 3,
      "Generated room should have a completed transcript with speaker segments.",
      {
        transcriptCount: room.transcriptJobs.length,
        segmentCount: room.transcriptJobs[0]?.segments?.length ?? 0,
      },
    );
    assert(
      room.notes.some((note) => note.kind === "SUMMARY") &&
        room.notes.some((note) => note.kind === "HIGHLIGHT") &&
        room.notes.some((note) => note.sourceJson?.source === "transcript-packet-builder"),
      "Generated room should have transcript packet notes.",
      { noteKinds: room.notes.map((note) => note.kind) },
    );
    assert(room.actionItems.length === 1 && room.actionItems[0].status === "OPEN", "Generated room should have an open action item.", {
      actionItemCount: room.actionItems.length,
    });

    const report = {
      ok: true,
      keptArtifacts: keepArtifacts,
      checkedAt: new Date().toISOString(),
      database: safeDatabaseLabel(databaseUrl),
      smokeId,
      invariant:
        "Quipsly can represent a complete app-owned coaching/capture lifecycle without external side effects: booking, test-mode payment evidence, consent, verified recording, transcript, packet notes, and action items.",
      created,
      evidence: {
        bookingStatus: room.booking.status,
        paymentProvider: room.booking.paymentRecord.provider,
        paymentStatus: room.booking.paymentRecord.status,
        checkoutLedgerCount: room.booking.paymentRecord.checkoutSessionLedgers.length,
        stripeLivemode: room.booking.paymentRecord.checkoutSessionLedgers.map((ledger) => ledger.livemode),
        roomStatus: room.status,
        participantCount: room.participants.length,
        grantedConsentCount: room.recordingConsents.filter((consent) => consent.status === "GRANTED").length,
        verifiedRecordingCount: room.recordingAssets.filter((asset) => asset.status === "VERIFIED").length,
        verifiedChunkCount: room.recordingAssets.flatMap((asset) => asset.uploadChunks).filter((chunk) => chunk.status === "VERIFIED").length,
        completedTranscriptCount: room.transcriptJobs.filter((job) => job.status === "COMPLETED").length,
        transcriptSegmentCount: room.transcriptJobs.flatMap((job) => job.segments).length,
        packetNoteCount: room.notes.filter((note) => note.sourceJson?.source === "transcript-packet-builder").length,
        openActionItemCount: room.actionItems.filter((item) => item.status === "OPEN").length,
      },
    };

    if (!keepArtifacts) {
      cleanup = await cleanupArtifacts(prisma, ids);
      report.cleanup = cleanup;
    }

    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("Quipsly coaching local lifecycle DB smoke: PASS");
      console.log(`Smoke ID: ${smokeId}`);
      console.log(`Database: ${report.database}`);
      console.log(`Evidence: ${JSON.stringify(report.evidence)}`);
      if (cleanup) console.log(`Cleanup: ${JSON.stringify(cleanup)}`);
    }
  } catch (error) {
    if (!keepArtifacts) {
      try {
        cleanup = await cleanupArtifacts(prisma, ids);
      } catch (cleanupError) {
        cleanup = { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) };
      }
    }

    const report = {
      ok: false,
      keptArtifacts: keepArtifacts,
      checkedAt: new Date().toISOString(),
      database: databaseUrl ? safeDatabaseLabel(databaseUrl) : null,
      error: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
      cleanup,
    };

    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else {
      console.error("Quipsly coaching local lifecycle DB smoke: FAIL");
      console.error(report.error);
      if (report.details) console.error(JSON.stringify(report.details, null, 2));
      if (cleanup) console.error(`Cleanup: ${JSON.stringify(cleanup)}`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
