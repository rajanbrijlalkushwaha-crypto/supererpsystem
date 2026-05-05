// JSON-only mode — no database connection
module.exports = {
  connected: false,
  query() { throw new Error('DB_UNAVAILABLE'); },
};
