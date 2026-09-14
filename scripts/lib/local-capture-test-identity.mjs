/** Local test adapters may create a fresh identity, never erase or rotate an
 * existing one as a side effect of preparing a UI test. Callers must establish
 * a loopback Firebase emulator before supplying the Auth instance. */
export async function ensureLocalCaptureTestIdentity({auth, email, uid, readPassword, writePassword, generatePassword}) {
  if (!/^[^\s@]+@[^\s@]+\.test$/.test(email) || !/^[a-zA-Z0-9._-]{6,128}$/.test(uid)) {
    throw new Error("Local Capture testing requires a reserved .test identity and bounded UID.");
  }
  const prior = await auth.getUserByEmail(email).catch(error => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (prior && prior.uid !== uid) throw new Error("That test email belongs to another UID. Use its actual UID or choose a fresh test identity; nothing was changed.");
  let password = readPassword();
  if (prior && !password) throw new Error("This test account has no retained password. Choose a fresh .test identity; the existing account was not changed.");
  if (!password) {
    password = generatePassword();
    // Store first so a process interruption after account creation is resumable.
    writePassword(password);
  }
  if (!prior) await auth.createUser({uid, email, password, emailVerified: true});
  return {uid, email, password, created: !prior};
}
