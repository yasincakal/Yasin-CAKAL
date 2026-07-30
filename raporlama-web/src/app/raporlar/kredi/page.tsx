"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { DataTable } from "@/components/DataTable";
import { Panel, SourceBadge } from "@/components/ui";
import { useApp } from "@/context/app-context";
import type { ReportResponse } from "@/lib/types";

export default function Page() {
  const { session, refreshing } = useApp();
  const [ozet, setOzet] = useState<ReportResponse | null>(null);
  const [detay, setDetay] = useState<ReportResponse | null>(null);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const [a, b] = await Promise.all([
        fetch("/api/reports?type=kredi-ozet"),
        fetch("/api/reports?type=kredi-detay"),
      ]);
      if (a.ok) setOzet(await a.json());
      if (b.ok) setDetay(await b.json());
    })();
  }, [session, refreshing, session?.startDate, session?.endDate]);

  return (
    <div className="page">
      <TopBar
        title="Banka Kredi"
        subtitle="Kredi taksit özeti ve detay hareketleri"
      />
      <Panel title="Kredi Özet" actions={<SourceBadge source={ozet?.source} />}>
        {ozet ? (
          <DataTable columns={ozet.columns} rows={ozet.rows} maxHeight={320} />
        ) : (
          <div className="empty-state">Yükleniyor…</div>
        )}
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title="Kredi Detay" actions={<SourceBadge source={detay?.source} />}>
        {detay ? (
          <DataTable columns={detay.columns} rows={detay.rows} />
        ) : (
          <div className="empty-state">Yükleniyor…</div>
        )}
      </Panel>
    </div>
  );
}
