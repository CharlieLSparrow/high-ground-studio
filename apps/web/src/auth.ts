import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import {
  ensureAppUserFromGoogle,
  getAppUserIdentityByEmail,
} from "@/lib/server/user-identity";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
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
  ],
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const googleProfile = profile as GoogleProfile | undefined;
      const email = googleProfile?.email;
      const emailVerified = Boolean(googleProfile?.email_verified);

      if (!email || !emailVerified) {
        return false;
      }

      await ensureAppUserFromGoogle({
        email,
        name: googleProfile?.name ?? null,
        image: googleProfile?.picture ?? null,
      });

      return true;
    },

    async jwt({ token, account, profile }) {
      const googleProfile = profile as GoogleProfile | undefined;

      const email =
        (typeof token.email === "string" && token.email) ||
        googleProfile?.email ||
        null;

      if (!email) {
        return token;
      }

      const identity =
        account?.provider === "google" || profile
          ? await ensureAppUserFromGoogle({
              email,
              name: googleProfile?.name ?? null,
              image: googleProfile?.picture ?? null,
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

      return token;
    },

    async session({ session, token }) {
      if (!session.user) {
        session.user = {
          name: null,
          email: null,
          image: null,
        };
      }

      session.user.id =
        typeof token.appUserId === "string" ? token.appUserId : "";
      session.user.email =
        typeof token.email === "string" ? token.email : session.user.email;
      session.user.primaryEmail =
        typeof token.primaryEmail === "string"
          ? token.primaryEmail
          : typeof token.email === "string"
            ? token.email
            : "";
      session.user.roles = Array.isArray(token.roles) ? token.roles : [];
      session.user.isStaff = Boolean(token.isStaff);
      session.user.newsletterOptIn = Boolean(token.newsletterOptIn);
      session.user.announcementsOptIn = Boolean(token.announcementsOptIn);

      return session;
    },
  },
});