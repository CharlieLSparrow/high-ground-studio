/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STUDIO_CUT_PROJECT_ID?: string;
  readonly VITE_STUDIO_CUT_BRANCH_ID?: string;
  readonly VITE_STUDIO_CUT_CREATED_BY?: string;
  readonly VITE_STUDIO_CUT_ALLOWED_EMAILS?: string;
  readonly VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
