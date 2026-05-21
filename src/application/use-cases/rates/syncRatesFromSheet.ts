import { parseSpreadsheetId, parseDriveFolderId } from "@/shared/utils/drive";
import { listDriveFiles, findSpreadsheetInFiles, getSheetsClient } from "@/infrastructure/services/drive";
import { encryptRsRate } from "@/infrastructure/services/encryption/rate-encryption";
import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { RATE_SHEET_NAME } from "@/config";
import type { RateSyncResult } from "@/domain/types";

function parseRsRate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const s = String(value).trim().replace(/,/g, "");
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function isEmptyRow(row: unknown[]): boolean {
  const e = row[0];
  const f = row[1];
  const g = row[2];
  const j = row[5];
  return (
    (e === undefined || e === null || String(e).trim() === "") &&
    (f === undefined || f === null || String(f).trim() === "") &&
    (g === undefined || g === null || String(g).trim() === "") &&
    (j === undefined || j === null || String(j).trim() === "")
  );
}

function mapRow(row: unknown[]): {
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: number | null;
} {
  const typ = row[0] != null ? String(row[0]).trim() : "";
  const shp = row[1] != null ? String(row[1]).trim() : "";
  const band = row[2] != null ? String(row[2]).trim() : "";
  const rsRate = parseRsRate(row[5]);
  return { TYP: typ, SHP: shp, Band: band, Rs_Rate: rsRate };
}

export async function syncRatesFromSheet(
  driveLink: string
): Promise<RateSyncResult> {
  let spreadsheetId: string | null = parseSpreadsheetId(driveLink);
  if (!spreadsheetId) {
    const folderId = parseDriveFolderId(driveLink);
    if (!folderId) {
      throw new Error(
        "Invalid Google Drive link. Use a spreadsheet link or a Drive folder link."
      );
    }
    const files = await listDriveFiles(folderId);
    const sheet = findSpreadsheetInFiles(files);
    if (!sheet) {
      throw new Error("No Google Sheet found in the specified folder.");
    }
    spreadsheetId = sheet.id;
  }
  const sheets = getSheetsClient();
  const range = `${RATE_SHEET_NAME}!E2:J2000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rawRows = (res.data.values || []) as unknown[][];
  const mapped: { TYP: string; SHP: string; Band: string; Rs_Rate: number | null }[] = [];
  let skipped = 0;
  for (const row of rawRows) {
    if (isEmptyRow(row)) {
      skipped += 1;
      continue;
    }
    const doc = mapRow(row);
    if (doc.Rs_Rate === null && !doc.TYP && !doc.SHP && !doc.Band) {
      skipped += 1;
      continue;
    }
    mapped.push(doc);
  }
  const deleted = await ratesRepo.deleteAllRates();
  const toWrite = mapped.map((doc) => ({
    TYP: doc.TYP,
    SHP: doc.SHP,
    Band: doc.Band,
    Rs_Rate: encryptRsRate(doc.Rs_Rate),
  }));
  const written = await ratesRepo.createRates(toWrite);
  return {
    deleted,
    written,
    total: mapped.length,
    skipped,
  };
}
