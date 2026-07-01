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
      script: 'npm.cmd',
      args: 'start',
      cwd: './frontend',
      watch: false,
      env: {
        PORT: 80,
        BROWSER: 'none',
      },
    },
  ],
};
