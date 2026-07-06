import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InstrumentType = "EQ" | "FUT" | "OPT";
export type Interval = "15min" | "day" | "week" | "month";
export type ChartType = "candle" | "heikin_ashi" | "line" | "area" | "bar";
export type DuckDBStatus = "loading" | "ready" | "error";

export interface IndicatorConfig {
  id: string;       // e.g. "SMA", "RSI", "MACD"
  params: Record<string, number | string>;
}

interface ChartState {
  // Symbol selection
  symbol: string;
  instrumentType: InstrumentType;
  interval: Interval;
  dateRange: { start: Date; end: Date };
  chartType: ChartType;

  // Compare overlay
  compareSymbol: string | null;

  // Active indicators
  overlays: IndicatorConfig[];
  subPanes: IndicatorConfig[];

  // Options filters
  optionsUnderlying: string;
  optionsExpiry: string;

  // Watchlist (persisted)
  watchlist: string[];

  // DuckDB status
  duckdbStatus: DuckDBStatus;

  // Performance
  lastQueryMs: number;
  lastRowCount: number;

  // Actions
  setSymbol: (symbol: string, type: InstrumentType) => void;
  setInterval: (interval: Interval) => void;
  setDateRange: (start: Date, end: Date) => void;
  setChartType: (type: ChartType) => void;
  setCompareSymbol: (symbol: string | null) => void;
  addOverlay: (cfg: IndicatorConfig) => void;
  removeOverlay: (id: string) => void;
  addSubPane: (cfg: IndicatorConfig) => void;
  removeSubPane: (id: string) => void;
  setOptionsUnderlying: (underlying: string) => void;
  setOptionsExpiry: (expiry: string) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  setDuckDBStatus: (status: DuckDBStatus) => void;
  setPerfStats: (ms: number, rows: number) => void;
}

const DEFAULT_DATE_RANGE = {
  start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
  end: new Date(),
};

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "RELIANCE",
      instrumentType: "EQ",
      interval: "day",
      dateRange: DEFAULT_DATE_RANGE,
      chartType: "candle",
      compareSymbol: null,
      overlays: [{ id: "SMA", params: { period: 20 } }],
      subPanes: [{ id: "VOL", params: {} }],
      optionsUnderlying: "NIFTY",
      optionsExpiry: "",
      watchlist: ["RELIANCE", "NIFTY-50", "HDFCBANK", "NIFTY-BANK"],
      duckdbStatus: "loading",
      lastQueryMs: 0,
      lastRowCount: 0,

      setSymbol: (symbol, type) => set({ symbol, instrumentType: type }),
      setInterval: (interval) => set({ interval }),
      setDateRange: (start, end) => set({ dateRange: { start, end } }),
      setChartType: (chartType) => set({ chartType }),
      setCompareSymbol: (compareSymbol) => set({ compareSymbol }),
      addOverlay: (cfg) =>
        set((s) => ({
          overlays: s.overlays.some((o) => o.id === cfg.id)
            ? s.overlays
            : [...s.overlays, cfg],
        })),
      removeOverlay: (id) =>
        set((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) })),
      addSubPane: (cfg) =>
        set((s) => ({
          subPanes: s.subPanes.some((p) => p.id === cfg.id)
            ? s.subPanes
            : [...s.subPanes, cfg],
        })),
      removeSubPane: (id) =>
        set((s) => ({ subPanes: s.subPanes.filter((p) => p.id !== id) })),
      setOptionsUnderlying: (optionsUnderlying) => set({ optionsUnderlying }),
      setOptionsExpiry: (optionsExpiry) => set({ optionsExpiry }),
      addToWatchlist: (symbol) =>
        set((s) => ({
          watchlist: s.watchlist.includes(symbol)
            ? s.watchlist
            : [...s.watchlist, symbol],
        })),
      removeFromWatchlist: (symbol) =>
        set((s) => ({ watchlist: s.watchlist.filter((w) => w !== symbol) })),
      setDuckDBStatus: (duckdbStatus) => set({ duckdbStatus }),
      setPerfStats: (lastQueryMs, lastRowCount) =>
        set({ lastQueryMs, lastRowCount }),
    }),
    {
      name: "chart-store",
      // Only persist watchlist and overlays across sessions
      partialize: (s) => ({
        watchlist: s.watchlist,
        overlays: s.overlays,
        subPanes: s.subPanes,
        chartType: s.chartType,
      }),
    }
  )
);
