import admin from "firebase-admin";
import {
  getFirebaseCredential,
  FIREBASE_STORAGE_BUCKET,
} from "@/config";

export function getFirebaseAdmin(): typeof admin {
  if (admin.apps.length === 0) {
    const credential = getFirebaseCredential();
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      storageBucket: FIREBASE_STORAGE_BUCKET,
    });
  }
  return admin;
}
