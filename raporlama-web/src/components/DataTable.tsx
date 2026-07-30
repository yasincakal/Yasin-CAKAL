"use client";

import { formatDateTR, formatMoney } from "@/lib/format";
import type { ReportRow } from "@/lib/types";

const MONEY_HINTS = [
  "tutar",
  "bakiye",
  "borç",
  "alacak",
  "maliyet",
  "kar",
  "satış",
  "gider",
  "anapara",
  "faiz",
  "toplam",
  "net",
];

function isMoneyCol(col: string) {
  const c = col.toLocaleLowerCase("tr-TR");
  return MONEY_HINTS.some((h) => c.includes(h)) && !c.includes("oran") && !c.includes("%");
}

function isPercentCol(col: string) {
  const c = col.toLocaleLowerCase("tr-TR");
  return c.includes("%") || c.includes("oran");
}

function cellValue(col: string, value: ReportRow[string]) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (isPercentCol(col)) return `${formatMoney(value)}%`;
    if (isMoneyCol(col)) return formatMoney(value);
    return formatMoney(value, Number.isInteger(value) ? 0 : 2);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDateTR(value);
  }
  return String(value);
}

export function DataTable({
  columns,
  rows,
  totals,
  maxHeight = 560,
}: {
  columns: string[];
  rows: ReportRow[];
  totals?: ReportRow;
  maxHeight?: number;
}) {
  if (!columns.length) {
    return <div className="empty-state">Gösterilecek veri yok.</div>;
  }

  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c}
                  className={
                    isMoneyCol(c) || isPercentCol(c) || typeof row[c] === "number"
                      ? "num"
                      : undefined
                  }
                >
                  {cellValue(c, row[c])}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="totals-row">
              {columns.map((c) => (
                <td
                  key={c}
                  className={
                    isMoneyCol(c) || isPercentCol(c) || typeof totals[c] === "number"
                      ? "num"
                      : undefined
                  }
                >
                  {cellValue(c, totals[c])}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
