import * as productsRepo from "@/infrastructure/repositories/products.repository";
import {
  listDriveFiles,
  findTagsExcelFile,
  downloadFileToBuffer,
  getDriveFileMetadata,
} from "@/infrastructure/services/drive";
import { readTagsFromExcelBuffer } from "@/shared/utils/excel";
import { parseDriveFolderId, parseSpreadsheetId } from "@/shared/utils/drive";
import type { SyncResult } from "@/domain/types";

async function syncTagsFromRows(
  rows: { productId: string; tags: string[] }[]
): Promise<SyncResult> {
  const stats: SyncResult = {
    total: 0,
    updated: 0,
    skipped: 0,
    not_found: 0,
    errors: 0,
    errors_list: [],
  };
  if (rows.length === 0) return stats;
  stats.total = rows.length;
  const validRows: { productId: string; tags: string[] }[] = [];
  for (const { productId, tags } of rows) {
    if (!productId) continue;
    if (!tags || tags.length === 0) {
      stats.skipped++;
      continue;
    }
    validRows.push({ productId, tags });
  }
  const result = await productsRepo.updateProductTagsBulk(validRows);
  stats.updated += result.updated;
  stats.skipped += result.skipped;
  stats.not_found += result.not_found;
  stats.errors += result.errors.length;
  stats.errors_list.push(...result.errors);
  return stats;
}

export async function syncTagsFromDrive(folderId: string): Promise<SyncResult> {
  const files = await listDriveFiles(folderId);
  const targetFile = findTagsExcelFile(files);
  if (!targetFile) {
    throw new Error("No Excel file found in Google Drive folder");
  }
  const buffer = await downloadFileToBuffer(
    targetFile.id,
    targetFile.mimeType
  );
  const rows = await readTagsFromExcelBuffer(buffer);
  return syncTagsFromRows(rows);
}

export async function syncTagsFromFile(fileId: string): Promise<SyncResult> {
  const targetFile = await getDriveFileMetadata(fileId);
  const buffer = await downloadFileToBuffer(targetFile.id, targetFile.mimeType);
  const rows = await readTagsFromExcelBuffer(buffer);
  return syncTagsFromRows(rows);
}

export async function syncTagsFromDriveLink(driveLink: string): Promise<SyncResult> {
  const spreadsheetId = parseSpreadsheetId(driveLink);
  if (spreadsheetId) {
    return syncTagsFromFile(spreadsheetId);
  }
  const folderId = parseDriveFolderId(driveLink);
  if (!folderId) {
    throw new Error("Invalid Google Drive link. Use a spreadsheet link or a Drive folder link.");
  }
  return syncTagsFromDrive(folderId);
}
