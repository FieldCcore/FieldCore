const app       = require('./src/app');
const scheduler = require('./src/services/scheduler');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FieldCore API running on port ${PORT}`);
  scheduler.startReminderJob();
});
