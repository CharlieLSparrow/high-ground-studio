import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  recognitionPhraseKey,
  validateVoiceRecognitionOperation,
  VOICE_RECOGNITION_MAX_TERMS,
  VOICE_RECOGNITION_SCHEMA,
  type VoiceRecognitionOperationInput,
} from "@/lib/server/voice-recognition-profile";

export const dynamic = "force-dynamic";

class OperationConflict extends Error {}

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function publicProfile(profile: any) {
  return {
    exists: Boolean(profile),
    revision: Number(profile?.revision) || 0,
    adaptationEnabled: Boolean(profile?.adaptationEnabled),
    learnedPhrases: (profile?.terms || []).slice(0, VOICE_RECOGNITION_MAX_TERMS).map((term: any) => ({
      text: String(term.text || ""),
      count: Math.max(0, Number(term.count) || 0),
      updatedAt: term.updatedAt instanceof Date ? term.updatedAt.toISOString() : String(term.updatedAt || ""),
    })),
  };
}

function profileInclude() {
  return {
    terms: {
      where: { isActive: true },
      orderBy: [{ count: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: VOICE_RECOGNITION_MAX_TERMS,
    },
  };
}

async function actor(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const userId = String(session?.user?.id || "").trim();
  return userId || null;
}

export async function GET(request: Request) {
  const actorUserId = await actor(request);
  if (!actorUserId) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before loading speech preferences." },
      { status: 401 },
    );
  }
  const prisma = getPrismaClient() as any;
  const profile = await prisma.voiceRecognitionPreference.findUnique({
    where: { userId: actorUserId },
    include: profileInclude(),
  });
  return NextResponse.json({
    ok: true,
    schema: VOICE_RECOGNITION_SCHEMA,
    profile: publicProfile(profile),
  });
}

async function applyOperation(tx: any, actorUserId: string, input: VoiceRecognitionOperationInput) {
  const existingProfile = await tx.voiceRecognitionPreference.findUnique({
    where: { userId: actorUserId },
    select: { revision: true },
  });
  await tx.voiceRecognitionPreference.upsert({
    where: { userId: actorUserId },
    create: { userId: actorUserId },
    update: {},
  });

  if (input.operationKind === "bootstrap") {
    if (!existingProfile || existingProfile.revision === 0) {
      await tx.voiceRecognitionPreference.update({
        where: { userId: actorUserId },
        data: { adaptationEnabled: Boolean(input.adaptationEnabled) },
      });
    }
    for (const phrase of input.phrases || []) {
      const normalizedText = recognitionPhraseKey(phrase);
      const existing = await tx.voiceRecognitionTerm.findUnique({
        where: { preferenceUserId_normalizedText: { preferenceUserId: actorUserId, normalizedText } },
        select: { id: true, isActive: true },
      });
      if (!existing) {
        await tx.voiceRecognitionTerm.create({
          data: { preferenceUserId: actorUserId, normalizedText, text: phrase, count: 1, isActive: true },
        });
      } else if (existing.isActive) {
        await tx.voiceRecognitionTerm.update({ where: { id: existing.id }, data: { text: phrase } });
      }
    }
  } else if (input.operationKind === "set-adaptation") {
    await tx.voiceRecognitionPreference.update({
      where: { userId: actorUserId },
      data: { adaptationEnabled: Boolean(input.adaptationEnabled) },
    });
  } else if (input.operationKind === "learn-phrase" && input.phrase) {
    const normalizedText = recognitionPhraseKey(input.phrase);
    await tx.voiceRecognitionTerm.upsert({
      where: { preferenceUserId_normalizedText: { preferenceUserId: actorUserId, normalizedText } },
      create: {
        preferenceUserId: actorUserId,
        normalizedText,
        text: input.phrase,
        count: input.weight || 1,
        isActive: true,
      },
      update: {
        text: input.phrase,
        count: { increment: input.weight || 1 },
        isActive: true,
      },
    });
  } else if (input.operationKind === "forget-phrase" && input.phrase) {
    const normalizedText = recognitionPhraseKey(input.phrase);
    await tx.voiceRecognitionTerm.upsert({
      where: { preferenceUserId_normalizedText: { preferenceUserId: actorUserId, normalizedText } },
      create: {
        preferenceUserId: actorUserId,
        normalizedText,
        text: input.phrase,
        count: 0,
        isActive: false,
      },
      update: { text: input.phrase, isActive: false },
    });
  }
}

export async function POST(request: Request) {
  const actorUserId = await actor(request);
  if (!actorUserId) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing speech preferences." },
      { status: 401 },
    );
  }
  const validation = validateVoiceRecognitionOperation(await requestBody(request));
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, code: validation.code, error: validation.error },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.voiceRecognitionOperation.findUnique({
        where: { id: validation.value.clientRequestId },
      });
      if (existing) {
        if (existing.preferenceUserId !== actorUserId || existing.payloadHash !== validation.payloadHash) {
          throw new OperationConflict("That speech preference request identity was already used differently.");
        }
        const profile = await tx.voiceRecognitionPreference.findUnique({
          where: { userId: actorUserId },
          include: profileInclude(),
        });
        return { idempotentReplay: true, profile };
      }

      await applyOperation(tx, actorUserId, validation.value);
      const updated = await tx.voiceRecognitionPreference.update({
        where: { userId: actorUserId },
        data: { revision: { increment: 1 } },
      });
      await tx.voiceRecognitionOperation.create({
        data: {
          id: validation.value.clientRequestId,
          preferenceUserId: actorUserId,
          operationKind: validation.value.operationKind,
          payloadHash: validation.payloadHash,
          payloadJson: validation.value,
          resultingRevision: updated.revision,
        },
      });
      const profile = await tx.voiceRecognitionPreference.findUnique({
        where: { userId: actorUserId },
        include: profileInclude(),
      });
      return { idempotentReplay: false, profile };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      schema: VOICE_RECOGNITION_SCHEMA,
      idempotentReplay: result.idempotentReplay,
      profile: publicProfile(result.profile),
    });
  } catch (error) {
    if (error instanceof OperationConflict) {
      return NextResponse.json(
        { ok: false, code: "REQUEST_ID_CONFLICT", error: error.message },
        { status: 409 },
      );
    }
    console.error("[voice-recognition-profile] failed", { actorUserId, error });
    return NextResponse.json(
      { ok: false, code: "SPEECH_PROFILE_FAILED", error: "Quipsly could not sync speech preferences yet. The iPhone copy is unchanged and will retry." },
      { status: 503 },
    );
  }
}
