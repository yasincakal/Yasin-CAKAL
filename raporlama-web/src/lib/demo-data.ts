import type { DashboardSummary, ReportResponse } from "./types";

export const demoFirms = [
  { NR: 328, NAME: "ERYAP MOBİLYA AŞ", TITLE: "ERYAP MOBİLYA AŞ" },
];

export const demoPeriods = [
  { NR: 1, BEGDATE: "2026-01-01", ENDDATE: "2026-12-31" },
];

export const demoFirmPeriods = [
  {
    firmaAdi: "ERYAP MOBİLYA AŞ",
    database: "LOGODB",
    firmaNr: "328",
    donemNr: "01",
    donemBaslangic: "2026-01-01",
    donemBitis: "2026-12-31",
  },
];

export function demoDashboard(): DashboardSummary {
  return {
    toplamSatis: 114_653_557.21,
    toplamMaliyet: 60_475_673.88,
    brutKar: 54_177_883.33,
    hizmetGideri: 19_868_520.57,
    personelGideri: 15_837_699.41,
    netKar: 18_471_663.35,
    bankaTlBakiye: -73_665_726.87,
    krediKalan: 12_450_000,
    cariBorclu: 8_450_000,
    cariAlacakli: 3_120_000,
    cariNet: 5_330_000,
    cariBorcluAdet: 186,
    cariAlacakliAdet: 94,
    isyeriKarlilik: [
      { isYeri: "LİMAN ENZA", satis: 48_163_002.65, netKar: 6_163_606.73 },
      { isYeri: "GAZİ BULVARI ENZA", satis: 23_350_616.18, netKar: 6_570_371.82 },
      { isYeri: "LEAFPORT KONYAALTI HOTEL", satis: 11_385_478.35, netKar: 3_418_553.09 },
      { isYeri: "LEAF RİVER HOTEL", satis: 9_335_703.79, netKar: 4_433_006.02 },
      { isYeri: "ERYAP MERKEZ YÖNETİM", satis: 6_182_893.27, netKar: -105_039.22 },
      { isYeri: "ÇEVREYOLU YATAŞ BEDDİNG", satis: 5_943_117.07, netKar: -1_821_255.06 },
      { isYeri: "KUMLUCA ENZA", satis: 5_148_426.42, netKar: 914_219.17 },
      { isYeri: "ESKİ SANAYİ YATAŞ BEDDİNG", satis: 5_126_319.48, netKar: 1_239_126.11 },
    ],
    source: "demo",
  };
}

export function demoKarlilik(): ReportResponse {
  const rows = [
    {
      "İş Yeri": "ÇEVREYOLU YATAŞ BEDDİNG",
      "Satış Tutarı": 5943117.07,
      "Giriş Maliyeti": 4005432.07,
      "Brüt Kar Tutar": 1937685.0,
      "Hizmet Gideri": 392550.19,
      "Personel Gideri": 3366389.87,
      "Net Kar Tutarı": -1821255.06,
      "Net Kar Oranı %": -45.47,
    },
    {
      "İş Yeri": "ERYAP MERKEZ YÖNETİM",
      "Satış Tutarı": 6182893.27,
      "Giriş Maliyeti": 3281287.49,
      "Brüt Kar Tutar": 2901605.78,
      "Hizmet Gideri": 3006645.0,
      "Personel Gideri": 0,
      "Net Kar Tutarı": -105039.22,
      "Net Kar Oranı %": -3.2,
    },
    {
      "İş Yeri": "ESKİ SANAYİ YATAŞ BEDDİNG",
      "Satış Tutarı": 5126319.48,
      "Giriş Maliyeti": 3488458.8,
      "Brüt Kar Tutar": 1637860.68,
      "Hizmet Gideri": 149374.07,
      "Personel Gideri": 249360.5,
      "Net Kar Tutarı": 1239126.11,
      "Net Kar Oranı %": 35.52,
    },
    {
      "İş Yeri": "GAZİ BULVARI ENZA",
      "Satış Tutarı": 23350616.18,
      "Giriş Maliyeti": 15749703.42,
      "Brüt Kar Tutar": 7600912.76,
      "Hizmet Gideri": 67246.49,
      "Personel Gideri": 963294.45,
      "Net Kar Tutarı": 6570371.82,
      "Net Kar Oranı %": 41.72,
    },
    {
      "İş Yeri": "KUMLUCA ENZA",
      "Satış Tutarı": 5148426.42,
      "Giriş Maliyeti": 3471845.91,
      "Brüt Kar Tutar": 1676580.51,
      "Hizmet Gideri": 43273.3,
      "Personel Gideri": 719088.04,
      "Net Kar Tutarı": 914219.17,
      "Net Kar Oranı %": 26.33,
    },
    {
      "İş Yeri": "LEAF RİVER HOTEL",
      "Satış Tutarı": 9335703.79,
      "Giriş Maliyeti": 0,
      "Brüt Kar Tutar": 9335703.79,
      "Hizmet Gideri": 1421105.66,
      "Personel Gideri": 3481592.11,
      "Net Kar Tutarı": 4433006.02,
      "Net Kar Oranı %": 0,
    },
    {
      "İş Yeri": "LEAFPORT KONYAALTI HOTEL",
      "Satış Tutarı": 11385478.35,
      "Giriş Maliyeti": 4048.88,
      "Brüt Kar Tutar": 11381429.47,
      "Hizmet Gideri": 2731686.8,
      "Personel Gideri": 5231189.58,
      "Net Kar Tutarı": 3418553.09,
      "Net Kar Oranı %": 84432.07,
    },
    {
      "İş Yeri": "LİMAN ENZA",
      "Satış Tutarı": 48163002.65,
      "Giriş Maliyeti": 30479897.31,
      "Brüt Kar Tutar": 17683105.34,
      "Hizmet Gideri": 9692713.75,
      "Personel Gideri": 1826784.86,
      "Net Kar Tutarı": 6163606.73,
      "Net Kar Oranı %": 20.22,
    },
  ];
  const totals = {
    "İş Yeri": "Genel Toplam",
    "Satış Tutarı": rows.reduce((s, r) => s + Number(r["Satış Tutarı"]), 0),
    "Giriş Maliyeti": rows.reduce((s, r) => s + Number(r["Giriş Maliyeti"]), 0),
    "Brüt Kar Tutar": rows.reduce((s, r) => s + Number(r["Brüt Kar Tutar"]), 0),
    "Hizmet Gideri": rows.reduce((s, r) => s + Number(r["Hizmet Gideri"]), 0),
    "Personel Gideri": rows.reduce((s, r) => s + Number(r["Personel Gideri"]), 0),
    "Net Kar Tutarı": rows.reduce((s, r) => s + Number(r["Net Kar Tutarı"]), 0),
    "Net Kar Oranı %": null,
  };
  return {
    columns: Object.keys(rows[0]),
    rows,
    totals,
    source: "demo",
  };
}

export function demoBanka(): ReportResponse {
  const rows = [
    {
      "Banka Kodu": "001",
      "Banka Adı": "AK BANK",
      "Hesap Kodu": "001   01-001",
      "Hesap Adı": "AKBANK - 9490  NL TL HES",
      "Özel Kod": "BAKIYE",
      "TL Bakiye": 451.79,
      "Bakiye Tipi": "(B)",
      "Döviz Türü": "TL",
      "Döviz Tutarı": 451.79,
    },
    {
      "Banka Kodu": "100",
      "Banka Adı": "GARANTİ BANK",
      "Hesap Kodu": "100   01-102",
      "Hesap Adı": "GARANTİ BANKASI - 6642 NL TL HES",
      "Özel Kod": "BAKIYE",
      "TL Bakiye": 20161850.83,
      "Bakiye Tipi": "(B)",
      "Döviz Türü": "TL",
      "Döviz Tutarı": 20161850.83,
    },
    {
      "Banka Kodu": "050",
      "Banka Adı": "DENİZ BANK",
      "Hesap Kodu": "050   01-050",
      "Hesap Adı": "DENİZ BANK - 001 NL TL HES",
      "Özel Kod": "BAKIYE",
      "TL Bakiye": 72755000,
      "Bakiye Tipi": "(A)",
      "Döviz Türü": "TL",
      "Döviz Tutarı": -72755000,
    },
    {
      "Banka Kodu": "125",
      "Banka Adı": "HALK BANK",
      "Hesap Kodu": "125   01-129",
      "Hesap Adı": "HALK BANKASI - 4071 NL TL HES",
      "Özel Kod": "BAKIYE",
      "TL Bakiye": 6812313.43,
      "Bakiye Tipi": "(A)",
      "Döviz Türü": "TL",
      "Döviz Tutarı": -6812313.43,
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoBankaOzet(): ReportResponse {
  const rows = [
    { Tipi: "Hesap", "Döviz Türü": "TL", "Döviz Tutarı": -73665726.87 },
    { Tipi: "Hesap", "Döviz Türü": "USD", "Döviz Tutarı": 555.83 },
    { Tipi: "Hesap", "Döviz Türü": "EUR", "Döviz Tutarı": 15727.1 },
    { Tipi: "Fon", "Döviz Türü": "TL", "Döviz Tutarı": 1250000 },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoKrediOzet(): ReportResponse {
  const rows = [
    {
      "Banka Kodu": "100",
      "Banka Adı": "GARANTİ BANK",
      "Hesap Kodu": "100   01-106",
      "Hesap Adı": "GARANTİ - Kredi Hesabı",
      "Taksit Anapara": 8500000,
      "Taksit Faiz": 420000,
      Toplam: 8920000,
    },
    {
      "Banka Kodu": "050",
      "Banka Adı": "DENİZ BANK",
      "Hesap Kodu": "050   01-050",
      "Hesap Adı": "DENİZ - Kredi Hesabı",
      "Taksit Anapara": 3200000,
      "Taksit Faiz": 180000,
      Toplam: 3380000,
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoKrediDetay(): ReportResponse {
  const rows = [
    {
      "Banka Kodu": "100",
      "Banka Adı": "GARANTİ BANK",
      "Kre.Hs. Kodu": "KR-001",
      "Kre.Hs. Adı": "İşletme Kredisi 1",
      "Kre.Kart Türü": "İşletme Kredisi",
      "Taksit Vade": "2026-08-15",
      "Taksit Anapara": 250000,
      "Taksit Faiz": 18500,
      "Kalan Tutar": 268500,
      Kalan: "Yürürlükte",
    },
    {
      "Banka Kodu": "100",
      "Banka Adı": "GARANTİ BANK",
      "Kre.Hs. Kodu": "KR-001",
      "Kre.Hs. Adı": "İşletme Kredisi 1",
      "Kre.Kart Türü": "İşletme Kredisi",
      "Taksit Vade": "2026-07-15",
      "Taksit Anapara": 250000,
      "Taksit Faiz": 19200,
      "Kalan Tutar": 0,
      Kalan: "Kapandı",
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoFatura(): ReportResponse {
  const rows = [
    {
      "Cari Hesap Kodu": "120.01.0001",
      "Cari Hesap Adı": "ÖRNEK MÜŞTERİ A.Ş.",
      "İş Yeri": "LİMAN ENZA",
      "Fatura No": "REM2026000002165",
      Tarih: "2026-06-30",
      "Stok Kodu": "00882940",
      "Stok Adı": "YAĞLI BOYA TABLO 100 X 150 CM",
      "Net Tutar": 6666.67,
      "Giriş Maliyeti": 4200,
      "Kar Tutarı": 2466.67,
      "Kar Oranı %": 37.0,
    },
    {
      "Cari Hesap Kodu": "120.01.0042",
      "Cari Hesap Adı": "DEMO CARİ LTD.",
      "İş Yeri": "GAZİ BULVARI ENZA",
      "Fatura No": "MER2026000000298",
      Tarih: "2026-06-27",
      "Stok Kodu": "01059033",
      "Stok Adı": "ALESSA KONSOL AKSESUAR SET.",
      "Net Tutar": 5833.33,
      "Giriş Maliyeti": 3100,
      "Kar Tutarı": 2733.33,
      "Kar Oranı %": 46.85,
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoHizmet(): ReportResponse {
  const rows = [
    {
      "Cari Hesap Kodu": "320.01.0010",
      "Cari Hesap Adı": "HİZMET TEDARİKÇİSİ",
      "İş Yeri": "LİMAN ENZA",
      "Fatura No": "ALS2026000001120",
      Tarih: "2026-03-15",
      "Fatura Türü": "Alınan Hizmet Faturası",
      "Hizmet Kodu": "700.02.0019",
      "Hizmet Adı": "Elektrik tesisat işleri malzeme işçilik Giderleri",
      "Net Tutar": 624065.22,
    },
    {
      "Cari Hesap Kodu": "320.01.0022",
      "Cari Hesap Adı": "İNŞAAT GİDERLERİ A.Ş.",
      "İş Yeri": "LEAF RİVER LARA",
      "Fatura No": "ALS2026000001188",
      Tarih: "2026-04-02",
      "Fatura Türü": "Alınan Hizmet Faturası",
      "Hizmet Kodu": "700.02.0007",
      "Hizmet Adı": "Karot  ve kırma  Gideri",
      "Net Tutar": 93636.75,
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoPersonel(): ReportResponse {
  const rows = [
    {
      "İş Yeri No": 8,
      "İş Yeri": "LEAFPORT KONYAALTI HOTEL",
      Tarih: "2026-01-31",
      Ay: "01-Ocak",
      "Fiş Türü": "Mahsup Fişi",
      "Fiş No": "0000028924",
      "Hesap Kodu": "740.20.01.001",
      "Hesap Adı": "İŞÇİ ÜCRET VE GİDERLERİ",
      Borç: 884327.42,
      Alacak: 0,
      "Borç / Alacak": 884327.42,
      "Modül Adı": "Personel Ödemeleri",
    },
    {
      "İş Yeri No": 9,
      "İş Yeri": "LEAF RİVER HOTEL",
      Tarih: "2026-01-31",
      Ay: "01-Ocak",
      "Fiş Türü": "Mahsup Fişi",
      "Fiş No": "0000028924",
      "Hesap Kodu": "740.21.01.001",
      "Hesap Adı": "İŞÇİ ÜCRET VE GİDERLERİ",
      Borç: 676611.22,
      Alacak: 0,
      "Borç / Alacak": 676611.22,
      "Modül Adı": "Personel Ödemeleri",
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}

export function demoNegatif(): ReportResponse {
  const rows = [
    {
      "Stok Kodu": "00882940",
      "Stok Adı": "1167362 -YAĞLI BOYA TABLO 100 X 150 CM",
      "Ambar Adı": "Merkez(Antalya)",
      "Ambar No": 0,
      "Fiş Türü": "Toptan Satış Faturası",
      "Fiş No": "ERS2023000000887",
      "Fatura No": "REM2026000002165",
      Tarih: "2026-06-30",
      "Ana Miktar": 1,
      Tutar: 6666.67,
      "Kalan Miktar": -1,
      Negatif: -1,
    },
    {
      "Stok Kodu": "01393732",
      "Stok Adı": "LENTO BAZA 120X200 4706 GK:40114 GRI AR:306",
      "Ambar Adı": "ANA DEPO",
      "Ambar No": 104,
      "Fiş Türü": "Toptan Satış Faturası",
      "Fiş No": "0000000000002548",
      "Fatura No": "MER2026000000295",
      Tarih: "2026-06-27",
      "Ana Miktar": 8,
      Tutar: 100248.38,
      "Kalan Miktar": -8,
      Negatif: -1,
    },
  ];
  return { columns: Object.keys(rows[0]), rows, source: "demo" };
}
