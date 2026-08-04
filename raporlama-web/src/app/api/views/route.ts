import { NextResponse } from "next/server";
import { loadSession } from "@/lib/config";
import { CRITICAL_VIEWS, ensureViews, REQUIRED_VIEWS } from "@/lib/views";
import { formatDonem, formatFirma } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const session = loadSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum yok." }, { status: 400 });
  }
  if (session.demoMode) {
    return NextResponse.json({ ok: true, demo: true, required: REQUIRED_VIEWS });
  }
  const firma = formatFirma(session.firmaNr);
  const donem = formatDonem(session.donemNr);
  return NextResponse.json({
    ok: true,
    firmaNr: firma,
    donemNr: donem,
    required: REQUIRED_VIEWS.map((s) => `BAYRAK_${firma}_${donem}_${s}`),
  });
}

export async function POST(req: Request) {
  const session = loadSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Önce firma/dönem seçin." },
      { status: 400 }
    );
  }
  if (session.demoMode) {
    return NextResponse.json({
      ok: true,
      demo: true,
      statuses: [{ name: "DEMO", exists: true, created: false }],
      message: "Demo modunda view oluşturulmaz.",
    });
  }

  let force = true;
  try {
    const body = await req.json();
    if (typeof body?.force === "boolean") force = body.force;
  } catch {
    force = true;
  }

  try {
    const statuses = await ensureViews(session.firmaNr, session.donemNr, { force });
    const viewStatuses = statuses.filter((s) => s.name.startsWith("BAYRAK_"));
    const pre = statuses.find((s) => s.name === "ÖN_KONTROL" && !s.exists);

    const criticalOk = CRITICAL_VIEWS.every((suffix) =>
      viewStatuses.some(
        (s) =>
          s.exists &&
          s.name.endsWith(`_${suffix}`)
      )
    );
    const created = viewStatuses.filter((s) => s.created).map((s) => s.name);
    const failed = viewStatuses.filter((s) => !s.exists);
    const ok = criticalOk;

    let message = "";
    if (pre) {
      message = pre.error || "Ön kontrol başarısız";
    } else if (ok && failed.length === 0) {
      message = created.length
        ? `${created.length} view oluşturuldu/yenilendi. Canlı veriye geçilebilir.`
        : "Tüm view'lar hazır.";
    } else if (ok && failed.length) {
      message =
        `Kritik view'lar hazır. Bazı ek view'lar başarısız (raporlar kısmi çalışır): ` +
        failed.map((f) => `${f.name}: ${f.error || "?"}`).join(" | ");
    } else {
      message =
        `View oluşturulamadı.\n` +
        failed
          .map((f) => `• ${f.name}\n  ${f.error || "bilinmeyen hata"}`)
          .join("\n");
    }

    return NextResponse.json({
      ok,
      statuses,
      created,
      failed,
      criticalOk,
      message,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "View kontrolü başarısız",
      },
      { status: 500 }
    );
  }
}
