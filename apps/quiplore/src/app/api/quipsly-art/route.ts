import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";

export function GET() {
  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: generatedQuipslyArt.length,
      art: generatedQuipslyArt,
      source: "Quipsly generated-art manifest",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
