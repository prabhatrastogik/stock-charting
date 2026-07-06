// F&O-specific indicators computed from options/futures data

export interface OIRow { timestamp: number; oi: number }
export interface OptionRow {
  timestamp: number;
  strike: number;
  option_type: "CE" | "PE";
  oi: number;
  volume: number;
  close: number;
}

// Escape single quotes to prevent SQL injection from user-supplied strings.
const esc = (s: string) => s.replace(/'/g, "''");

// Put/Call Ratio from daily options data grouped by date
export function pcrSQL(presignedUrls: string[], expiry?: string): string {
  const files = presignedUrls.map((u) => `'${u}'`).join(", ");
  const expiryFilter = expiry ? `AND expiry = '${esc(expiry)}'` : "";
  return `
SELECT
  timestamp,
  SUM(CASE WHEN option_type = 'PE' THEN oi ELSE 0 END)::DOUBLE /
    NULLIF(SUM(CASE WHEN option_type = 'CE' THEN oi ELSE 0 END), 0) AS pcr
FROM read_parquet([${files}])
WHERE 1=1 ${expiryFilter}
GROUP BY timestamp
ORDER BY timestamp
`;
}

// Options chain for a single expiry — returns all strikes × CE/PE
export function optionsChainSQL(presignedUrls: string[], expiry: string, date: number): string {
  const files = presignedUrls.map((u) => `'${u}'`).join(", ");
  const safeExpiry = esc(expiry);
  return `
WITH latest AS (
  SELECT *
  FROM read_parquet([${files}])
  WHERE expiry = '${safeExpiry}'
    AND timestamp = (
      SELECT MAX(timestamp) FROM read_parquet([${files}])
      WHERE expiry = '${safeExpiry}' AND timestamp <= ${date}
    )
),
prev AS (
  SELECT *
  FROM read_parquet([${files}])
  WHERE expiry = '${safeExpiry}'
    AND timestamp = (
      SELECT MAX(timestamp) FROM read_parquet([${files}])
      WHERE expiry = '${safeExpiry}' AND timestamp < (
        SELECT MAX(timestamp) FROM read_parquet([${files}])
        WHERE expiry = '${safeExpiry}' AND timestamp <= ${date}
      )
    )
)
SELECT
  l.strike,
  MAX(CASE WHEN l.option_type='CE' THEN l.close END)  AS ce_close,
  MAX(CASE WHEN l.option_type='CE' THEN l.volume END) AS ce_volume,
  MAX(CASE WHEN l.option_type='CE' THEN l.oi END)     AS ce_oi,
  MAX(CASE WHEN l.option_type='CE' THEN l.oi END) -
    MAX(CASE WHEN p.option_type='CE' THEN p.oi ELSE 0 END) AS ce_oi_chg,
  MAX(CASE WHEN l.option_type='PE' THEN l.close END)  AS pe_close,
  MAX(CASE WHEN l.option_type='PE' THEN l.volume END) AS pe_volume,
  MAX(CASE WHEN l.option_type='PE' THEN l.oi END)     AS pe_oi,
  MAX(CASE WHEN l.option_type='PE' THEN l.oi END) -
    MAX(CASE WHEN p.option_type='PE' THEN p.oi ELSE 0 END) AS pe_oi_chg
FROM latest l
LEFT JOIN prev p ON l.strike = p.strike AND l.option_type = p.option_type
GROUP BY l.strike
ORDER BY l.strike
`;
}

// Max pain: the strike where total ITM option value (writers' loss) is minimized
export function computeMaxPain(
  chain: Array<{ strike: number; ce_oi: number; pe_oi: number }>
): number {
  const strikes = chain.map((r) => r.strike).sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = strikes[0];

  for (const testStrike of strikes) {
    let pain = 0;
    for (const row of chain) {
      // Call writers lose when testStrike > strike (calls are ITM)
      if (testStrike > row.strike) pain += (testStrike - row.strike) * row.ce_oi;
      // Put writers lose when testStrike < strike (puts are ITM)
      if (testStrike < row.strike) pain += (row.strike - testStrike) * row.pe_oi;
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = testStrike; }
  }
  return maxPainStrike;
}

// Basis = spot_close - futures_close, one row per timestamp
export function basisSQL(
  spotUrls: string[],
  futUrls: string[],
  startUs: number,
  endUs: number
): string {
  const sf = spotUrls.map((u) => `'${u}'`).join(", ");
  const ff = futUrls.map((u) => `'${u}'`).join(", ");
  return `
SELECT s.timestamp,
  s.close - f.close AS basis
FROM (
  SELECT timestamp, close FROM read_parquet([${sf}])
  WHERE timestamp >= ${startUs} AND timestamp <= ${endUs}
) s
JOIN (
  SELECT timestamp, close FROM read_parquet([${ff}])
  WHERE timestamp >= ${startUs} AND timestamp <= ${endUs}
) f ON s.timestamp = f.timestamp
ORDER BY s.timestamp
`;
}
