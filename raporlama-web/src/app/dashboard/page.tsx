"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Panel, SourceBadge, StatCard } from "@/components/ui";
import { useApp } from "@/context/app-context";
import { apiUrl } from "@/lib/base-path";
import { formatMoney } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";

export default function DashboardPage() {
  const { session, refreshTick } = useApp();
  const router = useRouter();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) {
      router.replace("/firma");
      return;
    }
    let cancelled = false;
    void (async () => {
      setError("");
      const res = await fetch(apiUrl("/api/reports?type=dashboard"));
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(json.message || "Dashboard canlı verisi alınamadı");
        setData(null);
        return;
      }
      setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refreshTick, session?.startDate, session?.endDate, router]);

  return (
    <div className="page">
      <TopBar
        title="Dashboard"
        subtitle={
          session?.demoMode
            ? "Demo veri (statik)"
            : `Canlı SQL · Firma ${session?.firmaNr}/${session?.donemNr}${session?.database ? ` · ${session.database}` : ""} · Cari bakiyeler seçilen bitiş tarihine kadar (tarih itibariyle)`
        }
      />

      {error && (
        <div className="error-box" style={{ borderRadius: 14, marginBottom: 16, whiteSpace: "pre-wrap" }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => router.push("/firma")}>
              Firma / View ekranına dön
            </button>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <StatCard label="Toplam Satış" value={data?.toplamSatis ?? 0} tone="accent" />
        <StatCard label="Brüt Kar" value={data?.brutKar ?? 0} tone="good" />
        <StatCard label="Hizmet Gideri" value={data?.hizmetGideri ?? 0} />
        <StatCard
          label="Net Kar"
          value={data?.netKar ?? 0}
          tone={(data?.netKar ?? 0) >= 0 ? "good" : "bad"}
        />
        <StatCard label="Personel Gideri" value={data?.personelGideri ?? 0} />
        <StatCard
          label="Banka TL Bakiye"
          value={data?.bankaTlBakiye ?? 0}
          tone={(data?.bankaTlBakiye ?? 0) >= 0 ? "good" : "bad"}
        />
        <StatCard label="Kredi Kalan" value={data?.krediKalan ?? 0} />
        <StatCard
          label="Cari Borçlu Toplam"
          value={data?.cariBorclu ?? 0}
          hint={`${data?.cariBorcluAdet ?? 0} cari`}
          tone="accent"
        />
        <StatCard
          label="Cari Alacaklı Toplam"
          value={data?.cariAlacakli ?? 0}
          hint={`${data?.cariAlacakliAdet ?? 0} cari`}
          tone="bad"
        />
        <StatCard
          label="Cari Net Bakiye"
          value={data?.cariNet ?? 0}
          tone={(data?.cariNet ?? 0) >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="grid-2">
        <Panel title="İş Yeri Karlılık" actions={<SourceBadge source={data?.source} />}>
          <div className="chart-panel">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.isyeriKarlilik ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5dde8" />
                <XAxis dataKey="isYeri" hide />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`} />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value ?? 0))}
                  labelStyle={{ color: "#1a2332" }}
                />
                <Bar dataKey="satis" name="Satış" fill="#0e7490" radius={[6, 6, 0, 0]} />
                <Bar dataKey="netKar" name="Net Kar" fill="#ea580c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Hızlı Raporlar">
          <div className="quick-links">
            {[
              ["/raporlar/cari", "Cari Bakiyeler"],
              ["/raporlar/karlilik", "Yönetim Karlılık"],
              ["/raporlar/banka", "Banka Rapor"],
              ["/raporlar/kredi", "Banka Kredi"],
              ["/raporlar/fatura", "Fatura Karlılık"],
              ["/raporlar/hizmet", "Hizmet Gideri"],
              ["/raporlar/personel", "Personel Gideri"],
              ["/raporlar/negatif", "Negatif Stok"],
            ].map(([href, label]) => (
              <button key={href} className="quick-link" type="button" onClick={() => router.push(href)}>
                {label}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
