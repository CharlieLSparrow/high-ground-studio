import {
  createOutputPacketSkeleton,
  createOutputReadinessPlan,
  getOutputDefinition,
} from "@high-ground/quipsly-domain/output-catalog";

export async function GET(
  _request: Request,
  context: { params: Promise<{ outputId: string }> },
) {
  const { outputId } = await context.params;
  const output = getOutputDefinition(outputId);

  if (!output) {
    return Response.json(
      {
        ok: false,
        error: "Unknown output type.",
        outputId,
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      output,
      readinessPlan: createOutputReadinessPlan(output),
      packetSkeleton: createOutputPacketSkeleton(output),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
