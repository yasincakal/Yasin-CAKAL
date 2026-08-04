import { NextResponse } from "next/server";
import { saveDbConfig, saveSession } from "@/lib/config";

export const runtime = "nodejs";

export async function POST() {
  saveDbConfig({
    server: "demo.local",
    database: "DEMO",
    user: "demo",
    password: "demo",
    encrypt: false,
    trustServerCertificate: true,
    windowsAuth: false,
  });
  const year = new Date().getFullYear();
  saveSession({
    firmaNr: "328",
    firmaAdi: "ERYAP MOBİLYA AŞ",
    donemNr: "01",
    database: "LOGODB",
    startDate: `${year}-01-01`,
    endDate: new Date().toISOString().slice(0, 10),
    demoMode: true,
  });
  return NextResponse.json({ ok: true, demo: true });
}
