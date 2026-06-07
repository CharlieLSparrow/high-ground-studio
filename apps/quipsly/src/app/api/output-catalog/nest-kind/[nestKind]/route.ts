import {
  listOutputsForNestKind,
  normalizeOutputNestKind,
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
      requestedNestKind: nestKind,
      nestKind: normalizedNestKind,
      count: outputs.length,
      outputs,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
