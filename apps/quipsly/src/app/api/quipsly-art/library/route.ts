import { createGeneratedQuipslyArtManifest } from "@high-ground/quipsly-domain/generated-art";

export function GET() {
  return Response.json(
    {
      ok: true,
      manifest: createGeneratedQuipslyArtManifest(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
