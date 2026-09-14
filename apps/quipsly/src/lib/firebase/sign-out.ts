import { signOut } from "firebase/auth";
import { auth } from "./firebase";

export const BROWSER_SIGN_OUT_TIMEOUT_MS = 15_000;

/** Clear this browser's server session before leaving its Firebase identity.
 * Never revoke other devices, or navigate as though an unsuccessful request worked.
 */
export async function signOutBrowserSession(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROWSER_SIGN_OUT_TIMEOUT_MS);
  try {
    const response = await fetch("/api/auth/session", {
      method: "DELETE", credentials: "same-origin", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) throw new Error("Session sign-out failed");
  } catch {
    throw new Error(controller.signal.aborted
      ? "Signing out took too long. Check your connection and try again."
      : "We couldn't sign you out. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
  try {
    await signOut(auth);
  } catch {
    throw new Error("Your session ended, but this browser couldn't finish signing out. Please try again.");
  }
}
