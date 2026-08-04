import { NextResponse } from "next/server";
import { loadDbConfig } from "@/lib/config";
import { testConnection } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const cfg = loadDbConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, message: "Kayıtlı bağlantı yok." },
      { status: 404 }
    );
  }
  const result = await testConnection(cfg);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
