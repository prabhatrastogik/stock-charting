import { useEffect, useState } from "react";
import { useChartStore } from "../../store/chartStore";
import { optionsKeys } from "../../lib/r2Paths";
import { presignKeys } from "../../lib/presign";
import { optionsChainSQL, computeMaxPain } from "../../lib/indicators/custom";
import { executeQuery } from "../../lib/duckdb";
import { pcrSQL } from "../../lib/indicators/custom";

interface ChainRow {
  strike: number;
  ce_close: number;
  ce_volume: number;
  ce_oi: number;
  ce_oi_chg: number;
  pe_close: number;
  pe_volume: number;
  pe_oi: number;
  pe_oi_chg: number;
}

function fmt(n: number | null) {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_00_000) return (n / 1_00_000).toFixed(1) + "L";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

export default function OptionsChain() {
  const { optionsUnderlying, optionsExpiry, dateRange, duckdbStatus } = useChartStore();
  const [rows, setRows] = useState<ChainRow[]>([]);
  const [spot] = useState<number | null>(null);
  const [maxPain, setMaxPain] = useState<number | null>(null);
  const [pcr, setPcr] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (duckdbStatus !== "ready" || !optionsExpiry) return;

    const load = async () => {
      setLoading(true);
      try {
        const keys = optionsKeys(optionsUnderlying, dateRange.start, dateRange.end);
        const urls = await presignKeys(keys);

        const endUs = dateRange.end.getTime() * 1000;
        const chainRows = (await executeQuery(
          optionsChainSQL(urls, optionsExpiry, endUs)
        )) as unknown as ChainRow[];

        setRows(chainRows);
        setMaxPain(computeMaxPain(chainRows.map((r) => ({ strike: r.strike, ce_oi: r.ce_oi, pe_oi: r.pe_oi }))));

        // PCR for the selected expiry
        const pcrRows = (await executeQuery(pcrSQL(urls, optionsExpiry))) as Array<{ timestamp: number; pcr: number }>;
        if (pcrRows.length) setPcr(pcrRows[pcrRows.length - 1].pcr);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [optionsUnderlying, optionsExpiry, dateRange, duckdbStatus]);

  const atm = spot != null ? rows.reduce((prev, cur) =>
    Math.abs(cur.strike - spot) < Math.abs(prev.strike - spot) ? cur : prev, rows[0])?.strike : null;

  const maxOI = Math.max(...rows.flatMap((r) => [r.ce_oi, r.pe_oi].filter(Boolean)));

  if (!optionsExpiry) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        Select an expiry to view the options chain
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0f1117]">
      {/* Header stats */}
      <div className="flex gap-6 px-4 py-2 border-b border-[#1e2530] text-xs text-slate-400">
        {spot && <span>Spot: <b className="text-slate-200">₹{spot.toFixed(2)}</b></span>}
        {maxPain && <span>Max Pain: <b className="text-amber-400">₹{maxPain}</b></span>}
        {pcr && <span>PCR: <b className={pcr > 1 ? "text-green-400" : "text-red-400"}>{pcr.toFixed(2)}</b></span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading chain…</div>
      ) : (
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 bg-[#131820] z-10">
            <tr className="text-slate-500">
              <th className="px-2 py-1.5 text-right">CE OI</th>
              <th className="px-2 py-1.5 text-right">Chg</th>
              <th className="px-2 py-1.5 text-right">Vol</th>
              <th className="px-2 py-1.5 text-right">LTP</th>
              <th className="px-3 py-1.5 text-center font-semibold text-slate-300">Strike</th>
              <th className="px-2 py-1.5 text-left">LTP</th>
              <th className="px-2 py-1.5 text-left">Vol</th>
              <th className="px-2 py-1.5 text-left">Chg</th>
              <th className="px-2 py-1.5 text-left">PE OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isATM = row.strike === atm;
              const isMaxPain = row.strike === maxPain;
              const ceBarWidth = maxOI > 0 ? (row.ce_oi / maxOI) * 100 : 0;
              const peBarWidth = maxOI > 0 ? (row.pe_oi / maxOI) * 100 : 0;
              const atmCls = isATM ? "bg-indigo-950/60" : "";
              const maxPainCls = isMaxPain ? "bg-amber-950/40" : "";
              return (
                <tr key={row.strike} className={`border-b border-[#1a2030] ${atmCls} ${maxPainCls} hover:bg-[#1e2530]`}>
                  {/* CE side */}
                  <td className="px-2 py-1 text-right font-mono relative" style={{ background: `linear-gradient(to left, #26a69a20 ${ceBarWidth}%, transparent ${ceBarWidth}%)` }}>
                    <span className="text-slate-300">{fmt(row.ce_oi)}</span>
                  </td>
                  <td className={`px-2 py-1 text-right ${row.ce_oi_chg >= 0 ? "text-green-500" : "text-red-500"}`}>{fmt(row.ce_oi_chg)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(row.ce_volume)}</td>
                  <td className="px-2 py-1 text-right text-slate-200">{row.ce_close?.toFixed(2) ?? "—"}</td>
                  {/* Strike */}
                  <td className={`px-3 py-1 text-center font-semibold ${isATM ? "text-indigo-300" : "text-slate-300"} ${isMaxPain ? "text-amber-300" : ""}`}>
                    {row.strike}
                    {isATM && <span className="ml-1 text-[9px] text-indigo-400">ATM</span>}
                    {isMaxPain && <span className="ml-1 text-[9px] text-amber-400">MP</span>}
                  </td>
                  {/* PE side */}
                  <td className="px-2 py-1 text-left text-slate-200">{row.pe_close?.toFixed(2) ?? "—"}</td>
                  <td className="px-2 py-1 text-left text-slate-400">{fmt(row.pe_volume)}</td>
                  <td className={`px-2 py-1 text-left ${row.pe_oi_chg >= 0 ? "text-green-500" : "text-red-500"}`}>{fmt(row.pe_oi_chg)}</td>
                  <td className="px-2 py-1 text-left font-mono relative" style={{ background: `linear-gradient(to right, #ef535020 ${peBarWidth}%, transparent ${peBarWidth}%)` }}>
                    <span className="text-slate-300">{fmt(row.pe_oi)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
