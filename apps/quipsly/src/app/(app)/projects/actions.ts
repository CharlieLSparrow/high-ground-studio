"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  createNestWithOwner,
  QuipslyNestCreateIdentityConflictError,
} from "@/lib/server/quipsly-core";
import { hasQuipslyBetaAccess } from "@/lib/server/patreon-authz";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";
import {
  normalizeNestKind,
} from "@/lib/studio/project-registry";
import {
  isCreatableNestKind,
  starterTitleForNestKind,
} from "./nest-creation-templates";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CreateNestFormState = {
  error: string | null;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

export async function createNestAction(
  _previous: CreateNestFormState,
  formData: FormData,
): Promise<CreateNestFormState> {
  const name = field(formData, "name");
  const description = field(formData, "description");
  const template = field(formData, "template") || "writing";
  const documentTitle = field(formData, "documentTitle");
  const clientRequestId = field(formData, "clientRequestId").toLowerCase();

  if (!name) return { error: "Give this private Nest a name." };
  if (name.length > 120) return { error: "Keep the Nest name to 120 characters." };
  if (description.length > 2_000) {
    return { error: "Keep the Nest purpose to 2,000 characters." };
  }
  if (documentTitle.length > 240) {
    return { error: "Keep the first document title to 240 characters." };
  }
  if (template.length > 40) {
    return { error: "Choose one of the available starting shapes." };
  }
  if (!UUID_PATTERN.test(clientRequestId)) {
    return {
      error: "This creation form lost its protected retry identity. Refresh the page before trying again.",
    };
  }

  const session = await auth();
  const actorEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  if (!actorEmail) redirect("/login?callbackUrl=/projects");

  if (!(await hasQuipslyBetaAccess(actorEmail))) {
    redirect("/projects?betaAccessDenied=1");
  }

  const nestKind = normalizeNestKind(template);
  if (!isCreatableNestKind(nestKind)) {
    return { error: "Choose one of the available starting shapes." };
  }
  let nestSlug: string;
  try {
    const { nest } = await createNestWithOwner({
      prisma: getPrismaClient(),
      name,
      description: description || null,
      nestKind,
      documentTitle: documentTitle || starterTitleForNestKind(nestKind),
      ownerEmail: actorEmail,
      clientRequestId,
    });
    nestSlug = nest.slug;
  } catch (error) {
    if (error instanceof QuipslyNestCreateIdentityConflictError) {
      return {
        error: "This form was already used for different project details. Refresh the page to start a new project safely.",
      };
    }
    console.error("[projects] canonical Nest creation failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error: "Quipsly could not create this private Nest. Check the connection and try again; retrying will not duplicate a completed project.",
    };
  }

  revalidatePath("/projects");
  redirect(`/nests/${encodeURIComponent(nestSlug)}`);
}
