import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "good" | "bad" | "accent";
}) {
  const display =
    typeof value === "number" ? formatMoney(value) : value;
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{display}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Panel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <span className={`source-badge ${source}`}>
      {source === "demo" ? "Demo veri" : "SQL Server"}
    </span>
  );
}
