import { Suspense } from "react";
import FirmaClient from "./FirmaClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="setup-card">Yükleniyor…</div>}>
      <FirmaClient />
    </Suspense>
  );
}
