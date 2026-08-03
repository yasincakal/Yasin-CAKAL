"use client";

import { useEffect, useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DataTable } from "@/components/DataTable";
import { Panel, SourceBadge, StatCard } from "@/components/ui";
import { ColumnPicker, useColumnVisibility } from "@/components/ColumnPicker";
import { useApp } from "@/context/app-context";
import { apiUrl } from "@/lib/base-path";
import { exportExcel, exportPdf } from "@/lib/export";
import type { ReportResponse } from "@/lib/types";

type Tab = "ozet" | "borc" | "alacak" | "all";

export default function CariPage() {
  const { session, refreshing } = useApp();
  const [tab, setTab] = useState<Tab>("ozet");
  const [ozet, setOzet] = useState<ReportResponse | null>(null);
  const [liste, setListe] = useState<ReportResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const ozetRes = await fetch(apiUrl("/api/reports?type=cari-ozet"));
        const ozetJson = await ozetRes.json();
        if (!ozetRes.ok) throw new Error(ozetJson.message || "Özet alınamadı");
        if (!cancelled) setOzet(ozetJson);

        if (tab !== "ozet") {
          const tip = tab === "borc" ? "borc" : tab === "alacak" ? "alacak" : "all";
          const listRes = await fetch(apiUrl(`/api/reports?type=cari-liste&tip=${tip}`));
          const listJson = await listRes.json();
          if (!listRes.ok) throw new Error(listJson.message || "Liste alınamadı");
          if (!cancelled) setListe(listJson);
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
  }, [session, tab, refreshing, session?.endDate]);

  const ozetRow = ozet?.rows?.[0];
  const allCols = liste?.columns ?? [];
  const cols = useColumnVisibility(
    `cari-${tab}`,
    allCols,
    liste?.defaultVisible ?? ["Cari Kodu", "Cari Adı", "Borç", "Alacak", "Bakiye", "Bakiye Tipi"]
  );

  async function savePdf() {
    if (tab === "ozet" && ozet) {
      await exportPdf("Cari Bakiye Özet", ozet.columns, ozet.rows);
      return;
    }
    if (liste) {
      await exportPdf(
        `Cari Bakiyeler (${tab})`,
        cols.visible,
        liste.rows,
        liste.totals
      );
    }
  }

  function saveExcel() {
    if (tab === "ozet" && ozet) {
      exportExcel("Cari Bakiye Özet", ozet.columns, ozet.rows);
      return;
    }
    if (liste) exportExcel(`Cari Bakiyeler (${tab})`, cols.visible, liste.rows, liste.totals);
  }

  return (
    <div className="page">
      <TopBar
        title="Cari Bakiyeler"
        subtitle={`Bitiş tarihine kadar kümülatif bakiye (${session?.endDate || "—"})`}
      />

      <div className="tabs">
        {(
          [
            ["ozet", "Özet"],
            ["borc", "Borç Bakiyeli"],
            ["alacak", "Alacak Bakiyeli"],
            ["all", "Tüm Cariler"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-box" style={{ borderRadius: 12, marginBottom: 12 }}>{error}</div>}

      {tab === "ozet" && (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <StatCard
              label="Borçlu Cariler"
              value={Number(ozetRow?.["Borçlu Cariler Toplamı"] ?? 0)}
              hint={`${ozetRow?.["Borçlu Adet"] ?? 0} cari`}
              tone="accent"
            />
            <StatCard
              label="Alacaklı Cariler"
              value={Number(ozetRow?.["Alacaklı Cariler Toplamı"] ?? 0)}
              hint={`${ozetRow?.["Alacaklı Adet"] ?? 0} cari`}
              tone="bad"
            />
            <StatCard
              label="Net Bakiye"
              value={Number(ozetRow?.["Net Bakiye"] ?? 0)}
              tone={Number(ozetRow?.["Net Bakiye"] ?? 0) >= 0 ? "good" : "bad"}
            />
          </div>
          <Panel
            title="Cari Özet"
            actions={
              <div style={{ display: "flex", gap: 8 }}>
                <SourceBadge source={ozet?.source} />
                <button className="btn btn-ghost" type="button" onClick={saveExcel}>
                  <FileSpreadsheet size={16} /> Excel
                </button>
                <button className="btn btn-primary" type="button" onClick={() => void savePdf()}>
                  <FileDown size={16} /> PDF Kaydet
                </button>
              </div>
            }
          >
            {loading && <div className="empty-state">Yükleniyor…</div>}
            {!loading && ozet && <DataTable columns={ozet.columns} rows={ozet.rows} maxHeight={240} />}
          </Panel>
        </>
      )}

      {tab !== "ozet" && (
        <Panel
          title={
            tab === "borc"
              ? "Borç Bakiyeli Cariler"
              : tab === "alacak"
                ? "Alacak Bakiyeli Cariler"
                : "Tüm Cari Bakiyeler"
          }
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SourceBadge source={liste?.source} />
              {allCols.length > 0 && (
                <ColumnPicker
                  allColumns={allCols}
                  visible={cols.visible}
                  open={cols.open}
                  setOpen={cols.setOpen}
                  toggle={cols.toggle}
                  showAll={cols.showAll}
                  reset={cols.reset}
                />
              )}
              <button className="btn btn-ghost" type="button" onClick={saveExcel}>
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void savePdf()}>
                <FileDown size={16} /> PDF Kaydet
              </button>
            </div>
          }
        >
          {loading && <div className="empty-state">Yükleniyor…</div>}
          {!loading && liste && (
            <DataTable
              columns={cols.visible}
              rows={liste.rows}
              totals={liste.totals}
            />
          )}
        </Panel>
      )}
    </div>
  );
}
