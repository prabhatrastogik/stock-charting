import { instrumentSnapshotKey } from "./r2Paths";
import { buildUrl } from "./presign";

export interface InstrumentRecord {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrument_type: string;
  segment: string;
  expiry: string;
  strike: number;
  lot_size: number;
  tick_size: number;
}

const CACHE_KEY = "instruments_cache";
const CACHE_DATE_KEY = "instruments_cache_date";

let memCache: InstrumentRecord[] | null = null;

// Probes recent dates with real HEAD requests to verify the file actually exists on R2.
// presignKeys() only builds a URL — it never validates existence.
async function findLatestSnapshotDate(): Promise<string | null> {
  // Check the last 5 days concurrently (covers long weekends + public holidays).
  // All requests fire at once so resolution is one round-trip, not N sequential ones.
  const candidates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000);
    return d.toISOString().slice(0, 10);
  });

  const results = await Promise.all(
    candidates.map(async (dateStr) => {
      try {
        const resp = await fetch(buildUrl(instrumentSnapshotKey(dateStr)), { method: "HEAD" });
        return resp.ok ? dateStr : null;
      } catch {
        return null;
      }
    })
  );

  return results.find((r) => r !== null) ?? null;
}

export async function loadInstruments(
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>
): Promise<InstrumentRecord[]> {
  if (memCache) return memCache;

  // localStorage cache valid for the same calendar day
  const today = new Date().toISOString().slice(0, 10);
  const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
  const cachedData = localStorage.getItem(CACHE_KEY);
  if (cachedDate === today && cachedData) {
    try {
      memCache = JSON.parse(cachedData);
      return memCache!;
    } catch {
      // Corrupt cache entry — fall through to reload
    }
  }

  const date = await findLatestSnapshotDate();
  if (!date) return (memCache = []);
  const url = buildUrl(instrumentSnapshotKey(date));
  const rows = await executeQuery(
    `SELECT * FROM read_parquet('${url}') ORDER BY tradingsymbol`
  );

  memCache = rows as unknown as InstrumentRecord[];
  localStorage.setItem(CACHE_DATE_KEY, today);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    // Storage quota exceeded — skip caching
  }
  return memCache;
}

export function searchInstruments(
  instruments: InstrumentRecord[],
  query: string,
  type?: "EQ" | "FUT" | "OPT"
): InstrumentRecord[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];

  return instruments
    .filter((inst) => {
      if (type === "EQ") return inst.exchange === "NSE" && (inst.instrument_type === "EQ" || inst.segment === "INDICES");
      if (type === "FUT") return inst.instrument_type === "FUT";
      if (type === "OPT") return inst.instrument_type === "CE" || inst.instrument_type === "PE";
      return true;
    })
    .filter(
      (inst) =>
        inst.tradingsymbol.includes(q) ||
        inst.name.toUpperCase().includes(q)
    )
    .slice(0, 50);
}

// Get unique underlyings for OPT type (for options chain)
export function getOptionUnderlyings(instruments: InstrumentRecord[]): string[] {
  const underlyings = new Set<string>();
  instruments
    .filter((i) => i.instrument_type === "CE" || i.instrument_type === "PE")
    .forEach((i) => underlyings.add(i.name));
  return Array.from(underlyings).sort();
}

// Get unique expiry dates for an underlying (from instruments snapshot)
export function getExpiries(
  instruments: InstrumentRecord[],
  underlying: string
): string[] {
  const expiries = new Set<string>();
  instruments
    .filter(
      (i) =>
        i.name === underlying &&
        (i.instrument_type === "CE" || i.instrument_type === "PE") &&
        i.expiry
    )
    .forEach((i) => expiries.add(i.expiry));
  return Array.from(expiries).sort();
}
