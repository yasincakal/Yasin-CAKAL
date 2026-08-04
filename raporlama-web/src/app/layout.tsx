import type { Metadata } from "next";
import { Poppins, Source_Sans_3 } from "next/font/google";
import { AppProvider } from "@/context/app-context";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const display = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CariHesap Web — Logo Tiger Raporlama",
  description: "Logo Tiger ERP cari, banka, karlılık ve stok raporlama web uygulaması",
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
