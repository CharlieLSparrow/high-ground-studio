import {
  OUTPUT_FAMILY_LABELS,
  OUTPUT_STATUS_LABELS,
  QUIPSLY_OUTPUT_CATALOG,
} from "@high-ground/quipsly-domain/output-catalog";

export function GET() {
  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: QUIPSLY_OUTPUT_CATALOG.length,
      families: OUTPUT_FAMILY_LABELS,
      statuses: OUTPUT_STATUS_LABELS,
      outputs: QUIPSLY_OUTPUT_CATALOG,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
