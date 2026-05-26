require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const fleetRouter     = require('./routes/fleet');
const billingRouter        = require('./routes/billing');
const notificationsRouter  = require('./routes/notifications');
const onboardingRouter     = require('./routes/onboarding');
const payRouter            = require('./routes/pay');
const contactRouter        = require('./routes/contact');
const betaRouter           = require('./routes/beta');
const businessSettingsRouter = require('./routes/business-settings');
const chatRouter           = require('./routes/chat');
const portalRouter         = require('./routes/portal');

// Auth: 10 attempts per 15 min — brute-force protection on login/reset
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// Public booking reads: 60 per minute — widget config fetches
const bookingReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Chat: 20 per hour per IP — prevent AI abuse
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please try again later.' },
});

// Booking submit: 5 per 10 min per IP — prevent form spam
const bookingSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts. Please wait before trying again.' },
});

const app = express();

app.use(helmet());

const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.APP_URL || false)
  : true;
app.use(cors({ origin: corsOrigin }));

app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => console.log(JSON.stringify({
    ts: new Date().toISOString(), method: req.method, path: req.path,
    status: res.statusCode, ms: Date.now() - t0,
  })));
  next();
});

// Webhook routes must come before express.json() to get raw body
app.use('/api/webhooks', webhooksRouter);

app.use(express.json());

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/deposits',  depositsRouter);
app.use('/api/clients',   clientsRouter);
app.use('/api/jobs',      jobsRouter);
app.use('/api/invoices',  invoicesRouter);
app.use('/api/payments',  paymentsRouter);
app.use('/api/sms',       smsRouter);
app.use('/api/users',     usersRouter);
app.use('/api/mobile',    mobileRouter);
app.post('/api/booking/:accountId/submit', bookingSubmitLimiter); // tight limit before router
app.use('/api/booking',          bookingReadLimiter, bookingRouter);  // public: /api/booking/:accountId
app.use('/api/booking-settings', bookingRouter);                      // operator: GET/PUT with auth
app.use('/api/fleet',    fleetRouter);
app.use('/api/billing',        billingRouter);
app.use('/api/notifications',  notificationsRouter);
app.use('/api/onboarding',     onboardingRouter);
app.use('/api/pay',            payRouter);
app.use('/api/contact',          contactRouter);
app.use('/api/beta',             betaRouter);
app.use('/api/business-settings', businessSettingsRouter);
app.use('/api/chat',             chatLimiter, chatRouter);
app.use('/api/portal',           portalRouter);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve built React app (whenever dist exists — production and local npm start)
const clientDist = path.join(__dirname, '../client/dist');
const fs = require('fs');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // Serve hashed assets with long cache; serve index.html with no-cache so
  // browsers always fetch the latest version (prevents stale hash references
  // after a new deployment changes asset filenames).
  app.use(express.static(clientDist, { index: false }));
  app.use((req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
