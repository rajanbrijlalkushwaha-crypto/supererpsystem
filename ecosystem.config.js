module.exports = {
  apps: [
    {
      name: 'epsilon-backend',
      script: 'server.js',
      cwd: './',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
