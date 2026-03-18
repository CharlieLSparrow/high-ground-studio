import { auth, signIn, signOut } from "@/auth";

export default async function AuthButtons() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-[var(--text-light)]/80 sm:inline">
          {session.user.name ?? session.user.email}
        </span>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button
        type="submit"
        className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Sign in with Google
      </button>
    </form>
  );
}