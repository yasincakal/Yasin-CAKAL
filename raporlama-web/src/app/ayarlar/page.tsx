"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/app-context";

type FormState = {
  server: string;
  port: string;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  windowsAuth: boolean;
};

const empty: FormState = {
  server: "",
  port: "",
  database: "",
  user: "",
  password: "",
  encrypt: false,
  trustServerCertificate: true,
  windowsAuth: false,
};

export default function AyarlarPage() {
  const router = useRouter();
  const { reload, configured } = useApp();
  const [form, setForm] = useState<FormState>(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.config) {
        setForm({
          server: data.config.server || "",
          port: data.config.port ? String(data.config.port) : "",
          database: data.config.database || "",
          user: data.config.user || "",
          password: "",
          encrypt: Boolean(data.config.encrypt),
          trustServerCertificate: data.config.trustServerCertificate !== false,
          windowsAuth: Boolean(data.config.windowsAuth),
        });
      }
    })();
  }, []);

  function payload() {
    const portNum = form.port.trim() ? Number(form.port.trim()) : undefined;
    return {
      ...form,
      port: portNum && !Number.isNaN(portNum) ? portNum : undefined,
    };
  }

  async function submit(action: "test" | "save") {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), action }),
      });
      const data = await res.json();
      setMessage(data.message || (res.ok ? "Tamam" : "Hata"));
      if (action === "save" && res.ok) {
        await reload();
        router.push("/firma");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  async function continueDemo() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Demo başlatılamadı");
      await reload();
      router.push("/dashboard");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Demo hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-card wide">
      <div className="brand-sub">İlk açılış</div>
      <h1>Veritabanı Bağlantısı</h1>
      <p className="lead">
        SQL Server bilgilerini bir kez kaydedin. Named instance için
        (<code>DESKTOP-97B4PJQ\SQL2025</code>) port bulunamazsa aşağıdaki{" "}
        <strong>Port</strong> alanını doldurun.
      </p>

      <div className="field-row">
        <label className="field">
          <span>SQL Server Adı / IP</span>
          <input
            value={form.server}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            placeholder="DESKTOP-97B4PJQ veya DESKTOP-97B4PJQ\SQL2025"
          />
        </label>
        <label className="field">
          <span>Port (önerilir)</span>
          <input
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value.replace(/[^\d]/g, "") })}
            placeholder="örn. 1433"
            inputMode="numeric"
          />
        </label>
      </div>

      <p className="muted" style={{ marginTop: -6, marginBottom: 14, whiteSpace: "pre-line" }}>
        {`Port için: SQL Server Configuration Manager → SQL2025 → TCP/IP → IP Addresses → TCP Port
veya sunucuyu şöyle yazın: DESKTOP-97B4PJQ,1433`}
      </p>

      <label className="field">
        <span>Veritabanı Adı</span>
        <input
          value={form.database}
          onChange={(e) => setForm({ ...form, database: e.target.value })}
          placeholder="LOGODB"
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Kullanıcı Adı</span>
          <input
            value={form.user}
            disabled={form.windowsAuth}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Şifre</span>
          <input
            type="password"
            value={form.password}
            disabled={form.windowsAuth}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
      </div>

      <div className="check-row">
        <label>
          <input
            type="checkbox"
            checked={form.windowsAuth}
            onChange={(e) => setForm({ ...form, windowsAuth: e.target.checked })}
          />
          Windows Authentication
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.encrypt}
            onChange={(e) => setForm({ ...form, encrypt: e.target.checked })}
          />
          Encrypt
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.trustServerCertificate}
            onChange={(e) =>
              setForm({ ...form, trustServerCertificate: e.target.checked })
            }
          />
          Trust Server Certificate
        </label>
      </div>

      {message && (
        <div
          className={message.toLowerCase().includes("başar") ? "muted" : "error-box"}
          style={{ borderRadius: 12, marginBottom: 12, whiteSpace: "pre-wrap" }}
        >
          {message}
        </div>
      )}

      <div className="actions">
        <button className="btn btn-ghost" disabled={busy} onClick={() => void submit("test")}>
          Bağlantıyı Test Et
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit("save")}>
          Kaydet ve Devam
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void continueDemo()}>
          Demo ile Devam
        </button>
      </div>
      {configured && (
        <p className="muted" style={{ marginTop: 16 }}>
          Kayıtlı bağlantı mevcut. Firma seçimine gidebilirsiniz.
        </p>
      )}
    </div>
  );
}
