import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";

// Set emulator environment variables
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";

let app: App;
let auth: Auth;
let db: Firestore;
let storage: Storage;

export function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    // For emulators, use a demo project (no credentials needed)
    app = initializeApp({
      projectId: "demo-test-project",
      storageBucket: "demo-test-project.appspot.com",
    });
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  return { app, auth, db, storage };
}

export function getAdminAuth(): Auth {
  if (!auth) {
    initializeFirebaseAdmin();
  }
  return auth;
}

export function getAdminFirestore(): Firestore {
  if (!db) {
    initializeFirebaseAdmin();
  }
  return db;
}

export function getAdminStorage(): Storage {
  if (!storage) {
    initializeFirebaseAdmin();
  }
  return storage;
}

export { auth, db, storage };
