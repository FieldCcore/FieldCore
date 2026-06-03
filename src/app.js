require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

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
const noShowRouter         = require('./routes/noshow');
const entitiesRouter       = require('./routes/entities');
const connectRouter        = require('./routes/connect');
const phoneRouter          = require('./routes/phone');
const estimatesRouter      = require('./routes/estimates');
const reviewsRouter        = require('./routes/reviews');
const pushTokensRouter     = require('./routes/push-tokens');

const ALLOWED_ORIGINS = [
  'https://getfieldcore.com',
  'https://www.getfieldcore.com',
  'https://fieldcore-production-ee0d.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Auth: 10 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// General API: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' },
  skip: (req) => req.path.startsWith('/health'),
});

// Public booking reads: 60 per minute
const bookingReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Chat (AI): 20 per hour per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please try again later.' },
});

// Booking submit: 5 per 10 min per IP
const bookingSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts. Please wait before trying again.' },
});

// Beta signup: 3 per day per IP
const betaSignupLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts from this IP.' },
});

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false, // Managed at Vercel CDN level
}));

// CORS — allow only FieldCore origins + Railway internal
app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Request size limit — prevent oversized payload attacks
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => console.log(JSON.stringify({
    ts: new Date().toISOString(), method: req.method, path: req.path,
    status: res.statusCode, ms: Date.now() - t0,
  })));
  next();
});

// Webhook routes must come before JSON body parser to get raw body
app.use('/api/webhooks', webhooksRouter);

app.use('/api/auth',    authLimiter, authRouter);
app.use('/api/analytics', generalLimiter, analyticsRouter);
app.use('/api/deposits',  generalLimiter, depositsRouter);
app.use('/api/clients',   generalLimiter, clientsRouter);
app.use('/api/jobs',      generalLimiter, jobsRouter);
app.use('/api/invoices',  generalLimiter, invoicesRouter);
app.use('/api/payments',  generalLimiter, paymentsRouter);
app.use('/api/sms',       generalLimiter, smsRouter);
app.use('/api/users',     generalLimiter, usersRouter);
app.use('/api/mobile',    generalLimiter, mobileRouter);
app.post('/api/booking/:accountId/submit', bookingSubmitLimiter);
app.use('/api/booking',          bookingReadLimiter, bookingRouter);
app.use('/api/booking-settings', generalLimiter, bookingRouter);
app.use('/api/fleet',    generalLimiter, fleetRouter);
app.use('/api/billing',        generalLimiter, billingRouter);
app.use('/api/notifications',  generalLimiter, notificationsRouter);
app.use('/api/onboarding',     generalLimiter, onboardingRouter);
app.use('/api/pay',            generalLimiter, payRouter);
app.use('/api/contact',        generalLimiter, contactRouter);
app.post('/api/beta', betaSignupLimiter);
app.use('/api/beta',             betaRouter);
app.use('/api/business-settings', generalLimiter, businessSettingsRouter);
app.use('/api/chat',             chatLimiter, chatRouter);
app.use('/api/portal',           generalLimiter, portalRouter);
app.use('/api/no-show',          generalLimiter, noShowRouter);
app.use('/api/entities',         generalLimiter, entitiesRouter);
app.use('/api/connect',          generalLimiter, connectRouter);
app.use('/api/phone',            generalLimiter, phoneRouter);
app.use('/api/estimates',        generalLimiter, estimatesRouter);
app.use('/api/reviews',          generalLimiter, reviewsRouter);
app.use('/api/push-tokens',      generalLimiter, pushTokensRouter);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve built React app
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { index: false }));
  app.use((req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Generic error handler — never expose stack traces in production
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  console.error('[error]', err.message);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Internal server error.' });
  }
  res.status(500).json({ error: err.message });
});

module.exports = app;
