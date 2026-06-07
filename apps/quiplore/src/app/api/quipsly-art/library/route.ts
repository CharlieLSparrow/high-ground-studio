import { createGeneratedQuipslyArtManifest } from "@high-ground/quipsly-domain/generated-art";

export function GET() {
  return Response.json(
    {
      ok: true,
      manifest: createGeneratedQuipslyArtManifest(),
      source: "Quipsly generated-art manifest",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
