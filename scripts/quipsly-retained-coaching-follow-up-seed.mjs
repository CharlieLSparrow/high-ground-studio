#!/usr/bin/env node

import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "../apps/quipsly/src/lib/mobile-capture-consent-policy.js";
import {
  buildMobileCaptureConsentVersions,
  mobileCaptureConsentVersion,
} from "../apps/quipsly/src/lib/server/mobile-capture-consent-readiness.js";
import { resolveRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  materializeRetainedCoachingContinuitySource,
  RETAINED_COACHING_CONTINUITY_SOURCE,
} from "./lib/retained-coaching-continuity-source.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const PROJECT_ID = "quipsly-reef";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const BOOKING_ID = "retained-coaching-booking-20260731";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const NEXT_BOOKING_ID = "qa-retained-coaching-next-booking-20260807";
const CONTINUITY_WORKSPACE_ID = "qa-retained-coaching-workspace";
const CONTINUITY_WORKSPACE_SLUG = "qa-retained-coaching";
const CONTINUITY_PROJECT_ID = "qa-retained-coaching-engagement";
const CONTINUITY_PROJECT_SLUG = "qa-retained-coaching-engagement";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const OUTSIDER_EMAIL = "quipsly-followup-outsider-retained-20260731@example.test";
const COACH_UID = "quipsly-coach-retained-20260731";
const CLIENT_UID = "quipsly-client-retained-20260731";
const OUTSIDER_UID = "quipsly-followup-outsider-retained-20260731";
const CLIENT_SAFE_NOTE_ID = "retained-follow-up-client-safe-note-20260731";
const PRIVATE_NOTE_ID = "retained-follow-up-private-note-20260731";
const SHARED_NOTE_ID = "retained-follow-up-shared-note-20260731";
const TASK_ID = "retained-follow-up-client-task-20260731";
const COACH_CONTINUITY_TASK_ID = "retained-coaching-continuity-task-20260803";
const COACH_TASK_EVIDENCE_ID = "retained-coaching-continuity-task-evidence-20260803";
const TRANSCRIPT_ASSET_ID = "retained-coaching-continuity-asset-20260803";
const TRANSCRIPT_SOURCE_ID = "retained-coaching-continuity-source-20260803";
const TRANSCRIPT_MEDIA_ASSET_ID = "retained-coaching-continuity-media-20260803";
const TRANSCRIPT_JOB_ID = "retained-coaching-continuity-job-20260803";
const TRANSCRIPT_SEGMENT_ID = "retained-coaching-continuity-segment-20260803";
const TRANSCRIPT_UPLOAD_SESSION_ID = "8d8a53d8-46b4-45bf-830e-89d3482c9822";
const TRANSCRIPT_CAPTURE_ID = "53eef936-835f-411a-94be-a2f68cb89b59";
const TRANSCRIPT_STORAGE_BUCKET = "local-retained-fixture";
const TRANSCRIPT_STORAGE_OBJECT = "coaching/retained-coaching-follow-up-20260731/continuity-source.wav";
const CANDIDATE_TASK_ID = "retained-follow-up-candidate-task-20260731";
const GOAL_ID = "retained-follow-up-client-goal-20260731";
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Retained coaching dogfood refuses non-local databases.",
  );
  return value;
}

function credentialPath(label) {
  return path.join(
    os.tmpdir(),
    `quipsly-retained-coaching-${label}-credentials.json`,
  );
}

function password() {
  return `Qp-${crypto.randomBytes(24).toString("base64url")}!26`;
}

function credentialStore() {
  const value = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "temporary",
  ).trim().toLowerCase();
  assert(
    value === "temporary" || value === "keychain",
    "QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE must be temporary or keychain.",
  );
  return value;
}

async function upsertFirebaseUser(auth, input) {
  const current = await auth.getUser(input.uid).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (current) {
    await auth.updateUser(input.uid, {
      email: input.email,
      password: input.password,
      displayName: input.name,
      emailVerified: true,
      disabled: false,
    });
  } else {
    await auth.createUser({
      uid: input.uid,
      email: input.email,
      password: input.password,
      displayName: input.name,
      emailVerified: true,
    });
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL
      || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  await materializeRetainedCoachingContinuitySource();
  const store = credentialStore();
  const credentials = [
    {
      role: "coach",
      uid: COACH_UID,
      email: COACH_EMAIL,
      name: "Quipsly Retained Coach",
      password: store === "temporary" ? password() : null,
      file: credentialPath("coach"),
    },
    {
      role: "client",
      uid: CLIENT_UID,
      email: CLIENT_EMAIL,
      name: "Quipsly Retained Client",
      password: store === "temporary" ? password() : null,
      file: credentialPath("client"),
    },
    {
      role: "outsider",
      uid: OUTSIDER_UID,
      email: OUTSIDER_EMAIL,
      name: "Quipsly Retained Room Producer",
      password: store === "temporary" ? password() : null,
      file: credentialPath("outsider"),
    },
  ];
  for (const identity of credentials) {
    assert(
      /^[^\s@]+@[^\s@]+\.test$/.test(identity.email),
      "Retained coaching identities must use reserved .test email addresses.",
    );
    if (store === "keychain") {
      const resolved = resolveRetainedQAPassword({
        service: KEYCHAIN_SERVICE,
        account: identity.email,
        generate: password,
      });
      identity.password = resolved.password;
      identity.keychainCreated = resolved.created;
    }
    assert(identity.password, `No ${identity.role} QA password was resolved.`);
  }

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  await Promise.all(
    credentials.map((identity) => upsertFirebaseUser(auth, identity)),
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });
  try {
    const userByRole = {};
    for (const identity of credentials) {
      userByRole[identity.role] = await prisma.user.upsert({
        where: { primaryEmail: identity.email },
        update: {
          firebaseUid: identity.uid,
          name: identity.name,
          emailVerified: new Date(),
          isActive: true,
        },
        create: {
          primaryEmail: identity.email,
          firebaseUid: identity.uid,
          name: identity.name,
          emailVerified: new Date(),
          isActive: true,
        },
      });
    }
    await prisma.userRole.upsert({
      where: {
        userId_role: {
          userId: userByRole.coach.id,
          role: "COACH",
        },
      },
      update: {},
      create: {
        userId: userByRole.coach.id,
        role: "COACH",
      },
    });

    const scheduledStart = new Date("2026-07-31T16:00:00.000Z");
    const scheduledEnd = new Date("2026-07-31T17:00:00.000Z");
    const nextScheduledStart = new Date("2026-08-07T16:00:00.000Z");
    const nextScheduledEnd = new Date("2026-08-07T17:00:00.000Z");
    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: CONTINUITY_WORKSPACE_SLUG },
      update: {
        name: "QA Retained · Coaching continuity",
        description: "Private longitudinal coaching acceptance data.",
        ownerLabel: COACH_EMAIL,
        isPrivate: true,
      },
      create: {
        id: CONTINUITY_WORKSPACE_ID,
        slug: CONTINUITY_WORKSPACE_SLUG,
        name: "QA Retained · Coaching continuity",
        description: "Private longitudinal coaching acceptance data.",
        ownerLabel: COACH_EMAIL,
        isPrivate: true,
      },
    });
    const continuityProject = await prisma.studioProject.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: CONTINUITY_PROJECT_SLUG,
        },
      },
      update: {
        name: "QA Retained · Coaching engagement",
        description: "Two sequential Sessions proving private continuity without copied work.",
        sourceLabel: "qa-retained-coaching-continuity",
        isPrivate: true,
      },
      create: {
        id: CONTINUITY_PROJECT_ID,
        workspaceId: workspace.id,
        slug: CONTINUITY_PROJECT_SLUG,
        name: "QA Retained · Coaching engagement",
        description: "Two sequential Sessions proving private continuity without copied work.",
        sourceLabel: "qa-retained-coaching-continuity",
        isPrivate: true,
      },
    });
    for (const grant of [
      { email: COACH_EMAIL, role: "OWNER" },
      { email: CLIENT_EMAIL, role: "VIEWER" },
      { email: OUTSIDER_EMAIL, role: "VIEWER" },
    ]) {
      await prisma.studioProjectAccessGrant.upsert({
        where: {
          projectId_email: {
            projectId: continuityProject.id,
            email: grant.email,
          },
        },
        update: {
          role: grant.role,
          status: "ACTIVE",
          createdByUserId: userByRole.coach.id,
          createdByEmail: COACH_EMAIL,
          note: "QA Retained · Coaching continuity rendered-operation access.",
        },
        create: {
          projectId: continuityProject.id,
          email: grant.email,
          role: grant.role,
          status: "ACTIVE",
          createdByUserId: userByRole.coach.id,
          createdByEmail: COACH_EMAIL,
          note: "QA Retained · Coaching continuity rendered-operation access.",
        },
      });
    }
    await prisma.coachingBooking.upsert({
      where: { id: BOOKING_ID },
      update: {
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "COMPLETED",
        scheduledStart,
        scheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
      create: {
        id: BOOKING_ID,
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "COMPLETED",
        scheduledStart,
        scheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
    });
    await prisma.callRoom.upsert({
      where: { id: ROOM_ID },
      update: {
        bookingId: BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "ENDED",
        title: "Retained coaching follow-up rehearsal",
        scheduledStart,
        scheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
      create: {
        id: ROOM_ID,
        bookingId: BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "ENDED",
        title: "Retained coaching follow-up rehearsal",
        scheduledStart,
        scheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
    });

    const participants = [
      {
        id: `${ROOM_ID}-coach`,
        userId: userByRole.coach.id,
        email: COACH_EMAIL,
        displayName: "Quipsly Retained Coach",
        role: "COACH",
      },
      {
        id: `${ROOM_ID}-client`,
        userId: userByRole.client.id,
        email: CLIENT_EMAIL,
        displayName: "Quipsly Retained Client",
        role: "CLIENT",
      },
      {
        id: `${ROOM_ID}-producer`,
        userId: userByRole.outsider.id,
        email: OUTSIDER_EMAIL,
        displayName: "Quipsly Retained Room Producer",
        role: "PRODUCER",
      },
    ];
    for (const participant of participants) {
      await prisma.callParticipant.upsert({
        where: { id: participant.id },
        update: { roomId: ROOM_ID, ...participant },
        create: { roomId: ROOM_ID, ...participant },
      });
    }
    const recordingConsents = [];
    for (const participant of participants) {
      const consentedAt = new Date("2026-07-31T15:55:00.000Z");
      const consent = await prisma.recordingConsent.upsert({
        where: { id: `retained-coaching-consent-${participant.role.toLowerCase()}-20260803` },
        update: {
          roomId: ROOM_ID,
          participantId: participant.id,
          userId: participant.userId,
          status: "GRANTED",
          consentText: MOBILE_CAPTURE_CONSENT_TEXT,
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: true,
          canRecordVideo: false,
          canTranscribe: true,
          consentedAt,
          declinedAt: null,
          revokedAt: null,
          metadataJson: {
            source: "quipsly-retained-coaching-follow-up-seed",
            localOnly: true,
            syntheticFixture: true,
            consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
            consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
            recordingChoiceExplicit: true,
            transcriptionChoiceExplicit: true,
            allAudibleParticipantsNotifiedAndAgreed: true,
            presentationEvidence: {
              version: 1,
              surface: "quipsly-capture-consent-v2",
            },
          },
        },
        create: {
          id: `retained-coaching-consent-${participant.role.toLowerCase()}-20260803`,
          roomId: ROOM_ID,
          participantId: participant.id,
          userId: participant.userId,
          status: "GRANTED",
          consentText: MOBILE_CAPTURE_CONSENT_TEXT,
          policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
          canRecordAudio: true,
          canRecordVideo: false,
          canTranscribe: true,
          consentedAt,
          metadataJson: {
            source: "quipsly-retained-coaching-follow-up-seed",
            localOnly: true,
            syntheticFixture: true,
            consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
            consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
            recordingChoiceExplicit: true,
            transcriptionChoiceExplicit: true,
            allAudibleParticipantsNotifiedAndAgreed: true,
            presentationEvidence: {
              version: 1,
              surface: "quipsly-capture-consent-v2",
            },
          },
        },
      });
      recordingConsents.push(consent);
    }
    const retainedConsentVersion = mobileCaptureConsentVersion(
      buildMobileCaptureConsentVersions({ participants, consents: recordingConsents }),
    );

    await prisma.coachingBooking.upsert({
      where: { id: NEXT_BOOKING_ID },
      update: {
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "CONFIRMED",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
      create: {
        id: NEXT_BOOKING_ID,
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "CONFIRMED",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
    });
    await prisma.callRoom.upsert({
      where: { id: NEXT_ROOM_ID },
      update: {
        bookingId: NEXT_BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "PLANNED",
        title: "QA Retained · Coaching continuity Session 2",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
      create: {
        id: NEXT_ROOM_ID,
        bookingId: NEXT_BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "PLANNED",
        title: "QA Retained · Coaching continuity Session 2",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
    });
    for (const participant of participants) {
      await prisma.callParticipant.upsert({
        where: { id: `${NEXT_ROOM_ID}-${participant.role.toLowerCase()}` },
        update: {
          roomId: NEXT_ROOM_ID,
          userId: participant.userId,
          email: participant.email,
          displayName: participant.displayName,
          role: participant.role,
        },
        create: {
          id: `${NEXT_ROOM_ID}-${participant.role.toLowerCase()}`,
          roomId: NEXT_ROOM_ID,
          userId: participant.userId,
          email: participant.email,
          displayName: participant.displayName,
          role: participant.role,
        },
      });
    }

    const notes = [
      {
        id: CLIENT_SAFE_NOTE_ID,
        visibility: "CLIENT_SAFE",
        kind: "FOLLOW_UP",
        title: "Practice evidence",
        body: "Bring one specific example of the new boundary in use.",
      },
      {
        id: PRIVATE_NOTE_ID,
        visibility: "AUTHOR_PRIVATE",
        kind: "SESSION_NOTE",
        title: "Coach-only formulation",
        body: "RETAINED PRIVATE MARKER: never release this formulation.",
      },
      {
        id: SHARED_NOTE_ID,
        visibility: "SESSION_SHARED",
        kind: "SESSION_NOTE",
        title: "Room-shared note",
        body: "RETAINED SHARED MARKER: room visibility is not follow-up consent.",
      },
    ];
    for (const note of notes) {
      await prisma.coachingNote.upsert({
        where: { id: note.id },
        update: {
          roomId: ROOM_ID,
          bookingId: BOOKING_ID,
          authorUserId: userByRole.coach.id,
          ...note,
        },
        create: {
          roomId: ROOM_ID,
          bookingId: BOOKING_ID,
          authorUserId: userByRole.coach.id,
          ...note,
        },
      });
    }

    await prisma.actionItem.upsert({
      where: { id: TASK_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.client.id,
        title: "Run one protected rehearsal",
        detail: "Write down what changed and what remained difficult.",
        dueAt: new Date("2026-08-03T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        id: TASK_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.client.id,
        title: "Run one protected rehearsal",
        detail: "Write down what changed and what remained difficult.",
        dueAt: new Date("2026-08-03T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });
    const evidenceText = "I can name the smallest repeatable boundary before the next Session.";
    const coachTaskEvidence = {
      schema: "quipsly-transcript-task-evidence-merge-v1",
      receiptId: COACH_TASK_EVIDENCE_ID,
      actionCandidateId: "retained-coaching-continuity-action-candidate-20260803",
      mergedAt: "2026-08-03T18:02:00.000Z",
      candidateSource: {
        schema: "quipsly-transcript-derived-task-v1",
        roomId: ROOM_ID,
        transcriptJobId: TRANSCRIPT_JOB_ID,
        segmentId: TRANSCRIPT_SEGMENT_ID,
        startSeconds: 63.2,
        endSeconds: 71.8,
        providerTextSha256: crypto.createHash("sha256").update(evidenceText, "utf8").digest("hex"),
        providerSpeakerLabel: "Coach",
        effectiveTextSnapshot: evidenceText,
        effectiveSpeakerLabelSnapshot: "Coach",
        acceptedCorrectionId: null,
        recordingAssetId: TRANSCRIPT_ASSET_ID,
        playbackSourceId: TRANSCRIPT_SOURCE_ID,
      },
    };
    await prisma.studioVideoSource.upsert({
      where: { id: TRANSCRIPT_SOURCE_ID },
      update: {
        providerSourceId: RETAINED_COACHING_CONTINUITY_SOURCE.path,
        url: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
        title: "Retained coaching continuity source",
      },
      create: {
        id: TRANSCRIPT_SOURCE_ID,
        provider: "capture-recording",
        providerSourceId: RETAINED_COACHING_CONTINUITY_SOURCE.path,
        url: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
        title: "Retained coaching continuity source",
      },
    });
    await prisma.studioMediaAsset.upsert({
      where: { id: TRANSCRIPT_MEDIA_ASSET_ID },
      update: {
        filename: RETAINED_COACHING_CONTINUITY_SOURCE.fileName,
        url: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
        mimeType: RETAINED_COACHING_CONTINUITY_SOURCE.contentType,
        sizeBytes: BigInt(RETAINED_COACHING_CONTINUITY_SOURCE.byteSize),
        duration: RETAINED_COACHING_CONTINUITY_SOURCE.durationSeconds,
        isProxy: false,
        cloudProvider: "local-retained-fixture",
        isGlobal: false,
      },
      create: {
        id: TRANSCRIPT_MEDIA_ASSET_ID,
        filename: RETAINED_COACHING_CONTINUITY_SOURCE.fileName,
        url: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
        mimeType: RETAINED_COACHING_CONTINUITY_SOURCE.contentType,
        sizeBytes: BigInt(RETAINED_COACHING_CONTINUITY_SOURCE.byteSize),
        duration: RETAINED_COACHING_CONTINUITY_SOURCE.durationSeconds,
        isProxy: false,
        cloudProvider: "local-retained-fixture",
        isGlobal: false,
      },
    });
    await prisma.studioAssetAttachment.upsert({
      where: {
        projectId_assetId: {
          projectId: continuityProject.id,
          assetId: TRANSCRIPT_MEDIA_ASSET_ID,
        },
      },
      update: {
        role: "coaching-session-audio",
        source: "quipsly-retained-coaching-follow-up-seed",
        createdByEmail: COACH_EMAIL,
        metadataJson: {
          callRoomId: ROOM_ID,
          recordingAssetId: TRANSCRIPT_ASSET_ID,
          sourceId: TRANSCRIPT_SOURCE_ID,
          playbackUrl: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
          localOnly: true,
          syntheticFixture: true,
        },
      },
      create: {
        projectId: continuityProject.id,
        assetId: TRANSCRIPT_MEDIA_ASSET_ID,
        role: "coaching-session-audio",
        source: "quipsly-retained-coaching-follow-up-seed",
        createdByEmail: COACH_EMAIL,
        metadataJson: {
          callRoomId: ROOM_ID,
          recordingAssetId: TRANSCRIPT_ASSET_ID,
          sourceId: TRANSCRIPT_SOURCE_ID,
          playbackUrl: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
          localOnly: true,
          syntheticFixture: true,
        },
      },
    });
    const existingTranscriptAsset = await prisma.recordingAsset.findUnique({
      where: { id: TRANSCRIPT_ASSET_ID },
      select: { localManifestJson: true },
    });
    const existingSourceProfile = jsonObject(jsonObject(existingTranscriptAsset?.localManifestJson).reportedSourceProfile);
    const expectedSourceGeneration = `sha256:${RETAINED_COACHING_CONTINUITY_SOURCE.sha256}`;
    const preservedSourceProfile = existingSourceProfile.sourceSha256 === RETAINED_COACHING_CONTINUITY_SOURCE.sha256
      && existingSourceProfile.sourceGeneration === expectedSourceGeneration
      && existingSourceProfile.originalPreserved === true
      && Object.keys(jsonObject(existingSourceProfile.audioSignal)).length > 0
      ? existingSourceProfile
      : null;
    const transcriptAssetManifest = {
      source: "retained-coaching-follow-up-seed",
      localOnly: true,
      syntheticFixture: true,
      processingDisposition: "RELEASED",
      transcriptionDisposition: "RELEASED",
      ...(preservedSourceProfile ? { reportedSourceProfile: preservedSourceProfile } : {}),
      promotion: {
        status: "promoted-to-studio-media",
        mediaAssetId: TRANSCRIPT_MEDIA_ASSET_ID,
        sourceId: TRANSCRIPT_SOURCE_ID,
        playbackUrl: `/api/ingest/media/${TRANSCRIPT_SOURCE_ID}`,
        mediaKind: "audio",
        projectId: continuityProject.id,
        nestSlug: continuityProject.slug,
        localOnly: true,
        syntheticFixture: true,
      },
    };
    await prisma.recordingAsset.upsert({
      where: { id: TRANSCRIPT_ASSET_ID },
      update: {
        roomId: ROOM_ID,
        participantId: `${ROOM_ID}-coach`,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: RETAINED_COACHING_CONTINUITY_SOURCE.fileName,
        contentType: RETAINED_COACHING_CONTINUITY_SOURCE.contentType,
        byteSize: BigInt(RETAINED_COACHING_CONTINUITY_SOURCE.byteSize),
        durationSeconds: RETAINED_COACHING_CONTINUITY_SOURCE.durationSeconds,
        storageBucket: TRANSCRIPT_STORAGE_BUCKET,
        storageObjectPath: TRANSCRIPT_STORAGE_OBJECT,
        checksum: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
        recordedStartedAt: new Date("2026-07-31T16:00:00.000Z"),
        recordedStoppedAt: new Date("2026-07-31T16:01:20.000Z"),
        uploadedAt: new Date("2026-07-31T16:02:05.000Z"),
        localManifestJson: transcriptAssetManifest,
        verifiedAt: new Date("2026-08-03T18:00:00.000Z"),
      },
      create: {
        id: TRANSCRIPT_ASSET_ID,
        roomId: ROOM_ID,
        participantId: `${ROOM_ID}-coach`,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        fileName: RETAINED_COACHING_CONTINUITY_SOURCE.fileName,
        contentType: RETAINED_COACHING_CONTINUITY_SOURCE.contentType,
        byteSize: BigInt(RETAINED_COACHING_CONTINUITY_SOURCE.byteSize),
        durationSeconds: RETAINED_COACHING_CONTINUITY_SOURCE.durationSeconds,
        storageBucket: TRANSCRIPT_STORAGE_BUCKET,
        storageObjectPath: TRANSCRIPT_STORAGE_OBJECT,
        checksum: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
        recordedStartedAt: new Date("2026-07-31T16:00:00.000Z"),
        recordedStoppedAt: new Date("2026-07-31T16:01:20.000Z"),
        uploadedAt: new Date("2026-07-31T16:02:05.000Z"),
        localManifestJson: transcriptAssetManifest,
        verifiedAt: new Date("2026-08-03T18:00:00.000Z"),
      },
    });
    await prisma.mobileCaptureFinalizationReceipt.upsert({
      where: { uploadSessionId: TRANSCRIPT_UPLOAD_SESSION_ID },
      update: {
        captureId: TRANSCRIPT_CAPTURE_ID,
        roomId: ROOM_ID,
        actorUserId: userByRole.coach.id,
        consentVersion: retainedConsentVersion,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        recordingAssetId: TRANSCRIPT_ASSET_ID,
        sourceId: TRANSCRIPT_SOURCE_ID,
        mediaAssetId: TRANSCRIPT_MEDIA_ASSET_ID,
        transcriptJobId: TRANSCRIPT_JOB_ID,
        releasedByUserId: userByRole.coach.id,
        releaseReason: "Reviewed local-only retained fixture release.",
        releasedAt: new Date("2026-07-31T16:02:10.000Z"),
        transcriptReleasedByUserId: userByRole.coach.id,
        transcriptReleaseReason: "Reviewed local-only retained fixture transcript release.",
        transcriptReleasedAt: new Date("2026-07-31T16:02:10.000Z"),
        metadataJson: {
          source: "quipsly-retained-coaching-follow-up-seed",
          localOnly: true,
          syntheticFixture: true,
          immutableUploadBinding: {
            uploadSessionId: TRANSCRIPT_UPLOAD_SESSION_ID,
            roomId: ROOM_ID,
            sha256: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
            bucketName: TRANSCRIPT_STORAGE_BUCKET,
            objectName: TRANSCRIPT_STORAGE_OBJECT,
            sizeBytes: RETAINED_COACHING_CONTINUITY_SOURCE.byteSize,
          },
        },
      },
      create: {
        uploadSessionId: TRANSCRIPT_UPLOAD_SESSION_ID,
        captureId: TRANSCRIPT_CAPTURE_ID,
        roomId: ROOM_ID,
        actorUserId: userByRole.coach.id,
        consentVersion: retainedConsentVersion,
        processingDisposition: "RELEASED",
        transcriptDisposition: "RELEASED",
        recordingAssetId: TRANSCRIPT_ASSET_ID,
        sourceId: TRANSCRIPT_SOURCE_ID,
        mediaAssetId: TRANSCRIPT_MEDIA_ASSET_ID,
        transcriptJobId: TRANSCRIPT_JOB_ID,
        releasedByUserId: userByRole.coach.id,
        releaseReason: "Reviewed local-only retained fixture release.",
        releasedAt: new Date("2026-07-31T16:02:10.000Z"),
        transcriptReleasedByUserId: userByRole.coach.id,
        transcriptReleaseReason: "Reviewed local-only retained fixture transcript release.",
        transcriptReleasedAt: new Date("2026-07-31T16:02:10.000Z"),
        metadataJson: {
          source: "quipsly-retained-coaching-follow-up-seed",
          localOnly: true,
          syntheticFixture: true,
          immutableUploadBinding: {
            uploadSessionId: TRANSCRIPT_UPLOAD_SESSION_ID,
            roomId: ROOM_ID,
            sha256: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
            bucketName: TRANSCRIPT_STORAGE_BUCKET,
            objectName: TRANSCRIPT_STORAGE_OBJECT,
            sizeBytes: RETAINED_COACHING_CONTINUITY_SOURCE.byteSize,
          },
        },
      },
    });
    await prisma.transcriptJob.upsert({
      where: { id: TRANSCRIPT_JOB_ID },
      update: {
        roomId: ROOM_ID,
        assetId: TRANSCRIPT_ASSET_ID,
        status: "COMPLETED",
        provider: "retained-fixture",
        requestedBy: userByRole.coach.id,
        sourceGeneration: "retained-local-fixture-v1",
        sourceSha256: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
        completedAt: new Date("2026-08-03T18:01:00.000Z"),
        resultJson: { source: "retained-coaching-follow-up-seed", synthetic: true, confidenceTriageThreshold: 0.65, confidenceTriageThresholdAuthority: "retained-fixture-calibration-v1" },
      },
      create: {
        id: TRANSCRIPT_JOB_ID,
        roomId: ROOM_ID,
        assetId: TRANSCRIPT_ASSET_ID,
        status: "COMPLETED",
        provider: "retained-fixture",
        requestedBy: userByRole.coach.id,
        sourceGeneration: "retained-local-fixture-v1",
        sourceSha256: RETAINED_COACHING_CONTINUITY_SOURCE.sha256,
        completedAt: new Date("2026-08-03T18:01:00.000Z"),
        resultJson: { source: "retained-coaching-follow-up-seed", synthetic: true, confidenceTriageThreshold: 0.65, confidenceTriageThresholdAuthority: "retained-fixture-calibration-v1" },
      },
    });
    await prisma.transcriptSegment.upsert({
      where: { id: TRANSCRIPT_SEGMENT_ID },
      update: {
        transcriptJobId: TRANSCRIPT_JOB_ID,
        speakerLabel: "Coach",
        startSeconds: 63.2,
        endSeconds: 71.8,
        text: evidenceText,
        confidence: 1,
        metadataJson: { source: "retained-coaching-follow-up-seed", synthetic: true },
      },
      create: {
        id: TRANSCRIPT_SEGMENT_ID,
        transcriptJobId: TRANSCRIPT_JOB_ID,
        speakerLabel: "Coach",
        startSeconds: 63.2,
        endSeconds: 71.8,
        text: evidenceText,
        confidence: 1,
        metadataJson: { source: "retained-coaching-follow-up-seed", synthetic: true },
      },
    });
    const providerWords = [
      "I",
      "can",
      "name",
      "the",
      "smallest",
      "repeatable",
      "boundary",
      "before",
      "the",
      "next",
      "Session.",
    ];
    const providerWordDuration = (71.8 - 63.2) / providerWords.length;
    for (const [providerWordIndex, punctuatedWord] of providerWords.entries()) {
      const startSeconds = 63.2 + (providerWordIndex * providerWordDuration);
      const endSeconds = providerWordIndex === providerWords.length - 1
        ? 71.8
        : 63.2 + ((providerWordIndex + 1) * providerWordDuration);
      await prisma.transcriptWord.upsert({
        where: {
          transcriptJobId_providerWordIndex: {
            transcriptJobId: TRANSCRIPT_JOB_ID,
            providerWordIndex,
          },
        },
        update: {
          segmentId: TRANSCRIPT_SEGMENT_ID,
          startSeconds,
          endSeconds,
          word: punctuatedWord.replace(/[.,!?]$/u, ""),
          punctuatedWord,
          confidence: punctuatedWord === "repeatable" ? 0.58 : 0.97,
          speakerLabel: "Coach",
          channel: 0,
          metadataJson: { source: "retained-coaching-follow-up-seed", synthetic: true, immutableProviderTiming: true },
        },
        create: {
          id: `retained-coaching-continuity-word-${String(providerWordIndex + 1).padStart(2, "0")}-20260804`,
          transcriptJobId: TRANSCRIPT_JOB_ID,
          segmentId: TRANSCRIPT_SEGMENT_ID,
          providerWordIndex,
          startSeconds,
          endSeconds,
          word: punctuatedWord.replace(/[.,!?]$/u, ""),
          punctuatedWord,
          confidence: punctuatedWord === "repeatable" ? 0.58 : 0.97,
          speakerLabel: "Coach",
          channel: 0,
          metadataJson: { source: "retained-coaching-follow-up-seed", synthetic: true, immutableProviderTiming: true },
        },
      });
    }
    await prisma.actionItem.upsert({
      where: { id: COACH_CONTINUITY_TASK_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.coach.id,
        title: "Name the smallest repeatable boundary",
        detail: "Bring the client's own wording back into the next coaching conversation.",
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        id: COACH_CONTINUITY_TASK_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.coach.id,
        title: "Name the smallest repeatable boundary",
        detail: "Bring the client's own wording back into the next coaching conversation.",
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });
    await prisma.actionItemEvidenceReceipt.upsert({
      where: { id: COACH_TASK_EVIDENCE_ID },
      update: {
        actionItemId: COACH_CONTINUITY_TASK_ID,
        actorUserId: userByRole.coach.id,
        kind: "TRANSCRIPT_CANDIDATE_MERGED",
        note: "Reviewed coaching commitment evidence.",
        occurredAt: new Date("2026-08-03T18:02:00.000Z"),
        evidenceJson: coachTaskEvidence,
      },
      create: {
        id: COACH_TASK_EVIDENCE_ID,
        actionItemId: COACH_CONTINUITY_TASK_ID,
        actorUserId: userByRole.coach.id,
        kind: "TRANSCRIPT_CANDIDATE_MERGED",
        note: "Reviewed coaching commitment evidence.",
        occurredAt: new Date("2026-08-03T18:02:00.000Z"),
        evidenceJson: coachTaskEvidence,
      },
    });
    await prisma.actionItem.upsert({
      where: { id: CANDIDATE_TASK_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.client.id,
        title: "RETAINED UNREVIEWED MARKER",
        sourceJson: {
          source: "transcript-packet-builder",
          candidate: true,
        },
      },
      create: {
        id: CANDIDATE_TASK_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        assignedUserId: userByRole.client.id,
        title: "RETAINED UNREVIEWED MARKER",
        sourceJson: {
          source: "transcript-packet-builder",
          candidate: true,
        },
      },
    });
    await prisma.goal.upsert({
      where: { id: GOAL_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        ownerUserId: userByRole.client.id,
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence over a perfect performance.",
        targetAt: new Date("2026-08-14T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        id: GOAL_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        projectId: continuityProject.id,
        ownerUserId: userByRole.client.id,
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence over a perfect performance.",
        targetAt: new Date("2026-08-14T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });
    await prisma.goalTaskLink.upsert({
      where: {
        goalId_actionItemId: {
          goalId: GOAL_ID,
          actionItemId: TASK_ID,
        },
      },
      update: {
        relationship: "CONTRIBUTES",
        createdByUserId: userByRole.client.id,
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        goalId: GOAL_ID,
        actionItemId: TASK_ID,
        relationship: "CONTRIBUTES",
        createdByUserId: userByRole.client.id,
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });

    for (const identity of credentials) {
      if (store === "temporary") {
        await writeFile(
          identity.file,
          JSON.stringify({
            baseURL,
            role: identity.role,
            email: identity.email,
            password: identity.password,
            roomID: ROOM_ID,
          }),
          { mode: 0o600 },
        );
      }
    }

    const outputCount = await prisma.sessionOutput.count({
      where: { roomId: ROOM_ID },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          localOnly: true,
          retained: true,
          baseURL,
          roomID: ROOM_ID,
          nextRoomID: NEXT_ROOM_ID,
          bookingID: BOOKING_ID,
          identities: credentials.map((identity) => ({
            role: identity.role,
            email: identity.email,
            uid: identity.uid,
            credentialStore: store,
            credentialFile: store === "temporary" ? identity.file : null,
            keychainService: store === "keychain" ? KEYCHAIN_SERVICE : null,
            keychainItemCreated:
              store === "keychain" ? identity.keychainCreated === true : null,
          })),
          canonicalRecords: {
            projectID: continuityProject.id,
            priorRoomID: ROOM_ID,
            nextRoomID: NEXT_ROOM_ID,
            clientSafeNoteID: CLIENT_SAFE_NOTE_ID,
            privateNoteID: PRIVATE_NOTE_ID,
            sharedNoteID: SHARED_NOTE_ID,
            taskID: TASK_ID,
            coachContinuityTaskID: COACH_CONTINUITY_TASK_ID,
            coachTaskEvidenceID: COACH_TASK_EVIDENCE_ID,
            transcriptAssetID: TRANSCRIPT_ASSET_ID,
            transcriptJobID: TRANSCRIPT_JOB_ID,
            transcriptSegmentID: TRANSCRIPT_SEGMENT_ID,
            candidateTaskID: CANDIDATE_TASK_ID,
            goalID: GOAL_ID,
          },
          existingOutputCount: outputCount,
          secretsPrinted: false,
          externalSideEffects: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
