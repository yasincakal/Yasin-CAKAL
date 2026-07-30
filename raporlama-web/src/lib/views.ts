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

export async function listFirms() {
  const pool = await getPool();
  const result = await pool.request().query<{
    NR: number;
    NAME: string;
    TITLE: string;
  }>(`SELECT NR, NAME, TITLE FROM L_CAPIFIRM ORDER BY NR`);
  return result.recordset;
}

export async function listPeriods(firmaNr: string) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("firma", Number(firmaNr))
    .query<{ NR: number; BEGDATE: Date; ENDDATE: Date }>(
      `SELECT NR, BEGDATE, ENDDATE FROM L_CAPIPERIOD WHERE FIRMNR = @firma ORDER BY NR`
    );
  return result.recordset;
}
