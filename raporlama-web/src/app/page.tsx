"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/app-context";

export default function HomePage() {
  const { ready, configured, session } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!configured) router.replace("/ayarlar");
    else if (!session) router.replace("/firma");
    else router.replace("/dashboard");
  }, [ready, configured, session, router]);

  return (
    <div className="boot-card">
      <div className="brand-name">Raporlama</div>
      <p>Yönlendiriliyor…</p>
    </div>
  );
}
