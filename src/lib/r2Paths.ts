// Sanitize NSE index symbols: "NIFTY 50" → "NIFTY-50"
export const sanitizeSymbol = (sym: string) => sym.replace(/ /g, "-");

export type Interval = "day" | "15min" | "week" | "month";
export type InstrumentType = "EQ" | "FUT" | "OPT";

// Compute the list of partition keys (year or YYYY-MM) for a date range
function yearRange(start: Date, end: Date): string[] {
  const years: string[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    years.push(String(y));
  }
  return years;
}

function monthRange(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${y}-${m}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function equityKeys(
  symbol: string,
  interval: "day" | "15min",
  start: Date,
  end: Date
): string[] {
  const sym = sanitizeSymbol(symbol);
  if (interval === "day") {
    return yearRange(start, end).map(
      (y) => `NSE/EQ/${sym}/day/${y}.parquet`
    );
  }
  return monthRange(start, end).map(
    (m) => `NSE/EQ/${sym}/15min/${m}.parquet`
  );
}

export function futuresKeys(
  // full Kite tradingsymbol e.g. RELIANCE24JULFUT
  symbol: string,
  interval: "day" | "15min",
  start: Date,
  end: Date
): string[] {
  if (interval === "day") {
    return yearRange(start, end).map(
      (y) => `NFO/FUT/${symbol}/day/${y}.parquet`
    );
  }
  return monthRange(start, end).map(
    (m) => `NFO/FUT/${symbol}/15min/${m}.parquet`
  );
}

// Options are stored by underlying (NIFTY, BANKNIFTY, RELIANCE, …), day-only
export function optionsKeys(underlying: string, start: Date, end: Date): string[] {
  return yearRange(start, end).map(
    (y) => `NFO/OPT/${underlying}/day/${y}.parquet`
  );
}

export function instrumentSnapshotKey(date: string): string {
  return `instruments/snapshots/${date}.parquet`;
}
