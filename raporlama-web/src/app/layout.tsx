import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { AppProvider } from "@/context/app-context";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Raporlama Programı",
  description: "Logo Tiger ERP yönetim ve karlılık raporlama web uygulaması",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
