"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/app-context";
import { formatDateTR } from "@/lib/format";

type FirmPeriodItem = {
  firmaAdi: string;
  database: string;
  firmaNr: string;
  donemNr: string;
  donemBaslangic?: string;
  donemBitis?: string;
};

function keyOf(f: FirmPeriodItem) {
  return `${f.firmaNr}-${f.donemNr}`;
}

export default function FirmaClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { reload } = useApp();
  const [items, setItems] = useState<FirmPeriodItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("sql");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [viewLog, setViewLog] = useState<string[]>([]);
  const demoPreferred = params.get("demo") === "1";

  const selected = useMemo(
    () => items.find((i) => keyOf(i) === selectedKey) ?? null,
    [items, selectedKey]
  );

  const isLive = !demoPreferred && source === "sql";

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/firmalar");
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Firma listesi alınamadı (canlı SQL).");
        setItems([]);
        setSource("sql");
        return;
      }
      const list = (data.firms || []) as FirmPeriodItem[];
      setItems(list);
      setSource(data.source || "sql");
      if (list[0]) {
        setSelectedKey(keyOf(list[0]));
        if (list[0].donemBaslangic) setStartDate(list[0].donemBaslangic);
        if (list[0].donemBitis) setEndDate(list[0].donemBitis);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (selected.donemBaslangic) setStartDate(selected.donemBaslangic);
    if (selected.donemBitis) setEndDate(selected.donemBitis);
  }, [selected]);

  async function continueNext() {
    if (!selected) return;

    if (isLive) {
      const okConfirm = window.confirm(
        `${selected.firmaAdi}\nFirma: ${selected.firmaNr}  Dönem: ${selected.donemNr}\nDatabase: ${selected.database}\n\n` +
          `Eksik rapor view'ları otomatik oluşturulacak / yenilenecek.\n` +
          `BAYRAK_${selected.firmaNr}_${selected.donemNr}_*\n\nDevam edilsin mi?`
      );
      if (!okConfirm) return;
    }

    setBusy(true);
    setMessage("");
    setViewLog([]);
    try {
      const demoMode = !isLive;
      const saveRes = await fetch("/api/firmalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmaNr: selected.firmaNr,
          firmaAdi: selected.firmaAdi,
          donemNr: selected.donemNr,
          database: selected.database,
          donemBaslangic: selected.donemBaslangic,
          donemBitis: selected.donemBitis,
          startDate,
          endDate,
          demoMode,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.message || "Oturum kaydedilemedi");

      if (!demoMode) {
        setMessage("View'lar oluşturuluyor (canlı SQL)…");
        const views = await fetch("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
        const viewData = await views.json();
        const lines = (viewData.statuses || []).map(
          (s: { name: string; exists: boolean; created?: boolean; error?: string }) =>
            `${s.exists ? "✓" : "✗"} ${s.name}${s.created ? " (oluşturuldu)" : ""}${s.error ? ` — ${s.error}` : ""}`
        );
        setViewLog(lines);
        if (!views.ok || !viewData.ok) {
          setMessage(
            viewData.message ||
              "View oluşturulamadı. Dashboard'a geçilmedi — hatayı düzeltip tekrar deneyin."
          );
          setBusy(false);
          return;
        }
        setMessage(viewData.message || "View'lar hazır. Canlı veriye geçiliyor…");
      }

      await reload();
      router.push("/dashboard");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-card wide">
      <div className="brand-sub">Firma seçimi</div>
      <h1>Çalışılacak firma ve dönem</h1>
      <p className="lead">
        Logo firma/dönem listesinden seçim yapın. Canlı modda rapor view&apos;ları
        onayınızla otomatik oluşturulur; demo veriye düşülmez.
      </p>

      <div className="firm-list">
        {items.map((f) => (
          <button
            key={keyOf(f)}
            className={`firm-item ${selectedKey === keyOf(f) ? "selected" : ""}`}
            onClick={() => setSelectedKey(keyOf(f))}
          >
            <strong>
              {f.firmaNr} / {f.donemNr} — {f.firmaAdi}
            </strong>
            <span className="muted">
              DB: {f.database}
              {f.donemBaslangic && f.donemBitis
                ? ` · ${formatDateTR(f.donemBaslangic)} – ${formatDateTR(f.donemBitis)}`
                : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="field-row">
        <label className="field">
          <span>Seçili Firma / Dönem</span>
          <input
            value={
              selected
                ? `${selected.firmaNr}-${selected.donemNr} · ${selected.firmaAdi}`
                : "—"
            }
            readOnly
          />
        </label>
        <label className="field">
          <span>Database</span>
          <input value={selected?.database || "—"} readOnly />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Başlangıç Tarihi</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Bitiş Tarihi</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>

      <p className="muted" style={{ marginTop: -4 }}>
        Mod:{" "}
        <strong>{isLive ? "CANLI SQL (statik veri yok)" : "Demo veri"}</strong>
      </p>

      {message && (
        <div
          className={message.toLowerCase().includes("hazır") || message.toLowerCase().includes("oluşturuldu") ? "muted" : "error-box"}
          style={{ borderRadius: 12, marginBottom: 12, whiteSpace: "pre-wrap" }}
        >
          {message}
        </div>
      )}

      {viewLog.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>View durumu</h2>
          </div>
          <div className="panel-body" style={{ padding: 14, fontSize: "0.88rem" }}>
            {viewLog.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn btn-ghost" onClick={() => router.push("/ayarlar")}>
          Bağlantı Ayarları
        </button>
        <button
          className="btn btn-primary"
          disabled={!selected || busy}
          onClick={() => void continueNext()}
        >
          {busy ? "İşleniyor…" : isLive ? "View Oluştur ve Devam" : "Demo ile Devam"}
        </button>
      </div>
    </div>
  );
}
