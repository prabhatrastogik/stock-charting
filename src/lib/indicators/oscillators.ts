// SQL builder functions for oscillator sub-pane indicators.

export function rsiCTE(period = 14): string {
  return `
rsi_gain_loss AS (
  SELECT timestamp, close,
    GREATEST(close - LAG(close) OVER (ORDER BY timestamp), 0) AS gain,
    GREATEST(LAG(close) OVER (ORDER BY timestamp) - close, 0) AS loss
  FROM candles
),
rsi_avg AS (
  SELECT timestamp,
    AVG(gain) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS avg_gain,
    AVG(loss) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS avg_loss
  FROM rsi_gain_loss
),
rsi AS (
  SELECT timestamp,
    CASE WHEN avg_loss = 0 THEN 100
         ELSE 100 - (100 / (1 + avg_gain / NULLIF(avg_loss, 0)))
    END AS value
  FROM rsi_avg
)`;
}

export function macdCTE(fast = 12, slow = 26, signal = 9): string {
  // Uses DuckDB recursive EMA pattern for fast/slow, then signal line
  const kFast = (2 / (fast + 1)).toFixed(10);
  const kSlow = (2 / (slow + 1)).toFixed(10);
  const kSig = (2 / (signal + 1)).toFixed(10);
  return `
macd_base AS (
  SELECT timestamp, close, ROW_NUMBER() OVER (ORDER BY timestamp) AS rn FROM candles
),
ema_fast AS (
  SELECT timestamp, close AS value, rn FROM macd_base WHERE rn = 1
  UNION ALL
  SELECT b.timestamp, b.close * ${kFast} + e.value * (1 - ${kFast}), b.rn
  FROM macd_base b JOIN ema_fast e ON b.rn = e.rn + 1
),
ema_slow AS (
  SELECT timestamp, close AS value, rn FROM macd_base WHERE rn = 1
  UNION ALL
  SELECT b.timestamp, b.close * ${kSlow} + e.value * (1 - ${kSlow}), b.rn
  FROM macd_base b JOIN ema_slow e ON b.rn = e.rn + 1
),
macd_line AS (
  SELECT f.timestamp, f.value - s.value AS macd, ROW_NUMBER() OVER (ORDER BY f.timestamp) AS rn
  FROM ema_fast f JOIN ema_slow s ON f.timestamp = s.timestamp
),
macd_signal_base AS (
  SELECT timestamp, macd AS value, rn FROM macd_line WHERE rn = 1
  UNION ALL
  SELECT m.timestamp, m.macd * ${kSig} + sg.value * (1 - ${kSig}), m.rn
  FROM macd_line m JOIN macd_signal_base sg ON m.rn = sg.rn + 1
),
macd AS (
  SELECT m.timestamp,
    m.macd AS macd_line,
    sg.value AS signal_line,
    m.macd - sg.value AS histogram
  FROM macd_line m JOIN macd_signal_base sg ON m.timestamp = sg.timestamp
)`;
}

export function stochasticCTE(kPeriod = 14, dPeriod = 3): string {
  return `
stoch_k AS (
  SELECT timestamp,
    100 * (close - MIN(low) OVER (ORDER BY timestamp ROWS BETWEEN ${kPeriod - 1} PRECEDING AND CURRENT ROW)) /
    NULLIF(MAX(high) OVER (ORDER BY timestamp ROWS BETWEEN ${kPeriod - 1} PRECEDING AND CURRENT ROW) -
           MIN(low)  OVER (ORDER BY timestamp ROWS BETWEEN ${kPeriod - 1} PRECEDING AND CURRENT ROW), 0) AS k
  FROM candles
),
stochastic AS (
  SELECT timestamp, k,
    AVG(k) OVER (ORDER BY timestamp ROWS BETWEEN ${dPeriod - 1} PRECEDING AND CURRENT ROW) AS d
  FROM stoch_k
)`;
}

export function williamsCTE(period = 14): string {
  return `
williams AS (
  SELECT timestamp,
    -100 * (MAX(high) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) - close) /
    NULLIF(MAX(high) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) -
           MIN(low)  OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW), 0) AS value
  FROM candles
)`;
}

export function cciCTE(period = 20): string {
  // DuckDB forbids nested window functions in the same SELECT; materialize the
  // rolling mean first so the outer AVG(ABS(...)) can reference it by column name.
  return `
cci_tp AS (
  SELECT timestamp,
    (high + low + close) / 3.0 AS tp,
    AVG((high + low + close) / 3.0) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS mean_tp
  FROM candles
),
cci AS (
  SELECT timestamp,
    (tp - mean_tp) /
    (0.015 * NULLIF(
      AVG(ABS(tp - mean_tp)) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW),
    0)) AS value
  FROM cci_tp
)`;
}

export function atrCTE(period = 14): string {
  return `
tr AS (
  SELECT timestamp,
    GREATEST(
      high - low,
      ABS(high - LAG(close) OVER (ORDER BY timestamp)),
      ABS(low  - LAG(close) OVER (ORDER BY timestamp))
    ) AS tr
  FROM candles
),
atr AS (
  SELECT timestamp,
    AVG(tr) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS value
  FROM tr
)`;
}

export function adxCTE(period = 14): string {
  return `
adx_dm AS (
  SELECT timestamp,
    GREATEST(high - LAG(high) OVER (ORDER BY timestamp), 0) AS pdm,
    GREATEST(LAG(low) OVER (ORDER BY timestamp) - low, 0)   AS ndm,
    GREATEST(high - low,
      ABS(high - LAG(close) OVER (ORDER BY timestamp)),
      ABS(low  - LAG(close) OVER (ORDER BY timestamp))) AS tr
  FROM candles
),
adx_smoothed AS (
  SELECT timestamp,
    AVG(pdm) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS pdm_s,
    AVG(ndm) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS ndm_s,
    AVG(tr)  OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) AS tr_s
  FROM adx_dm
),
adx_di AS (
  SELECT timestamp,
    100 * pdm_s / NULLIF(tr_s, 0) AS pdi,
    100 * ndm_s / NULLIF(tr_s, 0) AS ndi
  FROM adx_smoothed
),
adx AS (
  SELECT timestamp, pdi, ndi,
    AVG(100 * ABS(pdi - ndi) / NULLIF(pdi + ndi, 0)) OVER (
      ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
    ) AS adx
  FROM adx_di
)`;
}

export function obvCTE(): string {
  return `
obv AS (
  SELECT timestamp,
    SUM(CASE
      WHEN close > LAG(close) OVER (ORDER BY timestamp) THEN volume
      WHEN close < LAG(close) OVER (ORDER BY timestamp) THEN -volume
      ELSE 0 END
    ) OVER (ORDER BY timestamp) AS value
  FROM candles
)`;
}

export function mfiCTE(period = 14): string {
  return `
mfi_tp AS (
  SELECT timestamp, (high + low + close) / 3.0 AS tp, volume FROM candles
),
mfi_flow AS (
  SELECT timestamp,
    CASE WHEN tp > LAG(tp) OVER (ORDER BY timestamp) THEN tp * volume ELSE 0 END AS pos_flow,
    CASE WHEN tp < LAG(tp) OVER (ORDER BY timestamp) THEN tp * volume ELSE 0 END AS neg_flow
  FROM mfi_tp
),
mfi AS (
  SELECT timestamp,
    100 * SUM(pos_flow) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) /
    NULLIF(
      SUM(pos_flow) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW) +
      SUM(neg_flow) OVER (ORDER BY timestamp ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW),
    0) AS value
  FROM mfi_flow
)`;
}
