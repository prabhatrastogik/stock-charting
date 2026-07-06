import { useState } from "react";
import { useChartStore, type IndicatorConfig } from "../../store/chartStore";

const OVERLAYS: Array<{ id: string; label: string; defaultParams: Record<string, number> }> = [
  { id: "SMA", label: "SMA — Simple Moving Average", defaultParams: { period: 20 } },
  { id: "EMA", label: "EMA — Exponential Moving Average", defaultParams: { period: 21 } },
  { id: "BB", label: "Bollinger Bands", defaultParams: { period: 20, multiplier: 2 } },
  { id: "VWAP", label: "VWAP (intraday only)", defaultParams: {} },
  { id: "SAR", label: "Parabolic SAR", defaultParams: { step: 0.02, max: 0.2 } },
];

const SUB_PANES: Array<{ id: string; label: string; defaultParams: Record<string, number> }> = [
  { id: "VOL", label: "Volume", defaultParams: {} },
  { id: "RSI", label: "RSI — Relative Strength Index", defaultParams: { period: 14 } },
  { id: "MACD", label: "MACD", defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { id: "STOCH", label: "Stochastic Oscillator", defaultParams: { k: 14, d: 3 } },
  { id: "WILLIAMS", label: "Williams %R", defaultParams: { period: 14 } },
  { id: "CCI", label: "CCI — Commodity Channel Index", defaultParams: { period: 20 } },
  { id: "ADX", label: "ADX + ±DI", defaultParams: { period: 14 } },
  { id: "ATR", label: "ATR — Average True Range", defaultParams: { period: 14 } },
  { id: "OBV", label: "OBV — On Balance Volume", defaultParams: {} },
  { id: "MFI", label: "MFI — Money Flow Index", defaultParams: { period: 14 } },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IndicatorPanel({ open, onClose }: Props) {
  const { overlays, subPanes, addOverlay, removeOverlay, addSubPane, removeSubPane } = useChartStore();
  const [search, setSearch] = useState("");

  if (!open) return null;

  const activeOverlayIds = new Set(overlays.map((o) => o.id));
  const activeSubIds = new Set(subPanes.map((p) => p.id));

  const filterFn = (label: string) =>
    !search || label.toLowerCase().includes(search.toLowerCase());

  const toggle = (
    cfg: IndicatorConfig,
    isOverlay: boolean,
    active: boolean
  ) => {
    if (isOverlay) {
      active ? removeOverlay(cfg.id) : addOverlay(cfg);
    } else {
      active ? removeSubPane(cfg.id) : addSubPane(cfg);
    }
  };

  return (
    <div className="absolute top-10 right-0 z-20 w-80 bg-[#131820] border border-[#2d3748] rounded-lg shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-[#2d3748] flex gap-2 items-center">
        <input
          autoFocus
          className="flex-1 bg-[#0f1117] text-slate-200 text-sm rounded px-2 py-1.5 outline-none placeholder-slate-500 border border-[#2d3748] focus:border-indigo-500"
          placeholder="Search indicators…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none">×</button>
      </div>

      <div className="overflow-y-auto max-h-96 divide-y divide-[#1e2530]">
        {/* Overlays section */}
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-3 py-2">Overlays</p>
          {OVERLAYS.filter((o) => filterFn(o.label)).map((ind) => {
            const active = activeOverlayIds.has(ind.id);
            return (
              <button
                key={ind.id}
                onClick={() => toggle({ id: ind.id, params: ind.defaultParams }, true, active)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[#1e2530] transition-colors
                  ${active ? "text-indigo-400" : "text-slate-300"}`}
              >
                {ind.label}
                {active && <span className="text-indigo-500 text-xs">✓</span>}
              </button>
            );
          })}
        </div>

        {/* Sub-panes section */}
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider px-3 py-2">Oscillators</p>
          {SUB_PANES.filter((o) => filterFn(o.label)).map((ind) => {
            const active = activeSubIds.has(ind.id);
            return (
              <button
                key={ind.id}
                onClick={() => toggle({ id: ind.id, params: ind.defaultParams }, false, active)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[#1e2530] transition-colors
                  ${active ? "text-indigo-400" : "text-slate-300"}`}
              >
                {ind.label}
                {active && <span className="text-indigo-500 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
