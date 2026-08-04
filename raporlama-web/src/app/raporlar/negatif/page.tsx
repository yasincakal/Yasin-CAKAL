"use client";

import { useState } from "react";
import { ReportPage } from "@/components/ReportPage";

export default function Page() {
  const [stokKod, setStokKod] = useState("");
  const [stokAd, setStokAd] = useState("");
  const [fisTur, setFisTur] = useState("");
  const [onlyNegative, setOnlyNegative] = useState(true);

  return (
    <ReportPage
      title="Negatif Stok"
      subtitle="Kalan miktarı negatife düşen stok hareketleri"
      type="negatif"
      extraParams={{
        stokKod,
        stokAd,
        fisTur,
        onlyNegative: onlyNegative ? "1" : "0",
      }}
      filters={
        <div className="filter-bar">
          <label className="date-field">
            <span>Stok Kodu</span>
            <input value={stokKod} onChange={(e) => setStokKod(e.target.value)} />
          </label>
          <label className="date-field">
            <span>Stok Adı</span>
            <input value={stokAd} onChange={(e) => setStokAd(e.target.value)} />
          </label>
          <label className="date-field">
            <span>Fiş Türü</span>
            <input value={fisTur} onChange={(e) => setFisTur(e.target.value)} />
          </label>
          <label className="date-field" style={{ paddingBottom: 10 }}>
            <span>&nbsp;</span>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyNegative}
                onChange={(e) => setOnlyNegative(e.target.checked)}
              />
              Sadece negatifler
            </label>
          </label>
        </div>
      }
    />
  );
}
