import { useState, useEffect, useRef } from "react";
import TopBar from "../components/Layout/TopBar";
import MainChart from "../components/Chart/MainChart";
import ChartToolbar from "../components/Chart/ChartToolbar";
import IndicatorPanel from "../components/Chart/IndicatorPanel";
import OptionsChain from "../components/Options/OptionsChain";
import Watchlist from "../components/Sidebar/Watchlist";
import { useChartStore } from "../store/chartStore";
import { fetchCandles } from "../lib/dataAccess";
import { executeQuery } from "../lib/duckdb";
import { loadInstruments, getExpiries, type InstrumentRecord } from "../lib/instruments";
import { optionsKeys } from "../lib/r2Paths";
import { presignKeys } from "../lib/presign";
import type { CandleRow } from "../lib/dataAccess";
import type { Chart } from "klinecharts";

export default function Dashboard() {
  const {
    symbol, instrumentType, interval, dateRange,
    overlays, subPanes, optionsUnderlying, optionsExpiry,
    setOptionsUnderlying, setOptionsExpiry, duckdbStatus, lastQueryMs, lastRowCount, setPerfStats,
    setInterval: setChartInterval, compareSymbol,
  } = useChartStore();

  const [candles, setCandles] = useState<CandleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<CandleRow[]>([]);
  const [instruments, setInstruments] = useState<InstrumentRecord[]>([]);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [showIndicators, setShowIndicators] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const chartRef = useRef<Chart | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load instruments snapshot once DuckDB is ready
  useEffect(() => {
    if (duckdbStatus !== "ready") return;
    loadInstruments(executeQuery).then(setInstruments).catch(console.error);
  }, [duckdbStatus]);

  // Clear stale expiries whenever the underlying changes
  useEffect(() => {
    setExpiries([]);
  }, [optionsUnderlying]);

  // Update expiries from instruments snapshot (when available)
  useEffect(() => {
    if (!instruments.length) return;
    const e = getExpiries(instruments, optionsUnderlying);
    setExpiries(e);
    if (e.length) setOptionsExpiry(e[0]);
  }, [instruments, optionsUnderlying, setOptionsExpiry]);

  // Fallback: query the options Parquet directly for expiry dates when
  // instruments snapshot isn't available (e.g. 404 or not yet loaded)
  useEffect(() => {
    if (duckdbStatus !== "ready" || instruments.length > 0 || instrumentType !== "OPT") return;
    let cancelled = false;
    const run = async () => {
      const end = new Date();
      const start = new Date(end.getFullYear() - 1, 0, 1);
      const keys = optionsKeys(optionsUnderlying, start, end);
      const urls = await presignKeys(keys);
      if (!urls.length || cancelled) return;
      const fileList = urls.map((u) => `'${u}'`).join(", ");
      try {
        const rows = await executeQuery(
          `SELECT DISTINCT expiry FROM read_parquet([${fileList}]) WHERE expiry IS NOT NULL ORDER BY expiry`
        );
        if (cancelled) return;
        const expList = rows
          .map((r) => String(r.expiry))
          .filter((e) => e && e !== "null");
        setExpiries(expList);
        if (expList.length) setOptionsExpiry(expList[0]);
      } catch (err) {
        console.error("Expiry query failed:", err);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [duckdbStatus, instruments.length, instrumentType, optionsUnderlying, setOptionsExpiry]);

  // Fetch candles whenever selection changes.
  // cancelled flag prevents a slow in-flight fetch from overwriting a newer result.
  useEffect(() => {
    if (duckdbStatus !== "ready" || !symbol) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const t0 = performance.now();
      try {
        const rows = await fetchCandles(
          symbol, instrumentType, interval,
          dateRange.start, dateRange.end,
          overlays, subPanes, executeQuery
        );
        if (cancelled) return;
        setPerfStats(Math.round(performance.now() - t0), rows.length);
        setCandles(rows);
      } catch (err) {
        if (!cancelled) {
          console.error("fetchCandles error", err);
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [symbol, instrumentType, interval, dateRange, overlays, subPanes, duckdbStatus, setPerfStats]);

  // Fetch compare data whenever compareSymbol, interval, or dateRange changes
  useEffect(() => {
    if (!compareSymbol || duckdbStatus !== "ready") {
      setCompareData([]);
      return;
    }
    let cancelled = false;
    fetchCandles(compareSymbol, "EQ", interval, dateRange.start, dateRange.end, [], [], executeQuery)
      .then((rows) => { if (!cancelled) setCompareData(rows); })
      .catch((err) => { if (!cancelled) console.error("compare fetch error", err); });
    return () => { cancelled = true; };
  }, [compareSymbol, interval, dateRange, duckdbStatus]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      // "/" focuses the symbol search from anywhere
      if (e.key === "/" && !inInput) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (inInput) return;

      if (e.key === "Escape") setShowIndicators(false);
      if (e.key === "w" || e.key === "W") setWatchlistOpen((v) => !v);
      if (e.key === "1") setChartInterval("15min");
      if (e.key === "2") setChartInterval("day");
      if (e.key === "3") setChartInterval("week");
      if (e.key === "4") setChartInterval("month");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setChartInterval]);

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-slate-200 overflow-hidden">
      <TopBar
        instruments={instruments}
        onIndicatorsClick={() => setShowIndicators((v) => !v)}
        lastQueryMs={lastQueryMs}
        lastRowCount={lastRowCount}
        duckdbReady={duckdbStatus === "ready"}
        searchRef={searchRef}
      />

      {/* Options control bar — always visible in OPT mode */}
      {instrumentType === "OPT" && (
        <div className="flex items-center gap-2 px-3 py-1 bg-[#0d1119] border-b border-[#1e2530] overflow-x-auto">
          {/* Underlying selector */}
          <span className="text-xs text-slate-500 shrink-0">Underlying:</span>
          {["NIFTY", "BANKNIFTY", "FINNIFTY"].map((u) => (
            <button
              key={u}
              onClick={() => setOptionsUnderlying(u)}
              className={`px-2 py-0.5 text-xs rounded transition-colors shrink-0
                ${optionsUnderlying === u ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 border border-[#2d3748]"}`}
            >
              {u}
            </button>
          ))}
          <input
            value={optionsUnderlying}
            onChange={(e) => setOptionsUnderlying(e.target.value.toUpperCase())}
            placeholder="other…"
            className="bg-[#131820] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-slate-200 placeholder-slate-600 w-20 focus:outline-none focus:border-indigo-500 uppercase"
          />

          <span className="text-slate-700 shrink-0 select-none">|</span>

          {/* Expiry selector */}
          <span className="text-xs text-slate-500 shrink-0">Expiry:</span>
          {expiries.length > 0 ? (
            expiries.map((e) => (
              <button
                key={e}
                onClick={() => setOptionsExpiry(e)}
                className={`px-2 py-0.5 text-xs rounded transition-colors shrink-0
                  ${optionsExpiry === e ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 border border-[#2d3748]"}`}
              >
                {e}
              </button>
            ))
          ) : (
            <span className="text-xs text-slate-600 animate-pulse">Loading expiries…</span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Drawing toolbar */}
        <ChartToolbar
          chartRef={chartRef}
          activeTool={activeTool}
          onToolSelect={setActiveTool}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {showIndicators && (
            <IndicatorPanel open={showIndicators} onClose={() => setShowIndicators(false)} />
          )}

          {instrumentType === "OPT" ? (
            <OptionsChain />
          ) : (
            <MainChart
              candles={candles}
              loading={loading}
              error={error}
              compareData={compareData}
              compareSymbol={compareSymbol}
              chartRef={chartRef}
            />
          )}
        </div>

        {/* Watchlist sidebar */}
        {watchlistOpen && <Watchlist />}
        <button
          onClick={() => setWatchlistOpen((v) => !v)}
          title={`${watchlistOpen ? "Hide" : "Show"} watchlist [W]`}
          className="w-5 bg-[#131820] border-l border-[#1e2530] flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-[#1e2530] transition-colors shrink-0"
        >
          {watchlistOpen ? "›" : "‹"}
        </button>
      </div>
    </div>
  );
}
