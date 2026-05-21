import path from "path";
import fs from "fs";
import { google } from "googleapis";
import type admin from "firebase-admin";

export const FIREBASE_SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service.json";
export const FIREBASE_SERVICE_ACCOUNT_JSON =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
export const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "ivory-rose.firebasestorage.app";

export const GOOGLE_SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "./google-service.json";
export const GOOGLE_SERVICE_ACCOUNT_JSON =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

export const DRIVE_FOLDER_ID =
  process.env.DRIVE_FOLDER_ID || "1e2eMljiNOqCD8ocnnNaQ_o5TtwoKmq3B";
export const TAGS_EXCEL_FILENAME =
  process.env.TAGS_EXCEL_FILENAME || "style_tags";
export const RATE_SHEET_NAME = process.env.RATE_SHEET_NAME || "Sheet1";
export const RATE_ENCRYPTION_KEY = process.env.RATE_ENCRYPTION_KEY;

export const DEFAULT_PRODUCTS_DRIVE_FOLDER_ID =
  process.env.DRIVE_FOLDER_ID || "1J3PtI1ijQJrp_W2xhp8rakL7oeXh3cC7";

export const QUOTE_GENERATOR_URL =
  process.env.QUOTE_GENERATOR_URL ||
  "https://us-central1-ivory-rose.cloudfunctions.net/generateQuoteInternal";
export const QUOTE_INTERNAL_SECRET = process.env.QUOTE_INTERNAL_SECRET || "";

export function getFirebaseCredential(): admin.ServiceAccount {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
  }
  const resolved = path.resolve(process.cwd(), FIREBASE_SERVICE_ACCOUNT_PATH);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Firebase service account file not found: ${resolved}`);
  }
  return JSON.parse(
    fs.readFileSync(resolved, "utf-8")
  ) as admin.ServiceAccount;
}

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export function getGoogleAuth(scopes: string[] = DRIVE_SCOPES) {
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }
  const resolved = path.resolve(process.cwd(), GOOGLE_SERVICE_ACCOUNT_PATH);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Google service account file not found: ${resolved}`);
  }
  return new google.auth.GoogleAuth({ keyFile: resolved, scopes });
}

export function getGoogleAuthWithSheets() {
  return getGoogleAuth([...DRIVE_SCOPES, ...SHEETS_SCOPES]);
}
