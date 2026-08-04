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
  "bsmv",
  "kkdf",
];

/** Para sütunu mu? "Borçlu Adet" gibi sayaçlar para sayılmaz. */
export function isMoneyCol(col: string) {
  const c = col.toLocaleLowerCase("tr-TR");
  if (c.includes("adet") || c.includes("oran") || c.includes("%") || c.includes("no") || c.includes("kod")) {
    return false;
  }
  // Tam eşleşme veya kelime içinde — ama "borçlu adet" zaten adet ile elendi
  if (c === "borç" || c === "alacak" || c === "bakiye") return true;
  return MONEY_HINTS.some((h) => {
    if (h === "borç" || h === "alacak") {
      // "Borçlu Adet" / "Alacaklı Adet" değil; "Borç", "Alacak", "Borç Tutarı" evet
      return (
        c === h ||
        c.startsWith(`${h} `) ||
        c.endsWith(` ${h}`) ||
        c.includes(`${h} `) ||
        c.includes(` ${h}`)
      );
    }
    return c.includes(h);
  });
}

export function isPercentCol(col: string) {
  const c = col.toLocaleLowerCase("tr-TR");
  return c.includes("%") || c.includes("oran");
}

export function isCountCol(col: string) {
  const c = col.toLocaleLowerCase("tr-TR");
  return c.includes("adet") || c.includes("sayı") || c.includes("sayi");
}
