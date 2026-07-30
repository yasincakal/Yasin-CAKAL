import { NextResponse } from "next/server";
import { loadDbConfig, saveSession } from "@/lib/config";
import { demoFirms, demoPeriods } from "@/lib/demo-data";
import { listFirms, listPeriods } from "@/lib/views";

export const runtime = "nodejs";

export async function GET() {
  const cfg = loadDbConfig();
  try {
    if (!cfg || cfg.server === "demo.local") throw new Error("demo");
    const firms = await listFirms();
    return NextResponse.json({ firms, source: "sql" });
  } catch {
    return NextResponse.json({ firms: demoFirms, source: "demo" });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const firmaNr = String(body.firmaNr ?? "");
  const donemNr = String(body.donemNr ?? "1");
  const firmaAdi = String(body.firmaAdi ?? "");
  const startDate = String(body.startDate ?? `${new Date().getFullYear()}-01-01`);
  const endDate = String(
    body.endDate ?? new Date().toISOString().slice(0, 10)
  );
  const demoMode = Boolean(body.demoMode);

  if (!firmaNr) {
    return NextResponse.json({ ok: false, message: "Firma seçiniz." }, { status: 400 });
  }

  saveSession({
    firmaNr,
    firmaAdi,
    donemNr,
    startDate,
    endDate,
    demoMode,
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const firmaNr = String(body.firmaNr ?? "");
  const cfg = loadDbConfig();
  try {
    if (!cfg || cfg.server === "demo.local") throw new Error("demo");
    const periods = await listPeriods(firmaNr);
    return NextResponse.json({ periods, source: "sql" });
  } catch {
    return NextResponse.json({ periods: demoPeriods, source: "demo" });
  }
}
