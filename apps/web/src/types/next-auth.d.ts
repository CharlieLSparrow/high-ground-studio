import type { AppRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      primaryEmail: string;
      roles: AppRole[];
      isStaff: boolean;
      newsletterOptIn: boolean;
      announcementsOptIn: boolean;
      welcomeCompletedAt: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    primaryEmail?: string;
    roles?: AppRole[];
    isStaff?: boolean;
    newsletterOptIn?: boolean;
    announcementsOptIn?: boolean;
    welcomeCompletedAt?: string | null;
  }
}
