import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

import { resolveFirebaseAuthEmulatorUrl } from './auth-emulator';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dummy-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dummy-auth-domain',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'dummy-bucket',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

// Initialize Firebase gracefully
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const authEmulatorUrl = resolveFirebaseAuthEmulatorUrl(
  process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL,
);

if (authEmulatorUrl && !auth.emulatorConfig) {
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
}

export { app, auth };
