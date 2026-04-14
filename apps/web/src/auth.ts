import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 👈 [Skippy Detail]: We explicitly tell it to look at BOTH possible env names.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET, 
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