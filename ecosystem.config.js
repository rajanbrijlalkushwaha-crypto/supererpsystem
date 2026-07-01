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
      script: 'serve',
      args: '-s build -l 3000',
      cwd: './frontend',
      watch: false,
      env: {
        PM2_SERVE_PATH: './build',
        PM2_SERVE_PORT: 3000,
      },
    },
  ],
};
