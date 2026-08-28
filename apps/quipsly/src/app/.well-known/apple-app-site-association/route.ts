const captureAppId = "585GUXMY5M.com.highgroundodyssey.HighGroundCapture";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [captureAppId],
            components: [
              {
                "/": "/sessions/*",
                "?": { open: "capture" },
                comment: "Open an authenticated Quipsly Session in Capture without carrying invitation or provider authority.",
              },
              {
                "/": "/writing/*",
                "?": { open: "capture" },
                comment: "Continue actor-owned private writing in Capture without treating the draft identifier as authority.",
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Type": "application/json",
      },
    },
  );
}
