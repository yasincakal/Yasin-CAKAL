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
        const res = await fetch(apiUrl("/api/reports?type=banka-ozet"));
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Banka özet alınamadı");
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
      <ReportPage
        title="Banka Rapor"
        subtitle="Banka hesap bakiyeleri ve döviz kırılımı"
        type="banka"
      />
      <div className="page" style={{ paddingTop: 0 }}>
        {ozetError && <div className="error-box" style={{ marginBottom: 12 }}>{ozetError}</div>}
        {ozet && (
          <Panel title="Banka Özet">
            <DataTable columns={ozet.columns} rows={ozet.rows} maxHeight={320} />
          </Panel>
        )}
      </div>
    </>
  );
}
