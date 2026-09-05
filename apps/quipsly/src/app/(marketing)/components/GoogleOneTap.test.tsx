import { act, render, waitFor } from "@testing-library/react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
} from "firebase/auth";

import { finishQuipslyFirebaseSignIn } from "@/lib/firebase/quipsly-session";
import { GoogleOneTap, shouldPromptGoogleOneTap } from "./GoogleOneTap";

let currentPathname = "/";
let currentSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => currentSearchParams,
}));

jest.mock("next/script", () => {
  const React = require("react");
  return function MockScript({
    id,
    src,
    onReady,
  }: {
    id: string;
    src: string;
    onReady?: () => void;
  }) {
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return <script id={id} src={src} />;
  };
});

jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: {
    credential: jest.fn(),
  },
  onAuthStateChanged: jest.fn(),
  signInWithCredential: jest.fn(),
}));

jest.mock("@/lib/firebase/firebase", () => ({
  auth: { currentUser: null, name: "one-tap-auth-test" },
}));

jest.mock("@/lib/firebase/quipsly-session", () => {
  const actual = jest.requireActual("@/lib/firebase/quipsly-session");
  return {
    ...actual,
    finishQuipslyFirebaseSignIn: jest.fn(),
  };
});

describe("GoogleOneTap", () => {
  const initialize = jest.fn();
  const prompt = jest.fn();
  const cancel = jest.fn();
  const renderButton = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    currentPathname = "/";
    currentSearchParams = new URLSearchParams();
    window.google = {
      accounts: {
        id: {
          initialize,
          prompt,
          cancel,
          renderButton,
        },
      },
    };
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, callback) => {
      callback(null);
      return jest.fn();
    });
  });

  afterEach(() => {
    delete window.google;
  });

  it("loads GIS on public product surfaces without prompting FedCM on loopback", async () => {
    render(<GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />);

    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      client_id: "public-web-client.apps.googleusercontent.com",
      auto_select: false,
      context: "signin",
      itp_support: true,
      use_fedcm_for_prompt: true,
      callback: expect.any(Function),
    }));
    expect(prompt).not.toHaveBeenCalled();
    expect(document.querySelector("#quipsly-google-identity-services"))
      .toHaveAttribute("src", "https://accounts.google.com/gsi/client");
  });

  it("keeps production One Tap eligible while suppressing only loopback prompts", () => {
    expect(shouldPromptGoogleOneTap("quipsly.com")).toBe(true);
    expect(shouldPromptGoogleOneTap("www.quipsly.com")).toBe(true);
    expect(shouldPromptGoogleOneTap("localhost")).toBe(false);
    expect(shouldPromptGoogleOneTap("127.0.0.1")).toBe(false);
    expect(shouldPromptGoogleOneTap("::1")).toBe(false);
  });

  it("exchanges the One Tap ID token through Firebase before creating a Quipsly session", async () => {
    const firebaseCredential = { providerId: "google.com" };
    const user = { emailVerified: true };
    (GoogleAuthProvider.credential as jest.Mock).mockReturnValue(firebaseCredential);
    (signInWithCredential as jest.Mock).mockResolvedValue({ user });
    currentPathname = "/login";
    currentSearchParams = new URLSearchParams(
      "callbackUrl=%2Fwork&inviteToken=qinv_one-tap-test",
    );

    render(<GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />);
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    const configuration = initialize.mock.calls[0][0];

    await act(async () => {
      await configuration.callback({
        credential: "redacted-google-id-token",
        select_by: "user",
      });
    });

    expect(GoogleAuthProvider.credential)
      .toHaveBeenCalledWith("redacted-google-id-token");
    expect(signInWithCredential)
      .toHaveBeenCalledWith(expect.anything(), firebaseCredential);
    expect(finishQuipslyFirebaseSignIn).toHaveBeenCalledWith({
      user,
      callbackUrl: "/work",
      inviteToken: "qinv_one-tap-test",
      sessionInviteToken: "",
    });
  });

  it("preserves a Session invitation through the standard Google handoff", async () => {
    const sessionInviteToken = `qsinv_${"a".repeat(32)}`;
    const firebaseCredential = { providerId: "google.com" };
    const user = { emailVerified: true };
    (GoogleAuthProvider.credential as jest.Mock).mockReturnValue(firebaseCredential);
    (signInWithCredential as jest.Mock).mockResolvedValue({ user });
    currentPathname = "/login";
    currentSearchParams = new URLSearchParams(
      `callbackUrl=${encodeURIComponent(`/sessions/join?token=${sessionInviteToken}`)}&sessionInviteToken=${sessionInviteToken}`,
    );

    render(<GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />);
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));

    await act(async () => {
      await initialize.mock.calls[0][0].callback({ credential: "google-id-token" });
    });

    expect(finishQuipslyFirebaseSignIn).toHaveBeenCalledWith({
      user,
      callbackUrl: `/sessions/join?token=${sessionInviteToken}`,
      inviteToken: "",
      sessionInviteToken,
    });
  });

  it("uses Google's current branded button renderer on the login page", async () => {
    currentPathname = "/login";
    const host = document.createElement("div");
    host.id = "quipsly-google-signin-button";
    Object.defineProperty(host, "getBoundingClientRect", {
      value: () => ({ width: 348 }),
    });
    document.body.appendChild(host);

    render(<GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />);

    await waitFor(() => expect(renderButton).toHaveBeenCalledWith(
      host,
      {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 348,
      },
    ));
    host.remove();
  });

  it("does not prompt an already authenticated Firebase browser", async () => {
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, callback) => {
      callback({ uid: "already-signed-in" });
      return jest.fn();
    });

    render(<GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />);

    await waitFor(() => expect(onAuthStateChanged).toHaveBeenCalled());
    expect(initialize).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not load account prompts on privacy and support routes", () => {
    currentPathname = "/privacy";
    const { container } = render(
      <GoogleOneTap clientId="public-web-client.apps.googleusercontent.com" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(initialize).not.toHaveBeenCalled();
  });
});
