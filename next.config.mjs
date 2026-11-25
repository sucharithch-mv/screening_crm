/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['unpdf', 'mammoth', 'nodemailer'],
};

export default nextConfig;
