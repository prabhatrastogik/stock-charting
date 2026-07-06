import { useEffect, useState } from "react";
import { useChartStore } from "../../store/chartStore";
import { fetchSparkline } from "../../lib/dataAccess";
import { executeQuery } from "../../lib/duckdb";

interface WatchItem {
  symbol: string;
  lastClose: number;
  dayChange: number;
  sparkline: number[];
}

export default function Watchlist() {
  const { watchlist, symbol, setSymbol, addToWatchlist, removeFromWatchlist, duckdbStatus } = useChartStore();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [addQuery, setAddQuery] = useState("");

  useEffect(() => {
    if (duckdbStatus !== "ready") return;

    const load = async () => {
      const results = await Promise.allSettled(
        watchlist.map(async (sym) => {
          const rows = await fetchSparkline(sym, 31, executeQuery);
          if (rows.length < 2) return null;
          const closes = rows.map((r) => r.close);
          const lastClose = closes[closes.length - 1];
          const prevClose = closes[closes.length - 2];
          return {
            symbol: sym,
            lastClose,
            dayChange: ((lastClose - prevClose) / prevClose) * 100,
            sparkline: closes.slice(-30),
          } satisfies WatchItem;
        })
      );
      setItems(
        results
          .filter((r) => r.status === "fulfilled" && r.value)
          .map((r) => (r as PromiseFulfilledResult<WatchItem>).value)
      );
    };
    load();
  }, [watchlist, duckdbStatus]);

  const handleAdd = () => {
    const sym = addQuery.trim().toUpperCase();
    if (sym) {
      addToWatchlist(sym);
      setAddQuery("");
    }
  };

  const Spark = ({ data }: { data: number[] }) => {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 60;
    const h = 24;
    const pts = data
      .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
      .join(" ");
    const up = data[data.length - 1] >= data[0];
    return (
      <svg width={w} height={h} className="shrink-0">
        <polyline points={pts} fill="none" stroke={up ? "#26a69a" : "#ef5350"} strokeWidth={1.5} />
      </svg>
    );
  };

  return (
    <div className="w-52 shrink-0 bg-[#0f1117] border-l border-[#1e2530] flex flex-col">
      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-3 py-2 border-b border-[#1e2530]">
        Watchlist
      </p>
      <ul className="flex-1 overflow-y-auto divide-y divide-[#1a2030]">
        {items.map((item) => (
          <li
            key={item.symbol}
            onClick={() => setSymbol(item.symbol, "EQ")}
            className={`px-3 py-2 cursor-pointer hover:bg-[#1e2530] transition-colors
              ${symbol === item.symbol ? "bg-[#1e2530] border-l-2 border-indigo-500" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-slate-200">{item.symbol}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.symbol); }}
                className="text-slate-600 hover:text-red-400 text-xs leading-none"
                title="Remove"
              >×</button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-200">₹{item.lastClose.toFixed(2)}</div>
                <div className={`text-[10px] ${item.dayChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {item.dayChange >= 0 ? "+" : ""}{item.dayChange.toFixed(2)}%
                </div>
              </div>
              <Spark data={item.sparkline} />
            </div>
          </li>
        ))}
      </ul>

      {/* Add symbol */}
      <div className="px-2 py-2 border-t border-[#1e2530] flex gap-1">
        <input
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add symbol…"
          className="flex-1 min-w-0 bg-[#131820] border border-[#2d3748] rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 uppercase"
        />
        <button
          onClick={handleAdd}
          disabled={!addQuery.trim()}
          className="px-2 py-1 text-xs bg-[#1e2530] hover:bg-[#2d3748] text-slate-300 rounded border border-[#2d3748] disabled:opacity-40 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}
