import { useState, useEffect, type RefObject } from "react";
import { format, subDays, subMonths, subYears } from "date-fns";
import { useChartStore, type InstrumentType, type Interval, type ChartType } from "../../store/chartStore";
import { searchInstruments, type InstrumentRecord } from "../../lib/instruments";

const DATE_PRESETS: Array<{ label: string; getRange: () => { start: Date; end: Date } }> = [
  { label: "5D", getRange: () => ({ start: subDays(new Date(), 5), end: new Date() }) },
  { label: "1M", getRange: () => ({ start: subMonths(new Date(), 1), end: new Date() }) },
  { label: "3M", getRange: () => ({ start: subMonths(new Date(), 3), end: new Date() }) },
  { label: "6M", getRange: () => ({ start: subMonths(new Date(), 6), end: new Date() }) },
  { label: "1Y", getRange: () => ({ start: subYears(new Date(), 1), end: new Date() }) },
  { label: "3Y", getRange: () => ({ start: subYears(new Date(), 3), end: new Date() }) },
  { label: "5Y", getRange: () => ({ start: subYears(new Date(), 5), end: new Date() }) },
  { label: "Max", getRange: () => ({ start: new Date("2004-01-01"), end: new Date() }) },
];

const INTERVALS: Array<{ id: Interval; label: string; shortcut: string }> = [
  { id: "15min", label: "15m", shortcut: "1" },
  { id: "day", label: "Day", shortcut: "2" },
  { id: "week", label: "Week", shortcut: "3" },
  { id: "month", label: "Month", shortcut: "4" },
];

const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: "candle", label: "Candle" },
  { id: "heikin_ashi", label: "HA" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "bar", label: "Bar" },
];

interface Props {
  instruments: InstrumentRecord[];
  onIndicatorsClick: () => void;
  lastQueryMs: number;
  lastRowCount: number;
  duckdbReady: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
}

export default function TopBar({
  instruments,
  onIndicatorsClick,
  lastQueryMs,
  lastRowCount,
  duckdbReady,
  searchRef,
}: Props) {
  const {
    symbol, instrumentType, interval, dateRange, chartType,
    setSymbol, setInterval, setDateRange, setChartType, addToWatchlist, watchlist,
    compareSymbol, setCompareSymbol,
  } = useChartStore();

  const [query, setQuery] = useState(symbol);
  const [results, setResults] = useState<InstrumentRecord[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeType, setActiveType] = useState<InstrumentType>(instrumentType);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Compare search state
  const [showCompareInput, setShowCompareInput] = useState(false);
  const [compareQuery, setCompareQuery] = useState("");
  const [compareResults, setCompareResults] = useState<InstrumentRecord[]>([]);

  // Keep query in sync when symbol changes externally (watchlist click)
  useEffect(() => { setQuery(symbol); }, [symbol]);

  // Reset keyboard selection when results change
  useEffect(() => { setSelectedIndex(-1); }, [results]);

  const handleSearch = (q: string) => {
    setQuery(q);
    const found = searchInstruments(instruments, q, activeType);
    setResults(found);
    setShowDropdown(found.length > 0);
  };

  const selectInstrument = (inst: InstrumentRecord) => {
    const sym = inst.tradingsymbol;
    const type: InstrumentType =
      inst.instrument_type === "FUT" ? "FUT"
      : inst.instrument_type === "CE" || inst.instrument_type === "PE" ? "OPT"
      : "EQ";
    setSymbol(sym, type);
    setActiveType(type);
    setQuery(sym);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showDropdown && query) {
        const found = searchInstruments(instruments, query, activeType);
        setResults(found);
        setShowDropdown(found.length > 0);
      }
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = selectedIndex >= 0 ? results[selectedIndex] : results.length === 1 ? results[0] : null;
      if (target) {
        selectInstrument(target);
      } else if (query.trim()) {
        // Fallback: load typed symbol directly (useful when instruments snapshot is unavailable)
        const sym = query.trim().toUpperCase();
        setSymbol(sym, activeType);
        setQuery(sym);
        setShowDropdown(false);
        e.currentTarget.blur();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      e.currentTarget.blur();
    }
  };

  const handleCompareSearch = (q: string) => {
    setCompareQuery(q);
    const found = searchInstruments(instruments, q, "EQ");
    setCompareResults(found.slice(0, 10));
  };

  const selectCompare = (sym: string) => {
    setCompareSymbol(sym);
    setShowCompareInput(false);
    setCompareQuery("");
    setCompareResults([]);
  };

  const handleCompareKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (compareResults.length > 0) {
        selectCompare(compareResults[0].tradingsymbol);
      } else if (compareQuery.trim()) {
        selectCompare(compareQuery.trim().toUpperCase());
      }
    } else if (e.key === "Escape") {
      setShowCompareInput(false);
      setCompareQuery("");
      setCompareResults([]);
    }
  };

  const applyPreset = (preset: (typeof DATE_PRESETS)[0]) => {
    const { start, end } = preset.getRange();
    setDateRange(start, end);
  };

  const activePreset = DATE_PRESETS.find((p) => {
    const { start } = p.getRange();
    return Math.abs(start.getTime() - dateRange.start.getTime()) < 86400000 * 2;
  })?.label;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#0f1117] border-b border-[#1e2530] text-sm flex-wrap">
      {/* DuckDB status */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${duckdbReady ? "bg-green-500" : "bg-amber-400 animate-pulse"}`}
        title={duckdbReady ? "DuckDB ready" : "Initializing…"}
      />

      {/* Type toggle */}
      <div className="flex rounded overflow-hidden border border-[#2d3748]">
        {(["EQ", "FUT", "OPT"] as InstrumentType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setActiveType(t);
              if (instrumentType !== t) {
                if (t === "FUT") {
                  // Futures symbols differ from equity (e.g. TCSAUG25FUT vs TCS)
                  // Clear symbol so user must search for the right contract
                  setSymbol("", t);
                  setQuery("");
                  setTimeout(() => searchRef.current?.focus(), 50);
                } else {
                  setSymbol(symbol, t);
                }
              }
            }}
            className={`px-2 py-1 text-xs font-medium transition-colors
              ${activeType === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Symbol search */}
      <div className="relative">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query && handleSearch(query)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={instruments.length ? "Symbol… [/]" : "Type symbol + Enter"}
          title={instruments.length ? undefined : "Instruments list unavailable — type an exact symbol and press Enter"}
          className="bg-[#131820] border border-[#2d3748] rounded px-2 py-1 text-slate-200 placeholder-slate-500 w-36 focus:outline-none focus:border-indigo-500 uppercase"
        />
        {showDropdown && (
          <ul className="absolute top-full mt-1 left-0 bg-[#131820] border border-[#2d3748] rounded shadow-2xl z-30 w-80 max-h-60 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={r.instrument_token}
                className={`px-3 py-2 cursor-pointer flex justify-between items-center group
                  ${i === selectedIndex ? "bg-indigo-900/50" : "hover:bg-[#1e2530]"}`}
                onMouseDown={() => selectInstrument(r)}
              >
                <span className="text-slate-200 font-mono text-xs">{r.tradingsymbol}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs">{r.expiry || r.name}</span>
                  <button
                    title={watchlist.includes(r.tradingsymbol) ? "In watchlist" : "Add to watchlist"}
                    onMouseDown={(e) => { e.stopPropagation(); addToWatchlist(r.tradingsymbol); }}
                    className={`text-xs px-1 rounded transition-colors
                      ${watchlist.includes(r.tradingsymbol)
                        ? "text-indigo-400"
                        : "text-slate-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100"}`}
                  >
                    {watchlist.includes(r.tradingsymbol) ? "★" : "+"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Interval — show keyboard shortcut on hover */}
      <div className="flex rounded overflow-hidden border border-[#2d3748]">
        {INTERVALS.filter((iv) => iv.id !== "15min" || instrumentType !== "OPT").map((iv) => (
          <button
            key={iv.id}
            onClick={() => setInterval(iv.id)}
            title={`${iv.label} [${iv.shortcut}]`}
            className={`px-2 py-1 text-xs font-medium transition-colors
              ${interval === iv.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {iv.label}
          </button>
        ))}
      </div>

      {/* Date presets */}
      <div className="flex gap-0.5">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`px-2 py-1 text-xs rounded transition-colors
              ${activePreset === p.label ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-[#1e2530]"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-1 text-xs text-slate-400">
        <input
          type="date"
          value={format(dateRange.start, "yyyy-MM-dd")}
          onChange={(e) => setDateRange(new Date(e.target.value), dateRange.end)}
          className="bg-[#131820] border border-[#2d3748] rounded px-1 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
        />
        <span>→</span>
        <input
          type="date"
          value={format(dateRange.end, "yyyy-MM-dd")}
          onChange={(e) => setDateRange(dateRange.start, new Date(e.target.value))}
          className="bg-[#131820] border border-[#2d3748] rounded px-1 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Chart type */}
      <div className="flex rounded overflow-hidden border border-[#2d3748]">
        {CHART_TYPES.map((ct) => (
          <button
            key={ct.id}
            onClick={() => setChartType(ct.id)}
            className={`px-2 py-1 text-xs font-medium transition-colors
              ${chartType === ct.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Indicators */}
      <button
        onClick={onIndicatorsClick}
        className="px-3 py-1 text-xs bg-[#1e2530] hover:bg-[#2d3748] text-slate-300 rounded border border-[#2d3748] transition-colors"
      >
        + Indicators
      </button>

      {/* Compare — inline search */}
      {compareSymbol ? (
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-950/40 rounded border border-amber-700/50">
          <span className="text-xs text-amber-400 font-mono">vs {compareSymbol}</span>
          <button
            onClick={() => setCompareSymbol(null)}
            title="Remove compare"
            className="text-slate-500 hover:text-red-400 text-xs leading-none"
          >×</button>
        </div>
      ) : showCompareInput ? (
        <div className="relative">
          <input
            autoFocus
            value={compareQuery}
            onChange={(e) => handleCompareSearch(e.target.value)}
            onKeyDown={handleCompareKeyDown}
            onBlur={() => setTimeout(() => { setShowCompareInput(false); setCompareResults([]); }, 150)}
            placeholder="Compare symbol…"
            className="bg-[#131820] border border-amber-500/60 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 w-36 focus:outline-none focus:border-amber-400 uppercase"
          />
          {compareResults.length > 0 && (
            <ul className="absolute top-full mt-1 left-0 bg-[#131820] border border-[#2d3748] rounded shadow-2xl z-30 w-64 max-h-48 overflow-y-auto">
              {compareResults.map((r) => (
                <li
                  key={r.instrument_token}
                  onMouseDown={() => selectCompare(r.tradingsymbol)}
                  className="px-3 py-2 cursor-pointer hover:bg-[#1e2530] flex justify-between items-center"
                >
                  <span className="text-slate-200 font-mono text-xs">{r.tradingsymbol}</span>
                  <span className="text-slate-500 text-xs truncate ml-2">{r.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowCompareInput(true)}
          className="px-3 py-1 text-xs bg-[#1e2530] hover:bg-[#2d3748] text-slate-300 rounded border border-[#2d3748] transition-colors"
        >
          Compare
        </button>
      )}

      {/* Perf HUD */}
      {lastRowCount > 0 && (
        <span className="ml-auto text-xs text-slate-600 font-mono">
          {lastRowCount.toLocaleString()} rows · {lastQueryMs}ms
        </span>
      )}
    </div>
  );
}
