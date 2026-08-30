const captureAppID = "585GUXMY5M.com.highgroundodyssey.HighGroundCapture";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    applinks: {
      details: [{
        appIDs: [captureAppID],
        components: [
          {
            "/": "/open/capture/write",
            comment: "Start a new private voice-writing draft in Quipsly Capture.",
          },
          {
            "/": "/open/capture/writing/*",
            comment: "Continue an actor-authorized private writing draft in Quipsly Capture.",
          },
          {
            "/": "/write",
            "?": { open: "capture" },
            comment: "Open the Nest new-writing fallback in Quipsly Capture.",
          },
          {
            "/": "/writing/*",
            "?": { open: "capture" },
            comment: "Continue a Nest writing draft in Quipsly Capture.",
          },
          {
            "/": "/sessions/*",
            "?": { open: "capture" },
            comment: "Open an authenticated Session in Quipsly Capture.",
          },
        ],
      }],
    },
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json",
    },
  });
}
