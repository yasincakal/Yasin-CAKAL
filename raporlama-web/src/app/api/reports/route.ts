import { NextResponse } from "next/server";
import { loadSession, saveSession } from "@/lib/config";
import {
  getBankaOzetReport,
  getBankaReport,
  getDashboard,
  getFaturaReport,
  getHizmetReport,
  getKarlilikReport,
  getKrediDetayReport,
  getKrediOzetReport,
  getNegatifReport,
  getPersonelReport,
  refreshAllReports,
} from "@/lib/reports";

export const runtime = "nodejs";

const handlers: Record<string, (sp: URLSearchParams) => Promise<unknown>> = {
  dashboard: async () => getDashboard(),
  karlilik: async () => getKarlilikReport(),
  banka: async () => getBankaReport(),
  "banka-ozet": async () => getBankaOzetReport(),
  "kredi-ozet": async () => getKrediOzetReport(),
  "kredi-detay": async () => getKrediDetayReport(),
  fatura: async (sp) => getFaturaReport(sp.get("stokKod") ?? "%"),
  hizmet: async () => getHizmetReport(),
  personel: async () => getPersonelReport(),
  negatif: async (sp) =>
    getNegatifReport({
      stokKod: sp.get("stokKod") ?? "",
      stokAd: sp.get("stokAd") ?? "",
      fisTur: sp.get("fisTur") ?? "",
      onlyNegative: sp.get("onlyNegative") !== "0",
    }),
  refresh: async () => refreshAllReports(),
};

export async function GET(req: Request) {
  const session = loadSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Oturum yok. Firma seçiniz." },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "dashboard";
  const handler = handlers[type];
  if (!handler) {
    return NextResponse.json({ ok: false, message: "Geçersiz rapor." }, { status: 400 });
  }
  try {
    const data = await handler(searchParams);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Rapor hatası" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const session = loadSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum yok." }, { status: 401 });
  }
  const body = await req.json();
  saveSession({
    ...session,
    startDate: body.startDate ?? session.startDate,
    endDate: body.endDate ?? session.endDate,
  });
  return NextResponse.json({ ok: true, session: loadSession() });
}
