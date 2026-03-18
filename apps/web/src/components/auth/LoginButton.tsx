"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function LoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="text-sm text-orange-400 hover:text-orange-300"
      >
        Sign out ({session.user?.name})
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="text-sm text-orange-400 hover:text-orange-300"
    >
      Sign in
    </button>
  );
}