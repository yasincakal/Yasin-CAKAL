"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3 } from "lucide-react";

export function useColumnVisibility(
  reportKey: string,
  allColumns: string[],
  defaultVisible?: string[]
) {
  const storageKey = `rapor-cols:${reportKey}`;
  const defaults = useMemo(() => {
    if (defaultVisible?.length) return defaultVisible.filter((c) => allColumns.includes(c));
    return allColumns;
  }, [allColumns, defaultVisible]);

  const [visible, setVisible] = useState<string[]>(defaults);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const filtered = parsed.filter((c) => allColumns.includes(c));
        if (filtered.length) {
          setVisible(filtered);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setVisible(defaults);
  }, [storageKey, allColumns, defaults]);

  function toggle(col: string) {
    setVisible((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      const ordered = allColumns.filter((c) => next.includes(c));
      localStorage.setItem(storageKey, JSON.stringify(ordered));
      return ordered.length ? ordered : defaults;
    });
  }

  function showAll() {
    setVisible(allColumns);
    localStorage.setItem(storageKey, JSON.stringify(allColumns));
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
