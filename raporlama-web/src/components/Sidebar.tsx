"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  PackageX,
  PieChart,
  Settings,
  Landmark,
  Users,
  Wrench,
} from "lucide-react";
import { clsx } from "@/lib/format";
import { useApp } from "@/context/app-context";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/raporlar/karlilik", label: "Yönetim Karlılık", icon: PieChart },
  { href: "/raporlar/banka", label: "Banka Rapor", icon: Landmark },
  { href: "/raporlar/kredi", label: "Banka Kredi", icon: CreditCard },
  { href: "/raporlar/fatura", label: "Fatura Karlılık", icon: FileSpreadsheet },
  { href: "/raporlar/hizmet", label: "Hizmet Gideri", icon: Wrench },
  { href: "/raporlar/personel", label: "Personel Gideri", icon: Users },
  { href: "/raporlar/negatif", label: "Negatif Stok", icon: PackageX },
  { href: "/firma", label: "Firma / Dönem", icon: Building2 },
  { href: "/ayarlar", label: "Bağlantı Ayarları", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { session } = useApp();

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">RY</div>
        <div>
          <div className="brand-name">Raporlama</div>
          <div className="brand-sub">Logo Tiger Web</div>
        </div>
      </div>

      {session && (
        <div className="session-chip">
          <strong>{session.firmaAdi || `Firma ${session.firmaNr}`}</strong>
          <span>
            {session.firmaNr}/{session.donemNr.padStart(2, "0")}
            {session.database ? ` · ${session.database}` : ""}
            {session.demoMode ? " · Demo" : ""}
          </span>
        </div>
      )}

      <nav className="nav-list">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("nav-item", active && "active")}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
