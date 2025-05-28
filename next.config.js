/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  webpack: (config) => {
    config.externals.push('better-sqlite3');
    
    // Ignore project_knowledge directory
    config.plugins.push(
      new (require('webpack')).IgnorePlugin({
        resourceRegExp: /^\.\/project_knowledge/
      })
    );
    
    return config;
  }
}

module.exports = nextConfig
