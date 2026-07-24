import { resolveFirebaseAuthEmulatorUrl } from "./auth-emulator";

describe("Firebase Auth Emulator URL", () => {
  it("accepts explicit localhost HTTP origins", () => {
    expect(resolveFirebaseAuthEmulatorUrl("http://127.0.0.1:9099")).toBe("http://127.0.0.1:9099");
    expect(resolveFirebaseAuthEmulatorUrl(" http://localhost:9099 ")).toBe("http://localhost:9099");
  });

  it("refuses remote, credentialed, HTTPS, and path-bearing values", () => {
    expect(resolveFirebaseAuthEmulatorUrl("https://localhost:9099")).toBeNull();
    expect(resolveFirebaseAuthEmulatorUrl("http://firebase.example.com:9099")).toBeNull();
    expect(resolveFirebaseAuthEmulatorUrl("http://user:secret@localhost:9099")).toBeNull();
    expect(resolveFirebaseAuthEmulatorUrl("http://localhost:9099/auth")).toBeNull();
  });

  it("leaves normal production configuration untouched", () => {
    expect(resolveFirebaseAuthEmulatorUrl(undefined)).toBeNull();
    expect(resolveFirebaseAuthEmulatorUrl("")).toBeNull();
    expect(resolveFirebaseAuthEmulatorUrl("not a URL")).toBeNull();
  });
});
