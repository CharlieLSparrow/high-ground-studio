"use server";

import { revalidatePath } from "next/cache";
import type { StoryDraftStatus } from "@prisma/client";

import { auth } from "@/auth";
import { canEditStoryDrafts } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getLearningToLeadManuscript } from "@/lib/server/living-manuscript";
import {
  STORY_DRAFT_STATUSES,
  type StoryDraftActionState,
} from "@/lib/story-drafts";

const STORY_DRAFT_ROUTE = "/team/books/learning-to-lead";

async function requireStoryDraftEditor() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Please sign in before saving Story Drafts.");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canEditStoryDrafts(roles)) {
    throw new Error("You do not have permission to edit Story Drafts.");
  }

  return session;
}

function readFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = readFormString(formData, key);
  return value || null;
}

function readEpisodeNumber(formData: FormData) {
  const value = readFormString(formData, "episodeNumber");
  const parsed = Number(value);

  return value && Number.isFinite(parsed) ? parsed : null;
}

function parseStoryDraftStatus(value: string): StoryDraftStatus {
  const status = STORY_DRAFT_STATUSES.includes(value as StoryDraftStatus)
    ? (value as StoryDraftStatus)
    : "ROUGH";

  if (status === "PROMOTED") {
    throw new Error(
      "Promoted status requires the later controlled manuscript promotion workflow.",
    );
  }

  return status;
}

async function assertSourceBlockExists(sourceBlockId: string) {
  const manuscript = await getLearningToLeadManuscript();
  const exists = manuscript.blocks.some((block) => block.id === sourceBlockId);

  if (!exists) {
    throw new Error(`Source block does not exist: ${sourceBlockId}`);
  }
}

function parseDraftInput(formData: FormData) {
  const storyCandidateId = readFormString(formData, "storyCandidateId");
  const sourceBlockId = readFormString(formData, "sourceBlockId");
  const title = readFormString(formData, "title");
  const body = readFormString(formData, "body");
  const status = parseStoryDraftStatus(readFormString(formData, "status"));

  if (!storyCandidateId) {
    throw new Error("Story Candidate ID is required.");
  }

  if (!sourceBlockId) {
    throw new Error("Source block ID is required.");
  }

  if (!title) {
    throw new Error("Draft title is required.");
  }

  if (!body) {
    throw new Error("Draft body is required.");
  }

  return {
    storyCandidateId,
    sourceBlockId,
    title,
    body,
    status,
    storyCandidateTitle: readOptionalFormString(formData, "storyCandidateTitle"),
    episodeKey: readOptionalFormString(formData, "episodeKey"),
    episodeNumber: readEpisodeNumber(formData),
    arrangementKey: readOptionalFormString(formData, "arrangementKey"),
    notes: readOptionalFormString(formData, "notes"),
    supportNotes: readOptionalFormString(formData, "supportNotes"),
  };
}

function success(message: string): StoryDraftActionState {
  return {
    ok: true,
    message,
  };
}

function failure(error: unknown): StoryDraftActionState {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Story Draft save failed.",
  };
}

export async function createStoryDraftAction(
  _previousState: StoryDraftActionState,
  formData: FormData,
): Promise<StoryDraftActionState> {
  try {
    const session = await requireStoryDraftEditor();
    const input = parseDraftInput(formData);

    await assertSourceBlockExists(input.sourceBlockId);

    await prisma.storyDraft.create({
      data: {
        ...input,
        createdByUserId: session.user.id,
        reviewedByUserId:
          input.status === "ROUGH" ? null : session.user.id,
        approvedAt:
          input.status === "APPROVED_FOR_PROMOTION" ? new Date() : null,
      },
    });

    revalidatePath(STORY_DRAFT_ROUTE);

    return success("Story Draft created.");
  } catch (error) {
    return failure(error);
  }
}

export async function updateStoryDraftAction(
  _previousState: StoryDraftActionState,
  formData: FormData,
): Promise<StoryDraftActionState> {
  try {
    const session = await requireStoryDraftEditor();
    const draftId = readFormString(formData, "draftId");
    const input = parseDraftInput(formData);

    if (!draftId) {
      throw new Error("Draft ID is required for updates.");
    }

    await assertSourceBlockExists(input.sourceBlockId);

    const existing = await prisma.storyDraft.findUnique({
      where: {
        id: draftId,
      },
      select: {
        id: true,
        status: true,
        approvedAt: true,
        reviewedByUserId: true,
      },
    });

    if (!existing) {
      throw new Error("Story Draft not found.");
    }

    await prisma.storyDraft.update({
      where: {
        id: existing.id,
      },
      data: {
        ...input,
        updatedByUserId: session.user.id,
        reviewedByUserId:
          input.status !== existing.status
            ? session.user.id
            : existing.reviewedByUserId,
        approvedAt:
          input.status === "APPROVED_FOR_PROMOTION" && !existing.approvedAt
            ? new Date()
            : existing.approvedAt,
      },
    });

    revalidatePath(STORY_DRAFT_ROUTE);

    return success("Story Draft updated.");
  } catch (error) {
    return failure(error);
  }
}

export async function setStoryDraftStatusAction(
  _previousState: StoryDraftActionState,
  formData: FormData,
): Promise<StoryDraftActionState> {
  try {
    const session = await requireStoryDraftEditor();
    const draftId = readFormString(formData, "draftId");
    const status = parseStoryDraftStatus(readFormString(formData, "status"));

    if (!draftId) {
      throw new Error("Draft ID is required for status updates.");
    }

    const existing = await prisma.storyDraft.findUnique({
      where: {
        id: draftId,
      },
      select: {
        id: true,
        approvedAt: true,
      },
    });

    if (!existing) {
      throw new Error("Story Draft not found.");
    }

    await prisma.storyDraft.update({
      where: {
        id: existing.id,
      },
      data: {
        status,
        updatedByUserId: session.user.id,
        reviewedByUserId: session.user.id,
        approvedAt:
          status === "APPROVED_FOR_PROMOTION" && !existing.approvedAt
            ? new Date()
            : existing.approvedAt,
      },
    });

    revalidatePath(STORY_DRAFT_ROUTE);

    return success("Story Draft status updated.");
  } catch (error) {
    return failure(error);
  }
}
