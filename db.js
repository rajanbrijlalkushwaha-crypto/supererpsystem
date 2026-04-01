const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:             process.env.DB_HOST || '127.0.0.1',
  port:             parseInt(process.env.DB_PORT) || 3306,
  user:             process.env.DB_USER || 'root',
  password:         process.env.DB_PASS || 'Epsilon$2022',
  database:         process.env.DB_NAME || 'savvishprefab',
  waitForConnections: true,
  connectionLimit:  10,
  timezone:         'local',
  supportBigNumbers: true,
  bigNumberStrings:  true,
});

module.exports = pool;