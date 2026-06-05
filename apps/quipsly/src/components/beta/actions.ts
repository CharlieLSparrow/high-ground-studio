"use server";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

export async function requestManualReview() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return { error: "Not authenticated" };
    }

    const prisma = getPrismaClient();
    const email = session.user.email.toLowerCase().trim();
    
    const userRecord = await prisma.user.findFirst({
      where: { primaryEmail: email }
    });

    // Check if a request was already submitted recently to avoid spam
    const recentRequest = await prisma.companySupportRequest.findFirst({
      where: {
        email: email,
        supportType: "beta_access_review",
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours
        }
      }
    });

    if (recentRequest) {
      return { success: true, message: "We already received your request and will review it soon." };
    }

    await prisma.companySupportRequest.create({
      data: {
        name: session.user.name || "Unknown Supporter",
        email: email,
        supportType: "beta_access_review",
        preferredContactMethod: "EMAIL",
        note: `Manual beta access review requested for ${email}`,
        userId: userRecord?.id || null,
      }
    });

    return { success: true, message: "Manual review requested successfully." };
  } catch (error) {
    console.error("[ManualReview] Failed to log request", error);
    return { error: "Failed to log request. Please try again later." };
  }
}
