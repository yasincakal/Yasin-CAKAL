import { NextResponse } from "next/server";
import { loadDbConfig, saveDbConfig, saveSession } from "@/lib/config";
import { closePool } from "@/lib/db";
import { demoFirmPeriods } from "@/lib/demo-data";
import { listFirmPeriods } from "@/lib/views";

export const runtime = "nodejs";

export async function GET() {
  const cfg = loadDbConfig();
  if (!cfg || cfg.server === "demo.local") {
    return NextResponse.json({ firms: demoFirmPeriods, source: "demo" });
  }
  try {
    const firms = await listFirmPeriods();
    return NextResponse.json({ firms, source: "sql" });
  } catch (err) {
    return NextResponse.json(
      {
        firms: [],
        source: "sql",
        error: err instanceof Error ? err.message : "Firma listesi alınamadı",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const cfg = loadDbConfig();
  const firmaNr = String(body.firmaNr ?? "").padStart(3, "0");
  const donemNr = String(body.donemNr ?? "1").padStart(2, "0");
  const firmaAdi = String(body.firmaAdi ?? "");
  const database = String(body.database ?? "").trim();
  const startDate = String(
    body.startDate ?? body.donemBaslangic ?? `${new Date().getFullYear()}-01-01`
  );
  const endDate = String(
    body.endDate ?? body.donemBitis ?? new Date().toISOString().slice(0, 10)
  );

  // Canlı SQL config varken demoMode zorla kapalı
  const isDemoConfig = !cfg || cfg.server === "demo.local";
  const demoMode = isDemoConfig ? true : false;

  if (!firmaNr || firmaNr === "000") {
    return NextResponse.json({ ok: false, message: "Firma seçiniz." }, { status: 400 });
  }

  if (!demoMode && cfg && database && database !== cfg.database) {
    saveDbConfig({ ...cfg, database });
    await closePool();
  }

  saveSession({
    firmaNr,
    firmaAdi,
    donemNr,
    database: database || cfg?.database,
    startDate,
    endDate,
    demoMode,
  });

  return NextResponse.json({ ok: true, demoMode });
}
