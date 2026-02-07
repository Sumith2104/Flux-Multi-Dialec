import "server-only";
import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// You can either use a service account JSON file or environment variables.
// For App Hosting/Cloud Run, automatic credentials (applicationDefault) are often preferred,
// but for local dev with robust permissions, a service account is common.
// Here we assume standard env vars or Application Default Credentials.

const serviceAccount: ServiceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

let app;

if (getApps().length === 0) {
    if (process.env.FIREBASE_PRIVATE_KEY) {
        app = initializeApp({
            credential: cert(serviceAccount)
        });
    } else {
        // Fallback to Application Default Credentials (good for App Hosting if configured)
        app = initializeApp();
    }
} else {
    app = getApp();
}

const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

export { adminAuth, adminDb };
