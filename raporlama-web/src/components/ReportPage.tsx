"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DataTable } from "@/components/DataTable";
import { Panel, SourceBadge } from "@/components/ui";
import { ColumnPicker, useColumnVisibility } from "@/components/ColumnPicker";
import { apiUrl } from "@/lib/base-path";
import { exportExcel, exportPdf } from "@/lib/export";
import type { ReportResponse } from "@/lib/types";
import { useApp } from "@/context/app-context";

export function ReportPage({
  title,
  subtitle,
  type,
  reportKey,
  extraParams,
  filters,
  defaultVisible,
}: {
  title: string;
  subtitle: string;
  type: string;
  reportKey?: string;
  extraParams?: Record<string, string>;
  filters?: ReactNode;
  defaultVisible?: string[];
}) {
  const { session, refreshing } = useApp();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const paramsKey = useMemo(() => JSON.stringify(extraParams ?? {}), [extraParams]);
  const key = reportKey || type;

  const allColumns = data?.columns ?? [];
  const defaults = data?.defaultVisible ?? defaultVisible;
  const cols = useColumnVisibility(key, allColumns, defaults);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const parsed = JSON.parse(paramsKey) as Record<string, string>;
        const sp = new URLSearchParams({ type, ...parsed });
        const res = await fetch(apiUrl(`/api/reports?${sp.toString()}`));
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

  const visibleCols = cols.visible.length ? cols.visible : allColumns;
  const visibleRows = data?.rows ?? [];
  const visibleTotals = data?.totals;

  async function onPdf() {
    if (!data) return;
    setExporting(true);
    try {
      await exportPdf(title, visibleCols, visibleRows, visibleTotals);
    } finally {
      setExporting(false);
    }
  }

  function onExcel() {
    if (!data) return;
    exportExcel(title, visibleCols, visibleRows, visibleTotals);
  }

  return (
    <div className="page">
      <TopBar title={title} subtitle={subtitle} />
      {filters}
      <Panel
        title={title}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <SourceBadge source={data?.source} />
            {allColumns.length > 0 && (
              <ColumnPicker
                allColumns={allColumns}
                visible={cols.visible}
                open={cols.open}
                setOpen={cols.setOpen}
                toggle={cols.toggle}
                showAll={cols.showAll}
                reset={cols.reset}
              />
            )}
            <button className="btn btn-ghost" type="button" disabled={!data || exporting} onClick={onExcel}>
              <FileSpreadsheet size={16} />
              Excel
            </button>
            <button className="btn btn-primary" type="button" disabled={!data || exporting} onClick={() => void onPdf()}>
              <FileDown size={16} />
              PDF Kaydet
            </button>
          </div>
        }
      >
        {loading && <div className="empty-state">Yükleniyor…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !error && data && (
          <DataTable
            columns={visibleCols}
            rows={visibleRows}
            totals={visibleTotals}
          />
        )}
      </Panel>
    </div>
  );
}
