/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    serverComponentsExternalPackages: ['postgres', '@node-rs/argon2'],
  },
};

module.exports = nextConfig;
