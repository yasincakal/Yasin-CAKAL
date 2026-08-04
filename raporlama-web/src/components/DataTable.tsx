"use client";

import { formatDateTR, formatMoney, isCountCol, isMoneyCol, isPercentCol } from "@/lib/format";
import type { ReportRow } from "@/lib/types";

function cellValue(col: string, value: ReportRow[string]) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (isPercentCol(col)) return `${formatMoney(value)}%`;
    if (isCountCol(col)) return formatMoney(value, Number.isInteger(value) ? 0 : 2);
    if (isMoneyCol(col)) return formatMoney(value);
    return formatMoney(value, Number.isInteger(value) ? 0 : 2);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDateTR(value);
  }
  return String(value);
}

function isNumericCol(col: string, sample: ReportRow[string]) {
  return isMoneyCol(col) || isPercentCol(col) || isCountCol(col) || typeof sample === "number";
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
                <td key={c} className={isNumericCol(c, row[c]) ? "num" : undefined}>
                  {cellValue(c, row[c])}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="totals-row">
              {columns.map((c) => (
                <td key={c} className={isNumericCol(c, totals[c]) ? "num" : undefined}>
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
