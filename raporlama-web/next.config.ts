import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/Raporlar";

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath,
  // Dev overlay / indicator kapalı (kullanıcıya kırmızı N çıkmasın)
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
