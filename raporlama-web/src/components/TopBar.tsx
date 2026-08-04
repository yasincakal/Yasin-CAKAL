"use client";

import { RefreshCw } from "lucide-react";
import { useApp } from "@/context/app-context";

export function TopBar({
  title,
  subtitle,
  dateMode = "range",
}: {
  title: string;
  subtitle?: string;
  /** range: başlangıç+bitiş · endOnly: cari gibi tarih itibariyle */
  dateMode?: "range" | "endOnly";
}) {
  const { session, updateDates, refreshReports, refreshing } = useApp();

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="topbar-actions">
        {session && (
          <>
            {dateMode === "range" && (
              <label className="date-field">
                <span>Başlangıç</span>
                <input
                  type="date"
                  value={session.startDate}
                  onChange={(e) => updateDates(e.target.value, session.endDate)}
                />
              </label>
            )}
            <label className="date-field">
              <span>{dateMode === "endOnly" ? "Tarih (itibariyle)" : "Bitiş"}</span>
              <input
                type="date"
                value={session.endDate}
                onChange={(e) => updateDates(session.startDate, e.target.value)}
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={() => void refreshReports()}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
              Raporları Güncelle
            </button>
          </>
        )}
      </div>
    </header>
  );
}
