import { StudioWorkbenchClient } from "./studio-workbench-client";
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
    <main className="studio-shell studio-access-shell">
      <section className="studio-access-panel" aria-label="Studio access">
        <div className="studio-glyph" aria-hidden="true">
          S
        </div>
        <p className="studio-label">Private Studio</p>
        <h1 className="studio-title">
          {isDenied ? "Studio access is restricted" : "Sign in to Studio"}
        </h1>
        <p className="studio-subtitle">
          High Ground Studio is a private writing, research, tagging, and
          provenance workspace. Access currently requires a Google account with
          an approved Studio team role.
        </p>

        {isDenied ? (
          <div className="studio-access-user">
            <span>{email}</span>
            <span>{roles?.length ? roles.join(", ") : "No approved role"}</span>
          </div>
        ) : null}

        <div className="studio-auth-actions">
          {isDenied ? (
            <form action={signOutOfStudio}>
              <button className="studio-secondary-button" type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <form action={signInWithGoogle}>
              <button className="studio-primary-button" type="submit">
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
        roles,
      }}
    />
  );
}
