import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { LocalImportPreview } from "@/domain/types";
import { requireAdminPermission } from "@/infrastructure/auth/server-auth";
import { parseDriveFolderId } from "@/shared/utils/drive";

const MAX_SAMPLE_FILES = 6;

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

function scanLocalFolder(folderPath: string) {
  const resolved = path.resolve(normalizeLocalSystemPath(folderPath));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Local folder not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new Error(`Local path is not a folder: ${resolved}`);
  }

  const folderRoot = stat.isFile() ? path.dirname(resolved) : resolved;
  let totalFiles = 0;
  let folders = 0;
  let htmlFiles = 0;
  let zipFiles = 0;
  const sampleHtmlFiles: string[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        folders++;
        walk(entryPath);
        continue;
      }

      totalFiles++;
      if (/\.(html?|xhtml)$/i.test(entry.name)) {
        htmlFiles++;
        if (sampleHtmlFiles.length < MAX_SAMPLE_FILES) {
          sampleHtmlFiles.push(path.relative(folderRoot, entryPath) || entry.name);
        }
      }
      if (/\.zip$/i.test(entry.name)) zipFiles++;
    }
  };

  walk(folderRoot);
  return { folderRoot, totalFiles, folders, htmlFiles, zipFiles, sampleHtmlFiles };
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission(request, "imports.run");
  if (!auth.ok) return auth.response;

  try {
    let body: { localFolderPath?: string; driveDestinationFolderLink?: string } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // no body
    }

    const localFolderPath =
      typeof body.localFolderPath === "string" ? body.localFolderPath.trim() : "";
    const driveDestinationFolderLink =
      typeof body.driveDestinationFolderLink === "string"
        ? body.driveDestinationFolderLink.trim()
        : "";

    if (!localFolderPath) {
      return NextResponse.json({ error: "Please enter a local folder path." }, { status: 400 });
    }

    const scan = scanLocalFolder(localFolderPath);
    const driveDestinationFolderId = driveDestinationFolderLink
      ? parseDriveFolderId(driveDestinationFolderLink)
      : null;
    const warnings: string[] = [];

    if (scan.htmlFiles === 0) {
      warnings.push("No product HTML files were found in this folder.");
    }
    if (scan.zipFiles === 0) {
      warnings.push("No ZIP files were found; products may import without images.");
    }
    if (driveDestinationFolderLink && !driveDestinationFolderId) {
      warnings.push("The destination folder link does not look like a valid Drive folder link or ID.");
    }

    const preview: LocalImportPreview = {
      folderPath: scan.folderRoot,
      driveDestinationFolderId,
      totalFiles: scan.totalFiles,
      htmlFiles: scan.htmlFiles,
      zipFiles: scan.zipFiles,
      folders: scan.folders,
      estimatedProducts: scan.htmlFiles,
      warnings,
      sampleHtmlFiles: scan.sampleHtmlFiles,
    };

    return NextResponse.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
