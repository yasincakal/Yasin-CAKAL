import { getPool } from "./db";
import { formatDonem, formatFirma, loadSession, viewName } from "./config";
import { toSqlDate } from "./format";
import {
  demoBanka,
  demoBankaOzet,
  demoDashboard,
  demoFatura,
  demoHizmet,
  demoKarlilik,
  demoKrediDetay,
  demoKrediOzet,
  demoNegatif,
  demoPersonel,
} from "./demo-data";
import type { DashboardSummary, ReportResponse, ReportRow } from "./types";

function sessionOrThrow() {
  const s = loadSession();
  if (!s) throw new Error("Firma/dönem seçimi yapılmamış.");
  return s;
}

function v(suffix: string) {
  const s = sessionOrThrow();
  return viewName(s.firmaNr, s.donemNr, suffix);
}

function dateFilter(alias = "Tarih") {
  const s = sessionOrThrow();
  return `${alias} BETWEEN CONVERT(datetime,'${toSqlDate(s.startDate)}',104) AND CONVERT(datetime,'${toSqlDate(s.endDate)}',104)`;
}

function toReport(rows: ReportRow[], source: "sql" | "demo"): ReportResponse {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { columns, rows, source };
}

async function safeQuery(sqlText: string): Promise<ReportRow[]> {
  const pool = await getPool();
  const result = await pool.request().query(sqlText);
  return result.recordset as ReportRow[];
}

export async function getDashboard(): Promise<DashboardSummary> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoDashboard();
  try {
    const firma = formatFirma(s.firmaNr);
    const fatura = v("FATURARAPOR");
    const hizmet = v("HIZMETRAPOR");
    const muhasebe = v("MUHASEBERAPOR");
    const banka = v("BANKARAPOR");
    const kredi = v("KREDIRAPOR");
    const negatif = v("STOK_NEGATIF");

    const karlilikSql = `
SELECT NAME AS [isYeri],
 ISNULL(SATIS.[Satış Tutarı],0) [satis],
 ISNULL(SATIS.[Brüt Kar Tutar],0)
  - ISNULL(HIZMET.[Hizmet Gideri],0)
  - ISNULL(PERSONEL.Borç,0) AS [netKar],
 ISNULL(SATIS.[Satış Tutarı],0) [satisRaw],
 ISNULL(SATIS.[Giriş Maliyeti],0) [maliyet],
 ISNULL(SATIS.[Brüt Kar Tutar],0) [brut],
 ISNULL(HIZMET.[Hizmet Gideri],0) [hizmet],
 ISNULL(PERSONEL.Borç,0) [personel]
FROM L_CAPIDIV ISYERI
LEFT JOIN (
  SELECT HAREKET.[İş Yeri No],
    SUM([Net Tutar]) as [Satış Tutarı],
    SUM([Giriş Maliyeti]) as [Giriş Maliyeti],
    SUM([Kar Tutarı]) [Brüt Kar Tutar]
  FROM [dbo].[${fatura}] HAREKET
  WHERE ${dateFilter("HAREKET.Tarih")}
  GROUP BY HAREKET.[İş Yeri No]
) SATIS ON SATIS.[İş Yeri No]=ISYERI.NR
LEFT JOIN (
  SELECT [İş Yeri No], SUM([Net Tutar]) AS [Hizmet Gideri]
  FROM [dbo].[${hizmet}]
  WHERE [Fatura Türü] IN ('Satın Alma Faturası','Alınan Hizmet Faturası')
    AND ${dateFilter("Tarih")}
  GROUP BY [İş Yeri No]
) AS HIZMET ON HIZMET.[İş Yeri No] = ISYERI.NR
LEFT JOIN (
  SELECT [İş Yeri No], SUM(Borç) Borç
  FROM [dbo].[${muhasebe}]
  WHERE ${dateFilter("Tarih")}
  GROUP BY [İş Yeri No]
) PERSONEL ON PERSONEL.[İş Yeri No] = ISYERI.NR
WHERE ISYERI.FIRMNR = '${firma}'
  AND (ISNULL(SATIS.[Satış Tutarı],0)>0 OR ISNULL(HIZMET.[Hizmet Gideri],0)>0)
ORDER BY NAME`;

    const rows = await safeQuery(karlilikSql);
    const bankaRows = await safeQuery(
      `SELECT SUM(CASE WHEN [Bakiye Tipi]='(A)' THEN -[TL Bakiye] ELSE [TL Bakiye] END) AS bakiye
       FROM [dbo].[${banka}] WHERE [Döviz Türü]='TL' AND [Özel Kod]='BAKIYE'`
    );
    const krediRows = await safeQuery(
      `SELECT SUM(ISNULL([Kalan Tutar],0)) AS kalan FROM [dbo].[${kredi}] WHERE [Kalan]='Yürürlükte'`
    );
    const negatifRows = await safeQuery(
      `SELECT COUNT(*) AS adet FROM [dbo].[${negatif}] WHERE Negatif=-1`
    );

    const isyeriKarlilik = rows.map((r) => ({
      isYeri: String(r.isYeri ?? ""),
      satis: Number(r.satis ?? 0),
      netKar: Number(r.netKar ?? 0),
    }));

    return {
      toplamSatis: rows.reduce((a, r) => a + Number(r.satisRaw ?? 0), 0),
      toplamMaliyet: rows.reduce((a, r) => a + Number(r.maliyet ?? 0), 0),
      brutKar: rows.reduce((a, r) => a + Number(r.brut ?? 0), 0),
      hizmetGideri: rows.reduce((a, r) => a + Number(r.hizmet ?? 0), 0),
      personelGideri: rows.reduce((a, r) => a + Number(r.personel ?? 0), 0),
      netKar: rows.reduce((a, r) => a + Number(r.netKar ?? 0), 0),
      bankaTlBakiye: Number(bankaRows[0]?.bakiye ?? 0),
      negatifStokAdedi: Number(negatifRows[0]?.adet ?? 0),
      krediKalan: Number(krediRows[0]?.kalan ?? 0),
      isyeriKarlilik,
      source: "sql",
    };
  } catch {
    return demoDashboard();
  }
}

export async function getKarlilikReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoKarlilik();
  try {
    const firma = formatFirma(s.firmaNr);
    const sqlText = `
SELECT NAME AS [İş Yeri],
 ISNULL(SATIS.[Satış Tutarı],0) [Satış Tutarı],
 ISNULL(SATIS.[Giriş Maliyeti],0) [Giriş Maliyeti],
 ISNULL(SATIS.[Brüt Kar Tutar],0)[Brüt Kar Tutar],
 ISNULL(HIZMET.[Hizmet Gideri],0) [Hizmet Gideri],
 ISNULL(PERSONEL.Borç,0) AS [Personel Gideri],
 ISNULL(SATIS.[Brüt Kar Tutar],0) - ISNULL(HIZMET.[Hizmet Gideri],0) - ISNULL(PERSONEL.Borç,0) AS [Net Kar Tutarı],
 ROUND(CASE WHEN ISNULL(SATIS.[Giriş Maliyeti],0)=0 THEN 0
   ELSE ((ISNULL(SATIS.[Brüt Kar Tutar],0)-ISNULL(HIZMET.[Hizmet Gideri],0)-ISNULL(PERSONEL.Borç,0))*100.0)/ISNULL(SATIS.[Giriş Maliyeti],0)
 END,2) AS [Net Kar Oranı %]
FROM L_CAPIDIV ISYERI
LEFT JOIN (
  SELECT HAREKET.[İş Yeri No], SUM([Net Tutar]) [Satış Tutarı], SUM([Giriş Maliyeti]) [Giriş Maliyeti], SUM([Kar Tutarı]) [Brüt Kar Tutar]
  FROM [dbo].[${v("FATURARAPOR")}] HAREKET
  WHERE ${dateFilter("HAREKET.Tarih")}
  GROUP BY HAREKET.[İş Yeri No]
) SATIS ON SATIS.[İş Yeri No]=ISYERI.NR
LEFT JOIN (
  SELECT [İş Yeri No], SUM([Net Tutar]) [Hizmet Gideri]
  FROM [dbo].[${v("HIZMETRAPOR")}]
  WHERE [Fatura Türü] IN ('Satın Alma Faturası','Alınan Hizmet Faturası') AND ${dateFilter("Tarih")}
  GROUP BY [İş Yeri No]
) HIZMET ON HIZMET.[İş Yeri No]=ISYERI.NR
LEFT JOIN (
  SELECT [İş Yeri No], SUM(Borç) Borç
  FROM [dbo].[${v("MUHASEBERAPOR")}]
  WHERE ${dateFilter("Tarih")} AND [Hesap Kodu] IN (
    '740.20.01.001','740.21.01.001','760.01.01.001','760.02.01.001','760.03.01.001','760.04.01.001','760.05.01.001'
  )
  GROUP BY [İş Yeri No]
) PERSONEL ON PERSONEL.[İş Yeri No]=ISYERI.NR
WHERE ISYERI.FIRMNR='${firma}' AND (ISNULL(SATIS.[Satış Tutarı],0)>0 OR ISNULL(HIZMET.[Hizmet Gideri],0)>0)
ORDER BY NAME`;
    const rows = await safeQuery(sqlText);
    const totals: ReportRow = {
      "İş Yeri": "Genel Toplam",
      "Satış Tutarı": rows.reduce((a, r) => a + Number(r["Satış Tutarı"] ?? 0), 0),
      "Giriş Maliyeti": rows.reduce((a, r) => a + Number(r["Giriş Maliyeti"] ?? 0), 0),
      "Brüt Kar Tutar": rows.reduce((a, r) => a + Number(r["Brüt Kar Tutar"] ?? 0), 0),
      "Hizmet Gideri": rows.reduce((a, r) => a + Number(r["Hizmet Gideri"] ?? 0), 0),
      "Personel Gideri": rows.reduce((a, r) => a + Number(r["Personel Gideri"] ?? 0), 0),
      "Net Kar Tutarı": rows.reduce((a, r) => a + Number(r["Net Kar Tutarı"] ?? 0), 0),
      "Net Kar Oranı %": null,
    };
    return { ...toReport(rows, "sql"), totals };
  } catch {
    return demoKarlilik();
  }
}

export async function getBankaReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoBanka();
  try {
    const rows = await safeQuery(
      `SELECT * FROM [dbo].[${v("BANKARAPOR")}] ORDER BY [Banka Kodu],[Hesap Kodu]`
    );
    return toReport(rows, "sql");
  } catch {
    return demoBanka();
  }
}

export async function getBankaOzetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoBankaOzet();
  try {
    const rows = await safeQuery(`
SELECT 'Hesap' AS [Tipi],[Döviz Türü], SUM([Döviz Tutarı]) [Döviz Tutarı]
FROM [dbo].[${v("BANKARAPOR")}] WHERE [Özel Kod]='BAKIYE' GROUP BY [Döviz Türü]
UNION ALL
SELECT 'Fon' AS [Tipi],[Döviz Türü], SUM([Döviz Tutarı]) [Döviz Tutarı]
FROM [dbo].[${v("BANKARAPOR")}] WHERE [Özel Kod]='FON' GROUP BY [Döviz Türü]
ORDER BY 1 DESC, 2 ASC`);
    return toReport(rows, "sql");
  } catch {
    return demoBankaOzet();
  }
}

export async function getKrediOzetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoKrediOzet();
  try {
    const rows = await safeQuery(`
SELECT [Banka Kodu],[Banka Adı],[Hesap Kodu],[Hesap Adı],
 SUM([Taksit Anapara]) [Taksit Anapara],
 SUM([Taksit Faiz]) [Taksit Faiz],
 SUM([Taksit Faiz]+[Taksit BSMV]+[Taksit KKDF]+[Taksit Anapara]) AS [Toplam]
FROM [dbo].[${v("KREDIRAPOR")}]
GROUP BY [Banka Kodu],[Banka Adı],[Hesap Kodu],[Hesap Adı]
ORDER BY [Banka Kodu],[Hesap Kodu]`);
    return toReport(rows, "sql");
  } catch {
    return demoKrediOzet();
  }
}

export async function getKrediDetayReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoKrediDetay();
  try {
    const rows = await safeQuery(
      `SELECT * FROM [dbo].[${v("KREDIRAPOR")}] ORDER BY [Kre.Hs. Kodu],[Taksit Vade]`
    );
    return toReport(rows, "sql");
  } catch {
    return demoKrediDetay();
  }
}

export async function getFaturaReport(stokKod = "%"): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoFatura();
  try {
    const like = `${stokKod || ""}%`.replace(/'/g, "''");
    const rows = await safeQuery(`
SELECT * FROM [dbo].[${v("FATURARAPOR")}]
WHERE ${dateFilter("Tarih")} AND [Stok Kodu] LIKE '${like}'
ORDER BY Tarih,[Fatura No],[Stok Kodu]`);
    return toReport(rows, "sql");
  } catch {
    return demoFatura();
  }
}

export async function getHizmetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoHizmet();
  try {
    const rows = await safeQuery(`
SELECT * FROM [dbo].[${v("HIZMETRAPOR")}]
WHERE [Gelir/Gider]='Gider' AND ${dateFilter("Tarih")}
ORDER BY [Tarih],[Fatura No],[Hizmet Kodu]`);
    return toReport(rows, "sql");
  } catch {
    return demoHizmet();
  }
}

export async function getPersonelReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoPersonel();
  try {
    const rows = await safeQuery(`
SELECT * FROM [dbo].[${v("MUHASEBERAPOR")}]
WHERE ${dateFilter("Tarih")}
ORDER BY [Tarih],[Fiş No]`);
    return toReport(rows, "sql");
  } catch {
    return demoPersonel();
  }
}

export async function getNegatifReport(filters?: {
  stokKod?: string;
  stokAd?: string;
  fisTur?: string;
  onlyNegative?: boolean;
}): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (s.demoMode) return demoNegatif();
  try {
    const stokKod = `${filters?.stokKod || ""}%`.replace(/'/g, "''");
    const stokAd = `${filters?.stokAd || ""}%`.replace(/'/g, "''");
    const fisTur = `${filters?.fisTur || ""}%`.replace(/'/g, "''");
    const onlyNeg = filters?.onlyNegative !== false;
    const rows = await safeQuery(`
SELECT * FROM [dbo].[${v("STOK_NEGATIF")}]
WHERE [Stok Kodu] LIKE '${stokKod}'
  AND [Stok Adı] LIKE '${stokAd}'
  AND [Fiş Türü] LIKE '${fisTur}'
  ${onlyNeg ? "AND Negatif=-1" : ""}
ORDER BY [Stok Kodu],[Tarih]`);
    return toReport(rows, "sql");
  } catch {
    return demoNegatif();
  }
}

export async function refreshAllReports() {
  // Touch each report to warm / validate
  const results = await Promise.allSettled([
    getKarlilikReport(),
    getBankaReport(),
    getKrediOzetReport(),
    getFaturaReport(),
    getHizmetReport(),
    getPersonelReport(),
    getNegatifReport(),
    getDashboard(),
  ]);
  return {
    ok: results.every((r) => r.status === "fulfilled"),
    count: results.filter((r) => r.status === "fulfilled").length,
  };
}

// silence unused import warning if any
void formatDonem;
