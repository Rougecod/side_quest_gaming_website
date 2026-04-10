require('dotenv').config();

// Startup check for required env vars
const requiredEnv = ['PAYTM_MID', 'PAYTM_MERCHANT_KEY', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_EMAIL'];
const missingEnv = requiredEnv.filter(k => !process.env[k] || process.env[k].includes('your_'));
if (missingEnv.length > 0) {
  console.warn(`\n⚠️  WARNING: These .env variables are not configured: ${missingEnv.join(', ')}`);
  console.warn('   Payment gateway and emails will use fallback mode until these are set.\n');
}

const express = require('express');
const cors = require('cors');
const path = require('path');

const bookingsRouter = require('./routes/bookings');
const contactRouter = require('./routes/contact');
const availabilityRouter = require('./routes/availability');
const adminRouter = require('./routes/admin');
const capacityRouter = require('./routes/capacity');
const sessionRouter = require('./routes/session');
const feedbackRouter = require('./routes/feedback');
const usersRouter = require('./routes/users');
const { startSessionChecker, startDailySummary } = require('./cron');
const { getPricingConfig } = require('./lib/pricing');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SSE: Admin live clients ----
let adminClients = [];
let timelineClients = [];

function notifyAdminClients(eventType, data) {
  adminClients.forEach(client => {
    client.write(`event: ${eventType}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

function notifyTimelineClients(eventType, data) {
  timelineClients.forEach(client => {
    client.write(`event: ${eventType}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

function broadcastBookingEvent(eventType, data) {
  notifyAdminClients(eventType, data);
  notifyTimelineClients('timeline_update', {
    event_type: eventType,
    ...data,
    emitted_at: new Date().toISOString(),
  });
}

app.set('notifyAdminClients', notifyAdminClients);
app.set('notifyTimelineClients', notifyTimelineClients);
app.set('broadcastBookingEvent', broadcastBookingEvent);
global.notifyAdminClients = notifyAdminClients;
global.notifyTimelineClients = notifyTimelineClients;

// ---- Middleware ----
app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "PUT", "DELETE"], allowedHeaders: ["Content-Type", "x-api-key"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Paytm callback form POST
app.use(express.static(path.join(__dirname, '..', 'website')));

app.use((req, res, next) => {
  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ---- API Routes ----
app.use('/api/bookings', bookingsRouter);
app.use('/api/contact', contactRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/admin', adminRouter);
app.use('/api/capacity', capacityRouter);
app.use('/api/session', sessionRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/users', usersRouter);

// Public settings route (no auth, proxied from admin router)
const { getAllSettings } = require('./db');
app.get('/api/settings/public', (req, res) => {
  const settings = getAllSettings();
  const pricing = getPricingConfig(settings);
  res.json({
    whatsapp_number: settings.whatsapp_number || '',
    contact_phone: process.env.CONTACT_PHONE || '+91 98765 43210',
    contact_email: process.env.CONTACT_EMAIL || 'hello@sidequestgaming.in',
    venue_address: process.env.VENUE_ADDRESS || '123 Gaming Street, Tech Park, Bangalore',
    weekday_open: settings.weekday_open || '10',
    weekday_close: settings.weekday_close || '23',
    weekend_open: settings.weekend_open || '9',
    weekend_close: settings.weekend_close || '24',
    ps5_rate: settings.ps5_rate || '150',
    pool_rate: settings.pool_rate || '200',
    ps5_rate_morning: settings.ps5_rate_morning || '100',
    ps5_rate_afternoon: settings.ps5_rate_afternoon || '150',
    pool_rate_morning: settings.pool_rate_morning || '150',
    pool_rate_afternoon: settings.pool_rate_afternoon || '200',
    pool_rate_2plus: settings.pool_rate_2plus || '200',
    pool_rate_4plus: settings.pool_rate_4plus || '350',
    pool_rate_8plus: settings.pool_rate_8plus || '600',
    buffer_time: settings.buffer_time || '10',
    upi_id: settings.upi_id || process.env.UPI_ID || 'sidequestgaming@upi',
    pricing,
  });
});

// Payment mode config endpoint
app.get('/api/config/payment-mode', (req, res) => {
  res.json({
    test_mode: (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_'),
    gateway_configured: !!(process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      !process.env.RAZORPAY_KEY_ID.includes('your_') &&
      !process.env.RAZORPAY_KEY_SECRET.includes('your_')),
  });
});

// SSE endpoint
app.get('/api/admin/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);
  adminClients.push(res);
  console.log(`📡 SSE client connected (${adminClients.length})`);
  req.on('close', () => {
    adminClients = adminClients.filter(c => c !== res);
    console.log(`📡 SSE client disconnected (${adminClients.length})`);
  });
});

app.get('/api/availability/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);
  timelineClients.push(res);
  req.on('close', () => {
    timelineClients = timelineClients.filter(c => c !== res);
  });
});

// ---- Page Routes ----
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'admin.html')));
app.get('/session', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'session.html')));
app.get('/feedback', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'feedback.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'payment.html')));
app.get('/wallet', (req, res) => res.sendFile(path.join(__dirname, '..', 'website', 'wallet.html')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'Side Quest Gaming Center API', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   🎮  Side Quest Gaming Center API Server  🎮    ║
  ║                                              ║
  ║   Website:  http://localhost:${PORT}             ║
  ║   Login:    http://localhost:${PORT}/login        ║
  ║   Admin:    http://localhost:${PORT}/admin        ║
  ║   Session:  http://localhost:${PORT}/session      ║
  ║   Feedback: http://localhost:${PORT}/feedback     ║
  ╚══════════════════════════════════════════════╝
  `);
  startSessionChecker();
  startDailySummary();
});
