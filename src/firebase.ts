import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { OperationType, FirestoreErrorInfo } from './types';

// Support Vercel / Client-side custom environments or fallback to local AI Studio project
const isSandbox = typeof window !== 'undefined' && (
  window.location.hostname.includes('run.app') || 
  window.location.hostname.includes('aistudio')
);

// Fallback to local AI Studio project in sandbox, otherwise use your custom project defaults
const configToUse = isSandbox ? firebaseConfig : {
  apiKey: "AIzaSyCZviKXmKcIUfqRdBV7cdWaH3zv-X_RnS4",
  authDomain: "cloud-based-smart-project.firebaseapp.com",
  projectId: "cloud-based-smart-project",
  storageBucket: "cloud-based-smart-project.firebasestorage.app",
  messagingSenderId: "876465746879",
  appId: "1:876465746879:web:b205418e0b8de5ebe1a70a",
  measurementId: "G-EMTMVYGP2R",
  firestoreDatabaseId: "(default)"
};

const resolvedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || configToUse.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || configToUse.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || configToUse.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || configToUse.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configToUse.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || configToUse.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || (configToUse as any).measurementId || '',
};

const databaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (configToUse as any).firestoreDatabaseId || (configToUse as any).databaseId || '(default)';

const app = initializeApp(resolvedConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, databaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Handles Firestore errors and signs diagnostic JSON objects for proper audit
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Test initial Firestore readiness as per critical instruction constraint
 */
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('Failed to get document'))) {
      console.warn("Please check your Firebase configuration or offline state:", error.message);
    }
  }
}

testConnection();
