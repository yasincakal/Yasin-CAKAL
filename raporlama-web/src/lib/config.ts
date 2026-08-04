import fs from "fs";
import path from "path";
import type { AppSession, DbConfig } from "./types";

/**
 * Windows PC: C:\ProgramData\RaporlamaWeb
 * Diğer: proje/data
 */
function resolveDataDir() {
  if (process.platform === "win32") {
    const programData =
      process.env.PROGRAMDATA || path.join("C:", "ProgramData");
    return path.join(programData, "RaporlamaWeb");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, "db-config.json");
const SESSION_FILE = path.join(DATA_DIR, "session.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDataDir() {
  return DATA_DIR;
}

export function loadDbConfig(): DbConfig | null {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as DbConfig;
  } catch {
    return null;
  }
}

export function saveDbConfig(config: DbConfig) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function loadSession(): AppSession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8")) as AppSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AppSession) {
  ensureDataDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

export function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

export function viewName(firmaNr: string, donemNr: string, suffix: string) {
  return `BAYRAK_${firmaNr.padStart(3, "0")}_${donemNr.padStart(2, "0")}_${suffix}`;
}

export function formatFirma(firmaNr: string) {
  return firmaNr.padStart(3, "0");
}

export function formatDonem(donemNr: string) {
  return donemNr.padStart(2, "0");
}
