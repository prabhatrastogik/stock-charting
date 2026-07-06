import type { RefObject } from "react";
import type { Chart } from "klinecharts";

// Minimal inline SVG icons for each drawing tool
const ICONS: Record<string, React.ReactNode> = {
  pointer: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2l10 5.5-4.5 1-2.5 4.5z" />
    </svg>
  ),
  horizontalStraightLine: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="8" x2="14" y2="8" />
      <circle cx="2" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  straightLine: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="13" x2="13" y2="3" />
      <circle cx="3" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="13" cy="3" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  ray: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="13" x2="13" y2="3" />
      <circle cx="3" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M10 3h3v3" />
    </svg>
  ),
  parallelStraightLine: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="9" x2="14" y2="4" />
      <line x1="2" y1="13" x2="14" y2="8" />
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="12" height="8" rx="1" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  ),
  fibonacciLine: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="2" y1="4" x2="14" y2="4" strokeDasharray="1 1" />
      <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="1 1" />
      <line x1="2" y1="12" x2="14" y2="12" strokeDasharray="1 1" />
      <text x="2" y="7" fontSize="4" fill="currentColor" stroke="none">0.5</text>
    </svg>
  ),
  fibonacciExtension: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="2" y1="3" x2="14" y2="3" strokeDasharray="1 1" />
      <line x1="2" y1="7" x2="14" y2="7" strokeDasharray="1 1" />
      <line x1="2" y1="11" x2="14" y2="11" strokeDasharray="1 1" />
      <line x1="2" y1="15" x2="14" y2="15" strokeDasharray="1 1" />
      <text x="2" y="6" fontSize="4" fill="currentColor" stroke="none">1.6</text>
    </svg>
  ),
  gannFan: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="14" x2="14" y2="10" />
      <line x1="2" y1="14" x2="14" y2="6" />
      <line x1="2" y1="14" x2="14" y2="2" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <text x="3" y="13" fontSize="13" fontWeight="600" fill="currentColor" fontFamily="serif">T</text>
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="13" x2="8" y2="4" />
      <path d="M5 7l3-3 3 3" />
    </svg>
  ),
  clear: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  ),
};

const TOOLS = [
  { id: null,                      iconKey: "pointer",              title: "Pointer — select / deselect" },
  { id: "horizontalStraightLine",  iconKey: "horizontalStraightLine", title: "Horizontal line" },
  { id: "straightLine",            iconKey: "straightLine",         title: "Trend line" },
  { id: "ray",                     iconKey: "ray",                  title: "Ray" },
  { id: "parallelStraightLine",    iconKey: "parallelStraightLine", title: "Parallel channel" },
  { id: "rect",                    iconKey: "rect",                 title: "Rectangle" },
  { id: "circle",                  iconKey: "circle",               title: "Circle" },
  { id: "fibonacciLine",           iconKey: "fibonacciLine",        title: "Fibonacci retracement" },
  { id: "fibonacciExtension",      iconKey: "fibonacciExtension",   title: "Fibonacci extension" },
  { id: "gannFan",                 iconKey: "gannFan",              title: "Gann fan" },
  { id: "text",                    iconKey: "text",                 title: "Text annotation" },
  { id: "arrow",                   iconKey: "arrow",                title: "Arrow" },
];

interface Props {
  chartRef: RefObject<Chart | null>;
  activeTool: string | null;
  onToolSelect: (id: string | null) => void;
}

export default function ChartToolbar({ chartRef, activeTool, onToolSelect }: Props) {
  const handleSelect = (id: string | null) => {
    onToolSelect(id);
    const chart = chartRef.current;
    if (!chart) return;
    if (id === null) {
      chart.removeOverlay();
    } else {
      chart.createOverlay(id);
    }
  };

  return (
    <div className="flex flex-col gap-0.5 bg-[#0f1117] border-r border-[#1e2530] py-2 w-10 shrink-0">
      {TOOLS.map((t) => (
        <button
          key={t.id ?? "pointer"}
          title={t.title}
          onClick={() => handleSelect(t.id)}
          className={`h-9 w-10 flex items-center justify-center rounded-sm transition-colors relative group
            ${activeTool === t.id
              ? "bg-indigo-600 text-white"
              : "text-slate-400 hover:bg-[#1e2530] hover:text-slate-200"
            }`}
        >
          {ICONS[t.iconKey]}
          {/* Visible label on hover */}
          <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-[#1e2530] text-slate-200 text-xs px-2 py-1 rounded border border-[#2d3748] opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {t.title}
          </span>
        </button>
      ))}

      <div className="border-t border-[#1e2530] my-1 mx-2" />

      <button
        title="Clear all drawings"
        onClick={() => chartRef.current?.removeOverlay()}
        className="h-9 w-10 flex items-center justify-center rounded-sm text-slate-500 hover:text-red-400 hover:bg-[#1e2530] transition-colors relative group"
      >
        {ICONS.clear}
        <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-[#1e2530] text-slate-200 text-xs px-2 py-1 rounded border border-[#2d3748] opacity-0 group-hover:opacity-100 transition-opacity z-50">
          Clear all drawings
        </span>
      </button>
    </div>
  );
}
