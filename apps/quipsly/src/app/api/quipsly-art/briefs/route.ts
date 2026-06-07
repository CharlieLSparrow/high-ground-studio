import {
  createQuipslyArtBrief,
  QUIPSLY_ART_ROLE_RECIPES,
} from "@high-ground/quipsly-domain/art-recipes";
import { QUIPSLY_OUTPUT_CATALOG } from "@high-ground/quipsly-domain/output-catalog";

export function GET() {
  return Response.json(
    {
      ok: true,
      roles: QUIPSLY_ART_ROLE_RECIPES,
      outputs: QUIPSLY_OUTPUT_CATALOG.map((output) => ({
        id: output.id,
        title: output.title,
        visualRoles: output.visualRoles,
      })),
      example: createQuipslyArtBrief({
        role: "librarian",
        subject: "finding related examples in a writer's source library",
        surface: "Quipsly assistant sidebar",
      }),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const output = typeof record.outputId === "string"
    ? QUIPSLY_OUTPUT_CATALOG.find((item) => item.id === record.outputId)
    : undefined;
  const inferredRole = output?.visualRoles[0];
  const inferredSubject = output
    ? `a ${output.title} helper that understands ${output.sourceInputs.slice(0, 3).join(", ")}`
    : undefined;
  const brief = createQuipslyArtBrief({
    role: typeof record.role === "string" ? record.role : inferredRole,
    subject: typeof record.subject === "string" ? record.subject : inferredSubject,
    mood: typeof record.mood === "string" ? record.mood : undefined,
    surface: typeof record.surface === "string" ? record.surface : output?.title,
  });

  return Response.json(
    {
      ok: true,
      output: output
        ? {
            id: output.id,
            title: output.title,
            visualRoles: output.visualRoles,
          }
        : null,
      brief,
      nextSteps: [
        "Copy the prompt and negative prompt into ComfyUI or your image generator.",
        "Export the approved square PNG.",
        "Run pnpm quipsly:art:ingest or copy the approved file into both public image folders.",
        "Add a semantic manifest entry to packages/quipsly-domain/src/generated-art.ts.",
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
