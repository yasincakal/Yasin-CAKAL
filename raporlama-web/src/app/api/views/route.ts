import { NextResponse } from "next/server";
import { loadSession } from "@/lib/config";
import { ensureViews } from "@/lib/views";

export const runtime = "nodejs";

export async function POST() {
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
      statuses: [
        { name: "DEMO", exists: true, created: false },
      ],
      message: "Demo modunda view oluşturulmaz.",
    });
  }
  try {
    const statuses = await ensureViews(session.firmaNr, session.donemNr);
    const ok = statuses.every((s) => s.exists);
    return NextResponse.json({ ok, statuses });
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
