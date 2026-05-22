import { useCallback, useEffect, useState } from "react";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  checkStudioCutEmailAccess,
  getAllowedAccessDescription,
  isStudioCutAccessConfigured,
  type StudioCutAuthAccessConfig,
  type StudioCutAuthAccessResult,
} from "../authAccess";
import { getStudioCutFirebaseApp } from "../firebase/studioCutFirebase";
import type { StudioCutRuntimeConfig } from "../studioCutConfig";

export type StudioCutAuthMode =
  | "loading"
  | "local_dev"
  | "auth_unconfigured"
  | "signed_out"
  | "authorized"
  | "not_authorized"
  | "auth_error";

export type StudioCutAuthStatus = {
  mode: StudioCutAuthMode;
  label: string;
  detail: string;
  isEditorAllowed: boolean;
  isFirebaseAuthEnabled: boolean;
  userEmail?: string;
};

export function useStudioCutAuth(config: StudioCutRuntimeConfig) {
  const [status, setStatus] = useState<StudioCutAuthStatus>(() =>
    getInitialAuthStatus(config),
  );

  useEffect(() => {
    if (!config.firebaseConfig) {
      setStatus(getMissingFirebaseStatus(config));
      return;
    }

    if (!isStudioCutAccessConfigured(config)) {
      setStatus(createAllowedListMissingStatus());
      return;
    }

    setStatus(createLoadingStatus());
    const app = getStudioCutFirebaseApp(config.firebaseConfig);
    const auth = getAuth(app);

    return onAuthStateChanged(
      auth,
      (user) => {
        setStatus(getSignedInStatus(user, config));
      },
      (error) => {
        setStatus(createAuthErrorStatus(error));
      },
    );
  }, [config]);

  const signIn = useCallback(async () => {
    if (!config.firebaseConfig) {
      setStatus(getMissingFirebaseStatus(config));
      return;
    }

    if (!isStudioCutAccessConfigured(config)) {
      setStatus(createAllowedListMissingStatus());
      return;
    }

    try {
      const app = getStudioCutFirebaseApp(config.firebaseConfig);
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      setStatus(createAuthErrorStatus(error));
    }
  }, [config]);

  const signOutUser = useCallback(async () => {
    if (!config.firebaseConfig) {
      return;
    }

    try {
      const app = getStudioCutFirebaseApp(config.firebaseConfig);
      const auth = getAuth(app);
      await signOut(auth);
    } catch (error) {
      setStatus(createAuthErrorStatus(error));
    }
  }, [config]);

  return { status, signIn, signOut: signOutUser };
}

function getInitialAuthStatus(config: StudioCutRuntimeConfig): StudioCutAuthStatus {
  if (!config.firebaseConfig) {
    return getMissingFirebaseStatus(config);
  }

  if (!isStudioCutAccessConfigured(config)) {
    return createAllowedListMissingStatus();
  }

  return createLoadingStatus();
}

function getMissingFirebaseStatus(
  config: StudioCutRuntimeConfig,
): StudioCutAuthStatus {
  if (config.isDev) {
    return {
      mode: "local_dev",
      label: "Local dev mode",
      detail:
        "Auth is disabled because Firebase env vars are missing. This mode is for local development only.",
      isEditorAllowed: true,
      isFirebaseAuthEnabled: false,
    };
  }

  return {
    mode: "auth_unconfigured",
    label: "Auth config required",
    detail:
      "This production build is missing Firebase Auth env vars, so the editor is hidden.",
    isEditorAllowed: false,
    isFirebaseAuthEnabled: false,
  };
}

function createAllowedListMissingStatus(): StudioCutAuthStatus {
  return {
    mode: "auth_unconfigured",
    label: "Allowed access rule required",
    detail:
      "Firebase Auth is configured, but no allowed email or email-domain rule was provided.",
    isEditorAllowed: false,
    isFirebaseAuthEnabled: true,
  };
}

function createLoadingStatus(): StudioCutAuthStatus {
  return {
    mode: "loading",
    label: "Checking sign-in",
    detail: "Verifying the current Google sign-in session.",
    isEditorAllowed: false,
    isFirebaseAuthEnabled: true,
  };
}

function getSignedInStatus(
  user: User | null,
  accessConfig: StudioCutAuthAccessConfig,
): StudioCutAuthStatus {
  const accessDescription = getAllowedAccessDescription(accessConfig);

  if (!user) {
    return {
      mode: "signed_out",
      label: "Sign-in required",
      detail: `Sign in with ${accessDescription} to open Studio Cut.`,
      isEditorAllowed: false,
      isFirebaseAuthEnabled: true,
    };
  }

  const email = user.email?.trim().toLowerCase();
  const accessResult = checkStudioCutEmailAccess(email, accessConfig);

  if (!accessResult.allowed) {
    return {
      mode: "not_authorized",
      label: "Not authorized",
      detail: getNotAuthorizedDetail(accessConfig, accessResult),
      isEditorAllowed: false,
      isFirebaseAuthEnabled: true,
      ...(email ? { userEmail: email } : {}),
    };
  }

  return {
    mode: "authorized",
    label: "Signed in",
    detail: "Google sign-in matched a Studio Cut access rule.",
    isEditorAllowed: true,
    isFirebaseAuthEnabled: true,
    userEmail: email,
  };
}

function getNotAuthorizedDetail(
  accessConfig: StudioCutAuthAccessConfig,
  accessResult: StudioCutAuthAccessResult,
) {
  if (accessResult.reason === "missing_email") {
    return "This Google account did not provide an email address Studio Cut can verify.";
  }

  return `Use a Google account with ${getAllowedAccessDescription(accessConfig)}.`;
}

function createAuthErrorStatus(error: unknown): StudioCutAuthStatus {
  const detail = error instanceof Error ? error.message : String(error);

  return {
    mode: "auth_error",
    label: "Auth error",
    detail,
    isEditorAllowed: false,
    isFirebaseAuthEnabled: true,
  };
}
