import { QUOTE_GENERATOR_URL, QUOTE_INTERNAL_SECRET } from "@/config";

type QuoteGeneratorResponse = {
  success?: boolean;
  fileName?: string;
  fileData?: string;
  rowCount?: number;
  contentType?: string;
  error?: string;
  code?: string;
};

export interface GeneratedProductQuote {
  buffer: Buffer;
  fileName: string;
  rowCount: number;
  contentType: string;
}

/**
 * Calls the `generateQuoteInternal` Cloud Function to build a quotation
 * workbook for the given product. Authenticates with the shared internal
 * secret configured via env (QUOTE_INTERNAL_SECRET) so the importer can
 * invoke it server-to-server without a Firebase Auth user token.
 */
export async function generateProductQuote(
  productCode: string,
): Promise<GeneratedProductQuote> {
  if (!QUOTE_INTERNAL_SECRET) {
    throw new Error(
      "QUOTE_INTERNAL_SECRET is not configured; cannot generate quotation."
    );
  }
  if (!QUOTE_GENERATOR_URL) {
    throw new Error(
      "QUOTE_GENERATOR_URL is not configured; cannot generate quotation."
    );
  }

  let response: Response;
  try {
    response = await fetch(QUOTE_GENERATOR_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": QUOTE_INTERNAL_SECRET,
      },
      body: JSON.stringify({ productCode }),
    });
  } catch (err) {
    throw new Error(
      `Quote generator request failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  let parsed: QuoteGeneratorResponse | null = null;
  try {
    parsed = (await response.json()) as QuoteGeneratorResponse;
  } catch {
    // fall through to status-based error reporting below
  }

  if (!response.ok || !parsed?.success) {
    const errorMessage =
      parsed?.error ||
      `Quote generator returned HTTP ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  if (!parsed.fileData || !parsed.fileName) {
    throw new Error("Quote generator response is missing fileData/fileName.");
  }

  const buffer = Buffer.from(parsed.fileData, "base64");
  return {
    buffer,
    fileName: parsed.fileName,
    rowCount: parsed.rowCount ?? 0,
    contentType:
      parsed.contentType ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
