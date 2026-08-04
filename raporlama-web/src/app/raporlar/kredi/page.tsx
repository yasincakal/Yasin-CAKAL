"use client";

import { useEffect, useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DataTable } from "@/components/DataTable";
import { Panel, SourceBadge } from "@/components/ui";
import { ColumnPicker, useColumnVisibility } from "@/components/ColumnPicker";
import { useApp } from "@/context/app-context";
import { apiUrl } from "@/lib/base-path";
import { exportExcel, exportPdf } from "@/lib/export";
import type { ReportResponse } from "@/lib/types";

function ExportBar({
  title,
  data,
  visible,
  cols,
}: {
  title: string;
  data: ReportResponse | null;
  visible: string[];
  cols: ReturnType<typeof useColumnVisibility>;
}) {
  if (!data) return <SourceBadge source={undefined} />;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <SourceBadge source={data.source} />
      <ColumnPicker
        allColumns={data.columns}
        visible={cols.visible}
        open={cols.open}
        setOpen={cols.setOpen}
        toggle={cols.toggle}
        showAll={cols.showAll}
        reset={cols.reset}
      />
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => exportExcel(title, visible, data.rows, data.totals)}
      >
        <FileSpreadsheet size={16} /> Excel
      </button>
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => void exportPdf(title, visible, data.rows, data.totals)}
      >
        <FileDown size={16} /> PDF Kaydet
      </button>
    </div>
  );
}

export default function Page() {
  const { session, refreshTick } = useApp();
  const [ozet, setOzet] = useState<ReportResponse | null>(null);
  const [detay, setDetay] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ozetCols = useColumnVisibility("kredi-ozet", ozet?.columns ?? []);
  const detayCols = useColumnVisibility(
    "kredi-detay",
    detay?.columns ?? [],
    [
      "Banka Kodu",
      "Banka Adı",
      "Kre.Hs. Kodu",
      "Kre.Hs. Adı",
      "Taksit Vade",
      "Taksit Anapara",
      "Taksit Faiz",
      "Kalan Tutar",
      "Kalan",
    ]
  );

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [a, b] = await Promise.all([
          fetch(apiUrl("/api/reports?type=kredi-ozet")),
          fetch(apiUrl("/api/reports?type=kredi-detay")),
        ]);
        const aj = await a.json();
        const bj = await b.json();
        if (!a.ok) throw new Error(aj.message || "Kredi özet alınamadı");
        if (!b.ok) throw new Error(bj.message || "Kredi detay alınamadı");
        if (!cancelled) {
          setOzet(aj);
          setDetay(bj);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Hata");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refreshTick, session?.startDate, session?.endDate]);

  return (
    <div className="page">
      <TopBar title="Banka Kredi" subtitle="Kredi taksit özeti ve detay hareketleri" />
      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      <Panel
        title="Kredi Özet"
        actions={
          <ExportBar
            title="Kredi Özet"
            data={ozet}
            visible={ozetCols.visible.length ? ozetCols.visible : ozet?.columns ?? []}
            cols={ozetCols}
          />
        }
      >
        {loading && !ozet ? (
          <div className="empty-state">Yükleniyor…</div>
        ) : ozet ? (
          <DataTable
            columns={ozetCols.visible.length ? ozetCols.visible : ozet.columns}
            rows={ozet.rows}
            maxHeight={320}
          />
        ) : (
          <div className="empty-state">Veri yok.</div>
        )}
      </Panel>
      <div style={{ height: 16 }} />
      <Panel
        title="Kredi Detay"
        actions={
          <ExportBar
            title="Kredi Detay"
            data={detay}
            visible={detayCols.visible.length ? detayCols.visible : detay?.columns ?? []}
            cols={detayCols}
          />
        }
      >
        {loading && !detay ? (
          <div className="empty-state">Yükleniyor…</div>
        ) : detay ? (
          <DataTable
            columns={detayCols.visible.length ? detayCols.visible : detay.columns}
            rows={detay.rows}
          />
        ) : (
          <div className="empty-state">Veri yok.</div>
        )}
      </Panel>
    </div>
  );
}
