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
  const demoPreferred = params.get("demo") === "1";

  const selected = useMemo(
    () => items.find((i) => keyOf(i) === selectedKey) ?? null,
    [items, selectedKey]
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/firmalar");
      const data = await res.json();
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
    setBusy(true);
    setMessage("");
    try {
      const demoMode = demoPreferred || source === "demo";
      await fetch("/api/firmalar", {
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

      if (!demoMode) {
        setMessage("View'lar kontrol ediliyor…");
        const views = await fetch("/api/views", { method: "POST" });
        const viewData = await views.json();
        if (!views.ok || !viewData.ok) {
          setMessage(
            viewData.message ||
              "Bazı view'lar oluşturulamadı. Demo moda geçebilir veya tekrar deneyebilirsiniz."
          );
        }
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
        Logo <code>L_CAPIFIRM</code> / <code>L_CAPIPERIOD</code> kayıtlarından firma no,
        dönem no, database ve tarih aralığı çekilir. Seçim sonrası view&apos;lar otomatik
        hazırlanır.
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
        Kaynak: {source === "demo" || demoPreferred ? "Demo veri" : "SQL Server (Logo)"}
      </p>

      {message && <div className="muted" style={{ marginBottom: 12 }}>{message}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={() => router.push("/ayarlar")}>
          Bağlantı Ayarları
        </button>
        <button
          className="btn btn-primary"
          disabled={!selected || busy}
          onClick={() => void continueNext()}
        >
          Devam Et
        </button>
      </div>
    </div>
  );
}
