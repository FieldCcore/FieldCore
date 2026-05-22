require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRouter      = require('./routes/auth');
const analyticsRouter = require('./routes/analytics');
const depositsRouter  = require('./routes/deposits');
const clientsRouter   = require('./routes/clients');
const jobsRouter      = require('./routes/jobs');
const invoicesRouter  = require('./routes/invoices');
const paymentsRouter  = require('./routes/payments');
const smsRouter       = require('./routes/sms');
const webhooksRouter  = require('./routes/webhooks');
const usersRouter     = require('./routes/users');
const mobileRouter    = require('./routes/mobile');
const bookingRouter   = require('./routes/booking');

const app = express();

app.use(helmet());
app.use(cors());

// Webhook routes must come before express.json() to get raw body
app.use('/api/webhooks', webhooksRouter);

app.use(express.json());

app.use('/api/auth',       authRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/deposits',  depositsRouter);
app.use('/api/clients',   clientsRouter);
app.use('/api/jobs',     jobsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/sms',      smsRouter);
app.use('/api/users',    usersRouter);
app.use('/api/mobile',          mobileRouter);
app.use('/api/booking',         bookingRouter);  // public: /api/booking/:accountId
app.use('/api/booking-settings', bookingRouter); // operator: GET/PUT with auth
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve built React app (whenever dist exists — production and local npm start)
const clientDist = path.join(__dirname, '../client/dist');
const fs = require('fs');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
