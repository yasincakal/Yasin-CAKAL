import { saveAs } from "file-saver";
import type { ReportRow } from "./types";
import { formatDateTR, formatMoney } from "./format";

function cellText(col: string, value: ReportRow[string]) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const c = col.toLocaleLowerCase("tr-TR");
    if (c.includes("%") || c.includes("oran")) return `${formatMoney(value)}%`;
    return formatMoney(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDateTR(value);
  }
  return String(value);
}

export function exportExcel(
  title: string,
  columns: string[],
  rows: ReportRow[],
  totals?: ReportRow
) {
  // dynamic import keeps client bundle clearer when unused
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const data = [
    columns,
    ...rows.map((r) => columns.map((c) => cellText(c, r[c]))),
  ];
  if (totals) data.push(columns.map((c) => cellText(c, totals[c])));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31) || "Rapor");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeFile(title)}.xlsx`
  );
}

export async function exportPdf(
  title: string,
  columns: string[],
  rows: ReportRow[],
  totals?: ReportRow
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(12);
  doc.text(title, 14, 16);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString("tr-TR"), 14, 22);

  const body = rows.map((r) => columns.map((c) => cellText(c, r[c])));
  if (totals) body.push(columns.map((c) => cellText(c, totals[c])));

  autoTable(doc, {
    startY: 26,
    head: [columns],
    body,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 107, 76] },
    footStyles: { fillColor: [234, 244, 238], textColor: [19, 32, 25], fontStyle: "bold" },
  });

  doc.save(`${safeFile(title)}.pdf`);
}

function safeFile(name: string) {
  return name.replace(/[^\wğüşıöçĞÜŞİÖÇ\- ]+/gi, "").trim().replace(/\s+/g, "_") || "rapor";
}
