/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  
  // FIXED: Move to top level (not experimental)
  outputFileTracingExcludes: {
    '*': ['./project_knowledge/**/*']
  },
  
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('better-sqlite3');
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        util: false,
        'fs/promises': false,
      };
    }
    
    config.plugins.push(
      new (require('webpack')).IgnorePlugin({
        resourceRegExp: /project_knowledge/,
        contextRegExp: /./
      })
    );
    
    return config;
  }
}

module.exports = nextConfig