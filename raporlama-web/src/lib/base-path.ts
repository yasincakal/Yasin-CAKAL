/** Ağ erişimi: http://192.168.x.x:3000/Raporlar */
export const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "/Raporlar";

export function withBasePath(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!BASE_PATH) return p;
  if (p === BASE_PATH || p.startsWith(`${BASE_PATH}/`)) return p;
  return `${BASE_PATH}${p}`;
}

export function apiUrl(path: string) {
  return withBasePath(path.startsWith("/") ? path : `/${path}`);
}
