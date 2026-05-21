import type { ProductImportResult } from "@/domain/types";

/**
 * Product import usecase. Delegates to the existing import implementation
 * until the importer can be split further into smaller infrastructure services.
 * API route and config pass folderId; default folder from config when needed.
 */
export async function runProductImport(options: {
  folderId: string;
  tempDir?: string;
}): Promise<ProductImportResult> {
  const { runProductImport: runImport } = await import(
    "@/infrastructure/importers/product-importer"
  );
  return runImport(options);
}
