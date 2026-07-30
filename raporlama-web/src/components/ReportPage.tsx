"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TopBar } from "@/components/TopBar";
import { DataTable } from "@/components/DataTable";
import { Panel, SourceBadge } from "@/components/ui";
import type { ReportResponse } from "@/lib/types";
import { useApp } from "@/context/app-context";

export function ReportPage({
  title,
  subtitle,
  type,
  extraParams,
  filters,
}: {
  title: string;
  subtitle: string;
  type: string;
  extraParams?: Record<string, string>;
  filters?: ReactNode;
}) {
  const { session, refreshing } = useApp();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const paramsKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const parsed = JSON.parse(paramsKey) as Record<string, string>;
        const sp = new URLSearchParams({ type, ...parsed });
        const res = await fetch(`/api/reports?${sp.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Rapor alınamadı");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, type, paramsKey, refreshing, session?.startDate, session?.endDate]);

  return (
    <div className="page">
      <TopBar title={title} subtitle={subtitle} />
      {filters}
      <Panel
        title={title}
        actions={<SourceBadge source={data?.source} />}
      >
        {loading && <div className="empty-state">Yükleniyor…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !error && data && (
          <DataTable columns={data.columns} rows={data.rows} totals={data.totals} />
        )}
      </Panel>
    </div>
  );
}
