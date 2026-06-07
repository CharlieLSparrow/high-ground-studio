import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Patreon from "next-auth/providers/patreon";

import {
  createStudioAllowlistIdentity,
  isStudioAllowlistAuthMode,
  isStudioEmailAllowed,
} from "@/lib/server/studio-auth-mode";
import {
  ensureStudioUserFromGoogle,
  getStudioUserIdentityByEmail,
} from "@/lib/server/studio-user-identity";
import { hasQuipslyBetaAccess } from "@/lib/server/patreon-authz";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

const authProviders = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: {
        prompt: "select_account",
      },
    },
  }),
  ...(process.env.PATREON_CLIENT_ID && process.env.PATREON_CLIENT_SECRET
    ? [
        Patreon({
          clientId: process.env.PATREON_CLIENT_ID,
          clientSecret: process.env.PATREON_CLIENT_SECRET,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authProviders,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" && account?.provider !== "patreon") {
        return false;
      }

      // Patreon doesn't always guarantee verified emails in the same way, but we need email for checking access.
      const email = profile?.email;

      if (!email) {
        return false;
      }

      if (isStudioAllowlistAuthMode()) {
        return isStudioEmailAllowed(email as string);
      }

      if (account?.provider === "google") {
        try {
          await ensureStudioUserFromGoogle({
            email: email as string,
            name: profile?.name ?? null,
            image: profile?.picture ?? null,
          });
        } catch (error) {
          console.error("Studio identity provisioning failed.", error);
          return false;
        }
      }

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

      // Set Beta Access Flag for Patreon Gating
      token.hasBetaAccess = await hasQuipslyBetaAccess(email as string);

      try {
        const identity = isStudioAllowlistAuthMode()
          ? createStudioAllowlistIdentity({
              email: email as string,
              name: profile?.name ?? null,
              image: profile?.picture ?? null,
            })
          : account?.provider === "google"
            ? await ensureStudioUserFromGoogle({
                email: email as string,
                name: profile?.name ?? null,
                image: profile?.picture ?? null,
              })
            : await getStudioUserIdentityByEmail(email as string);

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
        hasBetaAccess: Boolean(token.hasBetaAccess),
      };

      return session;
    },

    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        const home = new URL(baseUrl);

        if (target.origin !== home.origin) {
          return `${baseUrl}/projects`;
        }

        if (target.pathname === "/" || target.pathname.startsWith("/api/auth")) {
          return `${baseUrl}/projects`;
        }

        return target.toString();
      } catch {
        return `${baseUrl}/projects`;
      }
    },
  },
});
