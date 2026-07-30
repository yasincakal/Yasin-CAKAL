"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/context/app-context";

type Firm = { NR: number; NAME: string; TITLE?: string };
type Period = { NR: number; BEGDATE?: string; ENDDATE?: string };

export default function FirmaClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { reload } = useApp();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedFirm, setSelectedFirm] = useState<Firm | null>(null);
  const [donemNr, setDonemNr] = useState("1");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("sql");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const demoPreferred = params.get("demo") === "1";

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/firmalar");
      const data = await res.json();
      setFirms(data.firms || []);
      setSource(data.source || "sql");
      if (data.firms?.[0]) setSelectedFirm(data.firms[0]);
    })();
  }, []);

  useEffect(() => {
    if (!selectedFirm) return;
    void (async () => {
      const res = await fetch("/api/firmalar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmaNr: selectedFirm.NR }),
      });
      const data = await res.json();
      setPeriods(data.periods || []);
      if (data.periods?.[0]) setDonemNr(String(data.periods[0].NR));
    })();
  }, [selectedFirm]);

  async function continueNext() {
    if (!selectedFirm) return;
    setBusy(true);
    setMessage("");
    try {
      const demoMode = demoPreferred || source === "demo";
      await fetch("/api/firmalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmaNr: String(selectedFirm.NR),
          firmaAdi: selectedFirm.TITLE || selectedFirm.NAME,
          donemNr,
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
        Logo firmaları listelenir. Seçim sonrası gerekli rapor view&apos;ları otomatik
        kontrol edilir / oluşturulur.
      </p>

      <div className="firm-list">
        {firms.map((f) => (
          <button
            key={f.NR}
            className={`firm-item ${selectedFirm?.NR === f.NR ? "selected" : ""}`}
            onClick={() => setSelectedFirm(f)}
          >
            <strong>
              {String(f.NR).padStart(3, "0")} — {f.TITLE || f.NAME}
            </strong>
            <span className="muted">{f.NAME}</span>
          </button>
        ))}
      </div>

      <div className="field-row">
        <label className="field">
          <span>Dönem</span>
          <select value={donemNr} onChange={(e) => setDonemNr(e.target.value)}>
            {(periods.length ? periods : [{ NR: 1 }]).map((p) => (
              <option key={p.NR} value={p.NR}>
                {String(p.NR).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Kaynak</span>
          <input
            value={source === "demo" || demoPreferred ? "Demo veri" : "SQL Server"}
            readOnly
          />
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

      {message && <div className="muted" style={{ marginBottom: 12 }}>{message}</div>}

      <div className="actions">
        <button className="btn btn-ghost" onClick={() => router.push("/ayarlar")}>
          Bağlantı Ayarları
        </button>
        <button
          className="btn btn-primary"
          disabled={!selectedFirm || busy}
          onClick={() => void continueNext()}
        >
          Devam Et
        </button>
      </div>
    </div>
  );
}
