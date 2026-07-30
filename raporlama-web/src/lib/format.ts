export function formatMoney(value: number | null | undefined, digits = 2) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPercent(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}%`;
}

export function formatDateTR(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("tr-TR").format(d);
}

export function toSqlDate(iso: string) {
  // Accept yyyy-mm-dd, return dd.mm.yyyy for CONVERT style 104
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
