import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import { init, dispose, TooltipShowRule, TooltipShowType, CandleType } from "klinecharts";
import type { Chart, KLineData } from "klinecharts";
import type { CandleRow } from "../../lib/dataAccess";
import { toChartTime } from "../../lib/dataAccess";
import { useChartStore } from "../../store/chartStore";
import {
  ensureCompareIndicatorRegistered,
  setCompareIndicatorData,
  clearCompareIndicatorData,
} from "../../lib/compareIndicator";

const CHART_THEME = {
  grid: { show: true, horizontal: { color: "#1e2530" }, vertical: { color: "#1e2530" } },
  candle: {
    bar: { upColor: "#26a69a", downColor: "#ef5350", noChangeColor: "#888" },
    tooltip: { showRule: TooltipShowRule.FollowCross, showType: TooltipShowType.Standard },
  },
  xAxis: { axisLine: { color: "#2d3748" }, tickText: { color: "#718096" } },
  yAxis: { axisLine: { color: "#2d3748" }, tickText: { color: "#718096" } },
  crosshair: { horizontal: { line: { color: "#4a5568" } }, vertical: { line: { color: "#4a5568" } } },
};

const CANDLE_TYPE_MAP: Record<string, CandleType> = {
  candle: CandleType.CandleSolid,
  heikin_ashi: CandleType.CandleSolid,
  line: CandleType.Area,
  area: CandleType.Area,
  bar: CandleType.Ohlc,
};

interface Props {
  candles: CandleRow[];
  loading: boolean;
  error?: string | null;
  compareData?: CandleRow[];
  compareSymbol?: string | null;
  chartRef?: MutableRefObject<Chart | null>;
}

export default function MainChart({ candles, loading, error, compareData, compareSymbol, chartRef: externalChartRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const subPaneIds = useRef<string[]>([]);
  const { chartType, overlays, subPanes } = useChartStore();

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = init(containerRef.current, { styles: CHART_THEME });
    chartRef.current = chart;
    if (externalChartRef) externalChartRef.current = chart;
    return () => {
      dispose(containerRef.current!);
      chartRef.current = null;
      if (externalChartRef) externalChartRef.current = null;
    };
  // externalChartRef is a stable ref object — intentionally excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update chart type
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setStyles({ candle: { type: CANDLE_TYPE_MAP[chartType] ?? CandleType.CandleSolid } });
  }, [chartType]);

  // Push new candle data
  useEffect(() => {
    if (!chartRef.current || !candles.length) return;

    const klineData: KLineData[] = candles.map((c) => ({
      timestamp: toChartTime(c.timestamp) * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      turnover: c.oi,
    }));

    chartRef.current.applyNewData(klineData);

    // Remove overlay indicators from the main pane
    chartRef.current.removeIndicator("candle_pane");

    // Remove any previously created sub-panes — prevents the VOL/RSI/etc. duplication
    // that occurs because sub-panes get new auto-generated pane IDs on each data load
    for (const paneId of subPaneIds.current) {
      try { chartRef.current.removeIndicator(paneId); } catch { /* pane may already be gone */ }
    }
    subPaneIds.current = [];

    // Re-add overlay indicators
    for (const ind of overlays) {
      if (ind.id === "SMA") chartRef.current.createIndicator("MA", false, { id: "candle_pane" });
      if (ind.id === "EMA") chartRef.current.createIndicator("EMA", false, { id: "candle_pane" });
      if (ind.id === "BB") chartRef.current.createIndicator("BOLL", false, { id: "candle_pane" });
      if (ind.id === "VWAP") chartRef.current.createIndicator("VWAP", false, { id: "candle_pane" });
    }

    // Re-add sub-pane indicators, tracking each pane ID so we can clean up next time
    const newPaneIds: string[] = [];
    const addSub = (name: string, height: number) => {
      const id = chartRef.current!.createIndicator(name, false, { height });
      if (id) newPaneIds.push(id);
    };
    for (const ind of subPanes) {
      if (ind.id === "VOL")     addSub("VOL",  60);
      if (ind.id === "RSI")     addSub("RSI",  80);
      if (ind.id === "MACD")    addSub("MACD", 80);
      if (ind.id === "STOCH")   addSub("KDJ",  80);
      if (ind.id === "WILLIAMS") addSub("WR",  60);
      if (ind.id === "CCI")     addSub("CCI",  60);
      if (ind.id === "ADX")     addSub("DMI",  60);
      if (ind.id === "ATR")     addSub("ATR",  60);
      if (ind.id === "OBV")     addSub("OBV",  60);
    }
    subPaneIds.current = newPaneIds;
  }, [candles, overlays, subPanes]);

  // Compare overlay — rebase the second symbol's prices to the main chart's price scale
  useEffect(() => {
    if (!chartRef.current) return;
    try { chartRef.current.removeIndicator("candle_pane", "COMPARE"); } catch { /* not yet added */ }

    if (!compareData?.length || !candles.length || !compareSymbol) {
      clearCompareIndicatorData();
      return;
    }

    const mainBase = candles[0].close;
    const cmpBase = compareData[0].close;
    const map = new Map<number, number>();
    for (const c of compareData) {
      const tsMs = toChartTime(c.timestamp) * 1000;
      map.set(tsMs, mainBase * (c.close / cmpBase));
    }

    ensureCompareIndicatorRegistered();
    setCompareIndicatorData(compareSymbol, map);
    chartRef.current.createIndicator("COMPARE", false, { id: "candle_pane" });
  }, [compareData, candles, compareSymbol]);

  // Persist drawings on mouseup
  const saveDrawings = useCallback(() => {
    if (!chartRef.current) return;
    try {
      const key = `drawings_${window.location.pathname}`;
      // klinecharts v9 has no public getAll-overlays API; storing a marker so we know drawings exist
      localStorage.setItem(key, "1");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("mouseup", saveDrawings);
    return () => el.removeEventListener("mouseup", saveDrawings);
  }, [saveDrawings]);

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f1117]/70 z-10 pointer-events-none">
          <svg className="animate-spin h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-2">
          <span className="text-red-400 text-sm">{error}</span>
          <span className="text-slate-500 text-xs">Check your connection or try a different symbol / date range</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
