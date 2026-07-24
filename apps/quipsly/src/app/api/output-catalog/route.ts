import {
  OUTPUT_CATALOG_STAGE_LABELS,
  OUTPUT_FAMILY_LABELS,
  OUTPUT_ROADMAP_HORIZON_LABELS,
  QUIPSLY_OUTPUT_CATALOG_BOUNDARY,
  QUIPSLY_OUTPUT_CATALOG,
} from "@high-ground/quipsly-domain/output-catalog";

export function GET() {
  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      catalogBoundary: QUIPSLY_OUTPUT_CATALOG_BOUNDARY,
      definitionCount: QUIPSLY_OUTPUT_CATALOG.length,
      families: OUTPUT_FAMILY_LABELS,
      catalogStages: OUTPUT_CATALOG_STAGE_LABELS,
      roadmapHorizons: OUTPUT_ROADMAP_HORIZON_LABELS,
      outputs: QUIPSLY_OUTPUT_CATALOG,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
