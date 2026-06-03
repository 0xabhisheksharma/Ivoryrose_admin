export type RateKeyInput = {
  TYP?: unknown;
  SHP?: unknown;
  Band?: unknown;
};

export function normalizeRateKeyPart(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function makeRateDocId(input: RateKeyInput): string {
  const typ = normalizeRateKeyPart(input.TYP);
  const shp = normalizeRateKeyPart(input.SHP);
  const band = normalizeRateKeyPart(input.Band);
  return `typ=${encodeURIComponent(typ)}__shp=${encodeURIComponent(shp)}__band=${encodeURIComponent(band)}`;
}
