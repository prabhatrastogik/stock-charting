# NSE Stock Charting Dashboard

A browser-side charting dashboard for NSE equity, futures, and options data. DuckDB-Wasm queries Parquet files stored in Cloudflare R2. All SQL runs in-browser; R2 credentials never leave the server.

## Architecture

```
Browser (React + DuckDB-Wasm, loaded from CDN at runtime)
  │
  ├─ HEAD /api/data?key=NSE/EQ/RELIANCE/day/2024.parquet   (file-size probe)
  ├─ GET  /api/data?key=NSE/EQ/RELIANCE/day/2024.parquet   (full or range fetch)
  │       ↓
  │   Cloudflare Pages Function  (functions/api/data.js)
  │   Uses aws4fetch (AwsClient) to sign S3-compatible requests to R2
  │   R2 credentials in Pages env vars — never in the bundle or URLs
  │   Handles HEAD, GET (with Range), OPTIONS, and ?ping=1 diagnostic
  │       ↓
  └─ Cloudflare R2 (private bucket, Parquet files)
```

DuckDB always makes a HEAD request before reading a Parquet file (to get file size for random access). Both HEAD and GET are handled by the same Pages Function — no presigned URLs or R2 CORS configuration needed; all requests stay same-origin.

Indicators (SMA, EMA, RSI, MACD, Bollinger, etc.) are computed as DuckDB window-function CTEs in a single query per chart load. EMA and MACD use recursive CTEs (`WITH RECURSIVE`) because DuckDB has no built-in EMA window function.

DuckDB-Wasm is **not** bundled — it is fetched from jsDelivr CDN at runtime (`1.33.1-dev57.0`). This keeps the build output small and eliminates OOM failures during Cloudflare Pages builds.

## Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 |
| In-browser SQL engine | DuckDB-Wasm (CDN, v1.33.1-dev57.0) |
| Charting | klinecharts v9 |
| State | Zustand v5 (persisted) |
| Date helpers | date-fns v4 |
| R2 request signing | aws4fetch (AwsClient) |
| Serverless function | Cloudflare Pages Functions |
| Storage | Cloudflare R2 (private bucket, Parquet) |
| Package manager | pnpm |

## Features

- **Equity, Futures, Options** — unified symbol search across all NSE instruments
- **Intervals** — 15-minute, Daily, Weekly, Monthly (week/month aggregated from daily Parquet via DuckDB `DATE_TRUNC`)
- **Date presets** — 5D / 1M / 3M / 6M / 1Y / 3Y / 5Y / Max + custom date range
- **Chart types** — Candlestick, Heikin-Ashi, OHLC bar, Line, Area
- **Drawing tools** — Horizontal line, trend line, ray, parallel channel, rectangle, circle, Fibonacci retracement/extension, Gann fan, text, arrow
- **Indicator library** (searchable popup):
  - Overlays: SMA, EMA, Bollinger Bands, VWAP, Parabolic SAR
  - Oscillators: Volume, RSI, MACD, Stochastic, Williams %R, CCI, ADX/DMI, ATR, OBV, MFI
- **Compare overlay** — overlay any equity symbol on the main chart, rebased to the same price scale (amber line); toggle via "Compare" button in the top bar
- **Options chain** — CE/PE table with OI bars, ATM and max pain highlighting, PCR; expiry list sourced from instruments snapshot or queried directly from options Parquet as fallback
- **Watchlist** — saved symbols with 30-day sparklines and day change %, persisted in localStorage; toggle with `W`
- **Performance HUD** — shows DuckDB query time and row count on every chart load
- **Keyboard shortcuts**:
  - `/` — focus symbol search from anywhere
  - `W` — toggle watchlist sidebar
  - `1 / 2 / 3 / 4` — switch to 15m / Day / Week / Month interval
  - `Escape` — close indicator panel

## R2 Data Layout

```
NSE/EQ/{SYMBOL}/day/{YYYY}.parquet          # Equity daily OHLCV
NSE/EQ/{SYMBOL}/15min/{YYYY-MM}.parquet     # Equity 15-minute OHLCV
NFO/FUT/{SYMBOL}/day/{YYYY}.parquet         # Futures daily OHLCV + OI
NFO/FUT/{SYMBOL}/15min/{YYYY-MM}.parquet    # Futures 15-minute OHLCV + OI
NFO/OPT/{UNDERLYING}/day/{YYYY}.parquet     # Options daily (all strikes/expiries per underlying)
instruments/snapshots/{YYYY-MM-DD}.parquet  # Daily instruments snapshot (for symbol search)
```

Index symbols with spaces (e.g. `NIFTY 50`) are stored with hyphens (`NIFTY-50`). Timestamps are int64 microseconds UTC.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- Access to the R2 bucket (R2 API token with Object Read permission)

### Setup

```bash
git clone <repo>
cd stock-charting
pnpm install
```

On first install, pnpm may prompt about build scripts for native dependencies. Approve them, or run:

```bash
pnpm approve-builds
```

Create `.dev.vars` in the project root (gitignored):

```
R2_ACCOUNT_ID=<your-cloudflare-account-id>
R2_ACCESS_KEY_ID=<your-r2-api-token-access-key>
R2_SECRET_ACCESS_KEY=<your-r2-api-token-secret>
R2_BUCKET=<your-bucket-name>
```

> `R2_ACCOUNT_ID` and `R2_BUCKET` are also hard-coded in `wrangler.toml` as `[vars]` for convenience, but `.dev.vars` values take precedence locally. Only `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` must stay as secrets and must never appear in source.

Run the dev server (Vite on port 5173, Wrangler Pages dev on port 8788 proxying to Vite):

```bash
pnpm dev   # open http://localhost:8788
```

The split is necessary because Wrangler's Miniflare loopback cannot handle WebSocket upgrades from Vite's HMR client, so HMR connects directly to Vite (port 5173) while all page and API requests go through Wrangler (port 8788).

### Diagnostic endpoint

`GET /api/data?ping=1` returns a JSON object showing which R2 env vars are present:

```json
{ "ok": true, "hasAccountId": true, "hasAccessKey": true, "hasSecret": true, "hasBucket": true }
```

Useful for verifying credentials are wired up without making a real R2 request.

## Deployment

```bash
pnpm deploy   # builds then deploys to Cloudflare Pages
```

See [DEPLOY.md](DEPLOY.md) for full deployment instructions.

## Project Structure

```
functions/
  api/
    data.js                    # Pages Function — signs & proxies HEAD/GET/OPTIONS to R2 via aws4fetch
    presign.js                 # Legacy — no longer called by the frontend
wrangler.toml                  # Cloudflare config (name, compatibility flags, [vars] with non-secret R2 config)
pnpm-workspace.yaml            # pnpm config (allowBuilds for esbuild, sharp, workerd)
vite.config.ts                 # Vite config with HMR port fix for Wrangler proxy setup
src/
  lib/
    duckdb.ts                  # DuckDB-Wasm singleton (CDN-loaded), initDuckDB(), executeQuery()
    presign.ts                 # buildUrl() + presignKeys(): constructs /api/data?key=… URLs with HEAD-based existence checks
    r2Paths.ts                 # R2 key construction, symbol sanitization, partition ranges
    dataAccess.ts              # fetchCandles() (multi-partition + indicators), fetchSparkline()
    compareIndicator.ts        # klinecharts custom COMPARE indicator for the compare overlay
    instruments.ts             # Instruments snapshot loader with localStorage + memory cache, search helpers
    aggregation.ts             # Weekly/monthly OHLCV aggregation SQL builder (CTE parts)
    indicators/
      overlap.ts               # SQL CTEs: SMA, EMA (recursive), Bollinger, VWAP, SAR (client-side compute)
      oscillators.ts           # SQL CTEs: RSI, MACD (recursive EMA), Stochastic, Williams, CCI, ADX, ATR, OBV, MFI
      custom.ts                # Options/futures indicators: pcrSQL, optionsChainSQL, computeMaxPain, basisSQL
  components/
    Chart/
      MainChart.tsx            # klinecharts instance, data push, indicator re-application, compare overlay
      ChartToolbar.tsx         # Drawing tool palette (left strip) with inline SVG icons
      IndicatorPanel.tsx       # Searchable indicator library popup
    Options/
      OptionsChain.tsx         # CE/PE chain table with OI bars, ATM + max pain highlight, PCR
    Sidebar/
      Watchlist.tsx            # Symbol list with 30-day sparklines + day change, add/remove
    Layout/
      TopBar.tsx               # Symbol search (keyboard nav), type/interval/date/chart-type controls, compare
  pages/
    Dashboard.tsx              # Main layout shell, data fetching effects, keyboard shortcuts
  store/
    chartStore.ts              # Zustand store (persisted): symbol, interval, indicators, watchlist, compare
```

## State Persistence

`chartStore` persists a subset of state to localStorage under the key `chart-store`:

| Persisted | Not persisted |
|---|---|
| `watchlist` | `symbol`, `instrumentType`, `interval` |
| `overlays` (active indicator list) | `dateRange`, `duckdbStatus` |
| `subPanes` (active oscillator list) | `compareSymbol`, `lastQueryMs` |
| `chartType` | `optionsUnderlying`, `optionsExpiry` |

Instruments are cached separately under `instruments_cache` / `instruments_cache_date` (valid for the current calendar day).

## Security Notes

- R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are **only** in Cloudflare Pages environment variables — never in the frontend bundle, never in request URLs, never in source control.
- `R2_ACCOUNT_ID` and `R2_BUCKET` are in `wrangler.toml` `[vars]` since they are not secret; they are still injected server-side and never reach the browser.
- The proxy function (`functions/api/data.js`) does not validate which keys can be requested. If you need key-level access control, add an allowlist check there or gate the entire app with Cloudflare Access.
- User-supplied strings passed into SQL (e.g. `expiry` filter in options queries) are escaped with a single-quote doubler before interpolation.
