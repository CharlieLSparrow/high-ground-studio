"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canAccessInternalContent } from "@/lib/authz";
import {
  createKanbanCard,
  type KanbanLink,
  KANBAN_PRIORITIES,
  KANBAN_STATUSES,
  type KanbanPriority,
  type KanbanStatus,
  updateKanbanCardStatus,
} from "@/lib/server/kanban";

// What this file does:
// These are the server actions for the team kanban board. The browser submits a
// form; the server receives the sealed instruction, checks the caller, parses
// the payload, mutates the board file, and redirects with an outcome message.
//
// Why this matters:
// Server actions are a nice middle path for internal tools: no separate API
// route ceremony, but still a clear trusted boundary where validation and
// authorization live.
//
// Best practice (the "textbook" version):
// Keep transport concerns, validation, domain logic, and persistence clearly
// separated, often with shared schemas and service layers.
//
// What we are doing instead (and why):
// Thin action wrappers over a small file-backed domain helper. This is a
// conscious tradeoff for speed and legibility while the kanban board is a small
// internal tool, not a platform.
//
// Tradeoff:
// We gain fewer moving parts and highly local reasoning.
// We sacrifice some reuse and some formal boundary enforcement.
//
// Question for Future Charlie:
// Why not jump straight to API routes and a service layer?
//
// Answer:
// Because architecture should solve current pressure, not cosplay future scale.
// This page is mutated by forms in the same app. Server actions fit that shape.
//
// What it looks like now:
// Two small form handlers with inline parsing and redirect-based feedback.
//
// What it turns into later:
// Shared validation helpers or schemas, more granular mutations, maybe an API
// surface if non-form clients need the same behavior.
//
// Signal to evolve it:
// When parsing logic repeats across actions, when multiple pages need the same
// mutations, or when audit requirements outgrow "whoever had team access did
// it," the fake mustache has "domain service" written underneath.
//
// Footnote:
// Think of these actions as licensed couriers carrying stamped forms to the
// correct bureaucratic altar. If the courier lacks a badge, the altar ignores
// the request and everyone goes home with exactly the same number of dragons as
// before.
function buildRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/kanban?${search.toString()}`;
}

// Authentication says "someone has a session."
// Authorization says "and they are actually allowed to touch the internal
// planning board."
//
// Best practice (the "textbook" version):
// Centralized guard helpers for privileged workflows.
//
// What we are doing instead (and why):
// Exactly that, in miniature. One gatekeeper function so the two actions do not
// each improvise their own interpretation of "team-only."
async function requireTeamKanbanAccess() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fkanban");
  }

  const roles = Array.isArray(session.user.roles) ? session.user.roles : [];

  if (!canAccessInternalContent(roles)) {
    redirect("/");
  }

  return session;
}

// Small parsers keep the actions explicit and boring, which is exactly what
// you want when user input is being turned into file-backed state.
// Future complexity wearing a fake mustache:
// "I am just one more parser function." Later you discover you have hand-rolled
// validation confetti drifting through six actions and three forms.
//
// Right now, this is small enough to keep local.
// In a more mature system, this would likely become shared schema validation.
// We are NOT doing that yet because the field set is tiny and the extra layer
// would currently teach more ceremony than value.
function parseStatus(value: string): KanbanStatus {
  return KANBAN_STATUSES.includes(value as KanbanStatus)
    ? (value as KanbanStatus)
    : "backlog";
}

function parsePriority(value: string): KanbanPriority {
  return KANBAN_PRIORITIES.includes(value as KanbanPriority)
    ? (value as KanbanPriority)
    : "medium";
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLinks(value: string): KanbanLink[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [labelPart, hrefPart] = line.split("|");

      if (hrefPart) {
        return {
          label: labelPart.trim(),
          href: hrefPart.trim(),
        };
      }

      return {
        label: line,
        href: line,
      };
    })
    .filter((entry) => entry.label && entry.href);
}

// What this does:
// Moves an existing card between the four canonical swamps: backlog, todo,
// doing, done.
//
// Why revalidate + redirect:
// This is plain old Post/Redirect/Get in modern robes. Mutate on the server,
// revalidate the page, then redirect to a fresh GET with human-readable
// feedback in the query string.
//
// Best practice (the "textbook" version):
// Use the simplest reliable feedback loop that matches the UX requirements.
//
// What we are doing instead (and why):
// PRG with query-string messages because the board does not need live toasts,
// websockets, or interpretive dance.
//
// Signal to evolve it:
// If the page starts needing inline optimistic UX, partial updates, or several
// different mutation outcomes rendered at once, this simple redirect loop will
// start coughing politely and pointing at richer state handling.
export async function updateKanbanStatusAction(formData: FormData) {
  await requireTeamKanbanAccess();

  const cardId = String(formData.get("cardId") ?? "").trim();
  const status = parseStatus(String(formData.get("status") ?? "").trim());

  if (!cardId) {
    redirect(buildRedirect({ error: "Missing kanban card id." }));
  }

  try {
    await updateKanbanCardStatus(cardId, status);
    revalidatePath("/team/kanban");
    redirect(buildRedirect({ success: "Kanban card updated." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update kanban card.";

    redirect(buildRedirect({ error: message }));
  }
}

// This action turns freeform form input into a normalized board card.
// The server utility still owns the canonical write shape; this layer is mostly
// about trust boundaries, parsing, and user-facing outcomes.
//
// First assumption that breaks:
// "Card creation is simple enough that one form and one redirect covers it."
export async function createKanbanCardAction(formData: FormData) {
  await requireTeamKanbanAccess();

  const title = String(formData.get("title") ?? "").trim();
  const status = parseStatus(String(formData.get("status") ?? "").trim());
  const type = String(formData.get("type") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const priority = parsePriority(String(formData.get("priority") ?? "").trim());
  const owner = String(formData.get("owner") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const nextStep = String(formData.get("nextStep") ?? "").trim();
  const tags = parseTags(String(formData.get("tags") ?? "").trim());
  const links = parseLinks(String(formData.get("links") ?? "").trim());

  if (!title) {
    redirect(buildRedirect({ error: "Please provide a title." }));
  }

  try {
    await createKanbanCard({
      title,
      status,
      type,
      area,
      priority,
      owner,
      summary,
      nextStep,
      tags,
      links,
    });

    revalidatePath("/team/kanban");
    redirect(buildRedirect({ success: "Kanban card added." }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create kanban card.";

    redirect(buildRedirect({ error: message }));
  }
}
