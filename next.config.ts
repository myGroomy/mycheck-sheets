import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev memakai .next-dev supaya tidak bentrok dengan build produksi (.next).
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
