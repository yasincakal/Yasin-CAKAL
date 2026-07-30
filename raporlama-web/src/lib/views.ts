import fs from "fs";
import path from "path";
import { executeBatches, getPool } from "./db";
import { formatDonem, formatFirma } from "./config";
import type { ViewStatus } from "./types";

export const REQUIRED_VIEWS = [
  "FATURARAPOR",
  "HIZMETRAPOR",
  "MUHASEBERAPOR",
  "BANKARAPOR",
  "KREDIRAPOR",
  "STOK_NEGATIF",
] as const;

export type RequiredView = (typeof REQUIRED_VIEWS)[number];

function templatePath(name: string) {
  return path.join(process.cwd(), "sql", "views", `${name}.sql`);
}

export function renderViewSql(name: string, firmaNr: string, donemNr: string) {
  const file = templatePath(name);
  if (!fs.existsSync(file)) {
    throw new Error(`View şablonu bulunamadı: ${name}`);
  }
  const firma = formatFirma(firmaNr);
  const donem = formatDonem(donemNr);
  return fs
    .readFileSync(file, "utf-8")
    .replaceAll("{{FIRMA}}", firma)
    .replaceAll("{{DONEM}}", donem);
}

export async function checkViewExists(firmaNr: string, donemNr: string, suffix: string) {
  const name = `BAYRAK_${formatFirma(firmaNr)}_${formatDonem(donemNr)}_${suffix}`;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("name", name)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sys.views WHERE name = @name`
    );
  return (result.recordset[0]?.cnt ?? 0) > 0;
}

export async function ensureViews(
  firmaNr: string,
  donemNr: string
): Promise<ViewStatus[]> {
  const statuses: ViewStatus[] = [];
  for (const suffix of REQUIRED_VIEWS) {
    const name = `BAYRAK_${formatFirma(firmaNr)}_${formatDonem(donemNr)}_${suffix}`;
    try {
      const exists = await checkViewExists(firmaNr, donemNr, suffix);
      if (exists) {
        statuses.push({ name, exists: true });
        continue;
      }
      const sqlText = renderViewSql(suffix, firmaNr, donemNr);
      await executeBatches(sqlText);
      statuses.push({ name, exists: true, created: true });
    } catch (err) {
      statuses.push({
        name,
        exists: false,
        error: err instanceof Error ? err.message : "View oluşturulamadı",
      });
    }
  }

  // Optional stored proc for email negative stock
  try {
    const procName = `BAYRAK_${formatFirma(firmaNr)}_${formatDonem(donemNr)}_STOKNEGATIF`;
    const pool = await getPool();
    const exists = await pool
      .request()
      .input("name", procName)
      .query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sys.procedures WHERE name = @name`
      );
    if ((exists.recordset[0]?.cnt ?? 0) === 0) {
      await executeBatches(renderViewSql("STOKNEGATIF_PROC", firmaNr, donemNr));
    }
  } catch {
    /* proc is optional */
  }

  return statuses;
}

export async function listFirmPeriods() {
  const pool = await getPool();
  const result = await pool.request().query<{
    "Firma Adı": string;
    Database: string;
    "Firma No": string;
    "Dönem No": string;
    "Başlangıç Tarihi": Date;
    "Bitiş Tarihi": Date;
  }>(`
SELECT
  CAPIFIRM.NAME AS [Firma Adı],
  CASE WHEN CAPIFIRM.DBNAME='' THEN DB_NAME() ELSE CAPIFIRM.DBNAME END AS [Database],
  RIGHT('000'+CAST(CAPIFIRM.NR AS nvarchar(5)),3) AS [Firma No],
  RIGHT('000'+CAST(CAPIPERIOD.NR AS nvarchar(5)),2) AS [Dönem No],
  CAPIPERIOD.BEGDATE AS [Başlangıç Tarihi],
  CAPIPERIOD.ENDDATE AS [Bitiş Tarihi]
FROM L_CAPIFIRM CAPIFIRM WITH(NOLOCK)
INNER JOIN L_CAPIPERIOD CAPIPERIOD WITH(NOLOCK) ON CAPIPERIOD.FIRMNR = CAPIFIRM.NR
ORDER BY CAPIFIRM.NR, CAPIPERIOD.NR
`);
  return result.recordset.map((row) => ({
    firmaAdi: String(row["Firma Adı"] ?? ""),
    database: String(row.Database ?? ""),
    firmaNr: String(row["Firma No"] ?? "").padStart(3, "0"),
    donemNr: String(row["Dönem No"] ?? "").padStart(2, "0"),
    donemBaslangic: toIsoDate(row["Başlangıç Tarihi"]),
    donemBitis: toIsoDate(row["Bitiş Tarihi"]),
  }));
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** @deprecated use listFirmPeriods */
export async function listFirms() {
  const rows = await listFirmPeriods();
  const map = new Map<string, { NR: number; NAME: string; TITLE: string }>();
  for (const r of rows) {
    if (!map.has(r.firmaNr)) {
      map.set(r.firmaNr, {
        NR: Number(r.firmaNr),
        NAME: r.firmaAdi,
        TITLE: r.firmaAdi,
      });
    }
  }
  return [...map.values()];
}

/** @deprecated use listFirmPeriods */
export async function listPeriods(firmaNr: string) {
  const rows = await listFirmPeriods();
  return rows
    .filter((r) => Number(r.firmaNr) === Number(firmaNr))
    .map((r) => ({
      NR: Number(r.donemNr),
      BEGDATE: r.donemBaslangic,
      ENDDATE: r.donemBitis,
      DATABASE: r.database,
      NAME: r.firmaAdi,
    }));
}
