import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { StudioCutFirebaseConfig } from "../studioCutConfig";

const STUDIO_CUT_FIREBASE_APP_NAME = "studio-cut";

export function getStudioCutFirebaseApp(
  firebaseConfig: StudioCutFirebaseConfig,
): FirebaseApp {
  return (
    getApps().find((candidate) => candidate.name === STUDIO_CUT_FIREBASE_APP_NAME) ??
    initializeApp(firebaseConfig, STUDIO_CUT_FIREBASE_APP_NAME)
  );
}
