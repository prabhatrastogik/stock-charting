const V = "1.33.1-dev57.0";
const CDN = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${V}`;

// COI (multi-threaded) bundle requires SharedArrayBuffer and COEP headers, which
// block CDN resources on Cloudflare Pages. EH and MVP work without those headers.
const BUNDLES = {
  mvp: {
    mainModule: `${CDN}/dist/duckdb-mvp.wasm`,
    mainWorker: `${CDN}/dist/duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${CDN}/dist/duckdb-eh.wasm`,
    mainWorker: `${CDN}/dist/duckdb-browser-eh.worker.js`,
  },
};

interface DuckDBBatch {
  numRows: number;
  schema: { fields: Array<{ name: string }> };
  getChildAt(index: number): { get(i: number): unknown } | null;
}
interface DuckDBResult {
  batches: DuckDBBatch[];
}
interface DuckDBConn {
  query(sql: string): Promise<DuckDBResult>;
}
interface DuckDBInstance {
  instantiate(mainModule: string, pthreadWorker?: string | null): Promise<void>;
  connect(): Promise<DuckDBConn>;
}
interface DuckDBModule {
  AsyncDuckDB: new (logger: unknown, worker: Worker) => DuckDBInstance;
  ConsoleLogger: new (level: number) => unknown;
  LogLevel: { ERROR: number };
  selectBundle(bundles: typeof BUNDLES): Promise<(typeof BUNDLES)[keyof typeof BUNDLES]>;
}

let db: DuckDBInstance | null = null;
let conn: DuckDBConn | null = null;
// Promise singleton prevents concurrent double-init and worker leaks on rapid calls.
let initPromise: Promise<void> | null = null;

async function _initDuckDB(): Promise<void> {
  // @vite-ignore tells Vite not to try to bundle this external URL
  const duckdb = (await import(/* @vite-ignore */ `${CDN}/+esm`)) as DuckDBModule;
  const bundle = await duckdb.selectBundle(BUNDLES);

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  // Always release the blob URL; terminate the worker on any init failure.
  try {
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule);
    conn = await db.connect();
    await conn.query("LOAD httpfs;");
    await conn.query("SET enable_progress_bar = false;");
  } catch (err) {
    worker.terminate();
    db = null;
    conn = null;
    throw err;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

export function initDuckDB(): Promise<void> {
  if (!initPromise) {
    initPromise = _initDuckDB().catch((err) => {
      initPromise = null; // allow retry after failure
      throw err;
    });
  }
  return initPromise;
}

export async function executeQuery(
  sql: string
): Promise<Record<string, unknown>[]> {
  if (!conn) throw new Error("DuckDB not initialized");

  const result = await conn.query(sql);
  const rows: Record<string, unknown>[] = [];

  for (const batch of result.batches) {
    for (let i = 0; i < batch.numRows; i++) {
      const row: Record<string, unknown> = {};
      batch.schema.fields.forEach((field, fieldIdx) => {
        const col = batch.getChildAt(fieldIdx);
        if (!col) return;
        const val = col.get(i);
        row[field.name] = typeof val === "bigint" ? Number(val) : val;
      });
      rows.push(row);
    }
  }
  return rows;
}
