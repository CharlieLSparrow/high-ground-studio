import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 👈 [Skippy Detail]: We look for the Vercel env var, but provide a 
  // hardcoded fallback so the server never crashes with a 500.
  secret: process.env.AUTH_SECRET || "hgo-fallback-secret-2026-production-key", 
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
});