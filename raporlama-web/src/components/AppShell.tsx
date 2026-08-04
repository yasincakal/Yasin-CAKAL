"use client";

import { Sidebar } from "@/components/Sidebar";
import { useApp } from "@/context/app-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const PUBLIC = ["/", "/ayarlar", "/firma"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, configured, session } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!configured && pathname !== "/ayarlar" && pathname !== "/") {
      router.replace("/ayarlar");
      return;
    }
    if (configured && !session && !PUBLIC.includes(pathname) && pathname !== "/firma") {
      router.replace("/firma");
    }
  }, [ready, configured, session, pathname, router]);

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <div className="brand-name" style={{ color: "var(--brand)" }}>
            CariHesap Web
          </div>
          <p>Bağlantı kontrol ediliyor…</p>
        </div>
      </div>
    );
  }

  const showShell = pathname !== "/" && pathname !== "/ayarlar" && pathname !== "/firma";

  if (!showShell) {
    return <main className="auth-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-pane">{children}</main>
    </div>
  );
}
