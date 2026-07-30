"use client";

import { useState } from "react";
import { ReportPage } from "@/components/ReportPage";

export default function Page() {
  const [stokKod, setStokKod] = useState("");
  return (
    <ReportPage
      title="Fatura Karlılık Detay"
      subtitle="Fatura satırları, maliyet ve kar oranı"
      type="fatura"
      extraParams={{ stokKod: stokKod || "%" }}
      filters={
        <div className="filter-bar">
          <label className="date-field">
            <span>Stok Kodu</span>
            <input
              value={stokKod}
              onChange={(e) => setStokKod(e.target.value)}
              placeholder="örn. 01"
            />
          </label>
        </div>
      }
    />
  );
}
