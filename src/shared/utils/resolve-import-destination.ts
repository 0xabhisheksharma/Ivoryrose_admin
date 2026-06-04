import {
  DEFAULT_IMPORT_DESTINATION_FOLDER_ID,
  DEFAULT_IMPORT_DESTINATION_FOLDER_LINK,
} from "@/constants/import-destination";
import { parseDriveFolderId } from "@/shared/utils/drive";

function configuredImportDestinationFolderId(): string {
  const linkOverride = process.env.IMPORT_DESTINATION_FOLDER_LINK?.trim();
  if (linkOverride) {
    const fromLink = parseDriveFolderId(linkOverride);
    if (fromLink) return fromLink;
  }

  const idOverride = process.env.IMPORT_DESTINATION_FOLDER_ID?.trim();
  if (idOverride) {
    const fromId = parseDriveFolderId(idOverride);
    if (fromId) return fromId;
  }

  return DEFAULT_IMPORT_DESTINATION_FOLDER_ID;
}

export function getDefaultImportDestinationFolderLink(): string {
  const linkOverride = process.env.IMPORT_DESTINATION_FOLDER_LINK?.trim();
  if (linkOverride && parseDriveFolderId(linkOverride)) {
    return linkOverride;
  }

  const idOverride = process.env.IMPORT_DESTINATION_FOLDER_ID?.trim();
  if (idOverride && parseDriveFolderId(idOverride)) {
    return `https://drive.google.com/drive/folders/${parseDriveFolderId(idOverride)}`;
  }

  return DEFAULT_IMPORT_DESTINATION_FOLDER_LINK;
}

/** Resolves the Shared Drive folder ID for local-folder import, falling back to the configured default. */
export function resolveImportDestinationFolderId(linkFromRequest?: string): string {
  const trimmed = linkFromRequest?.trim() ?? "";
  if (trimmed) {
    const parsed = parseDriveFolderId(trimmed);
    if (parsed) return parsed;
  }
  return configuredImportDestinationFolderId();
}

/** True when a non-empty request link was provided but could not be parsed as a folder ID. */
export function isInvalidImportDestinationLink(linkFromRequest?: string): boolean {
  const trimmed = linkFromRequest?.trim() ?? "";
  return trimmed.length > 0 && !parseDriveFolderId(trimmed);
}
