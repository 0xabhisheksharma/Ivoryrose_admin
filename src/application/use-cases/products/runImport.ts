import type { ProductImportResult } from "@/domain/types";

/** One-click import usecase. Reads a local folder first; Drive support remains in the importer for older flows. */
export async function runImport(options: {
  folderId?: string;
  localFolderPath?: string;
  driveDestinationFolderId?: string;
  tempDir?: string;
}): Promise<ProductImportResult> {
  const { runLocalFolderProductImport, runProductImport } = await import(
    "@/infrastructure/importers/product-importer"
  );
  if (options.localFolderPath?.trim()) {
    return runLocalFolderProductImport({
      folderPath: options.localFolderPath.trim(),
      driveDestinationFolderId: options.driveDestinationFolderId,
    });
  }
  if (!options.folderId) {
    throw new Error("Please provide a local folder path.");
  }
  return runProductImport({
    ...options,
    folderId: options.folderId,
    includeNestedFolders: true,
    mergeTagsFromHtml: true,
    useProductHtmlStyleList: true,
  });
}
