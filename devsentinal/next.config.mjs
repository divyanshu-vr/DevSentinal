/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'ssh2', '@vultr/vultr-node'],
  },
};

export default nextConfig;
