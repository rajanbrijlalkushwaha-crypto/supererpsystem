module.exports = {
  apps: [
    {
      name: 'epsilon-backend',
      script: 'server.js',
      cwd: './',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
    {
      name: 'epsilon-frontend',
      script: 'node_modules/react-scripts/bin/react-scripts.js',
      args: 'start',
      cwd: './frontend',
      watch: false,
      env: {
        PORT: 3000,
        BROWSER: 'none',
        DANGEROUSLY_DISABLE_HOST_CHECK: 'true',
        HOST: '0.0.0.0',
      },
    },
  ],
};
