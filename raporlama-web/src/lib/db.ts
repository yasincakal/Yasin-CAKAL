import sql from "mssql";
import type { ConnectionTestResult, DbConfig } from "./types";
import { loadDbConfig } from "./config";

let pool: sql.ConnectionPool | null = null;
let poolKey = "";

function buildConfig(cfg: DbConfig): sql.config {
  return {
    server: cfg.server,
    database: cfg.database,
    user: cfg.windowsAuth ? undefined : cfg.user,
    password: cfg.windowsAuth ? undefined : cfg.password,
    options: {
      encrypt: cfg.encrypt ?? false,
      trustServerCertificate: cfg.trustServerCertificate ?? true,
      enableArithAbort: true,
      connectTimeout: 2000,
      requestTimeout: 120000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 2000,
  };
}

function keyOf(cfg: DbConfig) {
  return `${cfg.server}|${cfg.database}|${cfg.user}|${cfg.windowsAuth ? "win" : "sql"}`;
}

export async function getPool(cfg?: DbConfig | null): Promise<sql.ConnectionPool> {
  const config = cfg ?? loadDbConfig();
  if (!config) {
    throw new Error("Veritabanı bağlantı ayarları bulunamadı.");
  }
  const key = keyOf(config);
  if (pool && pool.connected && poolKey === key) return pool;
  if (pool) {
    try {
      await pool.close();
    } catch {
      /* ignore */
    }
    pool = null;
  }
  const next = new sql.ConnectionPool(buildConfig(config));
  await next.connect();
  pool = next;
  poolKey = key;
  return pool;
}

export async function testConnection(cfg: DbConfig): Promise<ConnectionTestResult> {
  const started = Date.now();
  let temp: sql.ConnectionPool | null = null;
  try {
    temp = new sql.ConnectionPool(buildConfig(cfg));
    await Promise.race([
      temp.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Bağlantı zaman aşımı (2 sn)")), 2000)
      ),
    ]);
    await temp.request().query("SELECT 1 AS ok");
    return {
      ok: true,
      message: "Bağlantı başarılı",
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Bağlantı başarısız",
      latencyMs: Date.now() - started,
    };
  } finally {
    if (temp) {
      try {
        await temp.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function queryRows<T extends Record<string, unknown> = Record<string, unknown>>(
  queryText: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const p = await getPool();
  const req = p.request();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v as string | number | boolean | Date | null | Buffer);
    }
  }
  const result = await req.query<T>(queryText);
  return result.recordset;
}

export async function executeBatches(sqlText: string) {
  const p = await getPool();
  const batches = sqlText
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const batch of batches) {
    await p.request().batch(batch);
  }
}

export async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    poolKey = "";
  }
}
