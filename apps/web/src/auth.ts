import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import {
  ensureAppUserFromOAuth,
  getAppUserIdentityByEmail,
} from "@/lib/server/user-identity";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google" && account?.provider !== "patreon") {
        return false;
      }

      const email = profile?.email;
      const emailVerified =
        account.provider === "patreon" ? true : Boolean((profile as any)?.email_verified);

      if (!email || !emailVerified) {
        return false;
      }

      await ensureAppUserFromOAuth({
        email,
        name: profile?.name ?? null,
        image: profile?.image ?? (profile as any)?.picture ?? null,
      });

      return true;
    },

    async jwt({ token, account, profile }) {
      const email =
        (typeof token.email === "string" && token.email) ||
        profile?.email ||
        null;

      if (!email) {
        return token;
      }

      const identity =
        account?.provider === "google" || account?.provider === "patreon" || profile
          ? await ensureAppUserFromOAuth({
              email,
              name: profile?.name ?? null,
              image: profile?.image ?? (profile as any)?.picture ?? null,
            })
          : await getAppUserIdentityByEmail(email);

      if (!identity) {
        return token;
      }

      token.email = identity.primaryEmail;
      token.appUserId = identity.id;
      token.primaryEmail = identity.primaryEmail;
      token.roles = identity.roles;
      token.isStaff = identity.isStaff;
      token.newsletterOptIn = identity.newsletterOptIn;
      token.announcementsOptIn = identity.announcementsOptIn;
      token.welcomeCompletedAt = identity.welcomeCompletedAt
        ? identity.welcomeCompletedAt.toISOString()
        : null;

      return token;
    },
  },
});
