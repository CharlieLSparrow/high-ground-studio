import { NextResponse } from "next/server";

import { resolveFirebaseAuthEmulatorUrl } from "@/lib/firebase/auth-emulator";

const FIREBASE_PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

function firebaseClientConfig() {
  const authEmulatorUrl =
    process.env.NODE_ENV === "production"
      ? null
      : resolveFirebaseAuthEmulatorUrl(
          process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL,
        );

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    authEmulatorUrl,
  };
}

export async function GET() {
  const config = firebaseClientConfig();
  const missing = FIREBASE_PUBLIC_ENV_KEYS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Firebase client configuration is incomplete.",
        missing,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    firebase: config,
    note: "This endpoint returns public Firebase client configuration only. It does not expose Firebase Admin credentials or Quipsly secrets. A localhost Auth Emulator origin is returned only outside production.",
  });
}
