import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deze pakketten maken de verbinding via je proxy; ze draaien gewoon in Node.
  serverExternalPackages: ["https-proxy-agent", "socks-proxy-agent"],
  poweredByHeader: false,
};

export default nextConfig;
