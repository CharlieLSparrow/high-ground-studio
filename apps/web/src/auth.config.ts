import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Patreon from "next-auth/providers/patreon";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
    Patreon({
      clientId: process.env.PATREON_CLIENT_ID,
      clientSecret: process.env.PATREON_CLIENT_SECRET,
    }),
  ],
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      const baseUser = session.user ?? {
        name: null,
        email: "",
        image: null,
      };

      session.user = {
        ...baseUser,
        emailVerified: null,
        email:
          typeof token.email === "string"
            ? token.email
            : typeof baseUser.email === "string"
              ? baseUser.email
              : "",
        id: typeof token.appUserId === "string" ? token.appUserId : "",
        primaryEmail:
          typeof token.primaryEmail === "string"
            ? token.primaryEmail
            : typeof token.email === "string"
              ? token.email
              : "",
        roles: Array.isArray(token.roles) ? token.roles : [],
        isStaff: Boolean(token.isStaff),
        newsletterOptIn: Boolean(token.newsletterOptIn),
        announcementsOptIn: Boolean(token.announcementsOptIn),
        welcomeCompletedAt:
          typeof token.welcomeCompletedAt === "string"
            ? token.welcomeCompletedAt
            : null,
      };

      return session;
    },
  },
} satisfies NextAuthConfig;
