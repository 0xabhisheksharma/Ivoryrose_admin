import ExcelJS from "exceljs";
import { normalizeProductId } from "./drive";

export async function readTagsFromExcelBuffer(
  buffer: Buffer
): Promise<{ productId: string; tags: string[] }[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]
  );
  const sheetName = "375 tags";
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    const names = workbook.worksheets.map((ws) => ws.name).join(", ");
    throw new Error(`Worksheet "${sheetName}" not found. Available: ${names}`);
  }
  const rows: { productId: string; tags: string[] }[] = [];
  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const productIdCell = row.getCell(1);
    const tagsCell = row.getCell(2);
    let productId: string =
      productIdCell.value === null || productIdCell.value === undefined
        ? ""
        : typeof productIdCell.value === "object"
          ? (productIdCell.value as {
              result?: string;
              richText?: { text: string }[];
              text?: string;
            }).result ??
            (productIdCell.value as { richText?: { text: string }[] }).richText
              ?.map((rt) => rt.text)
              .join("") ??
            (productIdCell.value as { text?: string }).text ??
            ""
          : String(productIdCell.value);
    let tagsRaw: string =
      tagsCell.value === null || tagsCell.value === undefined
        ? ""
        : typeof tagsCell.value === "object"
          ? (tagsCell.value as { result?: string }).result ??
            (tagsCell.value as { richText?: { text: string }[] }).richText
              ?.map((rt) => rt.text)
              .join("") ??
            (tagsCell.value as { text?: string }).text ??
            ""
          : String(tagsCell.value);
    productId = String(productId || "").trim();
    tagsRaw = String(tagsRaw || "").trim();
    productId = normalizeProductId(productId);
    if (!productId && !tagsRaw) return;
    const tagsArray = tagsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    rows.push({ productId, tags: tagsArray });
  });
  return rows;
}
