import crypto from "crypto";
import { RATE_ENCRYPTION_KEY } from "@/config";

function getEncryptionKey(): Buffer {
  const raw = RATE_ENCRYPTION_KEY;
  if (!raw || typeof raw !== "string") {
    throw new Error(
      "RATE_ENCRYPTION_KEY is required: set a 32-byte key as 64 hex characters or 44 base64 characters"
    );
  }
  const s = raw.trim();
  let buf: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    buf = Buffer.from(s, "hex");
  } else if (s.length === 44) {
    try {
      buf = Buffer.from(s, "base64");
    } catch {
      buf = null;
    }
  }
  if (!buf || buf.length !== 32) {
    throw new Error(
      "RATE_ENCRYPTION_KEY must be 32 bytes: use 64 hex characters or 44 base64 characters"
    );
  }
  return buf;
}

export function encryptRsRate(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  const key = getEncryptionKey();
  const serialized = JSON.stringify(value);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(serialized, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}

export function decryptRsRate(encrypted: unknown): number | null {
  if (encrypted === null || encrypted === undefined || encrypted === "")
    return null;
  // Legacy rows may store Rs_Rate as a plain number rather than an encrypted
  // base64 string.
  if (typeof encrypted === "number") {
    return Number.isFinite(encrypted) ? encrypted : null;
  }
  if (typeof encrypted !== "string") return null;
  // getEncryptionKey() throws on missing/invalid config; let it propagate so
  // the API surface returns a 500 with a clear message instead of silently
  // showing every row as null in the admin UI.
  const key = getEncryptionKey();
  try {
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < 17) return null;
    const iv = buf.subarray(0, 16);
    const ciphertext = buf.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as unknown;
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
