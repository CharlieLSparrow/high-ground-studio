import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { BROWSER_SIGN_OUT_TIMEOUT_MS, signOutBrowserSession } from "./sign-out";

jest.mock("firebase/auth", () => ({signOut: jest.fn()}));
jest.mock("./firebase", () => ({auth: {}}));

describe("browser-local sign out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ok: true});
    jest.mocked(signOut).mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it("waits for server success before clearing the local Firebase identity", async () => {
    let finish!: (value: Response) => void;
    jest.mocked(fetch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = signOutBrowserSession();
    expect(signOut).not.toHaveBeenCalled();
    finish({ok: true} as Response);
    await pending;
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({
      method: "DELETE", credentials: "same-origin", redirect: "error", signal: expect.any(AbortSignal),
    }));
    expect(signOut).toHaveBeenCalledWith(auth);
  });

  it("does not treat a server failure as successful sign out and allows retry", async () => {
    jest.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
    await expect(signOutBrowserSession()).rejects.toThrow("We couldn't sign you out");
    expect(signOut).not.toHaveBeenCalled();
    await signOutBrowserSession();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled request and clears its timer on retry", async () => {
    jest.useFakeTimers();
    jest.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const result = expect(signOutBrowserSession()).rejects.toThrow("Signing out took too long");
    await jest.advanceTimersByTimeAsync(BROWSER_SIGN_OUT_TIMEOUT_MS);
    await result;
    expect(signOut).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await signOutBrowserSession();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reports the distinct local completion failure without pretending the server session remains", async () => {
    jest.mocked(signOut).mockRejectedValueOnce(new Error("local storage unavailable"));
    await expect(signOutBrowserSession()).rejects.toThrow("Your session ended, but this browser couldn't finish signing out");
    await signOutBrowserSession();
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
