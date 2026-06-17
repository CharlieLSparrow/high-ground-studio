import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";

export async function verifyBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const prisma = getPrismaClient();
    
    // We look up the User by firebaseUid
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid }
    });

    if (!user) {
      throw new Error("User not found in Quipsly DB");
    }

    return user;
  } catch (error) {
    console.error("[verifyBearerToken] error:", error);
    throw new Error("Invalid token");
  }
}
