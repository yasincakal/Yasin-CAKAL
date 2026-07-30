import { NextResponse } from "next/server";
import { loadSession } from "@/lib/config";
import { ensureViews, REQUIRED_VIEWS } from "@/lib/views";

export const runtime = "nodejs";

export async function GET() {
  const session = loadSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum yok." }, { status: 400 });
  }
  if (session.demoMode) {
    return NextResponse.json({ ok: true, demo: true, required: REQUIRED_VIEWS });
  }
  return NextResponse.json({
    ok: true,
    firmaNr: session.firmaNr,
    donemNr: session.donemNr,
    required: REQUIRED_VIEWS.map(
      (s) => `BAYRAK_${session.firmaNr.padStart(3, "0")}_${session.donemNr.padStart(2, "0")}_${s}`
    ),
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
    const ok = statuses.every((s) => s.exists);
    const created = statuses.filter((s) => s.created).map((s) => s.name);
    const failed = statuses.filter((s) => !s.exists);
    return NextResponse.json({
      ok,
      statuses,
      created,
      failed,
      message: ok
        ? created.length
          ? `${created.length} view oluşturuldu/yenilendi.`
          : "Tüm view'lar hazır."
        : `Bazı view'lar başarısız: ${failed.map((f) => f.name).join(", ")}`,
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
