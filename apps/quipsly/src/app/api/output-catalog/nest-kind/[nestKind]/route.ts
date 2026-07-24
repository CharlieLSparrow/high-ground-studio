import {
  listOutputsForNestKind,
  normalizeOutputNestKind,
  QUIPSLY_OUTPUT_CATALOG_BOUNDARY,
} from "@high-ground/quipsly-domain/output-catalog";

export async function GET(
  _request: Request,
  context: { params: Promise<{ nestKind: string }> },
) {
  const { nestKind } = await context.params;
  const normalizedNestKind = normalizeOutputNestKind(nestKind);
  const outputs = listOutputsForNestKind(normalizedNestKind);

  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      catalogBoundary: QUIPSLY_OUTPUT_CATALOG_BOUNDARY,
      requestedNestKind: nestKind,
      nestKind: normalizedNestKind,
      definitionCount: outputs.length,
      outputs,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
