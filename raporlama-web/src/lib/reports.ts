import { getPool } from "./db";
import { formatFirma, loadSession, viewName } from "./config";
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
import { ensureViews, REQUIRED_VIEWS } from "./views";
import type { DashboardSummary, ReportResponse, ReportRow } from "./types";

function sessionOrThrow() {
  const s = loadSession();
  if (!s) throw new Error("Firma/dönem seçimi yapılmamış.");
  return s;
}

function assertLive(s: ReturnType<typeof sessionOrThrow>) {
  if (s.demoMode) return false;
  return true;
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

async function liveQuery(sqlText: string): Promise<ReportRow[]> {
  const pool = await getPool();
  const result = await pool.request().query(sqlText);
  return result.recordset as ReportRow[];
}

/**
 * Cari bakiye: her zaman seçilen tarihe (bitiş) kadar kümülatif.
 * Gün sonu dahil — CAST AS date ile saat kayması olmaz.
 */
function cariAsOfDatePredicate(endDateIso: string, alias = "[Tarih]") {
  // endDateIso: yyyy-mm-dd
  return `CAST(${alias} AS date) <= CONVERT(date, '${endDateIso}', 23)`;
}

type CariOzetNumbers = {
  borcluToplam: number;
  alacakliToplam: number;
  netBakiye: number;
  borcluAdet: number;
  alacakliAdet: number;
  sifirAdet: number;
  endDate: string;
  source: "sql" | "demo";
};

/** Dashboard + cari raporunun tek ortak kaynağı */
async function loadCariOzetNumbers(): Promise<CariOzetNumbers> {
  const s = sessionOrThrow();
  if (!assertLive(s)) {
    return {
      borcluToplam: 130_000,
      alacakliToplam: 75_000,
      netBakiye: 55_000,
      borcluAdet: 1,
      alacakliAdet: 1,
      sifirAdet: 0,
      endDate: s.endDate,
      source: "demo",
    };
  }
  await ensureLiveViews();
  const cari = v("CARIBAKIYELER");
  const rows = await liveQuery(`
SELECT
  SUM(CASE WHEN Bakiye > 0 THEN Bakiye ELSE 0 END) AS borclu,
  SUM(CASE WHEN Bakiye < 0 THEN -Bakiye ELSE 0 END) AS alacakli,
  SUM(Bakiye) AS net,
  SUM(CASE WHEN Bakiye > 0 THEN 1 ELSE 0 END) AS borcluAdet,
  SUM(CASE WHEN Bakiye < 0 THEN 1 ELSE 0 END) AS alacakliAdet,
  SUM(CASE WHEN Bakiye = 0 THEN 1 ELSE 0 END) AS sifirAdet
FROM (
  SELECT [Cari Kodu], SUM([Bakiye]) AS Bakiye
  FROM [dbo].[${cari}]
  WHERE ${cariAsOfDatePredicate(s.endDate)}
  GROUP BY [Cari Kodu]
) T`);
  return {
    borcluToplam: Number(rows[0]?.borclu ?? 0),
    alacakliToplam: Number(rows[0]?.alacakli ?? 0),
    netBakiye: Number(rows[0]?.net ?? 0),
    borcluAdet: Number(rows[0]?.borcluAdet ?? 0),
    alacakliAdet: Number(rows[0]?.alacakliAdet ?? 0),
    sifirAdet: Number(rows[0]?.sifirAdet ?? 0),
    endDate: s.endDate,
    source: "sql",
  };
}

async function ensureLiveViews() {
  const s = sessionOrThrow();
  if (s.demoMode) return;
  const statuses = await ensureViews(s.firmaNr, s.donemNr, { force: false });
  const failed = statuses.filter((x) => {
    if (!x.name.startsWith("BAYRAK_") || x.exists) return false;
    return REQUIRED_VIEWS.some((suffix) => x.name.endsWith(`_${suffix}`));
  });
  if (failed.length) {
    throw new Error(
      `Kritik view eksik: ${failed.map((f) => `${f.name}${f.error ? ` (${f.error})` : ""}`).join("; ")}`
    );
  }
}

export async function getDashboard(): Promise<DashboardSummary> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoDashboard();
  await ensureLiveViews();

  const firma = formatFirma(s.firmaNr);
  const fatura = v("FATURARAPOR");
  const hizmet = v("HIZMETRAPOR");
  const muhasebe = v("MUHASEBERAPOR");
  const banka = v("BANKARAPOR");
  const kredi = v("KREDIRAPOR");

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
  WHERE [Fatura Türü] IN (N'Satın Alma Faturası',N'Alınan Hizmet Faturası')
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

  const rows = await liveQuery(karlilikSql);
  const bankaRows = await liveQuery(
    `SELECT SUM(CASE WHEN [Bakiye Tipi]=N'(A)' THEN -[TL Bakiye] ELSE [TL Bakiye] END) AS bakiye
     FROM [dbo].[${banka}] WHERE [Döviz Türü]=N'TL' AND [Özel Kod]=N'BAKIYE'`
  );
  const krediRows = await liveQuery(
    `SELECT SUM(ISNULL([Kalan Tutar],0)) AS kalan FROM [dbo].[${kredi}] WHERE [Kalan]=N'Yürürlükte'`
  );
  const cariOzet = await loadCariOzetNumbers();

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
    krediKalan: Number(krediRows[0]?.kalan ?? 0),
    cariBorclu: cariOzet.borcluToplam,
    cariAlacakli: cariOzet.alacakliToplam,
    cariNet: cariOzet.netBakiye,
    cariBorcluAdet: cariOzet.borcluAdet,
    cariAlacakliAdet: cariOzet.alacakliAdet,
    isyeriKarlilik,
    source: "sql",
  };
}

export async function getKarlilikReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoKarlilik();
  await ensureLiveViews();
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
  WHERE [Fatura Türü] IN (N'Satın Alma Faturası',N'Alınan Hizmet Faturası') AND ${dateFilter("Tarih")}
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
  const rows = await liveQuery(sqlText);
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
}

export async function getBankaReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoBanka();
  await ensureLiveViews();
  const rows = await liveQuery(
    `SELECT * FROM [dbo].[${v("BANKARAPOR")}] ORDER BY [Banka Kodu],[Hesap Kodu]`
  );
  return toReport(rows, "sql");
}

export async function getBankaOzetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoBankaOzet();
  await ensureLiveViews();
  const rows = await liveQuery(`
SELECT N'Hesap' AS [Tipi],[Döviz Türü], SUM([Döviz Tutarı]) [Döviz Tutarı]
FROM [dbo].[${v("BANKARAPOR")}] WHERE [Özel Kod]=N'BAKIYE' GROUP BY [Döviz Türü]
UNION ALL
SELECT N'Fon' AS [Tipi],[Döviz Türü], SUM([Döviz Tutarı]) [Döviz Tutarı]
FROM [dbo].[${v("BANKARAPOR")}] WHERE [Özel Kod]=N'FON' GROUP BY [Döviz Türü]
ORDER BY 1 DESC, 2 ASC`);
  return toReport(rows, "sql");
}

export async function getKrediOzetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoKrediOzet();
  await ensureLiveViews();
  const rows = await liveQuery(`
SELECT [Banka Kodu],[Banka Adı],[Hesap Kodu],[Hesap Adı],
 SUM([Taksit Anapara]) [Taksit Anapara],
 SUM([Taksit Faiz]) [Taksit Faiz],
 SUM([Taksit Faiz]+[Taksit BSMV]+[Taksit KKDF]+[Taksit Anapara]) AS [Toplam]
FROM [dbo].[${v("KREDIRAPOR")}]
GROUP BY [Banka Kodu],[Banka Adı],[Hesap Kodu],[Hesap Adı]
ORDER BY [Banka Kodu],[Hesap Kodu]`);
  return toReport(rows, "sql");
}

export async function getKrediDetayReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoKrediDetay();
  await ensureLiveViews();
  const rows = await liveQuery(
    `SELECT * FROM [dbo].[${v("KREDIRAPOR")}] ORDER BY [Kre.Hs. Kodu],[Taksit Vade]`
  );
  return toReport(rows, "sql");
}

export async function getFaturaReport(stokKod = "%"): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoFatura();
  await ensureLiveViews();
  const like = `${stokKod || ""}%`.replace(/'/g, "''");
  const rows = await liveQuery(`
SELECT * FROM [dbo].[${v("FATURARAPOR")}]
WHERE ${dateFilter("Tarih")} AND [Stok Kodu] LIKE N'${like}'
ORDER BY Tarih,[Fatura No],[Stok Kodu]`);
  return toReport(rows, "sql");
}

export async function getHizmetReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoHizmet();
  await ensureLiveViews();
  const rows = await liveQuery(`
SELECT * FROM [dbo].[${v("HIZMETRAPOR")}]
WHERE [Gelir/Gider]=N'Gider' AND ${dateFilter("Tarih")}
ORDER BY [Tarih],[Fatura No],[Hizmet Kodu]`);
  return toReport(rows, "sql");
}

export async function getPersonelReport(): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoPersonel();
  await ensureLiveViews();
  const rows = await liveQuery(`
SELECT * FROM [dbo].[${v("MUHASEBERAPOR")}]
WHERE ${dateFilter("Tarih")}
ORDER BY [Tarih],[Fiş No]`);
  return toReport(rows, "sql");
}

export async function getNegatifReport(filters?: {
  stokKod?: string;
  stokAd?: string;
  fisTur?: string;
  onlyNegative?: boolean;
}): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoNegatif();
  await ensureLiveViews();
  const stokKod = `${filters?.stokKod || ""}%`.replace(/'/g, "''");
  const stokAd = `${filters?.stokAd || ""}%`.replace(/'/g, "''");
  const fisTur = `${filters?.fisTur || ""}%`.replace(/'/g, "''");
  const onlyNeg = filters?.onlyNegative !== false;
  const rows = await liveQuery(`
SELECT * FROM [dbo].[${v("STOK_NEGATIF")}]
WHERE [Stok Kodu] LIKE N'${stokKod}'
  AND [Stok Adı] LIKE N'${stokAd}'
  AND [Fiş Türü] LIKE N'${fisTur}'
  ${onlyNeg ? "AND Negatif=-1" : ""}
ORDER BY [Stok Kodu],[Tarih]`);
  return toReport(rows, "sql");
}

/** Cari bakiyeler: her zaman bitiş tarihine kadar kümülatif (başlangıç tarihi yok sayılır) */
export async function getCariBakiyeListe(
  tip: "all" | "borc" | "alacak" = "all"
): Promise<ReportResponse> {
  const s = sessionOrThrow();
  if (!assertLive(s)) return demoCariListe(tip);
  await ensureLiveViews();
  const having =
    tip === "borc"
      ? "HAVING SUM([Bakiye]) > 0"
      : tip === "alacak"
        ? "HAVING SUM([Bakiye]) < 0"
        : "";
  const rows = await liveQuery(`
SELECT
  MAX([Kullanım Durum]) AS [Kullanım Durum],
  [Cari Kodu],
  MAX([Cari Adı]) AS [Cari Adı],
  MAX([Cari Özel Kod]) AS [Cari Özel Kod],
  MAX([Cari Özel Kod2]) AS [Cari Özel Kod2],
  MAX([Cari Özel Kod3]) AS [Cari Özel Kod3],
  SUM([Borç]) AS [Borç],
  SUM([Alacak]) AS [Alacak],
  SUM([Bakiye]) AS [Bakiye],
  CASE WHEN SUM([Bakiye]) > 0 THEN N'Borç' WHEN SUM([Bakiye]) < 0 THEN N'Alacak' ELSE N'Sıfır' END AS [Bakiye Tipi]
FROM [dbo].[${v("CARIBAKIYELER")}]
WHERE ${cariAsOfDatePredicate(s.endDate)}
GROUP BY [Cari Kodu]
${having}
ORDER BY [Cari Kodu]`);

  const borcluToplam = rows
    .filter((r) => Number(r["Bakiye"] ?? 0) > 0)
    .reduce((a, r) => a + Number(r["Bakiye"] ?? 0), 0);
  const alacakliToplam = rows
    .filter((r) => Number(r["Bakiye"] ?? 0) < 0)
    .reduce((a, r) => a + Math.abs(Number(r["Bakiye"] ?? 0)), 0);
  const netBakiye = rows.reduce((a, r) => a + Number(r["Bakiye"] ?? 0), 0);

  const totals: ReportRow = {
    "Kullanım Durum": "",
    "Cari Kodu": "",
    "Cari Adı": "GENEL TOPLAM",
    "Cari Özel Kod": "",
    "Cari Özel Kod2": "",
    "Cari Özel Kod3": "",
    Borç: rows.reduce((a, r) => a + Number(r["Borç"] ?? 0), 0),
    Alacak: rows.reduce((a, r) => a + Number(r["Alacak"] ?? 0), 0),
    Bakiye: netBakiye,
    "Bakiye Tipi": "",
  };
  return {
    columns: [
      "Cari Kodu",
      "Cari Adı",
      "Borç",
      "Alacak",
      "Bakiye",
      "Bakiye Tipi",
      "Kullanım Durum",
      "Cari Özel Kod",
      "Cari Özel Kod2",
      "Cari Özel Kod3",
    ],
    defaultVisible: ["Cari Kodu", "Cari Adı", "Borç", "Alacak", "Bakiye", "Bakiye Tipi"],
    rows,
    totals,
    meta: {
      endDate: s.endDate,
      tip,
      // Dashboard ile aynı mantık (sekme filtresine göre)
      cariBorclu: tip === "alacak" ? 0 : borcluToplam,
      cariAlacakli: tip === "borc" ? 0 : alacakliToplam,
      cariNet: netBakiye,
      note: "Borç/Alacak sütunları hareket toplamı; Bakiye = tarih itibariyle net. Dashboard kartları Bakiye üzerinden hesaplanır.",
    },
    source: "sql",
  };
}

export async function getCariBakiyeOzet(): Promise<ReportResponse> {
  const ozet = await loadCariOzetNumbers();
  return {
    columns: [
      "Borçlu Cariler Toplamı",
      "Alacaklı Cariler Toplamı",
      "Net Bakiye",
      "Borçlu Adet",
      "Alacaklı Adet",
      "Sıfır Adet",
    ],
    rows: [
      {
        "Borçlu Cariler Toplamı": ozet.borcluToplam,
        "Alacaklı Cariler Toplamı": ozet.alacakliToplam,
        "Net Bakiye": ozet.netBakiye,
        "Borçlu Adet": ozet.borcluAdet,
        "Alacaklı Adet": ozet.alacakliAdet,
        "Sıfır Adet": ozet.sifirAdet,
      },
    ],
    defaultVisible: [
      "Borçlu Cariler Toplamı",
      "Alacaklı Cariler Toplamı",
      "Net Bakiye",
      "Borçlu Adet",
      "Alacaklı Adet",
    ],
    meta: { endDate: ozet.endDate, asOfDate: ozet.endDate },
    source: ozet.source,
  };
}

function demoCariListe(tip: "all" | "borc" | "alacak"): ReportResponse {
  let rows = [
    {
      "Cari Kodu": "120.01.0001",
      "Cari Adı": "ÖRNEK MÜŞTERİ A.Ş.",
      Borç: 150000,
      Alacak: 20000,
      Bakiye: 130000,
      "Bakiye Tipi": "Borç",
      "Kullanım Durum": "Kullanımda",
      "Cari Özel Kod": "",
      "Cari Özel Kod2": "",
      "Cari Özel Kod3": "",
    },
    {
      "Cari Kodu": "320.01.0010",
      "Cari Adı": "TEDARİKÇİ LTD.",
      Borç: 10000,
      Alacak: 85000,
      Bakiye: -75000,
      "Bakiye Tipi": "Alacak",
      "Kullanım Durum": "Kullanımda",
      "Cari Özel Kod": "",
      "Cari Özel Kod2": "",
      "Cari Özel Kod3": "",
    },
  ];
  if (tip === "borc") rows = rows.filter((r) => Number(r.Bakiye) > 0);
  if (tip === "alacak") rows = rows.filter((r) => Number(r.Bakiye) < 0);
  const netBakiye = rows.reduce((a, r) => a + Number(r.Bakiye), 0);
  return {
    columns: [
      "Cari Kodu",
      "Cari Adı",
      "Borç",
      "Alacak",
      "Bakiye",
      "Bakiye Tipi",
      "Kullanım Durum",
      "Cari Özel Kod",
      "Cari Özel Kod2",
      "Cari Özel Kod3",
    ],
    defaultVisible: ["Cari Kodu", "Cari Adı", "Borç", "Alacak", "Bakiye", "Bakiye Tipi"],
    rows,
    totals: {
      "Cari Adı": "GENEL TOPLAM",
      Borç: rows.reduce((a, r) => a + Number(r.Borç), 0),
      Alacak: rows.reduce((a, r) => a + Number(r.Alacak), 0),
      Bakiye: netBakiye,
    },
    meta: {
      cariBorclu: tip === "alacak" ? 0 : rows.filter((r) => Number(r.Bakiye) > 0).reduce((a, r) => a + Number(r.Bakiye), 0),
      cariAlacakli:
        tip === "borc"
          ? 0
          : rows.filter((r) => Number(r.Bakiye) < 0).reduce((a, r) => a + Math.abs(Number(r.Bakiye)), 0),
      cariNet: netBakiye,
    },
    source: "demo",
  };
}

export async function refreshAllReports() {
  const s = sessionOrThrow();
  if (!s.demoMode) {
    const statuses = await ensureViews(s.firmaNr, s.donemNr, { force: true });
    const failed = statuses.filter((x) => {
      if (!x.name.startsWith("BAYRAK_") || x.exists) return false;
      return REQUIRED_VIEWS.some((suffix) => x.name.endsWith(`_${suffix}`));
    });
    if (failed.length) {
      return {
        ok: false,
        count: 0,
        message: `View hatası: ${failed.map((f) => `${f.name}${f.error ? ` (${f.error})` : ""}`).join(", ")}`,
        statuses,
      };
    }
  }
  const results = await Promise.allSettled([
    getKarlilikReport(),
    getBankaReport(),
    getBankaOzetReport(),
    getKrediOzetReport(),
    getKrediDetayReport(),
    getFaturaReport(),
    getHizmetReport(),
    getPersonelReport(),
    getNegatifReport(),
    getCariBakiyeOzet(),
    getCariBakiyeListe("all"),
    getDashboard(),
  ]);
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  return {
    ok: rejected.length === 0,
    count: results.filter((r) => r.status === "fulfilled").length,
    message:
      rejected.length === 0
        ? "Raporlar güncellendi (canlı SQL)."
        : rejected.map((r) => String(r.reason?.message || r.reason)).join(" | "),
  };
}
