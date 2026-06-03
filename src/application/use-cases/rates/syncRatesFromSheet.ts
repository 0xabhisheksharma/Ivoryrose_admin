import { parseSpreadsheetId, parseDriveFolderId } from "@/shared/utils/drive";
import { makeRateDocId } from "@/shared/utils/rate-key";
import { listDriveFiles, findSpreadsheetInFiles, getSheetsClient } from "@/infrastructure/services/drive";
import { encryptRsRate } from "@/infrastructure/services/encryption/rate-encryption";
import * as ratesRepo from "@/infrastructure/repositories/rates.repository";
import { RATE_SHEET_NAME } from "@/config";
import type { RateSyncResult } from "@/domain/types";

type MappedRateRow = {
  sourceRowNumber: number;
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: number | null;
};

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

function analyzeDeterministicRateKeyCollisions(rows: MappedRateRow[]): void {
  const rowsByKey = new Map<string, MappedRateRow[]>();
  for (const row of rows) {
    const key = makeRateDocId(row);
    const existing = rowsByKey.get(key);
    if (existing) existing.push(row);
    else rowsByKey.set(key, [row]);
  }

  const duplicates = Array.from(rowsByKey.entries()).filter(
    ([, duplicateRows]) => duplicateRows.length > 1
  );
  if (duplicates.length === 0) return;

  const collisionReport = duplicates.map(([key, duplicateRows]) => {
    const rateValues = new Set(
      duplicateRows.map((row) =>
        row.Rs_Rate === null ? "null" : String(row.Rs_Rate)
      )
    );
    return {
      key,
      sourceRowNumbers: duplicateRows.map((row) => row.sourceRowNumber),
      rows: duplicateRows.map((row) => ({
        sourceRowNumber: row.sourceRowNumber,
        TYP: row.TYP,
        SHP: row.SHP,
        Band: row.Band,
        Rs_Rate: row.Rs_Rate,
      })),
      hasDifferentRsRateValues: rateValues.size > 1,
    };
  });

  const conflicting = collisionReport.filter(
    (item) => item.hasDifferentRsRateValues
  );
  if (conflicting.length > 0) {
    console.error("[sync-rate] Deterministic Rate ID conflicts detected", {
      conflicts: conflicting,
    });
    throw new Error(
      `Rate sync aborted before deleting existing rates: ${conflicting.length} duplicate deterministic Rate key(s) have different Rs_Rate values.`
    );
  }

  console.warn("[sync-rate] Duplicate deterministic Rate keys detected", {
    duplicates: collisionReport,
  });
}

function buildDeterministicRateWrites(rows: MappedRateRow[]): {
  rateId: string;
  TYP: string;
  SHP: string;
  Band: string;
  Rs_Rate: string | null;
}[] {
  const writesByRateId = new Map<
    string,
    {
      rateId: string;
      TYP: string;
      SHP: string;
      Band: string;
      Rs_Rate: string | null;
    }
  >();

  for (const row of rows) {
    const rateId = makeRateDocId(row);
    if (writesByRateId.has(rateId)) continue;
    writesByRateId.set(rateId, {
      rateId,
      TYP: row.TYP,
      SHP: row.SHP,
      Band: row.Band,
      Rs_Rate: encryptRsRate(row.Rs_Rate),
    });
  }

  return Array.from(writesByRateId.values());
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
  const mapped: MappedRateRow[] = [];
  let skipped = 0;
  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    if (isEmptyRow(row)) {
      skipped += 1;
      continue;
    }
    const doc = mapRow(row);
    if (doc.Rs_Rate === null && !doc.TYP && !doc.SHP && !doc.Band) {
      skipped += 1;
      continue;
    }
    mapped.push({ ...doc, sourceRowNumber: index + 2 });
  }
  analyzeDeterministicRateKeyCollisions(mapped);
  const deleted = await ratesRepo.deleteAllRates();
  const toWrite = buildDeterministicRateWrites(mapped);
  const written = await ratesRepo.createRatesWithIds(toWrite);
  return {
    deleted,
    written,
    total: mapped.length,
    skipped,
  };
}
