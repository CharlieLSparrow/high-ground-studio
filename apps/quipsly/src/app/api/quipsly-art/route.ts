import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { QUIPSLY_ART_ROLE_RECIPES } from "@high-ground/quipsly-domain/art-recipes";

export function GET() {
  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: generatedQuipslyArt.length,
      art: generatedQuipslyArt,
      roles: QUIPSLY_ART_ROLE_RECIPES,
      workflow: {
        briefEndpoint: "/api/quipsly-art/briefs",
        createBrief: "pnpm quipsly:art:brief -- --role librarian --subject \"finding examples in a writer's source library\"",
        ingestDownloads: "pnpm quipsly:art:ingest -- --count 12 --hint \"ChatGPT Image\"",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
