/** Parse Google Drive folder ID from link or return plain ID. Returns null if invalid. */
export function parseDriveFolderId(input: string): string | null {
  const trimmed = (input || "").trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;

  const foldersMatch = trimmed.match(
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/
  );
  if (foldersMatch) return foldersMatch[1];

  const mobileFoldersMatch = trimmed.match(
    /drive\.google\.com\/drive\/mobile\/folders\/([a-zA-Z0-9_-]+)/
  );
  if (mobileFoldersMatch) return mobileFoldersMatch[1];

  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Parse spreadsheet ID from docs.google.com/spreadsheets/d/ID URL. */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
  );
  return m ? m[1] : null;
}

/** Parse Google Docs document ID from a docs URL or return a plain ID. */
export function parseGoogleDocId(input: string): string | null {
  const trimmed = (input || "").trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;

  const docMatch = trimmed.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
  );
  if (docMatch) return docMatch[1];

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Parse Google Drive file ID from a file URL, open?id URL, or return plain ID. */
export function parseDriveFileId(input: string): string | null {
  const trimmed = (input || "").trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;

  const fileMatch = trimmed.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/
  );
  if (fileMatch) return fileMatch[1];

  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

export function normalizeProductId(productId: string): string {
  if (!productId || typeof productId !== "string") return productId;
  const parts = productId.split("-");
  if (parts.length === 2) {
    return `${parts[0]}-${parts[1].toUpperCase()}`;
  }
  return productId;
}
