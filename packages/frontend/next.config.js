/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    // Enable React Server Components optimizations
    serverComponentsExternalPackages: ['@prisma/client'],
    // Optimize bundle splitting
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Bundle analyzer (enable when needed)
  // bundlePagesRouterDependencies: true,

  // Image optimization
  images: {
    domains: ['cdn.discordapp.com', 'assets.coingecko.com'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // Performance optimizations
  poweredByHeader: false,
  compress: true,
  
  // Webpack optimizations
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Optimize bundle splitting
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Vendor chunk for stable dependencies
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
          },
          // UI components chunk
          ui: {
            test: /[\\/]src[\\/]components[\\/]ui[\\/]/,
            name: 'ui-components',
            priority: 20,
            reuseExistingChunk: true,
          },
          // Dashboard components chunk
          dashboard: {
            test: /[\\/]src[\\/]components[\\/]dashboard[\\/]/,
            name: 'dashboard-components',
            priority: 20,
            reuseExistingChunk: true,
          },
          // Common chunk for shared utilities
          common: {
            test: /[\\/]src[\\/](utils|hooks|contexts)[\\/]/,
            name: 'common',
            priority: 15,
            reuseExistingChunk: true,
          },
        },
      };

      // Optimize module concatenation
      config.optimization.concatenateModules = true;
      
      // Tree shaking optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
    }

    // Bundle analyzer (uncomment to analyze bundle)
    // if (!dev && !isServer) {
    //   const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
    //   config.plugins.push(
    //     new BundleAnalyzerPlugin({
    //       analyzerMode: 'static',
    //       openAnalyzer: false,
    //       reportFilename: 'bundle-analyzer-report.html',
    //     })
    //   );
    // }

    return config;
  },

  // Headers for better caching and security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Redirects for better SEO
  async redirects() {
    return [
      // Remove the problematic dashboard redirect that was causing infinite loops
    ];
  },

  // API routes configuration
  async rewrites() {
    // Disabled to ensure internal API proxy at /api/backend/[...path] handles requests
    // and attaches Authorization automatically.
    return [];
  },

  // Environment variables validation
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Output configuration for deployment
  output: 'standalone',
  
  // Disable x-powered-by header
  poweredByHeader: false,

  // Enable SWC minification
  swcMinify: true,

  // Strict mode for better development experience
  reactStrictMode: true,

  // ESLint configuration
  eslint: {
    // Only run ESLint on specific directories during build
    dirs: ['src'],
  },

  // TypeScript configuration
  typescript: {
    // Type checking is handled by separate process
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;