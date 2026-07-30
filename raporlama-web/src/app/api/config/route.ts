import { NextResponse } from "next/server";
import { loadDbConfig, loadSession, saveDbConfig } from "@/lib/config";
import { testConnection } from "@/lib/db";
import type { DbConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const cfg = loadDbConfig();
  const session = loadSession();
  return NextResponse.json({
    configured: Boolean(cfg),
    config: cfg
      ? {
          server: cfg.server,
          port: cfg.port,
          database: cfg.database,
          user: cfg.user,
          password: cfg.password ? "********" : "",
          encrypt: cfg.encrypt ?? false,
          trustServerCertificate: cfg.trustServerCertificate ?? true,
          windowsAuth: cfg.windowsAuth ?? false,
        }
      : null,
    session,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as DbConfig & { action?: string };
  const port =
    typeof body.port === "number"
      ? body.port
      : body.port
        ? Number(body.port)
        : undefined;

  const cfg: DbConfig = {
    server: String(body.server ?? "").trim(),
    database: String(body.database ?? "").trim(),
    user: body.user?.trim() ?? "",
    password: body.password ?? "",
    port: port && !Number.isNaN(port) && port > 0 ? port : undefined,
    encrypt: Boolean(body.encrypt),
    trustServerCertificate: body.trustServerCertificate !== false,
    windowsAuth: Boolean(body.windowsAuth),
  };

  // Kayıtlı şifreyi koru (UI maskeli gönderirse)
  const existing = loadDbConfig();
  if ((!cfg.password || cfg.password === "********") && existing?.password) {
    cfg.password = existing.password;
  }

  if (!cfg.server || !cfg.database) {
    return NextResponse.json(
      { ok: false, message: "Server ve veritabanı zorunludur." },
      { status: 400 }
    );
  }

  if (body.action === "test") {
    const result = await testConnection(cfg);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const result = await testConnection(cfg);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  saveDbConfig(cfg);
  return NextResponse.json({
    ...result,
    ok: true,
    message: "Ayarlar kaydedildi.",
  });
}
