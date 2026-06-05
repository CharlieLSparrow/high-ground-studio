import { NextResponse } from "next/server";

function disabledAuthResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "HighGroundOdyssey.com auth is temporarily routed through Quipsly/Nest while the public site is being rebuilt as a publishing projection.",
    },
    { status: 503 },
  );
}

export const GET = disabledAuthResponse;
export const POST = disabledAuthResponse;
