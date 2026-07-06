// SQL builder functions for overlay (on-chart) indicators.
// Each returns a WITH clause fragment to be composed into the main query.

export function smaCTE(period: number): string {
  return `
sma_${period} AS (
  SELECT timestamp,
    AVG(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS value
  FROM candles
)`;
}

export function emaCTE(period: number): string {
  // DuckDB doesn't have a built-in EMA window, so we use a recursive approach via a scalar UDF.
  // Instead, approximate with exponential weights using a materialized approach.
  // For correctness we compute it iteratively in a recursive CTE.
  const k = (2 / (period + 1)).toFixed(10);
  return `
ema_${period}_base AS (
  SELECT timestamp, close,
    ROW_NUMBER() OVER (ORDER BY timestamp) AS rn
  FROM candles
),
ema_${period} AS (
  SELECT timestamp, close AS value, rn
  FROM ema_${period}_base WHERE rn = 1
  UNION ALL
  SELECT b.timestamp,
    b.close * ${k} + e.value * (1 - ${k}),
    b.rn
  FROM ema_${period}_base b
  JOIN ema_${period} e ON b.rn = e.rn + 1
)`;
}

export function bollingerCTE(period = 20, multiplier = 2): string {
  return `
bb_${period} AS (
  SELECT timestamp,
    AVG(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS middle,
    AVG(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW)
      + ${multiplier} * STDDEV_POP(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS upper,
    AVG(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW)
      - ${multiplier} * STDDEV_POP(close) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS lower
  FROM candles
)`;
}

export function vwapCTE(): string {
  // VWAP resets daily; meaningful only for intraday (15min) data
  return `
vwap AS (
  SELECT timestamp,
    SUM(((high + low + close) / 3.0) * volume) OVER (
      PARTITION BY DATE_TRUNC('day', epoch_ms(CAST(timestamp / 1000 AS BIGINT))::TIMESTAMP)
      ORDER BY timestamp
    ) /
    NULLIF(SUM(volume) OVER (
      PARTITION BY DATE_TRUNC('day', epoch_ms(CAST(timestamp / 1000 AS BIGINT))::TIMESTAMP)
      ORDER BY timestamp
    ), 0) AS value
  FROM candles
)`;
}

// Parabolic SAR — computed client-side after query (stateful, hard to express in SQL window fns)
// Returns a placeholder CTE; actual values computed in sarCompute()
export function sarPlaceholder(): string {
  return `sar AS (SELECT timestamp, NULL::DOUBLE AS value FROM candles)`;
}

// Called after DuckDB returns OHLC rows; computes SAR iteratively
export interface OHLCRow { timestamp: number; open: number; high: number; low: number; close: number }
export function computeSAR(
  rows: OHLCRow[],
  step = 0.02,
  max = 0.2
): Array<{ timestamp: number; value: number }> {
  if (!rows.length) return [];
  let bull = true;
  let af = step;
  let ep = rows[0].low;
  let sar = rows[0].high;
  const out: Array<{ timestamp: number; value: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const { timestamp, high, low } = rows[i];
    if (i > 0) {
      sar = sar + af * (ep - sar);
      if (bull) {
        if (low < sar) { bull = false; sar = ep; ep = low; af = step; }
        else { if (high > ep) { ep = high; af = Math.min(af + step, max); } }
      } else {
        if (high > sar) { bull = true; sar = ep; ep = high; af = step; }
        else { if (low < ep) { ep = low; af = Math.min(af + step, max); } }
      }
    } else {
      ep = bull ? high : low;
    }
    out.push({ timestamp, value: sar });
  }
  return out;
}
