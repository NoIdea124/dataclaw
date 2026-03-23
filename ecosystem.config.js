module.exports = {
  apps: [
    {
      name: 'dataclaw-server',
      script: './dataclaw-server/server.js',
      env: {
        NODE_ENV: 'production',
        SITE_URL: 'http://your-server-ip-or-domain',  // ← 改成你的服务器地址
      },
    },
    {
      name: 'mcp-skills',
      script: './mcp-skills/server.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mcp-knowledge',
      script: './mcp-knowledge/server.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mcp-metrics',
      script: './mcp-metrics/server.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mcp-data',
      script: './mcp-data/server.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mcp-feishu',
      script: './mcp-feishu/server.js',
      env: { NODE_ENV: 'production' },
    },
  ],
};
