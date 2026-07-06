import { equityKeys, futuresKeys, optionsKeys, type InstrumentType } from "./r2Paths";
import { presignKeys } from "./presign";
import { buildAggregationSQL, buildAggregationCTEParts } from "./aggregation";
import {
  smaCTE, emaCTE, bollingerCTE, vwapCTE,
} from "./indicators/overlap";
import {
  rsiCTE, macdCTE, stochasticCTE, williamsCTE,
  cciCTE, atrCTE, adxCTE, obvCTE, mfiCTE,
} from "./indicators/oscillators";
import type { IndicatorConfig } from "../store/chartStore";

export type Interval = "day" | "15min" | "week" | "month";

export interface CandleRow {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
  // indicator columns — present only if requested
  [key: string]: number | undefined;
}

// Convert µs UTC timestamp to seconds for klinecharts
export const toChartTime = (us: number) => Math.floor(us / 1_000_000);

export async function fetchCandles(
  symbol: string,
  instrumentType: InstrumentType,
  interval: Interval,
  start: Date,
  end: Date,
  overlays: IndicatorConfig[],
  subPanes: IndicatorConfig[],
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>
): Promise<CandleRow[]> {
  const startUs = start.getTime() * 1000;
  const endUs = end.getTime() * 1000;

  // 1. Resolve R2 partition keys
  const rawInterval: "day" | "15min" =
    interval === "week" || interval === "month" ? "day" : interval;

  let keys: string[];
  if (instrumentType === "EQ") {
    keys = equityKeys(symbol, rawInterval, start, end);
  } else if (instrumentType === "FUT") {
    keys = futuresKeys(symbol, rawInterval, start, end);
  } else {
    // OPT — underlying name is the symbol here
    keys = optionsKeys(symbol, start, end);
  }

  // 2. Get pre-signed URLs (cached)
  const urls = await presignKeys(keys);
  if (urls.length === 0) return [];
  const fileList = urls.map((u) => `'${u}'`).join(", ");

  // 3. Build indicator CTEs
  const ctes: string[] = [];
  const selectCols: string[] = [
    "c.timestamp", "c.open", "c.high", "c.low", "c.close", "c.volume", "c.oi",
  ];
  const joins: string[] = [];

  for (const ind of overlays) {
    switch (ind.id) {
      case "SMA": {
        const p = Number(ind.params.period ?? 20);
        ctes.push(smaCTE(p));
        selectCols.push(`sma_${p}.value AS sma_${p}`);
        joins.push(`LEFT JOIN sma_${p} ON c.timestamp = sma_${p}.timestamp`);
        break;
      }
      case "EMA": {
        const p = Number(ind.params.period ?? 21);
        ctes.push(emaCTE(p));
        selectCols.push(`ema_${p}.value AS ema_${p}`);
        joins.push(`LEFT JOIN ema_${p} ON c.timestamp = ema_${p}.timestamp`);
        break;
      }
      case "BB": {
        const p = Number(ind.params.period ?? 20);
        const m = Number(ind.params.multiplier ?? 2);
        ctes.push(bollingerCTE(p, m));
        selectCols.push(`bb_${p}.upper AS bb_upper`, `bb_${p}.middle AS bb_middle`, `bb_${p}.lower AS bb_lower`);
        joins.push(`LEFT JOIN bb_${p} ON c.timestamp = bb_${p}.timestamp`);
        break;
      }
      case "VWAP": {
        ctes.push(vwapCTE());
        selectCols.push("vwap.value AS vwap");
        joins.push("LEFT JOIN vwap ON c.timestamp = vwap.timestamp");
        break;
      }
    }
  }

  for (const ind of subPanes) {
    switch (ind.id) {
      case "RSI": {
        const p = Number(ind.params.period ?? 14);
        ctes.push(rsiCTE(p));
        selectCols.push("rsi.value AS rsi");
        joins.push("LEFT JOIN rsi ON c.timestamp = rsi.timestamp");
        break;
      }
      case "MACD": {
        ctes.push(macdCTE(
          Number(ind.params.fast ?? 12),
          Number(ind.params.slow ?? 26),
          Number(ind.params.signal ?? 9)
        ));
        selectCols.push("macd.macd_line", "macd.signal_line", "macd.histogram AS macd_hist");
        joins.push("LEFT JOIN macd ON c.timestamp = macd.timestamp");
        break;
      }
      case "STOCH": {
        ctes.push(stochasticCTE(Number(ind.params.k ?? 14), Number(ind.params.d ?? 3)));
        selectCols.push("stochastic.k AS stoch_k", "stochastic.d AS stoch_d");
        joins.push("LEFT JOIN stochastic ON c.timestamp = stochastic.timestamp");
        break;
      }
      case "WILLIAMS": {
        ctes.push(williamsCTE(Number(ind.params.period ?? 14)));
        selectCols.push("williams.value AS williams");
        joins.push("LEFT JOIN williams ON c.timestamp = williams.timestamp");
        break;
      }
      case "CCI": {
        ctes.push(cciCTE(Number(ind.params.period ?? 20)));
        selectCols.push("cci.value AS cci");
        joins.push("LEFT JOIN cci ON c.timestamp = cci.timestamp");
        break;
      }
      case "ATR": {
        ctes.push(atrCTE(Number(ind.params.period ?? 14)));
        selectCols.push("atr.value AS atr");
        joins.push("LEFT JOIN atr ON c.timestamp = atr.timestamp");
        break;
      }
      case "ADX": {
        ctes.push(adxCTE(Number(ind.params.period ?? 14)));
        selectCols.push("adx.adx", "adx.pdi", "adx.ndi");
        joins.push("LEFT JOIN adx ON c.timestamp = adx.timestamp");
        break;
      }
      case "OBV": {
        ctes.push(obvCTE());
        selectCols.push("obv.value AS obv");
        joins.push("LEFT JOIN obv ON c.timestamp = obv.timestamp");
        break;
      }
      case "MFI": {
        ctes.push(mfiCTE(Number(ind.params.period ?? 14)));
        selectCols.push("mfi.value AS mfi");
        joins.push("LEFT JOIN mfi ON c.timestamp = mfi.timestamp");
        break;
      }
    }
  }

  // 4. Build final SQL
  const candleSQL = `
    SELECT timestamp, open, high, low, close, volume, oi
    FROM read_parquet([${fileList}])
    WHERE timestamp >= ${startUs} AND timestamp <= ${endUs}
    ORDER BY timestamp
  `;

  let sql: string;
  if (interval === "week" || interval === "month") {
    // Aggregate first, then apply indicators on top.
    // buildAggregationCTEParts returns [baseCTE, candlesCTE] so all CTEs sit in
    // the same WITH clause — a nested WITH inside a CTE body is invalid SQL.
    if (ctes.length > 0) {
      const [baseCTE, candlesCTE] = buildAggregationCTEParts(candleSQL, interval);
      // WITH RECURSIVE required because EMA/MACD CTEs use recursive UNION ALL patterns
      sql = `WITH RECURSIVE ${baseCTE},\n${candlesCTE},\n${ctes.join(",\n")}\nSELECT ${selectCols.join(", ")} FROM candles c\n${joins.join("\n")}\nORDER BY c.timestamp`;
    } else {
      sql = buildAggregationSQL(candleSQL, interval);
    }
  } else {
    sql = ctes.length > 0
      ? `WITH RECURSIVE candles AS (\n  ${candleSQL}\n),\n${ctes.join(",\n")}\nSELECT ${selectCols.join(", ")} FROM candles c\n${joins.join("\n")}\nORDER BY c.timestamp`
      : candleSQL;
  }

  const rows = await executeQuery(sql);
  return rows as CandleRow[];
}

// Fetch the last N days of candles for a watchlist sparkline (no indicators)
export async function fetchSparkline(
  symbol: string,
  days: number,
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>
): Promise<Array<{ timestamp: number; close: number }>> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const keys = equityKeys(symbol, "day", start, end);
  const urls = await presignKeys(keys);
  if (urls.length === 0) return [];
  const fileList = urls.map((u) => `'${u}'`).join(", ");
  const startUs = start.getTime() * 1000;
  const sql = `
    SELECT timestamp, close FROM read_parquet([${fileList}])
    WHERE timestamp >= ${startUs}
    ORDER BY timestamp
  `;
  return (await executeQuery(sql)) as Array<{ timestamp: number; close: number }>;
}
