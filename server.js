require('dotenv').config();

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app       = require('./src/app');
const scheduler = require('./src/services/scheduler');
const { runMigrations } = require('./src/db/migrate');

const PORT = process.env.PORT || 3000;

runMigrations()
  .catch(err => console.error('[DB] runMigrations error:', err.message))
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`FieldCore API running on port ${PORT}`);
      scheduler.startReminderJob();
    });

    function shutdown(signal) {
      console.log(`[${signal}] Graceful shutdown…`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('Shutdown timed out — forcing exit.');
        process.exit(1);
      }, 10_000).unref();
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  });
