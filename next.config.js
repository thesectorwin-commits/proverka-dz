/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional standalone output for deployments requiring a self-contained Next.js server bundle.
  output: process.env.STANDALONE === '1' ? 'standalone' : undefined,
  // Загруженные фото никогда не сохраняются на диск и не проксируются через
  // статические файлы — они существуют только в памяти запроса, поэтому
  // здесь нет необходимости в настройках image-оптимизации/CDN для них.
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb' // с запасом под одно фото после сжатия на клиенте
    }
  }
};

module.exports = nextConfig;
