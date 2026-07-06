// DuckDB SQL snippets for aggregating daily data into weekly / monthly OHLCV

// Returns [baseCTE, candlesCTE] as bare CTE fragments (no WITH keyword) so the
// caller can compose them with indicator CTEs in a single WITH clause, avoiding
// a nested WITH that DuckDB rejects.
export function buildAggregationCTEParts(
  sourceSQL: string,
  granularity: "week" | "month"
): [string, string] {
  const trunc = granularity === "week" ? "week" : "month";
  const baseCTE = `base AS (${sourceSQL})`;
  // Pre-compute the grouped period in a sub-select so 'timestamp' (raw µs column)
  // is renamed to 'ts' — avoids the DuckDB "column must appear in GROUP BY" binder
  // error that triggers when a raw column name matches the computed SELECT alias.
  const candlesCTE = `candles AS (
  SELECT
    period                       AS timestamp,
    FIRST(open  ORDER BY ts)     AS open,
    MAX(high)                    AS high,
    MIN(low)                     AS low,
    LAST(close  ORDER BY ts)     AS close,
    SUM(volume)                  AS volume,
    LAST(oi     ORDER BY ts)     AS oi
  FROM (
    SELECT
      timestamp  AS ts,
      open, high, low, close, volume, oi,
      (epoch_ms(DATE_TRUNC('${trunc}', epoch_ms(CAST(timestamp / 1000 AS BIGINT))::TIMESTAMP)) * 1000)::BIGINT AS period
    FROM base
  ) prep
  GROUP BY period
)`;
  return [baseCTE, candlesCTE];
}

// Standalone aggregation query (no indicator CTEs appended).
export function buildAggregationSQL(
  sourceSQL: string,
  granularity: "week" | "month"
): string {
  const [baseCTE, candlesCTE] = buildAggregationCTEParts(sourceSQL, granularity);
  return `WITH ${baseCTE},\n${candlesCTE}\nSELECT * FROM candles ORDER BY timestamp`;
}
