import { google } from "googleapis";
import { getGoogleAuth, getGoogleAuthWithSheets, TAGS_EXCEL_FILENAME } from "@/config";

export type DriveFile = { id: string; name: string; mimeType?: string };

export async function getDriveFileMetadata(
  fileId: string,
  auth?: ReturnType<typeof getGoogleAuth>
): Promise<DriveFile> {
  const authInstance = auth ?? getGoogleAuth();
  const drive = google.drive({ version: "v3", auth: authInstance });
  const response = await drive.files.get({
    fileId,
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });
  return response.data as DriveFile;
}

export async function listDriveFiles(
  folderId: string,
  auth?: ReturnType<typeof getGoogleAuth>
): Promise<DriveFile[]> {
  const authInstance = auth ?? getGoogleAuth();
  const drive = google.drive({ version: "v3", auth: authInstance });
  const allFiles: DriveFile[] = [];
  let pageToken: string | null = null;
  do {
    const params: {
      q: string;
      fields: string;
      orderBy: string;
      pageSize: number;
      pageToken?: string;
    } = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      orderBy: "name",
      pageSize: 1000,
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await drive.files.list(params);
    if (response.data.files?.length) {
      allFiles.push(...(response.data.files as DriveFile[]));
    }
    pageToken = response.data.nextPageToken ?? null;
  } while (pageToken);
  return allFiles;
}

export async function downloadFileToBuffer(
  fileId: string,
  mimeType: string | undefined,
  auth?: ReturnType<typeof getGoogleAuth>
): Promise<Buffer> {
  const authInstance = auth ?? getGoogleAuth();
  const drive = google.drive({ version: "v3", auth: authInstance });
  let response;
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    response = await drive.files.export(
      {
        fileId,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    );
  } else {
    response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
  }
  return Buffer.from(response.data as ArrayBuffer);
}

export function findTagsExcelFile(
  files: DriveFile[],
  tagsExcelFilename: string = TAGS_EXCEL_FILENAME
): DriveFile | null {
  const excelMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.google-apps.spreadsheet",
  ];
  const excelFiles = files.filter(
    (f) => f.mimeType && excelMimes.includes(f.mimeType)
  );
  if (excelFiles.length === 0) return null;
  const searchName = tagsExcelFilename.toLowerCase().replace(/\.xlsx?$/i, "");
  const target = excelFiles.find((f) => {
    const name = f.name.toLowerCase().replace(/\.xlsx?$/i, "");
    return (
      name === searchName ||
      name.includes(searchName) ||
      searchName.includes(name)
    );
  });
  if (target) return target;
  const styleTags = excelFiles.filter((f) =>
    f.name.toLowerCase().includes("style_tags")
  );
  if (styleTags.length > 0) return styleTags[0];
  const tags = excelFiles.filter((f) => f.name.toLowerCase().includes("tags"));
  if (tags.length > 0) return tags[0];
  return excelFiles[0];
}

export function findSpreadsheetInFiles(
  files: DriveFile[]
): { id: string } | null {
  const spreadsheetMime = "application/vnd.google-apps.spreadsheet";
  const sheet = files.find((f) => f.mimeType === spreadsheetMime);
  return sheet ? { id: sheet.id } : null;
}

export function getSheetsClient(auth?: ReturnType<typeof getGoogleAuthWithSheets>) {
  const authInstance = auth ?? getGoogleAuthWithSheets();
  return google.sheets({ version: "v4", auth: authInstance });
}
