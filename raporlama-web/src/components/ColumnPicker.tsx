"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3 } from "lucide-react";

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function useColumnVisibility(
  reportKey: string,
  allColumns: string[],
  defaultVisible?: string[]
) {
  const storageKey = `rapor-cols:${reportKey}`;
  const columnsKey = JSON.stringify(allColumns);
  const defaultKey = defaultVisible?.length ? JSON.stringify(defaultVisible) : "";

  const stableColumns = useMemo(() => JSON.parse(columnsKey) as string[], [columnsKey]);
  const defaults = useMemo(() => {
    if (!defaultKey) return stableColumns;
    const preferred = JSON.parse(defaultKey) as string[];
    return preferred.filter((c) => stableColumns.includes(c));
  }, [stableColumns, defaultKey]);

  const [visible, setVisible] = useState<string[]>(defaults);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let next = defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const filtered = parsed.filter((c) => stableColumns.includes(c));
        if (filtered.length) next = filtered;
      }
    } catch {
      /* ignore */
    }
    setVisible((prev) => (sameList(prev, next) ? prev : next));
  }, [storageKey, defaults, stableColumns]);

  function toggle(col: string) {
    setVisible((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      const ordered = stableColumns.filter((c) => next.includes(c));
      const result = ordered.length ? ordered : defaults;
      localStorage.setItem(storageKey, JSON.stringify(result));
      return result;
    });
  }

  function showAll() {
    setVisible(stableColumns);
    localStorage.setItem(storageKey, JSON.stringify(stableColumns));
  }

  function reset() {
    setVisible(defaults);
    localStorage.setItem(storageKey, JSON.stringify(defaults));
  }

  return { visible, open, setOpen, toggle, showAll, reset };
}

export function ColumnPicker({
  allColumns,
  visible,
  open,
  setOpen,
  toggle,
  showAll,
  reset,
}: {
  allColumns: string[];
  visible: string[];
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: (c: string) => void;
  showAll: () => void;
  reset: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(!open)}>
        <Columns3 size={16} />
        Sütunlar
      </button>
      {open && (
        <div className="column-picker">
          <div className="column-picker-actions">
            <button type="button" onClick={showAll}>
              Tümü
            </button>
            <button type="button" onClick={reset}>
              Varsayılan
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Kapat
            </button>
          </div>
          <div className="column-picker-list">
            {allColumns.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={visible.includes(c)}
                  onChange={() => toggle(c)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
