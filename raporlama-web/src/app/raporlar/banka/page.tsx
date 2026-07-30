"use client";

import { useState } from "react";
import { ReportPage } from "@/components/ReportPage";
import { Panel } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { useEffect } from "react";
import type { ReportResponse } from "@/lib/types";
import { useApp } from "@/context/app-context";

export default function Page() {
  const { session, refreshing } = useApp();
  const [ozet, setOzet] = useState<ReportResponse | null>(null);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const res = await fetch("/api/reports?type=banka-ozet");
      if (res.ok) setOzet(await res.json());
    })();
  }, [session, refreshing, session?.startDate, session?.endDate]);

  return (
    <>
      <ReportPage
        title="Banka Rapor"
        subtitle="Banka hesap bakiyeleri ve döviz kırılımı"
        type="banka"
      />
      {ozet && (
        <div className="page" style={{ paddingTop: 0 }}>
          <Panel title="Banka Özet">
            <DataTable columns={ozet.columns} rows={ozet.rows} maxHeight={320} />
          </Panel>
        </div>
      )}
    </>
  );
}
