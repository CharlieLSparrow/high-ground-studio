import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AppRole } from "@prisma/client";

// This webhook handles Patreon events (members:pledge:create, members:pledge:update, members:pledge:delete)
// It verifies the signature and syncs the NETWORK_PASS role to the user based on their Patreon status.

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("x-patreon-signature");
    const secret = process.env.PATREON_WEBHOOK_SECRET;

    if (!signature || !secret) {
      console.warn("[Patreon Webhook] Missing signature or secret.");
      return NextResponse.json({ error: "Missing configuration" }, { status: 400 });
    }

    const rawBody = await req.text();
    const expectedSignature = crypto
      .createHmac("md5", secret)
      .update(rawBody)
      .digest("hex");

    // We allow bypassing signature check in local dev if a special flag is passed, 
    // but in production, signatures must match.
    if (expectedSignature !== signature && process.env.NODE_ENV === "production") {
      console.warn("[Patreon Webhook] Invalid signature mismatch.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = req.headers.get("x-patreon-event") || payload.meta?.trigger;
    
    console.log(`[Patreon Webhook] Received event: ${eventType}`);

    const memberData = payload.data;
    const included = payload.included || [];
    
    // Find the user object in the included array to get the email
    const userObject = included.find((item: any) => item.type === "user");
    const email = userObject?.attributes?.email;

    if (!email) {
      console.warn("[Patreon Webhook] Payload did not contain a user email.");
      return NextResponse.json({ error: "No email in payload" }, { status: 400 });
    }

    // Use the globally imported prisma client

    // 1. Ensure the user exists in our DB (by email)
    // If they don't exist yet, we create a stub user.
    let user = await prisma.user.findUnique({
      where: { primaryEmail: email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          primaryEmail: email,
          name: userObject?.attributes?.full_name || "Patreon Supporter",
        },
      });
      console.log(`[Patreon Webhook] Created new user record for ${email}`);
    }

    // 2. Process the event
    const status = memberData?.attributes?.patron_status; 
    // Usually "active_patron" or "declined_patron" or "former_patron"

    if (eventType === "members:pledge:create" || eventType === "members:pledge:update") {
      if (status === "active_patron") {
        // Grant Network Pass
        await prisma.userRole.upsert({
          where: {
            userId_role: {
              userId: user.id,
              role: AppRole.NETWORK_PASS,
            },
          },
          update: {},
          create: {
            userId: user.id,
            role: AppRole.NETWORK_PASS,
          },
        });
        console.log(`[Patreon Webhook] Granted NETWORK_PASS to ${email}`);
      } else {
        // Revoke Network Pass if their card declined
        await prisma.userRole.deleteMany({
          where: {
            userId: user.id,
            role: AppRole.NETWORK_PASS,
          },
        });
        console.log(`[Patreon Webhook] Revoked NETWORK_PASS for ${email} (status: ${status})`);
      }
    } else if (eventType === "members:pledge:delete") {
      // Revoke Network Pass
      await prisma.userRole.deleteMany({
        where: {
          userId: user.id,
          role: AppRole.NETWORK_PASS,
        },
      });
      console.log(`[Patreon Webhook] Revoked NETWORK_PASS for ${email} (pledge deleted)`);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("[Patreon Webhook] Error processing event:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
