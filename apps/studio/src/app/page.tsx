import { StudioWorkbenchClient } from "./studio-workbench-client";
import {
  cn,
  labelClassName,
  panelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  StudioGlyph,
} from "./studio-ui";
import { auth, signIn, signOut } from "@/auth";
import { loadStudioWorkbenchData } from "@/lib/server/studio-data";
import { canAccessStudio } from "@/lib/studio-authz";

export const dynamic = "force-dynamic";

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

async function signOutOfStudio() {
  "use server";
  await signOut({ redirectTo: "/" });
}

function StudioAccessShell({
  mode,
  email,
  roles,
}: {
  mode: "signed-out" | "denied";
  email?: string;
  roles?: string[];
}) {
  const isDenied = mode === "denied";

  return (
    <main className="grid min-h-screen place-items-center p-3.5 md:p-6">
      <section
        className={cn(panelClassName, "grid w-full max-w-[560px] gap-3.5 p-6")}
        aria-label="Studio access"
      >
        <StudioGlyph />
        <p className={labelClassName}>Private Studio</p>
        <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink">
          {isDenied ? "Studio access is restricted" : "Sign in to Studio"}
        </h1>
        <p className="m-0 max-w-[760px] text-[0.94rem] leading-relaxed text-studio-muted">
          High Ground Studio is a private writing, research, tagging, and
          provenance workspace. Access currently requires a Google account with
          an approved Studio team role.
        </p>

        {isDenied ? (
          <div className="grid gap-1 rounded-lg border border-studio-line p-3 font-mono text-[0.78rem] leading-relaxed text-studio-muted">
            <span>{email}</span>
            <span>{roles?.length ? roles.join(", ") : "No approved role"}</span>
          </div>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-2.5">
          {isDenied ? (
            <form className="min-w-[min(100%,220px)]" action={signOutOfStudio}>
              <button className={secondaryButtonClassName} type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <form className="min-w-[min(100%,220px)]" action={signInWithGoogle}>
              <button className={primaryButtonClassName} type="submit">
                Sign in with Google
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

export default async function StudioHomePage() {
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];

  if (!session?.user?.id) {
    return <StudioAccessShell mode="signed-out" />;
  }

  if (!canAccessStudio(roles)) {
    return (
      <StudioAccessShell
        mode="denied"
        email={session.user.primaryEmail || session.user.email || undefined}
        roles={roles}
      />
    );
  }

  const data = await loadStudioWorkbenchData();

  return (
    <StudioWorkbenchClient
      {...data}
      actor={{
        primaryEmail:
          session.user.primaryEmail || session.user.email || session.user.id,
      }}
    />
  );
}
