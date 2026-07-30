export type DbConfig = {
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  windowsAuth?: boolean;
};

export type FirmPeriod = {
  firmaNr: string;
  firmaAdi: string;
  donemNr: string;
  donemBaslangic?: string;
  donemBitis?: string;
};

export type AppSession = {
  firmaNr: string;
  firmaAdi: string;
  donemNr: string;
  startDate: string;
  endDate: string;
  demoMode?: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export type ViewStatus = {
  name: string;
  exists: boolean;
  created?: boolean;
  error?: string;
};

export type ReportRow = Record<string, string | number | null | boolean>;

export type ReportResponse = {
  columns: string[];
  rows: ReportRow[];
  totals?: ReportRow;
  meta?: Record<string, unknown>;
  source: "sql" | "demo";
};

export type DashboardSummary = {
  toplamSatis: number;
  toplamMaliyet: number;
  brutKar: number;
  hizmetGideri: number;
  personelGideri: number;
  netKar: number;
  bankaTlBakiye: number;
  negatifStokAdedi: number;
  krediKalan: number;
  isyeriKarlilik: Array<{
    isYeri: string;
    satis: number;
    netKar: number;
  }>;
  source: "sql" | "demo";
};
