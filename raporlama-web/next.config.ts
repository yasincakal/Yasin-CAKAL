import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/Raporlar";

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath,
  // Ağ üzerinden çoklu kullanıcı erişimi için
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
