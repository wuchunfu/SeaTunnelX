import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Generate deployable Node server bundle in .next/standalone
  output: 'standalone',
  eslint: {
    // 只在构建时跳过 ESLint，开发时照常在编辑器里提示
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://127.0.0.1:8000'}/api/:path*`,
      },
    ];
  },

  // 确保代理请求正确传递headers和cookie
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value:
              process.env.NEXT_PUBLIC_FRONTEND_BASE_URL ||
              'http://38.55.133.202:80',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, Cookie',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
