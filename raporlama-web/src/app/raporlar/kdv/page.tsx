"use client";

import { apiUrl } from "@/lib/base-path";
import { useEffect, useState } from "react";
import { ReportPage } from "@/components/ReportPage";
import { Panel } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import type { ReportResponse } from "@/lib/types";
import { useApp } from "@/context/app-context";

export default function Page() {
  const { session, refreshTick } = useApp();
  const [ozet, setOzet] = useState<ReportResponse | null>(null);
  const [ozetError, setOzetError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      setOzetError("");
      try {
        const res = await fetch(apiUrl("/api/reports?type=kdv-ozet"));
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "KDV özet alınamadı");
        if (!cancelled) setOzet(json);
      } catch (err) {
        if (!cancelled) {
          setOzet(null);
          setOzetError(err instanceof Error ? err.message : "Hata");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refreshTick, session?.startDate, session?.endDate]);

  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        {ozetError && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {ozetError}
          </div>
        )}
        {ozet && (
          <Panel title="KDV Özet">
            <DataTable columns={ozet.columns} rows={ozet.rows} totals={ozet.totals} maxHeight={280} />
          </Panel>
        )}
      </div>
      <ReportPage
        title="KDV Raporu"
        subtitle="İndirilecek (191) ve hesaplanan (391) KDV muhasebe hareketleri — Mali Tablolar"
        type="kdv"
        defaultVisible={[
          "KDV Türü",
          "Tarih",
          "Ay",
          "Fiş No",
          "Hesap Kodu",
          "Hesap Adı",
          "Borç",
          "Alacak",
          "Borç / Alacak",
        ]}
      />
    </>
  );
}
