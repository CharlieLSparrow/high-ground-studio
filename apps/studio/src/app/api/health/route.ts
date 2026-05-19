export function GET() {
  return Response.json(
    {
      ok: true,
      service: "high-ground-studio",
      app: "studio",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
