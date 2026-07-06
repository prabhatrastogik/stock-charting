import { registerIndicator } from "klinecharts";

// Module-level store — klinecharts' calc runs inside the chart's render loop
// and can't receive external data via props, so we inject it through here.
const _state = {
  map: new Map<number, number>(), // ms timestamp → rebased price
  label: "CMP",
};

export function setCompareIndicatorData(label: string, tsToValue: Map<number, number>) {
  _state.map = tsToValue;
  _state.label = label;
}

export function clearCompareIndicatorData() {
  _state.map = new Map();
  _state.label = "CMP";
}

let _registered = false;
export function ensureCompareIndicatorRegistered() {
  if (_registered) return;
  _registered = true;
  registerIndicator({
    name: "COMPARE",
    shortName: "CMP",
    figures: [{ key: "value", type: "line", title: "vs " }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    styles: { lines: [{ color: "#f59e0b", size: 1.5, smooth: false, style: "solid", dashedValue: [2, 2] }] } as any,
    calc: (dataList: { timestamp: number }[]) =>
      dataList.map((d) => ({ value: _state.map.get(d.timestamp) ?? null })),
  } as Parameters<typeof registerIndicator>[0]);
}
