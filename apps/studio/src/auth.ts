import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import {
  ensureStudioUserFromGoogle,
  getStudioUserIdentityByEmail,
} from "@/lib/server/studio-user-identity";

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

      try {
        await ensureStudioUserFromGoogle({
          email,
          name: googleProfile?.name ?? null,
          image: googleProfile?.picture ?? null,
        });
      } catch (error) {
        console.error("Studio identity provisioning failed.", error);
        return false;
      }

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

      try {
        const identity =
          account?.provider === "google" || profile
            ? await ensureStudioUserFromGoogle({
                email,
                name: googleProfile?.name ?? null,
                image: googleProfile?.picture ?? null,
              })
            : await getStudioUserIdentityByEmail(email);

        if (!identity) {
          return token;
        }

        token.email = identity.primaryEmail;
        token.appUserId = identity.id;
        token.primaryEmail = identity.primaryEmail;
        token.roles = identity.roles;
        token.isStaff = identity.isStaff;
      } catch (error) {
        console.error("Studio identity token enrichment failed.", error);
      }

      return token;
    },

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
      };

      return session;
    },
  },
});
