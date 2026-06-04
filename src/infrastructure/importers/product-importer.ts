import admin from "firebase-admin";
import { JWT } from "google-auth-library";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { Readable } from "stream";
import { execFileSync } from "child_process";
import ExcelJS from "exceljs";
import { generateProductQuote } from "@/infrastructure/services/quote-generator";

// -------------------------
// CONFIGURATION
// -------------------------
const FIREBASE_SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service.json";
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const GOOGLE_SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "./google-service.json";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "ivory-rose.firebasestorage.app";
const PRODUCT_IMPORT_CONCURRENCY = parseBoundedInteger(
  process.env.PRODUCT_IMPORT_CONCURRENCY,
  4,
  1,
  12
);
const PRODUCT_IMPORT_IMAGE_CONCURRENCY = parseBoundedInteger(
  process.env.PRODUCT_IMPORT_IMAGE_CONCURRENCY,
  6,
  1,
  16
);

/**
 * Optional: Workspace user email for domain-wide delegation. Lets Drive create/update files in My Drive
 * shared folders (service accounts have no personal storage quota).
 * Set in Admin Console: Security > API controls > Domain-wide delegation for this SA client id, scope https://www.googleapis.com/auth/drive
 */
const GOOGLE_DRIVE_IMPERSONATE_USER = process.env.GOOGLE_DRIVE_IMPERSONATE_USER?.trim() || "";

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex++;
        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
}

function getFirebaseCredential(): admin.ServiceAccount {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
  }
  const resolved = path.resolve(process.cwd(), FIREBASE_SERVICE_ACCOUNT_PATH);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Firebase service account file not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf-8")) as admin.ServiceAccount;
}

type ImportDriveAuth = InstanceType<typeof google.auth.GoogleAuth> | JWT;

function jwtFromServiceAccount(
  clientEmail: string,
  privateKey: string,
  scopes: string[]
): JWT {
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject: GOOGLE_DRIVE_IMPERSONATE_USER || undefined,
  });
}

/** Full Drive scope so the service account can update/create files in folders shared with it (import write-back). */
function getGoogleAuth(): ImportDriveAuth {
  const scopes = ["https://www.googleapis.com/auth/drive"];
  if (GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON) as {
      client_email?: string;
      private_key?: string;
    };
    if (GOOGLE_DRIVE_IMPERSONATE_USER && credentials.client_email && credentials.private_key) {
      return jwtFromServiceAccount(credentials.client_email, credentials.private_key, scopes);
    }
    return new google.auth.GoogleAuth({ credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON), scopes });
  }
  const resolved = path.resolve(process.cwd(), GOOGLE_SERVICE_ACCOUNT_PATH);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Google service account file not found: ${resolved}`);
  }
  if (GOOGLE_DRIVE_IMPERSONATE_USER) {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as {
      client_email?: string;
      private_key?: string;
    };
    if (!raw.client_email || !raw.private_key) {
      throw new Error("Service account JSON must include client_email and private_key for Drive impersonation");
    }
    return jwtFromServiceAccount(raw.client_email, raw.private_key, scopes);
  }
  return new google.auth.GoogleAuth({ keyFile: resolved, scopes });
}

function getFirebaseAdmin() {
  if (admin.apps.length === 0) {
    const credential = getFirebaseCredential();
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      storageBucket: FIREBASE_STORAGE_BUCKET,
    });
  }
  return admin;
}

// -------------------------
// HELPERS - Path & filename
// -------------------------
function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "unnamed";
  return fileName.replace(/[<>:"|?*\x00-\x1f/\\]/g, "").trim() || "unnamed";
}

function validateAndSanitizePath(filePath: string, baseDir: string): string {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path: path must be a non-empty string");
  }
  const resolvedPath = path.resolve(baseDir, filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  const sanitized = path.basename(filePath).replace(/[<>:"|?*\x00-\x1f]/g, "");
  if (!sanitized || sanitized !== path.basename(filePath)) {
    throw new Error(`Invalid filename: ${filePath} contains dangerous characters`);
  }
  return resolvedPath;
}

// -------------------------
// HELPERS - Product ID & style
// -------------------------
function extractProductId(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "";
  try {
    let cleaned = path.basename(fileName);
    cleaned = cleaned.replace(/\.(xlsx|xls|png|jpg|jpeg|pdf)$/i, "");
    cleaned = cleaned.replace(/\s*\(\d+\)\s*$/g, "");
    const lowerCleaned = cleaned.toLowerCase();
    if (lowerCleaned.includes("copy of") || lowerCleaned.startsWith("copyof")) {
      cleaned = cleaned.replace(/\bcopy\s+of\b/gi, "").replace(/\bcopyof\b/gi, "");
    }
    cleaned = cleaned.replace(/\s*-\s*cad\b/gi, "").replace(/\bcad\b/gi, "");
    cleaned = cleaned.replace(/\s*-\s*details\b/gi, "").replace(/\bdetails\b/gi, "");
    cleaned = cleaned.replace(/\s*-\s*names\b/gi, "").replace(/\bnames\b/gi, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim().replace(/^[\s-]+|[\s-]+$/g, "");
    const stylePattern = /([A-Z]{2})\d{4}([a-zA-Z])?(-([A-Z]+)([a-zA-Z])?)?/i;
    const match = cleaned.match(stylePattern);
    if (match) {
      const prefix = match[1].toUpperCase();
      const digitsMatch = match[0].match(/\d{4}/);
      const digits = digitsMatch ? digitsMatch[0] : "";
      const baseVariant = match[2] || "";
      const suffixCode = match[4] ? match[4].toUpperCase() : "";
      const suffixVariant = match[5] || "";
      let productId = prefix + digits + baseVariant;
      if (suffixCode) productId += "-" + suffixCode + suffixVariant;
      return productId;
    }
    if (!cleaned) return path.parse(fileName).name || fileName;
    return cleaned;
  } catch {
    return path.parse(fileName).name || fileName;
  }
}

const CATEGORY_SUFFIX: Record<string, string> = {
  TI: "Tikka", E: "Earrings", R: "Rings", BR: "Bracelet", PP: "Pendant", PS: "Pendant",
  XC: "Bangles", XK: "Bangles", XR: "Bangles", XV: "Bangles", RB: "Rings", RG: "Rings",
  RR: "Rings", RS: "Rings", BT: "Buttons", CU: "Cufflinks", ND: "Necklaces", NN: "Necklaces",
  NS: "Necklaces", EB: "Earrings", ED: "Earrings", ES: "Earrings", ET: "Earrings",
  EJ: "Earrings", NC: "Chokers", BY: "Brooch", BA: "Bajuband",
};

const CATEGORY_PREFIX: Record<string, string[]> = {
  Bracelet: ["BD", "BR", "BS"], Pendant: ["PP", "PS"], Bangles: ["XC", "XK", "XR", "XV"],
  Rings: ["RB", "RG", "RR", "RS"], Buttons: ["BT"], Cufflinks: ["CU"],
  Necklaces: ["ND", "NN", "NS"], Earrings: ["E", "EB", "ED", "ES", "ET", "EJ"],
  Chokers: ["NC"], Tikka: ["TI"], Brooch: ["BY"], Bajuband: ["BA"],
};

interface ParsedStyle {
  prefix: string | null;
  baseVariant: string | null;
  suffixCode: string | null;
  suffixVariant: string | null;
}

function parseStyleNumber(styleNumber: string): ParsedStyle {
  if (!styleNumber || typeof styleNumber !== "string") {
    return { prefix: null, baseVariant: null, suffixCode: null, suffixVariant: null };
  }
  const KNOWN_SUFFIX_CODES = new Set([
    "E", "R", "TI", "BR", "PP", "PS", "XC", "XK", "XR", "XV", "RB", "RG", "RR", "RS",
    "BT", "CU", "ND", "NN", "NS", "EB", "ED", "ES", "ET", "EJ", "NC", "BY", "BA",
  ]);
  const pattern = /^([A-Z]{2})\d{4}([a-zA-Z])?(-([A-Z]+)([a-zA-Z])?)?$/i;
  const match = styleNumber.match(pattern);
  if (!match) {
    const prefix = styleNumber.substring(0, 2).toUpperCase();
    return {
      prefix: prefix.length === 2 ? prefix : null,
      baseVariant: null,
      suffixCode: null,
      suffixVariant: null,
    };
  }
  let suffixCode = match[4] ? match[4].toUpperCase() : null;
  let suffixVariant = match[5] || null;
  if (suffixCode && !suffixVariant && suffixCode.length > 1 && !KNOWN_SUFFIX_CODES.has(suffixCode)) {
    const potentialCode = suffixCode.slice(0, -1);
    const potentialVariant = suffixCode.slice(-1);
    if (KNOWN_SUFFIX_CODES.has(potentialCode)) {
      suffixCode = potentialCode;
      suffixVariant = potentialVariant.toLowerCase();
    }
  }
  if (suffixVariant) suffixVariant = suffixVariant.toLowerCase();
  return {
    prefix: match[1].toUpperCase(),
    baseVariant: match[2] || null,
    suffixCode,
    suffixVariant,
  };
}

function detectCategory(productId: string, parsedStyle: ParsedStyle | null): string {
  if (parsedStyle?.suffixCode && CATEGORY_SUFFIX[parsedStyle.suffixCode]) {
    return CATEGORY_SUFFIX[parsedStyle.suffixCode];
  }
  const prefix = (parsedStyle?.prefix ?? productId.substring(0, 2)).toUpperCase();
  for (const [category, prefixes] of Object.entries(CATEGORY_PREFIX)) {
    if (prefixes.includes(prefix)) return category;
  }
  return "Others";
}

// -------------------------
// HELPERS - Stone summary & materials
// -------------------------
const STONE_TYPE_MAP: Record<string, string> = {
  RUB: "Ruby", DIA: "Diamond", EME: "Emerald", SAP: "Sapphire", PRL: "Pearl", COR: "Coral",
  AM: "Amethyst", CT: "Citrine", TO: "Topaz", PE: "Peridot", GA: "Garnet", AQ: "Aquamarine",
  TAN: "Tanzanite", OP: "Opal", TOU: "Tourmaline", ZO: "Zircon", SP: "Spinel", MO: "Morganite",
  KU: "Kunzite", TS: "Tsavorite", AME: "Amethyst", CIT: "Citrine", CORAL: "Coral", CUZ: "Cubic Zirconia",
  DYEL: "Yellow Diamond", ENM: "Enamel", GTO: "Golden Topaz", GAR: "Garnet", LYEL: "Yellow Sapphire",
  MOP: "Mother of Pearl", OLD: "Old Mine Diamond", ONY: "Onyx", PER: "Peridot", PINK: "Pink Sapphire",
  PREC: "Precious Stone", PTO: "Pink Topaz", ROS: "Rose Quartz", RUE: "Ruby", SBT: "Sapphire",
  SEMI: "Semi-precious Stone", TUR: "Turquoise", WSA: "White Sapphire", WTO: "White Topaz",
  YSA: "Yellow Sapphire", YELL: "Yellow Sapphire",
};

interface StoneRow {
  typ: string;
  shp: string;
  qly: string;
  lot: string;
  band: string;
  mmSize: string;
  avWt: number;
  qty: number;
  twt: number;
  location: string;
  remarks: string;
}

function extractMaterials(stoneSummary: StoneRow[]): string[] {
  const materialsSet = new Set<string>();
  for (const stone of stoneSummary) {
    if (stone.typ) {
      const typUpper = String(stone.typ).trim().toUpperCase();
      if (STONE_TYPE_MAP[typUpper]) materialsSet.add(STONE_TYPE_MAP[typUpper]);
    }
  }
  return Array.from(materialsSet).sort();
}

function generateTags(category: string, materials: string[], relationType: string): string[] {
  const tags = new Set<string>();
  if (category) tags.add(category.toLowerCase());
  if (materials?.length) {
    materials.forEach((m) => m && tags.add(m.toLowerCase()));
  }
  if (relationType === "MATCHING") tags.add("matching");
  return Array.from(tags).sort();
}

function calculateStoneSummary(rows: StoneRow[]): { typ: string; qty: number; twt: number }[] {
  const summaryMap = new Map<string, { typ: string; qty: number; twt: number }>();
  for (const row of rows) {
    const typ = String(row.typ || "").trim();
    if (!typ) continue;
    const qty = Number(row.qty) || 0;
    const twt = Number(row.twt) || 0;
    if (summaryMap.has(typ)) {
      const existing = summaryMap.get(typ)!;
      existing.qty += qty;
      existing.twt += twt;
    } else {
      summaryMap.set(typ, { typ, qty, twt });
    }
  }
  return Array.from(summaryMap.values());
}

// -------------------------
// Excel - blank row & read
// -------------------------
function isBlankRow(row: (string | number)[]): boolean {
  if (!row || row.length < 11) return true;
  const [typ, shp, , , , , , qty, twt] = row;
  const typStr = String(typ ?? "").trim();
  const shpStr = String(shp ?? "").trim();
  const qtyNum = Number(qty) || 0;
  const twtNum = Number(twt) || 0;
  const hasTypOrShp = typStr !== "" || shpStr !== "";
  const hasQuantity = qtyNum > 0 || twtNum > 0;
  return !(hasTypOrShp && hasQuantity);
}

function pickDetailWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const targetNames = ["detail", "details"];
  for (const name of targetNames) {
    const ws = workbook.getWorksheet(name);
    if (ws) return ws;
  }
  const found = workbook.worksheets.find((ws) =>
    targetNames.includes((ws.name || "").trim().toLowerCase())
  );
  if (found) return found;
  return workbook.worksheets[0];
}

function normalizeWorksheetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function compactWorksheetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickReturnedUnusedGoodsWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const targetNames = new Set([
    "returned/unused goods",
    "returned unused goods",
    "returned-unused goods",
    "returnedunused goods",
    "returnedunusedgoods",
  ]);
  const targetCompactName = "returnedunusedgoods";
  return (
    workbook.worksheets.find((ws) =>
      targetNames.has(normalizeWorksheetName(ws.name || "")) ||
      compactWorksheetName(ws.name || "") === targetCompactName
    ) ?? null
  );
}

function normalizeCellValue(cellValue: ExcelJS.CellValue): string | number {
  const resolved =
    cellValue == null
      ? ""
      : typeof cellValue === "object" && "result" in cellValue
        ? ((cellValue as { result?: unknown }).result ?? "")
        : cellValue;
  if (typeof resolved === "number") return resolved;
  if (resolved == null || resolved === "") return "";
  const asString = String(resolved).trim();
  const numericValue = Number(asString);
  return !Number.isNaN(numericValue) && asString !== "" ? numericValue : asString;
}

function parseStoneRowsFromWorksheet(worksheet: ExcelJS.Worksheet): StoneRow[] {
  const rows: StoneRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;
    const rowData: (string | number)[] = [];
    for (let colNum = 2; colNum <= 12; colNum++) {
      rowData.push(normalizeCellValue(row.getCell(colNum).value));
    }
    if (!isBlankRow(rowData)) {
      const [typ, shp, qly, lot, band, mmSize, avWt, qty, twt, location, remarks] = rowData;
      const avWtNum = typeof avWt === "number" ? avWt : (avWt ? parseFloat(String(avWt).replace(/,/g, "")) : 0) || 0;
      const qtyNum = typeof qty === "number" ? qty : (qty ? parseFloat(String(qty).replace(/,/g, "")) : 0) || 0;
      const twtNum = typeof twt === "number" ? twt : (twt ? parseFloat(String(twt).replace(/,/g, "")) : 0) || 0;
      rows.push({
        typ: String(typ ?? "").trim(),
        shp: String(shp ?? "").trim(),
        qly: String(qly ?? "").trim(),
        lot: String(lot ?? "").trim(),
        band: String(band ?? "").trim(),
        mmSize: String(mmSize ?? "").trim(),
        avWt: Number.isNaN(avWtNum) ? 0 : avWtNum,
        qty: Number.isNaN(qtyNum) ? 0 : qtyNum,
        twt: Number.isNaN(twtNum) ? 0 : twtNum,
        location: String(location ?? "").trim(),
        remarks: String(remarks ?? "").trim(),
      });
    }
  });
  return rows;
}

type ReturnedUnusedGoodsRow = StoneRow | Record<string, string | number>;

function normalizeHeaderName(value: string | number, fallback: string): string {
  const header = String(value ?? "").trim();
  if (!header) return fallback;
  return header
    .replace(/\s+/g, " ")
    .replace(/[./()[\]{}#]+/g, " ")
    .trim()
    .replace(/\s+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase()) || fallback;
}

function isReturnedUnusedGenericRowBlank(row: Record<string, string | number>): boolean {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

function parseReturnedUnusedGoodsRows(worksheet: ExcelJS.Worksheet): ReturnedUnusedGoodsRow[] {
  const detailShapeRows = parseStoneRowsFromWorksheet(worksheet);
  if (detailShapeRows.length > 0) return detailShapeRows;

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  const columnCount = Math.max(headerRow.cellCount, worksheet.actualColumnCount);
  for (let colNum = 1; colNum <= columnCount; colNum++) {
    headers.push(normalizeHeaderName(normalizeCellValue(headerRow.getCell(colNum).value), `column${colNum}`));
  }

  const rows: ReturnedUnusedGoodsRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;
    const rowData: Record<string, string | number> = {};
    for (let colNum = 1; colNum <= columnCount; colNum++) {
      rowData[headers[colNum - 1] || `column${colNum}`] = normalizeCellValue(row.getCell(colNum).value);
    }
    if (!isReturnedUnusedGenericRowBlank(rowData)) rows.push(rowData);
  });
  return rows;
}

async function readExcelFile(filePath: string): Promise<{ rows: StoneRow[]; assumingNetWt: number | string | null }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = pickDetailWorksheet(workbook);
  if (!worksheet) throw new Error("No worksheet found in Excel file");

  let assumingNetWt: number | string | null = null;
  try {
    const firstDataRow = worksheet.getRow(2);
    if (firstDataRow) {
      const cell = firstDataRow.getCell(1);
      let cellValue = cell.value;
      if (cellValue != null && typeof cellValue === "object" && "result" in cellValue) {
        cellValue = (cellValue as { result?: number }).result;
      }
      if (typeof cellValue === "number") assumingNetWt = cellValue;
      else if (cellValue != null && String(cellValue).trim() !== "") {
        const n = Number(cellValue);
        assumingNetWt = !Number.isNaN(n) ? n : String(cellValue).trim();
      }
    }
  } catch {
    // ignore
  }

  return { rows: parseStoneRowsFromWorksheet(worksheet), assumingNetWt };
}

type ReturnedUnusedGoodsData = {
  rows: ReturnedUnusedGoodsRow[];
  sourceSheetName: string | null;
  sheetFound: boolean;
  availableSheetNames: string[];
};

async function readReturnedUnusedGoodsFile(filePath: string): Promise<ReturnedUnusedGoodsData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const availableSheetNames = workbook.worksheets.map((ws) => ws.name);
  const worksheet = pickReturnedUnusedGoodsWorksheet(workbook);
  if (!worksheet) {
    return {
      rows: [],
      sourceSheetName: null,
      sheetFound: false,
      availableSheetNames,
    };
  }
  return {
    rows: parseReturnedUnusedGoodsRows(worksheet),
    sourceSheetName: worksheet.name,
    sheetFound: true,
    availableSheetNames,
  };
}

// -------------------------
// Compare & save
// -------------------------
/** Deep-normalize values so Firestore reads compare reliably to freshly built import payloads. */
function toComparableValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toMillis();
  }
  if (typeof value === "object") {
    const maybeTs = value as { seconds?: number; nanoseconds?: number; toDate?: () => Date };
    if (typeof maybeTs.toDate === "function") {
      return maybeTs.toDate().getTime();
    }
    if (typeof maybeTs.seconds === "number") {
      const ns = typeof maybeTs.nanoseconds === "number" ? maybeTs.nanoseconds : 0;
      return maybeTs.seconds * 1000 + Math.floor(ns / 1e6);
    }
    if (Array.isArray(value)) {
      return value.map(toComparableValue);
    }
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = toComparableValue(obj[k]);
    }
    return out;
  }
  return value;
}

function compareProductData(
  newData: Record<string, unknown>,
  existingData: Record<string, unknown>
): boolean {
  const ignoreFields = ["createdAt", "updatedAt"];
  const newClean: Record<string, unknown> = {};
  const existingClean: Record<string, unknown> = {};
  for (const key of Object.keys(newData)) {
    if (ignoreFields.includes(key)) continue;
    newClean[key] = newData[key];
    existingClean[key] = existingData[key];
  }
  ignoreFields.forEach((f) => {
    delete (newClean as Record<string, unknown>)[f];
    delete (existingClean as Record<string, unknown>)[f];
  });
  const normalize = (obj: unknown): string => JSON.stringify(toComparableValue(obj));
  return normalize(newClean) === normalize(existingClean);
}

function valuesAreEqual(newValue: unknown, existingValue: unknown): boolean {
  return (
    JSON.stringify(toComparableValue(newValue)) ===
    JSON.stringify(toComparableValue(existingValue))
  );
}

function changedProductFields(
  newData: Record<string, unknown>,
  existingData: Record<string, unknown>
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(newData)) {
    if (key === "createdAt" || key === "updatedAt") continue;
    if (!valuesAreEqual(newData[key], existingData[key])) {
      changed[key] = newData[key];
    }
  }
  return changed;
}

// -------------------------
// Drive list & download
// -------------------------
type DriveFile = { id: string; name: string; mimeType?: string; pathParts?: string[] };
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const HTML_MIMES = new Set(["text/html", "application/xhtml+xml"]);

async function listDriveFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken: string | null = null;
  do {
    const params: { q: string; fields: string; orderBy: string; pageSize: number; pageToken?: string } = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      orderBy: "name",
      pageSize: 1000,
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await drive.files.list({
      ...params,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (response.data.files?.length) {
      allFiles.push(...(response.data.files as DriveFile[]));
    }
    pageToken = response.data.nextPageToken ?? null;
  } while (pageToken);
  return allFiles;
}

async function getDriveFileMetadata(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<DriveFile> {
  const response = await drive.files.get({
    fileId,
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });
  return response.data as DriveFile;
}

async function listDriveFilesRecursive(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  pathParts: string[] = []
): Promise<DriveFile[]> {
  const directFiles = await listDriveFiles(drive, folderId);
  const allFiles: DriveFile[] = directFiles.map((file) => ({ ...file, pathParts }));
  const nestedFiles = await mapConcurrent(
    directFiles.filter((file) => file.mimeType === DRIVE_FOLDER_MIME),
    3,
    async (folder) => listDriveFilesRecursive(drive, folder.id, [...pathParts, folder.name])
  );
  for (const nested of nestedFiles) allFiles.push(...nested);
  return allFiles;
}

async function downloadFileToPath(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  destPath: string,
  mimeType: string | undefined
): Promise<void> {
  let response: { data: unknown };
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    response = (await drive.files.export(
      {
        fileId,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    )) as { data: unknown };
  } else {
    response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
  }
  const buffer = Buffer.from(response.data as ArrayBuffer);
  fs.writeFileSync(destPath, buffer);
}

async function downloadFileToBuffer(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  mimeType: string | undefined
): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `ivory-import-buffer-${fileId}-${Date.now()}`);
  try {
    await downloadFileToPath(drive, fileId, tmpPath, mimeType);
    return fs.readFileSync(tmpPath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function downloadGoogleDocHtml(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<string> {
  const metadata = await getDriveFileMetadata(drive, fileId);
  if (metadata.mimeType === "application/vnd.google-apps.document") {
    const response = (await drive.files.export(
      { fileId, mimeType: "text/html" },
      { responseType: "arraybuffer" }
    )) as { data: unknown };
    return Buffer.from(response.data as ArrayBuffer).toString("utf8");
  }
  const buffer = await downloadFileToBuffer(drive, fileId, metadata.mimeType);
  return buffer.toString("utf8");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function readHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    const cellRegex = /<t[dh]\b[\s\S]*?<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml))) {
      cells.push(stripHtml(cellMatch[0]));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function compactHtmlLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeClientCode(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:.-]+|[\s:.-]+$/g, "")
    .trim();
  if (!normalized) return null;
  return normalized;
}

function findClientCodeFromFileName(filePath: string): string | null {
  const baseName = path.parse(path.basename(filePath)).name;
  if (!baseName) return null;
  const parts = baseName
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 1].replace(/\s*\(\d+\)\s*$/g, "").trim();
  return normalizeClientCode(candidate);
}

function findClientCodeFromHtml(html: string): string | null {
  const rows = readHtmlTableRows(html);
  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = row[index] ?? "";
      const compact = compactHtmlLabel(cell);
      if (compact === "clientcode" || compact === "clientcodeno" || compact === "client") {
        const nextValue = normalizeClientCode(row[index + 1]);
        if (nextValue) return nextValue;
      }
      const inlineMatch = cell.match(/client\s*(?:code|codeno|no)?\s*[:.-]\s*(.+)$/i);
      const inlineValue = normalizeClientCode(inlineMatch?.[1]);
      if (inlineValue) return inlineValue;
    }
  }

  const text = stripHtml(html);
  const inlineMatch = text.match(/client\s*(?:code|codeno|no)?\s*[:.-]\s*([A-Za-z0-9_-]+)/i);
  return normalizeClientCode(inlineMatch?.[1]);
}

function currentQuoteDateStamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const yearTwoDigits = year.slice(-2);
  return `${day}-${month}-${yearTwoDigits}`;
}

function buildQuoteFileNames(productId: string, clientCode: string | null): string[] {
  const safeProductId = sanitizeFileName(productId);
  const safeClientCode = sanitizeFileName(clientCode || "Client");
  const dateStamp = currentQuoteDateStamp();
  return [
    `Quo-${safeProductId}-${safeClientCode}-${dateStamp}.xlsx`,
    `${safeProductId}-${safeClientCode}-${dateStamp}.xlsx`,
  ];
}

function readMetaItempropTagsFromHtml(html: string): string[] {
  const tags: string[] = [];
  const metaRegex = /<meta\b[^>]*\bitemprop=["']tag["'][^>]*>/gi;
  const contentRegex = /\bcontent=["']([^"']+)["']/i;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRegex.exec(html))) {
    const contentMatch = metaMatch[0].match(contentRegex);
    const tag = contentMatch ? stripHtml(contentMatch[1]) : "";
    if (tag) tags.push(tag);
  }
  return tags;
}

function readMetaTitleFromHtml(html: string): string {
  const metaTitle = html.match(/<meta\b[^>]*\bitemprop=["']title["'][^>]*>/i);
  if (metaTitle) {
    const contentMatch = metaTitle[0].match(/\bcontent=["']([^"']+)["']/i);
    if (contentMatch) return stripHtml(contentMatch[1]);
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? stripHtml(titleMatch[1]) : "";
}

function readHtmlAnchors(html: string): { href: string; text: string }[] {
  const anchors: { href: string; text: string }[] = [];
  const anchorRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    anchors.push({
      href: decodeHtmlEntities(match[1]),
      text: stripHtml(match[2]),
    });
  }
  return anchors;
}

function findCadDetailsSpreadsheetIdFromHtml(html: string, productId: string): string | null {
  const anchors = readHtmlAnchors(html);
  const normalizedProductId = productId.toLowerCase();
  const cadAnchor = anchors.find((anchor) => {
    const text = anchor.text.toLowerCase();
    return (
      anchor.href.includes("docs.google.com/spreadsheets") &&
      text.includes(normalizedProductId) &&
      text.includes("cad") &&
      text.includes("details")
    );
  }) ?? anchors.find((anchor) => {
    const text = anchor.text.toLowerCase();
    return (
      anchor.href.includes("docs.google.com/spreadsheets") &&
      text.includes("cad") &&
      text.includes("details")
    );
  });
  if (!cadAnchor) return null;
  return parseDriveFileIdFromText(cadAnchor.href);
}

function findActualDetailsSpreadsheetIdFromHtml(html: string, productId: string): string | null {
  const anchors = readHtmlAnchors(html);
  const normalizedProductId = productId.toLowerCase();
  // The Actual sheet link is typically labelled like "ET0528-ACTUAL" (productId + "actual"),
  // so match on "actual" and prefer the anchor that also contains the productId.
  const actualAnchor = anchors.find((anchor) => {
    const text = anchor.text.toLowerCase();
    return (
      anchor.href.includes("docs.google.com/spreadsheets") &&
      text.includes(normalizedProductId) &&
      text.includes("actual")
    );
  }) ?? anchors.find((anchor) => {
    const text = anchor.text.toLowerCase();
    return (
      anchor.href.includes("docs.google.com/spreadsheets") &&
      text.includes("actual")
    );
  });
  if (!actualAnchor) return null;
  return parseDriveFileIdFromText(actualAnchor.href);
}

function normalizeTagList(value: string): string[] {
  return value
    .split(/[\n,;|]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function looksLikeProductId(value: string): boolean {
  return /^[A-Z]{1,2}\d{4}[A-Z]?(-[A-Z]+[A-Z]?)?$/i.test(value.trim());
}

function findStyleInValues(values: string[]): string | null {
  for (const value of values) {
    const productId = extractProductId(value);
    if (looksLikeProductId(productId)) return productId;
  }
  return null;
}

function findStyleColumn(headers: string[]): number {
  const styleHeaderIndex = headers.findIndex((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized === "styleno" || normalized === "stylenumber" || normalized === "style";
  });
  return styleHeaderIndex >= 0 ? styleHeaderIndex : 0;
}

function findTagsColumn(headers: string[]): number {
  const tagsHeaderIndex = headers.findIndex((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized === "tags" || normalized === "tag" || normalized.includes("tags");
  });
  return tagsHeaderIndex >= 0 ? tagsHeaderIndex : 1;
}

function findHtmlHeaderRowIndex(rows: string[][]): number {
  const index = rows.findIndex((row) => {
    const normalized = row.map((cell) => cell.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hasStyle = normalized.some((cell) => cell === "styleno" || cell === "stylenumber" || cell === "style");
    const hasUsefulImportColumn = normalized.some((cell) =>
      cell.includes("tag") ||
      ["typ", "type", "stone", "shp", "shape", "qty", "quantity", "twt"].includes(cell)
    );
    return hasStyle && hasUsefulImportColumn;
  });
  return index >= 0 ? index : 0;
}

function findHeaderColumn(headers: string[], names: string[]): number {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return headers.findIndex((header) => normalizedNames.has(header.toLowerCase().replace(/[^a-z0-9]/g, "")));
}

function cellAt(row: string[], index: number): string {
  return index >= 0 ? row[index] ?? "" : "";
}

function parseNumericCell(value: string): number {
  const parsed = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readProductRowsFromHtml(html: string): Map<string, Record<string, string>> {
  const productRows = new Map<string, Record<string, string>>();
  const rows = readHtmlTableRows(html);
  if (rows.length === 0) return productRows;
  const headerIndex = findHtmlHeaderRowIndex(rows);
  const headers = rows[headerIndex] ?? [];
  const styleColumn = findStyleColumn(headers);
  for (const row of rows.slice(headerIndex + 1)) {
    const candidate = row[styleColumn] || findStyleInValues(row) || "";
    const productId = extractProductId(candidate);
    if (!looksLikeProductId(productId)) continue;
    const productData: Record<string, string> = {};
    row.forEach((value, index) => {
      if (!value) return;
      const header = headers[index]?.trim() || `column_${index + 1}`;
      productData[header] = value;
    });
    productRows.set(productId, productData);
  }
  return productRows;
}

function readTagsFromHtml(html: string): Map<string, string[]> {
  const tagsByProduct = new Map<string, string[]>();
  const rows = readHtmlTableRows(html);
  if (rows.length === 0) return tagsByProduct;
  const headerIndex = findHtmlHeaderRowIndex(rows);
  const headers = rows[headerIndex] ?? [];
  const styleColumn = findStyleColumn(headers);
  const tagsColumn = findTagsColumn(headers);
  for (const row of rows.slice(headerIndex + 1)) {
    const productId = extractProductId(row[styleColumn] || "");
    if (!looksLikeProductId(productId)) continue;
    const tags = normalizeTagList(row[tagsColumn] || "");
    if (tags.length > 0) tagsByProduct.set(productId.toUpperCase(), tags);
  }
  return tagsByProduct;
}

type RichHtmlImportData = {
  productRows: Map<string, Record<string, string>>;
  tags: Map<string, string[]>;
  stoneRows: Map<string, StoneRow[]>;
};

function readRichImportDataFromHtml(html: string): RichHtmlImportData {
  const productRows = new Map<string, Record<string, string>>();
  const tags = new Map<string, string[]>();
  const stoneRows = new Map<string, StoneRow[]>();
  const rows = readHtmlTableRows(html);
  if (rows.length === 0) return { productRows, tags, stoneRows };

  const headerIndex = findHtmlHeaderRowIndex(rows);
  const headers = rows[headerIndex] ?? [];
  const styleColumn = findStyleColumn(headers);
  const tagsColumn = findTagsColumn(headers);
  const typColumn = findHeaderColumn(headers, ["typ", "type", "stone type", "stone"]);
  const shpColumn = findHeaderColumn(headers, ["shp", "shape"]);
  const qlyColumn = findHeaderColumn(headers, ["qly", "quality"]);
  const lotColumn = findHeaderColumn(headers, ["lot", "lot no", "lot number"]);
  const bandColumn = findHeaderColumn(headers, ["band"]);
  const mmSizeColumn = findHeaderColumn(headers, ["mm size", "mmsize", "size"]);
  const avWtColumn = findHeaderColumn(headers, ["av wt", "avg wt", "avwt", "average weight"]);
  const qtyColumn = findHeaderColumn(headers, ["qty", "quantity", "pcs"]);
  const twtColumn = findHeaderColumn(headers, ["twt", "total wt", "total weight"]);
  const locationColumn = findHeaderColumn(headers, ["location", "loc"]);
  const remarksColumn = findHeaderColumn(headers, ["remarks", "remark", "notes"]);

  for (const row of rows.slice(headerIndex + 1)) {
    const productId = extractProductId(row[styleColumn] || findStyleInValues(row) || "");
    if (!looksLikeProductId(productId)) continue;

    const productData: Record<string, string> = {};
    row.forEach((value, index) => {
      if (!value) return;
      const header = headers[index]?.trim() || `column_${index + 1}`;
      productData[header] = value;
    });
    productRows.set(productId, productData);

    const rowTags = normalizeTagList(cellAt(row, tagsColumn));
    if (rowTags.length > 0) tags.set(productId.toUpperCase(), rowTags);

    const stoneRow: StoneRow = {
      typ: cellAt(row, typColumn).trim(),
      shp: cellAt(row, shpColumn).trim(),
      qly: cellAt(row, qlyColumn).trim(),
      lot: cellAt(row, lotColumn).trim(),
      band: cellAt(row, bandColumn).trim(),
      mmSize: cellAt(row, mmSizeColumn).trim(),
      avWt: parseNumericCell(cellAt(row, avWtColumn)),
      qty: parseNumericCell(cellAt(row, qtyColumn)),
      twt: parseNumericCell(cellAt(row, twtColumn)),
      location: cellAt(row, locationColumn).trim(),
      remarks: cellAt(row, remarksColumn).trim(),
    };
    if (!isBlankRow([stoneRow.typ, stoneRow.shp, "", "", "", "", "", stoneRow.qty, stoneRow.twt, "", ""])) {
      const current = stoneRows.get(productId.toUpperCase()) ?? [];
      current.push(stoneRow);
      stoneRows.set(productId.toUpperCase(), current);
    }
  }

  return { productRows, tags, stoneRows };
}

function isHtmlFile(file: DriveFile): boolean {
  const lowerName = file.name.toLowerCase();
  return HTML_MIMES.has(file.mimeType || "") || lowerName.endsWith(".html") || lowerName.endsWith(".htm");
}

function parseDriveFileIdFromText(value: string): string | null {
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const spreadsheetMatch = value.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (spreadsheetMatch) return spreadsheetMatch[1];
  const openMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  return null;
}

function parseDriveFolderIdFromText(value: string): string | null {
  const folderMatch = value.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return null;
}

function normalizeGoogleRedirectUrl(url: string): string {
  try {
    const parsed = new URL(decodeHtmlEntities(url));
    const redirected = parsed.searchParams.get("q") || parsed.searchParams.get("url");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return decodeHtmlEntities(url);
  }
}

function extractDriveLinksFromHtml(html: string): string[] {
  const links = new Set<string>();
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRegex.exec(html))) {
    const normalized = normalizeGoogleRedirectUrl(hrefMatch[1]);
    if (normalized.includes("drive.google.com") || normalized.includes("docs.google.com")) {
      links.add(normalized);
    }
  }
  const plainUrlRegex = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>]+/gi;
  let plainMatch: RegExpExecArray | null;
  while ((plainMatch = plainUrlRegex.exec(html))) {
    links.add(normalizeGoogleRedirectUrl(plainMatch[0]));
  }
  return Array.from(links);
}

type ManifestLinks = {
  folderIds: string[];
  htmlFileIds: string[];
  excelFileIds: string[];
};

async function readManifestLinksFromGoogleDocs(
  drive: ReturnType<typeof google.drive>,
  docFileIds: string[]
): Promise<ManifestLinks> {
  const folderIds = new Set<string>();
  const htmlFileIds = new Set<string>();
  const excelFileIds = new Set<string>();

  const docHtmlList = await mapConcurrent(docFileIds, 2, (fileId) => downloadGoogleDocHtml(drive, fileId));
  const candidateFileIds = new Set<string>();
  for (const html of docHtmlList) {
    for (const link of extractDriveLinksFromHtml(html)) {
      const folderId = parseDriveFolderIdFromText(link);
      if (folderId) {
        folderIds.add(folderId);
        continue;
      }
      const fileId = parseDriveFileIdFromText(link);
      if (fileId) candidateFileIds.add(fileId);
    }
  }

  const files = await mapConcurrent(Array.from(candidateFileIds), 4, async (fileId) => {
    try {
      return await getDriveFileMetadata(drive, fileId);
    } catch {
      return null;
    }
  });
  for (const file of files) {
    if (!file) continue;
    if (file.mimeType === DRIVE_FOLDER_MIME) folderIds.add(file.id);
    else if (isHtmlFile(file)) htmlFileIds.add(file.id);
    else if (isExcelFile(file)) excelFileIds.add(file.id);
  }

  return {
    folderIds: Array.from(folderIds),
    htmlFileIds: Array.from(htmlFileIds),
    excelFileIds: Array.from(excelFileIds),
  };
}

function findCadFileIdInImportSheetData(importSheetData?: Record<string, string>): string | null {
  if (!importSheetData) return null;
  for (const [key, value] of Object.entries(importSheetData)) {
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.includes("cad") && !normalizedKey.includes("detail")) continue;
    const fileId = parseDriveFileIdFromText(value);
    if (fileId) return fileId;
  }
  for (const value of Object.values(importSheetData)) {
    const fileId = parseDriveFileIdFromText(value);
    if (fileId) return fileId;
  }
  return null;
}

function isExcelFile(file: DriveFile): boolean {
  const mime = file.mimeType || "";
  return (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.google-apps.spreadsheet"
  );
}

async function findDriveFolderByName(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  folderName: string
): Promise<string | null> {
  const q = `'${escapeDriveQueryLiteral(parentFolderId)}' in parents and name = '${escapeDriveQueryLiteral(folderName)}' and mimeType = '${DRIVE_FOLDER_MIME}' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function ensureDriveFolder(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const existingId = await findDriveFolderByName(drive, parentFolderId, folderName);
  if (existingId) return existingId;
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      parents: [parentFolderId],
      mimeType: DRIVE_FOLDER_MIME,
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error(`Could not create Drive folder: ${folderName}`);
  return id;
}

async function findDriveFileByName(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  fileName: string
): Promise<string | null> {
  const q = `'${escapeDriveQueryLiteral(parentFolderId)}' in parents and name = '${escapeDriveQueryLiteral(fileName)}' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function uploadLocalFileToDriveFolder(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const existingId = await findDriveFileByName(drive, parentFolderId, fileName);
  const media = { mimeType, body: fs.createReadStream(filePath) };
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
      supportsAllDrives: true,
    });
    return existingId;
  }
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      mimeType,
    },
    media,
    fields: "id",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error(`Could not upload Drive file: ${fileName}`);
  return id;
}

async function uploadBufferToDriveFolder(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<void> {
  const existingId = await findDriveFileByName(drive, parentFolderId, fileName);
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType, body: Readable.from(buffer) },
      supportsAllDrives: true,
    });
    return;
  }
  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      mimeType,
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
    supportsAllDrives: true,
  });
}

async function archiveQuoteToDrive(
  drive: ReturnType<typeof google.drive>,
  destinationFolderId: string,
  productId: string,
  quoteBuffer: Buffer,
  fileNames: string[]
): Promise<void> {
  const productFolderId = await ensureDriveFolder(
    drive,
    destinationFolderId,
    sanitizeFileName(productId)
  );
  const quotesFolderId = await ensureDriveFolder(
    drive,
    productFolderId,
    "Quo/Dc"
  );
  for (const fileName of fileNames) {
    await uploadBufferToDriveFolder(
      drive,
      quotesFolderId,
      quoteBuffer,
      sanitizeFileName(fileName),
      XLSX_MIME
    );
  }
}

function normalizeMatchValue(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function numericCellValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getReturnedUnusedGoodsRowValue(
  row: ReturnedUnusedGoodsRow,
  aliases: string[]
): string | number | undefined {
  const rowRecord = row as Record<string, string | number | undefined>;
  const compactAliases = aliases.map(compactWorksheetName);
  for (const [key, value] of Object.entries(rowRecord)) {
    if (compactAliases.includes(compactWorksheetName(key))) return value;
  }
  return undefined;
}

function returnedUnusedGoodsMatchKey(row: ReturnedUnusedGoodsRow): string | null {
  const typ = getReturnedUnusedGoodsRowValue(row, ["typ", "type"]);
  const shp = getReturnedUnusedGoodsRowValue(row, ["shp", "shape"]);
  const band = getReturnedUnusedGoodsRowValue(row, ["band"]);
  if (normalizeMatchValue(typ) === "" || normalizeMatchValue(shp) === "") return null;
  return [
    normalizeMatchValue(typ),
    normalizeMatchValue(shp),
    normalizeMatchValue(band),
  ].join("|");
}

function buildReturnedUnusedGoodsMatchMap(
  rows: ReturnedUnusedGoodsRow[]
): Map<string, { qty: number; twt: number }> {
  const matchMap = new Map<string, { qty: number; twt: number }>();
  for (const row of rows) {
    const key = returnedUnusedGoodsMatchKey(row);
    if (!key) continue;
    const qty = numericCellValue(getReturnedUnusedGoodsRowValue(row, ["qty", "quantity"])) ?? 0;
    const twt = numericCellValue(getReturnedUnusedGoodsRowValue(row, ["twt", "total wt", "total weight"])) ?? 0;
    const existing = matchMap.get(key);
    if (existing) {
      existing.qty += qty;
      existing.twt += twt;
    } else {
      matchMap.set(key, { qty, twt });
    }
  }
  return matchMap;
}

function quoteHeaderAlias(header: unknown): "typ" | "shp" | "band" | null {
  const normalized = compactWorksheetName(String(header ?? ""));
  if (normalized === "typ" || normalized === "type") return "typ";
  if (normalized === "shp" || normalized === "shape") return "shp";
  if (normalized === "band") return "band";
  return null;
}

function findQuoteMatchColumns(
  worksheet: ExcelJS.Worksheet
): { headerRowNumber: number; typColumn: number; shpColumn: number; bandColumn: number } | null {
  const maxRowsToScan = Math.min(30, worksheet.actualRowCount || 30);
  const maxColumnsToScan = Math.max(worksheet.actualColumnCount, 20);
  for (let rowNumber = 1; rowNumber <= maxRowsToScan; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const columns: Partial<Record<"typ" | "shp" | "band", number>> = {};
    for (let colNumber = 1; colNumber <= maxColumnsToScan; colNumber++) {
      const alias = quoteHeaderAlias(normalizeCellValue(row.getCell(colNumber).value));
      if (alias && !columns[alias]) columns[alias] = colNumber;
    }
    if (columns.typ && columns.shp && columns.band) {
      return {
        headerRowNumber: rowNumber,
        typColumn: columns.typ,
        shpColumn: columns.shp,
        bandColumn: columns.band,
      };
    }
  }
  return null;
}

async function applyReturnedUnusedGoodsToQuoteBuffer(
  quoteBuffer: Buffer,
  returnedUnusedGoodsRows: ReturnedUnusedGoodsRow[]
): Promise<Buffer> {
  const matchMap = buildReturnedUnusedGoodsMatchMap(returnedUnusedGoodsRows);
  if (matchMap.size === 0) return quoteBuffer;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    quoteBuffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]
  );

  let matchedRows = 0;
  for (const worksheet of workbook.worksheets) {
    const matchColumns = findQuoteMatchColumns(worksheet);
    if (!matchColumns) continue;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= matchColumns.headerRowNumber) return;
      const key = [
        normalizeMatchValue(normalizeCellValue(row.getCell(matchColumns.typColumn).value)),
        normalizeMatchValue(normalizeCellValue(row.getCell(matchColumns.shpColumn).value)),
        normalizeMatchValue(normalizeCellValue(row.getCell(matchColumns.bandColumn).value)),
      ].join("|");
      const returnedValues = matchMap.get(key);
      if (!returnedValues) return;
      row.getCell(19).value = returnedValues.qty;
      row.getCell(20).value = returnedValues.twt;
      row.commit();
      matchedRows++;
    });
  }

  if (matchedRows === 0) return quoteBuffer;
  const updated = await workbook.xlsx.writeBuffer();
  return Buffer.from(updated);
}

async function applyClientCodeToQuoteBuffer(
  quoteBuffer: Buffer,
  clientCode: string | null
): Promise<Buffer> {
  const normalizedClientCode = normalizeClientCode(clientCode);
  if (!normalizedClientCode) return quoteBuffer;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    quoteBuffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]
  );

  const sheet = workbook.getWorksheet("Summ") ?? workbook.worksheets[0];
  if (!sheet) return quoteBuffer;

  // A10:A11 is a merged cell; only the merge master (A10) holds the value.
  const cell = sheet.getCell("A10");
  const target = cell.isMerged && cell.master ? cell.master : cell;
  target.value = normalizedClientCode;

  workbook.calcProperties.fullCalcOnLoad = true;
  const updated = await workbook.xlsx.writeBuffer();
  return Buffer.from(updated);
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function assertSharedDriveDestinationFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string
): Promise<void> {
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType,driveId,capabilities(canAddChildren,canEdit)",
      supportsAllDrives: true,
    });
    const metadata = response.data;
    const folderName = metadata.name || folderId;
    if (metadata.mimeType !== DRIVE_FOLDER_MIME) {
      throw new Error(`Destination is not a Google Drive folder: ${folderName}`);
    }
    if (!metadata.driveId) {
      throw new Error(
        `Destination folder "${folderName}" is in My Drive. Use a Google Workspace Shared Drive folder shared with the service account as Content manager.`
      );
    }
    if (!metadata.capabilities?.canAddChildren) {
      throw new Error(
        `The service account cannot add files to "${folderName}". Share the Shared Drive or destination folder with the service account as Content manager.`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Google Drive destination check failed: ${message}`);
  }
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function exportedSpreadsheetXlsxName(sourceName: string): string {
  const base = path.basename(sourceName);
  const stem = path.parse(base).name;
  const safe = sanitizeFileName(stem) || "export";
  return `${safe}.xlsx`;
}

function imageMimeFromName(fileName: string, fallback?: string): string {
  if (fallback && fallback.startsWith("image/")) return fallback;
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

async function findXlsxByNameInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  fileName: string
): Promise<string | null> {
  const q = `'${escapeDriveQueryLiteral(folderId)}' in parents and name = '${escapeDriveQueryLiteral(fileName)}' and mimeType = '${escapeDriveQueryLiteral(XLSX_MIME)}' and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const id = res.data.files?.[0]?.id;
  return id ?? null;
}

type DownloadedAssetImage = {
  path: string;
  name: string;
  driveFileId: string;
  mimeType?: string;
};

type UploadedImageResult =
  | { url: string; error?: never }
  | { error: string; url?: never };

function shouldSuppressDriveSyncWarning(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("insufficient permissions for the specified parent") ||
    normalized.includes("user does not have sufficient permissions for this file")
  );
}

async function syncProductAssetsToDrive(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  productId: string,
  excelPath: string | null,
  excelFile: DriveFile | null,
  images: DownloadedAssetImage[],
  driveSyncErrors: { productId: string; error: string }[]
): Promise<void> {
  const errs: string[] = [];

  if (excelPath && fs.existsSync(excelPath) && excelFile) {
    const mime = excelFile.mimeType || "";
    try {
      if (mime === "application/vnd.google-apps.spreadsheet") {
        const exportName = exportedSpreadsheetXlsxName(excelFile.name);
        const existingId = await findXlsxByNameInFolder(drive, folderId, exportName);
        const media = { mimeType: XLSX_MIME, body: fs.createReadStream(excelPath) };
        if (existingId) {
          await drive.files.update({
            fileId: existingId,
            media,
            supportsAllDrives: true,
          });
        } else {
          await drive.files.create({
            requestBody: {
              name: exportName,
              parents: [folderId],
              mimeType: XLSX_MIME,
            },
            media,
            supportsAllDrives: true,
            fields: "id",
          });
        }
      } else if (
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel"
      ) {
        await drive.files.update({
          fileId: excelFile.id,
          media: {
            mimeType: mime === "application/vnd.ms-excel" ? "application/vnd.ms-excel" : XLSX_MIME,
            body: fs.createReadStream(excelPath),
          },
          supportsAllDrives: true,
        });
      }
    } catch (err) {
      errs.push(`Excel Drive sync: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const imageSyncErrors = await mapConcurrent(
    images,
    PRODUCT_IMPORT_IMAGE_CONCURRENCY,
    async (img) => {
      if (!fs.existsSync(img.path)) return null;
      try {
        const mime = imageMimeFromName(img.name, img.mimeType);
        await drive.files.update({
          fileId: img.driveFileId,
          media: { mimeType: mime, body: fs.createReadStream(img.path) },
          supportsAllDrives: true,
        });
        return null;
      } catch (err) {
        return `Image ${img.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  );
  errs.push(...imageSyncErrors.filter((err): err is string => Boolean(err)));

  if (errs.length > 0) {
    const visibleErrors = errs.filter((err) => !shouldSuppressDriveSyncWarning(err));
    if (visibleErrors.length > 0) {
      driveSyncErrors.push({ productId, error: visibleErrors.join("; ") });
    }
  }
}

// -------------------------
// Firebase Storage upload
// -------------------------
/** Type for Storage bucket used by uploadImage (avoids firebase-admin storage.Bucket type export). */
type StorageBucketLike = {
  upload(path: string, opts: { destination: string; metadata: { contentType: string } }): Promise<unknown>;
  file(path: string): { makePublic(): Promise<unknown> };
  name: string;
};

async function uploadImage(
  bucket: StorageBucketLike,
  category: string,
  fullStyleNo: string,
  filePath: string,
  originalFileName: string
): Promise<{ url: string; storagePath: string }> {
  const sanitizedCategory = sanitizeFileName(category);
  const sanitizedStyleNo = sanitizeFileName(fullStyleNo);
  const sanitizedFileName = sanitizeFileName(originalFileName);
  const storagePath = `Products/${sanitizedCategory}/${sanitizedStyleNo}/${sanitizedFileName}`;
  const ext = path.extname(originalFileName).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const contentType = contentTypeMap[ext] || "image/png";

  await bucket.upload(filePath, {
    destination: storagePath,
    metadata: { contentType },
  });
  const file = bucket.file(storagePath);
  await file.makePublic();
  return { url: publicStorageUrl(bucket.name, storagePath), storagePath };
}

function publicStorageUrl(bucketName: string, storagePath: string): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
}

function expectedImageUrl(
  bucket: StorageBucketLike,
  category: string,
  productId: string,
  originalFileName: string
): string {
  const storagePath = `Products/${sanitizeFileName(category)}/${sanitizeFileName(productId)}/${sanitizeFileName(originalFileName)}`;
  return publicStorageUrl(bucket.name, storagePath);
}

function localImageSignature(image: { path: string; name: string }): string {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(image.path)).digest("hex");
  return `${sanitizeFileName(image.name)}:${hash}`;
}

// -------------------------
// Process single product
// -------------------------
export type ImportProductResult = "CREATE" | "UPDATE" | "SKIP" | "ERRORED";

const ACTUAL_FIRESTORE_DOC_ID = "actual";

function hasActualAssumingNetWt(value: number | string | null): boolean {
  return (
    value !== null &&
    value !== "" &&
    !(typeof value === "number" && Number.isNaN(value))
  );
}

function hasActualDetailDataToPersist(
  actualStoneSummary: StoneRow[],
  actualReturnedUnusedGoodsData: ReturnedUnusedGoodsData | null,
  actualAssumingNetWt: number | string | null
): boolean {
  return (
    actualStoneSummary.length > 0 ||
    !!actualReturnedUnusedGoodsData?.sheetFound ||
    hasActualAssumingNetWt(actualAssumingNetWt)
  );
}

async function persistActualDetailToFirestore(
  productRef: admin.firestore.DocumentReference,
  actualStoneSummary: StoneRow[],
  actualReturnedUnusedGoodsData: ReturnedUnusedGoodsData | null,
  actualAssumingNetWt: number | string | null
): Promise<void> {
  const actualRowsRef = productRef.collection("rows").doc(ACTUAL_FIRESTORE_DOC_ID);
  const actualReturnedUnusedGoodsRef = productRef
    .collection("returnedUnusedGoods")
    .doc(ACTUAL_FIRESTORE_DOC_ID);

  const hasAssumingNetWt = hasActualAssumingNetWt(actualAssumingNetWt);
  if (actualStoneSummary.length > 0 || hasAssumingNetWt) {
    const actualRowsPayload: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (actualStoneSummary.length > 0) {
      actualRowsPayload.rows = actualStoneSummary;
    }
    if (hasAssumingNetWt) {
      actualRowsPayload.assumingNetWt = actualAssumingNetWt;
    }
    await actualRowsRef.set(actualRowsPayload, { merge: true });
  }
  if (actualReturnedUnusedGoodsData?.sheetFound) {
    await actualReturnedUnusedGoodsRef.set({
      rows: actualReturnedUnusedGoodsData.rows,
      sourceSheetName: actualReturnedUnusedGoodsData.sourceSheetName,
      availableSheetNames: actualReturnedUnusedGoodsData.availableSheetNames,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

type ProcessProductOptions = {
  tagOverride?: string[];
  includeAllImages?: boolean;
  actualDetailExcelPath?: string | null;
};

async function processProduct(
  db: admin.firestore.Firestore,
  bucket: StorageBucketLike,
  excelPath: string | null,
  productId: string,
  imagePaths: { path: string; name: string }[],
  options: ProcessProductOptions = {}
): Promise<{
  status: ImportProductResult;
  productId: string;
  error?: string;
  returnedUnusedGoodsRows?: ReturnedUnusedGoodsRow[];
  actualDetailReturnedUnusedGoodsRows?: ReturnedUnusedGoodsRow[];
}> {
  const processingErrors: string[] = [];
  let rows: StoneRow[] = [];
  let returnedUnusedGoodsData: ReturnedUnusedGoodsData | null = null;
  let assumingNetWt: number | string | null = null;
  let parsedStyle: ParsedStyle | null = null;
  let category = "Others";
  let materials: string[] = [];
  let tags: string[] = [];

  if (excelPath && fs.existsSync(excelPath)) {
    try {
      const excelData = await readExcelFile(excelPath);
      rows = excelData.rows || [];
      assumingNetWt = excelData.assumingNetWt ?? null;
    } catch (err) {
      processingErrors.push(`Excel read: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      returnedUnusedGoodsData = await readReturnedUnusedGoodsFile(excelPath);
    } catch (err) {
      processingErrors.push(`Returned/Unused Goods read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Actual Detail is kept fully separate from CAD Details (no override/merge).
  const actualDetailExcelPath = options.actualDetailExcelPath ?? null;
  let actualDetailReturnedUnusedGoodsRows: ReturnedUnusedGoodsRow[] = [];
  const actualStoneSummary: StoneRow[] = [];
  let actualReturnedUnusedGoodsData: ReturnedUnusedGoodsData | null = null;
  let actualAssumingNetWt: number | string | null = null;
  if (actualDetailExcelPath && fs.existsSync(actualDetailExcelPath)) {
    try {
      const actualDetailData = await readExcelFile(actualDetailExcelPath);
      actualAssumingNetWt = actualDetailData.assumingNetWt ?? null;
      for (const r of actualDetailData.rows || []) {
        if (isBlankRow([r.typ, r.shp, "", "", "", "", "", r.qty, r.twt, "", ""])) continue;
        actualStoneSummary.push(r);
      }
      actualReturnedUnusedGoodsData = await readReturnedUnusedGoodsFile(actualDetailExcelPath);
      if (
        actualReturnedUnusedGoodsData.sheetFound &&
        actualReturnedUnusedGoodsData.rows.length > 0
      ) {
        actualDetailReturnedUnusedGoodsRows = actualReturnedUnusedGoodsData.rows;
      }
    } catch (err) {
      processingErrors.push(`Actual Detail read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    parsedStyle = parseStyleNumber(productId);
    if (!parsedStyle?.prefix) {
      const prefix = productId.substring(0, 2).toUpperCase();
      parsedStyle = {
        prefix: prefix.length === 2 ? prefix : null,
        baseVariant: null,
        suffixCode: null,
        suffixVariant: null,
      };
    }
  } catch {
    parsedStyle = {
      prefix: productId.substring(0, 2).toUpperCase() || null,
      baseVariant: null,
      suffixCode: null,
      suffixVariant: null,
    };
  }

  category = detectCategory(productId, parsedStyle) || "Others";

  const stoneSummary: StoneRow[] = [];
  for (const r of rows) {
    if (isBlankRow([r.typ, r.shp, "", "", "", "", "", r.qty, r.twt, "", ""])) continue;
    stoneSummary.push(r);
  }
  const aggregatedSummary = calculateStoneSummary(stoneSummary);
  materials = extractMaterials(stoneSummary);
  const isMatching = parsedStyle?.suffixCode ? "MATCHING" : "BASE";
  tags = generateTags(category, materials, isMatching);
  if (options.tagOverride && options.tagOverride.length > 0) {
    tags = options.tagOverride;
  }

  const productRef = db.collection("products").doc(productId);
  const rowsRef = db.collection("products").doc(productId).collection("rows").doc(productId);
  const returnedUnusedGoodsRef = db
    .collection("products")
    .doc(productId)
    .collection("returnedUnusedGoods")
    .doc(productId);
  let existingDoc: admin.firestore.DocumentSnapshot | null = null;
  let existingData: Record<string, unknown> | null = null;
  let existingRows: StoneRow[] = [];
  let existingReturnedUnusedGoodsRows: StoneRow[] = [];
  let existingReturnedUnusedGoodsSheetName: string | null = null;
  try {
    existingDoc = await productRef.get();
    if (existingDoc.exists) existingData = existingDoc.data() as Record<string, unknown>;
    const rowsDoc = await rowsRef.get();
    const rowsData = rowsDoc.exists ? rowsDoc.data() : null;
    existingRows = Array.isArray(rowsData?.rows) ? (rowsData.rows as StoneRow[]) : [];
    const returnedUnusedGoodsDoc = await returnedUnusedGoodsRef.get();
    const returnedUnusedGoodsDocData = returnedUnusedGoodsDoc.exists
      ? returnedUnusedGoodsDoc.data()
      : null;
    existingReturnedUnusedGoodsRows = Array.isArray(returnedUnusedGoodsDocData?.rows)
      ? (returnedUnusedGoodsDocData.rows as StoneRow[])
      : [];
    existingReturnedUnusedGoodsSheetName =
      typeof returnedUnusedGoodsDocData?.sourceSheetName === "string"
        ? returnedUnusedGoodsDocData.sourceSheetName
        : null;
  } catch (err) {
    processingErrors.push(`Read existing: ${err instanceof Error ? err.message : String(err)}`);
  }

  const matchingImages = options.includeAllImages
    ? imagePaths
    : imagePaths.filter((img) => {
        return imageMatchesProductId(img.name, productId);
      });
  sortProductImagesForImport(matchingImages, productId);

  const expectedImageUrls = matchingImages.map((img) =>
    expectedImageUrl(bucket, category, productId, img.name)
  );
  const imageImportSignature: string[] = [];
  for (const img of matchingImages) {
    try {
      imageImportSignature.push(localImageSignature(img));
    } catch (err) {
      processingErrors.push(
        `Image signature ${img.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const expectedThumbnailUrl = expectedImageUrls[0] ?? "";
  const shouldImportImages =
    !existingDoc?.exists ||
    (matchingImages.length > 0 &&
      (!valuesAreEqual(expectedImageUrls, existingData?.imageUrls) ||
        !valuesAreEqual(expectedThumbnailUrl, existingData?.thumbnailUrl) ||
        !valuesAreEqual(imageImportSignature, existingData?.imageImportSignature)));

  const imageUrls: string[] = shouldImportImages ? [] : expectedImageUrls;
  let thumbnailUrl = shouldImportImages ? "" : expectedThumbnailUrl;
  if (shouldImportImages) {
    const uploadedImages = await mapConcurrent<typeof matchingImages[number], UploadedImageResult>(
      matchingImages,
      PRODUCT_IMPORT_IMAGE_CONCURRENCY,
      async (img) => {
        try {
          const { url } = await uploadImage(bucket, category, productId, img.path, img.name);
          return { url };
        } catch (err) {
          return {
            error: `Upload ${img.name}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
    );
    for (const uploaded of uploadedImages) {
      if (typeof uploaded.error === "string") {
        processingErrors.push(uploaded.error);
      } else {
        imageUrls.push(uploaded.url);
        if (!thumbnailUrl) thumbnailUrl = uploaded.url;
      }
    }
  }

  const productData: Record<string, unknown> = {
    productId,
    category,
    productType: category,
    isActive: true,
    prefix: parsedStyle?.prefix ?? productId.substring(0, 2).toUpperCase(),
    baseVariant: parsedStyle?.baseVariant ?? null,
    suffixCode: parsedStyle?.suffixCode ?? null,
    suffixVariant: parsedStyle?.suffixVariant ?? null,
    tags: tags || [],
    materials: materials || [],
    stoneSummary: aggregatedSummary || [],
    assumingNetWt: assumingNetWt ?? null,
  };
  if (returnedUnusedGoodsData) {
    productData.returnedUnusedGoodsImport = {
      sheetFound: returnedUnusedGoodsData.sheetFound,
      sourceSheetName: returnedUnusedGoodsData.sourceSheetName,
      rowCount: returnedUnusedGoodsData.rows.length,
      availableSheetNames: returnedUnusedGoodsData.availableSheetNames,
    };
  }
  if (!existingDoc?.exists || matchingImages.length > 0) {
    productData.imageUrls = imageUrls || [];
    productData.thumbnailUrl = thumbnailUrl || "";
    productData.imageImportSignature = imageImportSignature;
  }
  if (processingErrors.length > 0) {
    productData.processingErrors = processingErrors;
  }

  if (!existingDoc?.exists) {
    productData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    productData.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await productRef.set(productData, { merge: true });
    if (stoneSummary.length > 0) {
      try {
        await rowsRef.set({
          rows: stoneSummary,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        processingErrors.push(`Save rows: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (returnedUnusedGoodsData?.sheetFound) {
      try {
        await returnedUnusedGoodsRef.set({
          rows: returnedUnusedGoodsData.rows,
          sourceSheetName: returnedUnusedGoodsData.sourceSheetName,
          availableSheetNames: returnedUnusedGoodsData.availableSheetNames,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        processingErrors.push(`Save Returned/Unused Goods: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (
      actualDetailExcelPath &&
      hasActualDetailDataToPersist(
        actualStoneSummary,
        actualReturnedUnusedGoodsData,
        actualAssumingNetWt
      )
    ) {
      try {
        await persistActualDetailToFirestore(
          productRef,
          actualStoneSummary,
          actualReturnedUnusedGoodsData,
          actualAssumingNetWt
        );
      } catch (err) {
        processingErrors.push(`Save Actual Detail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return {
      status: "CREATE",
      productId,
      returnedUnusedGoodsRows: returnedUnusedGoodsData?.sheetFound
        ? returnedUnusedGoodsData.rows
        : undefined,
      actualDetailReturnedUnusedGoodsRows:
        actualDetailReturnedUnusedGoodsRows.length > 0
          ? actualDetailReturnedUnusedGoodsRows
          : undefined,
    };
  }

  const payloadUnchanged = compareProductData(productData, existingData ?? {});
  const rowsUnchanged =
    stoneSummary.length === 0 || valuesAreEqual(stoneSummary, existingRows);
  const returnedUnusedGoodsUnchanged =
    !returnedUnusedGoodsData?.sheetFound ||
    (valuesAreEqual(returnedUnusedGoodsData.rows, existingReturnedUnusedGoodsRows) &&
      valuesAreEqual(returnedUnusedGoodsData.sourceSheetName, existingReturnedUnusedGoodsSheetName));
  if (payloadUnchanged && rowsUnchanged && returnedUnusedGoodsUnchanged) {
    console.log("[import-products] product unchanged; skipped Firestore product write", {
      productId,
    });
    if (
      actualDetailExcelPath &&
      hasActualDetailDataToPersist(
        actualStoneSummary,
        actualReturnedUnusedGoodsData,
        actualAssumingNetWt
      )
    ) {
      try {
        await persistActualDetailToFirestore(
          productRef,
          actualStoneSummary,
          actualReturnedUnusedGoodsData,
          actualAssumingNetWt
        );
      } catch (err) {
        processingErrors.push(`Save Actual Detail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return {
      status: "SKIP",
      productId,
      returnedUnusedGoodsRows: returnedUnusedGoodsData?.sheetFound
        ? returnedUnusedGoodsData.rows
        : undefined,
      actualDetailReturnedUnusedGoodsRows:
        actualDetailReturnedUnusedGoodsRows.length > 0
          ? actualDetailReturnedUnusedGoodsRows
          : undefined,
    };
  }

  if (!rowsUnchanged && stoneSummary.length > 0) {
    try {
      await rowsRef.set({
        rows: stoneSummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      processingErrors.push(`Save rows: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!returnedUnusedGoodsUnchanged && returnedUnusedGoodsData?.sheetFound) {
    try {
      await returnedUnusedGoodsRef.set({
        rows: returnedUnusedGoodsData.rows,
        sourceSheetName: returnedUnusedGoodsData.sourceSheetName,
        availableSheetNames: returnedUnusedGoodsData.availableSheetNames,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      processingErrors.push(`Save Returned/Unused Goods: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const changedFields = changedProductFields(productData, existingData ?? {});
  if (processingErrors.length > 0) {
    changedFields.processingErrors = processingErrors;
  }
  if (Object.keys(changedFields).length > 0 || !rowsUnchanged || !returnedUnusedGoodsUnchanged) {
    await productRef.set(
      {
        ...changedFields,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  if (
    actualDetailExcelPath &&
    hasActualDetailDataToPersist(
      actualStoneSummary,
      actualReturnedUnusedGoodsData,
      actualAssumingNetWt
    )
  ) {
    try {
      await persistActualDetailToFirestore(
        productRef,
        actualStoneSummary,
        actualReturnedUnusedGoodsData,
        actualAssumingNetWt
      );
    } catch (err) {
      processingErrors.push(`Save Actual Detail: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    status: "UPDATE",
    productId,
    returnedUnusedGoodsRows: returnedUnusedGoodsData?.sheetFound
      ? returnedUnusedGoodsData.rows
      : undefined,
    actualDetailReturnedUnusedGoodsRows:
      actualDetailReturnedUnusedGoodsRows.length > 0
        ? actualDetailReturnedUnusedGoodsRows
        : undefined,
  };
}

// -------------------------
// Main export
// -------------------------
export type RunProductImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  total: number;
  errors: { productId: string; error: string }[];
  /** Non-fatal failures writing Excel/images back to Drive after a successful Firestore import. */
  driveSyncErrors: { productId: string; error: string }[];
  tagOverridesApplied?: number;
  /** Number of products for which a quotation was generated and uploaded to Drive. */
  quotesGenerated?: number;
  /** Non-fatal per-product quotation generation/upload failures. */
  quoteErrors?: { productId: string; error: string }[];
};

function listLocalFilesRecursive(folderPath: string): string[] {
  const normalizedPath = normalizeLocalSystemPath(folderPath);
  const resolved = path.resolve(normalizedPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Local folder not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  const folderRoot = stat.isFile() ? path.dirname(resolved) : resolved;
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new Error(`Local path is not a folder: ${resolved}`);
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else files.push(entryPath);
    }
  };
  walk(folderRoot);
  return files;
}

function normalizeLocalSystemPath(inputPath: string): string {
  const trimmed = inputPath.trim().replace(/^["']|["']$/g, "");
  if (/^file:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname)
      .replace(/^\/([a-zA-Z]:\/)/, "$1")
      .replace(/\//g, path.sep);
  }
  return trimmed;
}

function readLocalProductHtml(filePath: string): {
  productId: string | null;
  tags: string[];
  cadSpreadsheetId: string | null;
  actualDetailSpreadsheetId: string | null;
  clientCode: string | null;
} {
  const html = fs.readFileSync(filePath, "utf8");
  const title = readMetaTitleFromHtml(html) || path.basename(filePath);
  const productId = extractProductId(title);
  const metaTags = normalizeTagList(readMetaItempropTagsFromHtml(html).join(","));
  const fileNameClientCode = findClientCodeFromFileName(filePath);
  return {
    productId: looksLikeProductId(productId) ? productId : null,
    tags: metaTags,
    cadSpreadsheetId: looksLikeProductId(productId)
      ? findCadDetailsSpreadsheetIdFromHtml(html, productId)
      : null,
    actualDetailSpreadsheetId: looksLikeProductId(productId)
      ? findActualDetailsSpreadsheetIdFromHtml(html, productId)
      : null,
    clientCode: fileNameClientCode ?? findClientCodeFromHtml(html),
  };
}

function isLocalImageFile(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(filePath);
}

function findMatchingZipForProduct(
  productId: string,
  htmlPath: string,
  zipFiles: string[]
): string | null {
  const upperProductId = productId.toUpperCase();
  const byProductId = zipFiles.find(
    (zip) => extractProductId(path.basename(zip)).toUpperCase() === upperProductId
  );
  if (byProductId) return byProductId;

  const htmlDir = path.dirname(htmlPath);
  const sameDirZips = zipFiles.filter((zip) => path.dirname(zip) === htmlDir);
  return sameDirZips.length === 1 ? sameDirZips[0] : null;
}

function extractZipToFolder(zipPath: string, destinationPath: string): void {
  if (!fs.existsSync(destinationPath)) {
    fs.mkdirSync(destinationPath, { recursive: true });
  }
  try {
    execFileSync(
      "tar.exe",
      ["-xf", zipPath, "-C", destinationPath],
      { stdio: "pipe" }
    );
  } catch (err) {
    const message =
      err instanceof Error && "stderr" in err
        ? Buffer.from((err as { stderr?: Uint8Array }).stderr ?? []).toString("utf8").trim()
        : "";
    throw new Error(
      `ZIP extraction failed for ${path.basename(zipPath)}${message ? `: ${message}` : ""}`
    );
  }
}

async function downloadSpreadsheetAsXlsxToPath(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
  destinationPath: string,
  label = "CAD Details"
): Promise<void> {
  const dir = path.dirname(destinationPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    const response = (await drive.files.export(
      {
        fileId: spreadsheetId,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    )) as { data: unknown };
    fs.writeFileSync(destinationPath, Buffer.from(response.data as ArrayBuffer));
    return;
  } catch (err) {
    const driveMessage = err instanceof Error ? err.message : String(err);
    const publicExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
    try {
      const response = await fetch(publicExportUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("empty response");
      }
      fs.writeFileSync(destinationPath, buffer);
      return;
    } catch (publicErr) {
      const publicMessage = publicErr instanceof Error ? publicErr.message : String(publicErr);
      throw new Error(
        `${label} download failed for spreadsheet ${spreadsheetId}. Drive API: ${driveMessage}. Public export: ${publicMessage}. Share the ${label} sheet with the Google service account or make the export link accessible.`
      );
    }
  }
}

async function archiveLocalProductAssetsToDrive(
  drive: ReturnType<typeof google.drive>,
  destinationFolderId: string,
  productId: string,
  excelPath: string | null,
  imagePaths: { path: string; name: string }[],
  actualDetailExcelPath: string | null = null
): Promise<void> {
  const productFolderId = await ensureDriveFolder(drive, destinationFolderId, sanitizeFileName(productId));
  const cadFolderId = await ensureDriveFolder(drive, productFolderId, "CAD Details");
  const imagesFolderId = await ensureDriveFolder(drive, productFolderId, "Images");

  if (excelPath && fs.existsSync(excelPath)) {
    const cadFileName = `${sanitizeFileName(productId)}-cad-details.xlsx`;
    try {
      await uploadLocalFileToDriveFolder(
        drive,
        cadFolderId,
        excelPath,
        cadFileName,
        XLSX_MIME
      );
    } catch (err) {
      throw new Error(
        `CAD upload failed (${cadFileName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (actualDetailExcelPath && fs.existsSync(actualDetailExcelPath)) {
    const actualDetailFileName = `${sanitizeFileName(productId)}-actual-details.xlsx`;
    try {
      await uploadLocalFileToDriveFolder(
        drive,
        cadFolderId,
        actualDetailExcelPath,
        actualDetailFileName,
        XLSX_MIME
      );
    } catch (err) {
      throw new Error(
        `Actual Detail upload failed (${actualDetailFileName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  await mapConcurrent(imagePaths, PRODUCT_IMPORT_IMAGE_CONCURRENCY, async (image) => {
    if (!fs.existsSync(image.path)) return;
    const imageName = sanitizeFileName(image.name);
    try {
      await uploadLocalFileToDriveFolder(
        drive,
        imagesFolderId,
        image.path,
        imageName,
        imageMimeFromName(image.name)
      );
    } catch (err) {
      throw new Error(
        `Image upload failed (${imageName}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

export async function runLocalFolderProductImport(options: {
  folderPath: string;
  driveDestinationFolderId?: string;
}): Promise<RunProductImportResult> {
  const normalizedFolderPath = normalizeLocalSystemPath(options.folderPath);
  const files = listLocalFilesRecursive(normalizedFolderPath);
  const htmlFiles = files.filter((file) => /\.(html?|xhtml)$/i.test(file));
  const zipFiles = files.filter((file) => /\.zip$/i.test(file));

  const adminApp = getFirebaseAdmin();
  const db = adminApp.firestore();
  const bucket = adminApp.storage().bucket();
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth: auth as Parameters<typeof google.drive>[0]["auth"] });
  if (!options.driveDestinationFolderId) {
    throw new Error("Please provide a Google Workspace Shared Drive destination folder.");
  }
  const driveDestinationFolderId = options.driveDestinationFolderId;
  await assertSharedDriveDestinationFolder(drive, driveDestinationFolderId);
  const tempDir = path.join(os.tmpdir(), `ivory-local-import-${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { productId: string; error: string }[] = [];
  const driveSyncErrors: { productId: string; error: string }[] = [];
  let tagOverridesApplied = 0;
  let quotesGenerated = 0;
  const quoteErrors: { productId: string; error: string }[] = [];

  const processLocalHtml = async (
    htmlPath: string,
    htmlIndex: number
  ): Promise<{
    productId: string;
    status?: ImportProductResult;
    errors: { productId: string; error: string }[];
    driveSyncErrors: { productId: string; error: string }[];
    tagOverrideApplied: boolean;
    quoteGenerated: boolean;
    quoteErrors: { productId: string; error: string }[];
  }> => {
    const parsed = readLocalProductHtml(htmlPath);
    const productId = parsed.productId;
    if (!productId) {
      return {
        productId: path.basename(htmlPath),
        errors: [{ productId: path.basename(htmlPath), error: "Could not identify Style No. from HTML." }],
        driveSyncErrors: [],
        tagOverrideApplied: false,
        quoteGenerated: false,
        quoteErrors: [],
      };
    }

    const productErrors: { productId: string; error: string }[] = [];
    const productDriveSyncErrors: { productId: string; error: string }[] = [];
    const productQuoteErrors: { productId: string; error: string }[] = [];
    const imagePaths: { path: string; name: string }[] = [];
    let excelPath: string | null = null;
    let actualDetailPath: string | null = null;
    let status: ImportProductResult | undefined;
    let quoteGenerated = false;
    const zipPath = findMatchingZipForProduct(productId, htmlPath, zipFiles);
    const productTempDir = path.join(tempDir, `${sanitizeFileName(productId)}-${htmlIndex}`);
    try {
      if (!fs.existsSync(productTempDir)) fs.mkdirSync(productTempDir, { recursive: true });
      if (parsed.cadSpreadsheetId) {
        excelPath = path.join(productTempDir, `${sanitizeFileName(productId)}-cad-details.xlsx`);
        await downloadSpreadsheetAsXlsxToPath(drive, parsed.cadSpreadsheetId, excelPath);
      }
      if (parsed.actualDetailSpreadsheetId) {
        const candidateActualDetailPath = path.join(
          productTempDir,
          `${sanitizeFileName(productId)}-actual-details.xlsx`
        );
        try {
          await downloadSpreadsheetAsXlsxToPath(
            drive,
            parsed.actualDetailSpreadsheetId,
            candidateActualDetailPath,
            "Actual Detail"
          );
          actualDetailPath = candidateActualDetailPath;
        } catch (actualDetailErr) {
          // Non-fatal: the Actual Detail sheet is optional. Skip it so CAD import and
          // quote generation still proceed for this product.
          productErrors.push({
            productId,
            error: actualDetailErr instanceof Error ? actualDetailErr.message : String(actualDetailErr),
          });
        }
      }
      if (zipPath) {
        extractZipToFolder(zipPath, productTempDir);
        const extractedFiles = listLocalFilesRecursive(productTempDir);
        imagePaths.push(
          ...extractedFiles
            .filter(isLocalImageFile)
            .map((filePath) => ({ path: filePath, name: path.basename(filePath) }))
        );
      } else {
        productErrors.push({ productId, error: "Matching ZIP file not found; product will import without images." });
      }

      const result = await processProduct(
        db,
        bucket,
        excelPath,
        productId,
        imagePaths,
        { tagOverride: parsed.tags, includeAllImages: true, actualDetailExcelPath: actualDetailPath }
      );
      status = result.status;
      switch (result.status) {
        case "ERRORED":
          productErrors.push({ productId, error: result.error || "Product import failed" });
          break;
      }
      if (result.status === "CREATE" || result.status === "UPDATE") {
        try {
          await archiveLocalProductAssetsToDrive(
            drive,
            driveDestinationFolderId,
            productId,
            excelPath,
            imagePaths,
            actualDetailPath
          );
        } catch (archiveErr) {
          productDriveSyncErrors.push({
            productId,
            error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
          });
        }
      }
      const shouldGenerateQuotes =
        result.status === "CREATE" ||
        result.status === "UPDATE" ||
        (result.status === "SKIP" && !!actualDetailPath);

      if (shouldGenerateQuotes) {
        try {
          const [cadQuoteFileName, actualQuoteFileName] = buildQuoteFileNames(
            productId,
            parsed.clientCode
          );

          const buildQuoteBuffer = async (
            baseBuffer: Buffer,
            returnedUnusedGoodsRows: ReturnedUnusedGoodsRow[] | undefined
          ): Promise<Buffer> => {
            const withReturnedUnusedGoods =
              returnedUnusedGoodsRows && returnedUnusedGoodsRows.length > 0
                ? await applyReturnedUnusedGoodsToQuoteBuffer(baseBuffer, returnedUnusedGoodsRows)
                : baseBuffer;
            return applyClientCodeToQuoteBuffer(withReturnedUnusedGoods, parsed.clientCode);
          };

          const { buffer: cadBuffer } = await generateProductQuote(productId);
          const cadQuoteBuffer = await buildQuoteBuffer(
            cadBuffer,
            result.returnedUnusedGoodsRows
          );
          await archiveQuoteToDrive(
            drive,
            driveDestinationFolderId,
            productId,
            cadQuoteBuffer,
            [cadQuoteFileName]
          );

          if (actualDetailPath) {
            const { buffer: actualBaseBuffer } = await generateProductQuote(productId, {
              rowsDocId: ACTUAL_FIRESTORE_DOC_ID,
            });
            const actualQuoteBuffer = await buildQuoteBuffer(
              actualBaseBuffer,
              result.actualDetailReturnedUnusedGoodsRows
            );
            await archiveQuoteToDrive(
              drive,
              driveDestinationFolderId,
              productId,
              actualQuoteBuffer,
              [actualQuoteFileName]
            );
          } else {
            const actualQuoteBuffer = await buildQuoteBuffer(
              cadBuffer,
              result.returnedUnusedGoodsRows
            );
            await archiveQuoteToDrive(
              drive,
              driveDestinationFolderId,
              productId,
              actualQuoteBuffer,
              [actualQuoteFileName]
            );
          }

          quoteGenerated = true;
        } catch (quoteErr) {
          productQuoteErrors.push({
            productId,
            error: quoteErr instanceof Error ? quoteErr.message : String(quoteErr),
          });
        }
      }
    } catch (err) {
      productErrors.push({ productId, error: err instanceof Error ? err.message : String(err) });
    }
    return {
      productId,
      status,
      errors: productErrors,
      driveSyncErrors: productDriveSyncErrors,
      tagOverrideApplied: parsed.tags.length > 0,
      quoteGenerated,
      quoteErrors: productQuoteErrors,
    };
  };

  const outcomes = await mapConcurrent(
    htmlFiles,
    PRODUCT_IMPORT_CONCURRENCY,
    processLocalHtml
  );

  for (const outcome of outcomes) {
    switch (outcome.status) {
      case "CREATE":
        created++;
        break;
      case "UPDATE":
        updated++;
        break;
      case "SKIP":
        skipped++;
        break;
    }
    if (outcome.tagOverrideApplied) tagOverridesApplied++;
    if (outcome.quoteGenerated) quotesGenerated++;
    errors.push(...outcome.errors);
    driveSyncErrors.push(...outcome.driveSyncErrors);
    quoteErrors.push(...outcome.quoteErrors);
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // leave temp files for OS cleanup
  }

  return {
    created,
    updated,
    skipped,
    errored: errors.length,
    total: htmlFiles.length,
    errors: htmlFiles.length === 0
      ? [{ productId: "local-folder", error: "No .html files found in the local folder." }]
      : errors,
    driveSyncErrors,
    tagOverridesApplied,
    quotesGenerated,
    quoteErrors,
  };
}

type ProductImportGroup = {
  productId: string;
  excelFile: DriveFile | null;
  images: DriveFile[];
};

type RunProductImportOptions = {
  folderId?: string;
  tempDir?: string;
  includeNestedFolders?: boolean;
  mergeTagsFromHtml?: boolean;
  useProductHtmlStyleList?: boolean;
  tagHtmlFileIds?: string[];
  manifestDocFileIds?: string[];
};

function findProductIdForImportFile(file: DriveFile, oneClickImport: boolean): string | null {
  if (oneClickImport) {
    const parentStyle = findStyleInValues([...(file.pathParts ?? [])].reverse());
    if (parentStyle) return parentStyle;
  }
  const productId = extractProductId(file.name);
  if (!oneClickImport || looksLikeProductId(productId)) return productId;
  return null;
}

function imageMatchesProductId(imageName: string, productId: string): boolean {
  return extractProductId(imageName).toUpperCase() === productId.toUpperCase();
}

function sortProductImagesForImport(
  images: { path: string; name: string }[],
  productId: string
): void {
  images.sort((a, b) => {
    const aMatches = imageMatchesProductId(a.name, productId);
    const bMatches = imageMatchesProductId(b.name, productId);
    if (aMatches !== bMatches) return aMatches ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function mergeTagMaps(target: Map<string, string[]>, source: Map<string, string[]>): void {
  for (const [productId, tags] of source) {
    if (tags.length > 0) target.set(productId, tags);
  }
}

function getImportSheetData(
  productRows: Map<string, Record<string, string>>,
  productId: string
): Record<string, string> | undefined {
  const direct = productRows.get(productId);
  if (direct) return direct;
  const upperProductId = productId.toUpperCase();
  for (const [candidateProductId, data] of productRows) {
    if (candidateProductId.toUpperCase() === upperProductId) return data;
  }
  return undefined;
}

export async function runProductImport(options: RunProductImportOptions): Promise<RunProductImportResult> {
  const tempDir = options.tempDir ?? path.join(os.tmpdir(), `ivory-import-${Date.now()}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const adminApp = getFirebaseAdmin();
  const db = adminApp.firestore();
  const bucket = adminApp.storage().bucket();
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth: auth as Parameters<typeof google.drive>[0]["auth"] });

  const stats: RunProductImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errored: 0,
    total: 0,
    errors: [],
    driveSyncErrors: [],
  };
  const oneClickImport = Boolean(options.includeNestedFolders || options.mergeTagsFromHtml || options.useProductHtmlStyleList);

  const manifestLinks = options.manifestDocFileIds?.length
    ? await readManifestLinksFromGoogleDocs(drive, options.manifestDocFileIds)
    : { folderIds: [], htmlFileIds: [], excelFileIds: [] };
  const folderId = options.folderId ?? manifestLinks.folderIds[0];
  if (!folderId) {
    throw new Error("No Google Drive import folder found. Add a folder link to the Google Doc or provide a folder link.");
  }

  console.log("[import-products] run start", {
    folderId,
    manifestDocs: options.manifestDocFileIds?.length ?? 0,
    manifestFolders: manifestLinks.folderIds.length,
    manifestHtmlFiles: manifestLinks.htmlFileIds.length,
    manifestExcelFiles: manifestLinks.excelFileIds.length,
    tempDir,
    productConcurrency: PRODUCT_IMPORT_CONCURRENCY,
    imageConcurrency: PRODUCT_IMPORT_IMAGE_CONCURRENCY,
    oneClickImport,
    at: new Date().toISOString(),
  });

  const files = options.includeNestedFolders
    ? await listDriveFilesRecursive(drive, folderId)
    : await listDriveFiles(drive, folderId);
  if (manifestLinks.excelFileIds.length > 0) {
    const manifestExcelFiles = await mapConcurrent<string, DriveFile | null>(manifestLinks.excelFileIds, 4, async (fileId) => {
      try {
        const metadata = await getDriveFileMetadata(drive, fileId);
        return isExcelFile(metadata) ? { ...metadata, pathParts: ["manifest-doc"] } : null;
      } catch {
        return null;
      }
    });
    files.push(...manifestExcelFiles.filter((file): file is DriveFile => Boolean(file)));
  }
  const productMap = new Map<string, ProductImportGroup>();
  const htmlFiles = files.filter((file) => file.mimeType !== DRIVE_FOLDER_MIME && isHtmlFile(file));
  const tagOverrides = new Map<string, string[]>();
  const productRowsFromHtml = new Map<string, Record<string, string>>();

  const linkedHtmlFileIds = [...(options.tagHtmlFileIds ?? []), ...manifestLinks.htmlFileIds];
  if (oneClickImport && linkedHtmlFileIds.length) {
    const extraTagHtmlFiles = await mapConcurrent(Array.from(new Set(linkedHtmlFileIds)), 3, async (fileId) => {
      const metadata = await getDriveFileMetadata(drive, fileId);
      return { ...metadata, pathParts: ["external-tag-html"] };
    });
    htmlFiles.push(...extraTagHtmlFiles);
  }

  if (oneClickImport && htmlFiles.length > 0) {
    const parsedHtmlFiles = await mapConcurrent(htmlFiles, 3, async (file) => {
      const buffer = await downloadFileToBuffer(drive, file.id, file.mimeType);
      const html = buffer.toString("utf8");
      const lowerName = file.name.toLowerCase();
      const forceTagFile = file.pathParts?.includes("external-tag-html") || lowerName.includes("tag");
      const richData = readRichImportDataFromHtml(html);
      return {
        productRows: options.useProductHtmlStyleList && !forceTagFile
          ? richData.productRows
          : new Map<string, Record<string, string>>(),
        tags: options.mergeTagsFromHtml && forceTagFile
          ? richData.tags
          : new Map<string, string[]>(),
      };
    });
    for (const parsed of parsedHtmlFiles) {
      for (const [productId, productData] of parsed.productRows) {
        productRowsFromHtml.set(productId, productData);
      }
      mergeTagMaps(tagOverrides, parsed.tags);
    }
    stats.tagOverridesApplied = tagOverrides.size;
  }

  for (const productId of productRowsFromHtml.keys()) {
    productMap.set(productId, { productId, excelFile: null, images: [] });
  }

  const ungroupedExcelFiles: DriveFile[] = [];
  for (const file of files) {
    if (file.mimeType === DRIVE_FOLDER_MIME || isHtmlFile(file)) continue;
    const productId = findProductIdForImportFile(file, oneClickImport);
    if (!productId) {
      if (isExcelFile(file)) ungroupedExcelFiles.push(file);
      continue;
    }
    if (!productMap.has(productId)) {
      productMap.set(productId, { productId, excelFile: null, images: [] });
    }
    const entry = productMap.get(productId)!;
    const mime = file.mimeType || "";
    if (isExcelFile(file)) {
      entry.excelFile = file;
    } else if (mime.startsWith("image/")) {
      entry.images.push(file);
    }
  }

  if (productMap.size === 1 && ungroupedExcelFiles.length === 1) {
    const onlyProduct = Array.from(productMap.values())[0];
    if (!onlyProduct.excelFile) onlyProduct.excelFile = ungroupedExcelFiles[0];
  }

  for (const [productId, product] of productMap) {
    if (product.excelFile) continue;
    const cadFileId = findCadFileIdInImportSheetData(getImportSheetData(productRowsFromHtml, productId));
    if (!cadFileId) continue;
    try {
      const cadFile = await getDriveFileMetadata(drive, cadFileId);
      if (isExcelFile(cadFile)) {
        product.excelFile = cadFile;
      }
    } catch (err) {
      stats.driveSyncErrors.push({
        productId,
        error: `CAD details lookup: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  stats.total = productMap.size;
  console.log("[import-products] Drive listing done", {
    driveFileCount: files.length,
    productGroups: stats.total,
  });

  const processProductGroup = async (
    product: ProductImportGroup
  ): Promise<{
    status: ImportProductResult;
    productId: string;
    error?: string;
    driveSyncErrors: { productId: string; error: string }[];
  }> => {
    const { productId } = product;
    let excelPath: string | null = null;
    const imagePaths: DownloadedAssetImage[] = [];
    const productDriveSyncErrors: { productId: string; error: string }[] = [];

    try {
      const productTempDir = validateAndSanitizePath(sanitizeFileName(productId), tempDir);
      if (!fs.existsSync(productTempDir)) fs.mkdirSync(productTempDir, { recursive: true });

      if (product.excelFile) {
        const safeName = sanitizeFileName(product.excelFile.name) || `${productId}.xlsx`;
        const relPath = path.join(sanitizeFileName(productId), safeName);
        excelPath = validateAndSanitizePath(relPath, tempDir);
        const excelDir = path.dirname(excelPath);
        if (!fs.existsSync(excelDir)) fs.mkdirSync(excelDir, { recursive: true });
        await downloadFileToPath(
          drive,
          product.excelFile.id,
          excelPath,
          product.excelFile.mimeType
        );
      }

      const downloadedImages = await mapConcurrent<DriveFile, DownloadedAssetImage | null>(
        product.images,
        PRODUCT_IMPORT_IMAGE_CONCURRENCY,
        async (imgFile, imgIndex) => {
          try {
            const safeName = sanitizeFileName(imgFile.name) || "image";
            const relPath = path.join(sanitizeFileName(productId), `${imgIndex}-${safeName}`);
            const imgPath = validateAndSanitizePath(relPath, tempDir);
            const imgDir = path.dirname(imgPath);
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
            await downloadFileToPath(drive, imgFile.id, imgPath, imgFile.mimeType);
            return {
              path: imgPath,
              name: imgFile.name,
              driveFileId: imgFile.id,
              ...(imgFile.mimeType ? { mimeType: imgFile.mimeType } : {}),
            };
          } catch (err) {
            console.error("[import-products] Image download failed", { productId, imgIndex, err });
            return null;
          }
        }
      );
      imagePaths.push(
        ...downloadedImages.filter((img): img is DownloadedAssetImage => Boolean(img))
      );

      const result = await processProduct(
        db,
        bucket,
        excelPath,
        productId,
        imagePaths,
        { tagOverride: tagOverrides.get(productId.toUpperCase()) }
      );
      console.log("[import-products] product", {
        productId,
        status: result.status,
        hasExcel: !!product.excelFile,
        imageCount: imagePaths.length,
        ...(result.error ? { error: result.error } : {}),
      });

      if (result.status === "CREATE" || result.status === "UPDATE") {
        try {
          await syncProductAssetsToDrive(
            drive,
            folderId,
            productId,
            excelPath,
            product.excelFile,
            imagePaths,
            productDriveSyncErrors
          );
        } catch (err) {
          console.error("[import-products] Drive sync unexpected error", { productId, err });
          productDriveSyncErrors.push({
            productId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { ...result, driveSyncErrors: productDriveSyncErrors };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[import-products] product failed (before/after Firestore)", {
        productId,
        error: msg,
      });
      return {
        status: "ERRORED",
        productId,
        error: msg,
        driveSyncErrors: productDriveSyncErrors,
      };
    } finally {
      try {
        if (excelPath && fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
        for (const img of imagePaths) {
          if (fs.existsSync(img.path)) fs.unlinkSync(img.path);
        }
      } catch (cleanupErr) {
        console.warn("[import-products] Cleanup failed", cleanupErr);
      }
    }
  };

  const outcomes = await mapConcurrent(
    Array.from(productMap.values()),
    PRODUCT_IMPORT_CONCURRENCY,
    processProductGroup
  );

  for (const outcome of outcomes) {
    switch (outcome.status) {
      case "CREATE":
        stats.created++;
        break;
      case "UPDATE":
        stats.updated++;
        break;
      case "SKIP":
        stats.skipped++;
        break;
      case "ERRORED":
        stats.errored++;
        if (outcome.error) stats.errors.push({ productId: outcome.productId, error: outcome.error });
        break;
    }
    stats.driveSyncErrors.push(...outcome.driveSyncErrors);
  }

  try {
    const dirContents = fs.readdirSync(tempDir, { withFileTypes: true });
    for (const d of dirContents) {
      if (d.isDirectory()) {
        const sub = path.join(tempDir, d.name);
        const filesInSub = fs.readdirSync(sub);
        for (const f of filesInSub) {
          fs.unlinkSync(path.join(sub, f));
        }
        fs.rmdirSync(sub);
      }
    }
  } catch {
    // leave temp dir for OS to clean
  }

  console.log("[import-products] run complete", {
    ...stats,
    at: new Date().toISOString(),
  });

  return stats;
}
