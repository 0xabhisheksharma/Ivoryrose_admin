/**
 * Serialize a Firestore Timestamp (or a plain object form) into an ISO string.
 *
 * Handles:
 *  - Firestore Admin Timestamp instances (via `toMillis()` called with the
 *    correct `this` binding so it can read its private `_seconds`/`_nanoseconds`).
 *  - Plain serialized timestamp objects of the form
 *    `{ _seconds, _nanoseconds }` or `{ seconds, nanoseconds }`.
 *  - Native `Date` instances and ISO strings.
 *  - `null` / `undefined` (returns null).
 */
export function serializeTimestamp(v: unknown): string | null {
  if (v == null) return null;

  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? v.toISOString() : null;
  }

  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }

  if (typeof v === "object") {
    const obj = v as {
      toMillis?: () => number;
      _seconds?: number;
      seconds?: number;
      _nanoseconds?: number;
      nanoseconds?: number;
    };

    if (typeof obj.toMillis === "function") {
      try {
        const ms = obj.toMillis();
        if (typeof ms === "number" && Number.isFinite(ms)) {
          return new Date(ms).toISOString();
        }
      } catch {
        // fall through to the plain-object form below
      }
    }

    const sec = obj._seconds ?? obj.seconds;
    const nsec = obj._nanoseconds ?? obj.nanoseconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const ms =
        typeof nsec === "number" && Number.isFinite(nsec)
          ? sec * 1000 + nsec / 1e6
          : sec * 1000;
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
  }

  return null;
}
