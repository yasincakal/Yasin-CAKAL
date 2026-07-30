import sql from "mssql";
import type { ConnectionTestResult, DbConfig } from "./types";
import { loadDbConfig } from "./config";

let pool: sql.ConnectionPool | null = null;
let poolKey = "";

/** DESKTOP-97B4PJQ\SQL2025 veya DESKTOP-97B4PJQ,1433 ayrıştırır */
export function parseServerAddress(raw: string, port?: number) {
  const input = raw.trim().replace(/\//g, "\\");
  let host = input;
  let instanceName: string | undefined;
  let resolvedPort = port && port > 0 ? port : undefined;

  // host,port
  const comma = input.match(/^([^\\,]+)\s*,\s*(\d+)\s*$/);
  if (comma) {
    host = comma[1].trim();
    resolvedPort = Number(comma[2]);
  } else {
    // host\instance
    const slash = input.indexOf("\\");
    if (slash > 0) {
      host = input.slice(0, slash).trim();
      instanceName = input.slice(slash + 1).trim() || undefined;
    }
  }

  return { host, instanceName, port: resolvedPort };
}

function friendlySqlError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Port for .+ not found/i.test(msg)) {
    return (
      `${msg}\n\n` +
      "Named instance portu bulunamadı (SQL Browser).\n" +
      "Çözüm:\n" +
      "1) Port alanına instance portunu yazın (örn. 1433) ve sunucuyu sadece DESKTOP-97B4PJQ olarak girin\n" +
      "   veya DESKTOP-97B4PJQ,PORT yazın\n" +
      "2) Windows'ta SQL Server Browser servisini başlatın\n" +
      "3) SQL Server Configuration Manager → TCP/IP Enabled + portu not edin"
    );
  }
  if (/Failed to connect|ELOGIN|Login failed/i.test(msg)) {
    return `${msg}\n\nKullanıcı/şifre veya SQL Authentication ayarını kontrol edin.`;
  }
  if (/timeout|ETIMEOUT|Bağlantı zaman aşımı/i.test(msg)) {
    return `${msg}\n\nSunucu adı, port veya firewall (TCP) ayarını kontrol edin.`;
  }
  return msg;
}

function buildConfig(cfg: DbConfig): sql.config {
  const { host, instanceName, port } = parseServerAddress(cfg.server, cfg.port);
  const connectTimeout = 15000;

  const options: sql.config["options"] = {
    encrypt: cfg.encrypt ?? false,
    trustServerCertificate: cfg.trustServerCertificate ?? true,
    enableArithAbort: true,
    connectTimeout,
    requestTimeout: 120000,
  };

  // Port varsa Browser'a ihtiyaç yok; instanceName gönderme
  if (port) {
    // explicit port
  } else if (instanceName) {
    options.instanceName = instanceName;
  }

  const config: sql.config = {
    server: host,
    database: cfg.database,
    user: cfg.windowsAuth ? undefined : cfg.user,
    password: cfg.windowsAuth ? undefined : cfg.password,
    options,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: connectTimeout,
  };

  if (port) {
    config.port = port;
  }

  return config;
}

function keyOf(cfg: DbConfig) {
  const parsed = parseServerAddress(cfg.server, cfg.port);
  return `${parsed.host}|${parsed.instanceName || ""}|${parsed.port || ""}|${cfg.database}|${cfg.user}|${cfg.windowsAuth ? "win" : "sql"}`;
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
    await temp.connect();
    await temp.request().query("SELECT 1 AS ok");
    const parsed = parseServerAddress(cfg.server, cfg.port);
    return {
      ok: true,
      message: `Bağlantı başarılı (${parsed.host}${parsed.port ? "," + parsed.port : parsed.instanceName ? "\\" + parsed.instanceName : ""})`,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      message: friendlySqlError(err),
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
