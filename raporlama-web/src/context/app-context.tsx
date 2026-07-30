"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppSession } from "@/lib/types";

type AppContextValue = {
  ready: boolean;
  configured: boolean;
  session: AppSession | null;
  refreshing: boolean;
  setSessionLocal: (s: AppSession | null) => void;
  reload: () => Promise<void>;
  updateDates: (startDate: string, endDate: string) => Promise<void>;
  refreshReports: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<AppSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setConfigured(Boolean(data.configured));
    setSession(data.session ?? null);
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateDates = useCallback(async (startDate: string, endDate: string) => {
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    setSession((prev) => (prev ? { ...prev, startDate, endDate } : prev));
  }, []);

  const refreshReports = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/reports?type=refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      ready,
      configured,
      session,
      refreshing,
      setSessionLocal: setSession,
      reload,
      updateDates,
      refreshReports,
    }),
    [ready, configured, session, refreshing, reload, updateDates, refreshReports]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
