const express = require('express');
const crypto = require('crypto');
const {
  getAllBookings, getBookingsFiltered, getBookingById, getDashboardStats,
  startSession, completeSession, cancelBooking,
  getAllContacts, markContactRead, getUnreadCount,
  getAllStations, updateStationStatus, updateStationControllers,
  insertBlockedSlot, getAllBlockedSlots, deleteBlockedSlot,
  getAllSettings, updateSetting, getAllFeedback, getSetting,
  getCustomers, getCustomerHistory,
  getRevenueByDateRange, getPeakHours,
  updateBookingTimes, updateExtensionPayment, db, logBookingAudit, getBookingAuditTrail,
  getPaymentSummary, getBookingNumPeople, getBookingTotalAmount, getBaseAmount, getAllWalletTransactions,
} = require('../db');
const { sendSessionStartedEmail, sendTimeChangeNotification } = require('../email');
const {
  addHours,
  addMinutes,
  getBookingWindow,
  getExtensionPreview,
} = require('../lib/bookingTimeline');
const { getPricingConfig } = require('../lib/pricing');

const router = express.Router();

// ---- Session token store (in-memory, 12-hour expiry) ----
const sessionTokens = new Map();
const TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of sessionTokens.entries()) {
    if (now > data.expiresAt) sessionTokens.delete(token);
  }
}

// Clean up expired tokens every hour
setInterval(cleanExpiredTokens, 60 * 60 * 1000);

// ---- Auth middleware: accepts session tokens OR static API key ----
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ success: false, message: 'Unauthorized.' });

  // Check session tokens first
  cleanExpiredTokens();
  if (sessionTokens.has(apiKey)) {
    return next();
  }

  // Fallback: static ADMIN_API_KEY from .env
  if (apiKey === process.env.ADMIN_API_KEY) {
    return next();
  }

  return res.status(401).json({ success: false, message: 'Unauthorized.' });
}

function getISTDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// =============== LOGIN ===============
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required.' });

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessionTokens.set(token, { expiresAt: Date.now() + TOKEN_EXPIRY_MS });

  return res.json({ success: true, token });
});

// =============== PUBLIC SETTINGS (no auth) ===============
router.get('/settings/public', (req, res) => {
  const settings = getAllSettings();
  const pricing = getPricingConfig(settings);
  return res.json({
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
    pricing,
  });
});

// =============== DASHBOARD ===============
router.get('/dashboard', requireApiKey, (req, res) => {
  const date = req.query.date || getISTDate();
  const stats = getDashboardStats(date);
  const unread = getUnreadCount.get().count;
  const paymentSummary = getPaymentSummary(date);
  return res.json({ success: true, date, ...stats, unread_messages: unread, payment_summary: paymentSummary });
});

// =============== BOOKINGS ===============
router.get('/bookings', requireApiKey, (req, res) => {
  const { date, service, status, search } = req.query;
  if (service && !['ps5', 'pool'].includes(service)) return res.status(400).json({ success: false, message: 'Invalid service.' });
  if (status && !['confirmed', 'active', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });

  const hasFilters = date || service || status;
  let bookings = hasFilters ? getBookingsFiltered({ date, service, status }) : getAllBookings.all();

  if (search) {
    const q = search.toLowerCase();
    bookings = bookings.filter(b => b.name.toLowerCase().includes(q) || b.phone.includes(q));
  }

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  bookings = bookings.map(b => {
    const window = getBookingWindow(b);
    let session_badge = 'upcoming';
    if (b.status === 'completed') session_badge = 'completed';
    else if (b.status === 'cancelled') session_badge = 'cancelled';
    else if (b.status === 'active') session_badge = 'active';
    else {
      if (now >= window.start && now < window.end) session_badge = 'in_progress';
      else if (now >= window.end) session_badge = 'past';
    }
    return {
      ...b,
      session_badge,
      num_people: getBookingNumPeople(b),
      total_amount: getBookingTotalAmount(b),
      base_amount: getBaseAmount(b),
    };
  });

  return res.json({ success: true, count: bookings.length, bookings });
});

router.patch('/bookings/:id/start', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.status !== 'confirmed') return res.status(400).json({ success: false, message: `Cannot start session with status "${booking.status}".` });

  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const startTime = ist.toISOString();
  const endTime = booking.session_end_time || new Date(ist.getTime() + booking.duration_hours * 3600000).toISOString();
  startSession.run({ id: req.params.id, start_time: startTime, end_time: endTime });

  // Send session started email to admin (Issue #4e)
  sendSessionStartedEmail(booking, startTime, endTime);

  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'session_started',
    actor: 'admin',
    details: { session_start_time: startTime, session_end_time: endTime },
  });

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('session_started', { ...booking, status: 'active', session_start_time: startTime, session_end_time: endTime });
  return res.json({ success: true, message: 'Session started.', session_start_time: startTime, session_end_time: endTime });
});

router.patch('/bookings/:id/complete', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (!['confirmed', 'active'].includes(booking.status)) return res.status(400).json({ success: false, message: `Cannot complete booking with status "${booking.status}".` });
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const endTime = ist.toISOString();

  completeSession.run({ id: req.params.id, end_time: endTime });
  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'session_completed',
    actor: 'admin',
    details: { session_end_time: endTime, total_amount: getBookingTotalAmount(booking) },
  });

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('session_ended', { ...booking, status: 'completed', session_end_time: endTime, total_amount: getBookingTotalAmount(booking) });
  return res.json({ success: true, message: 'Session marked as completed.', total_amount: getBookingTotalAmount(booking), session_end_time: endTime });
});

router.patch('/bookings/:id/cancel', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled.' });
  cancelBooking.run(req.params.id);
  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'booking_cancelled',
    actor: 'admin',
    details: { previous_status: booking.status },
  });
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('booking_cancelled', { ...booking, status: 'cancelled' });
  return res.json({ success: true, message: 'Booking cancelled.' });
});

router.get('/bookings/:id/extension-preview', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const durationMinutes = Math.max(30, parseInt(req.query.minutes || req.query.duration_minutes || req.query.hours * 60 || req.query.duration_hours * 60 || '60', 10));
  const settings = getAllSettings();
  const preview = getExtensionPreview({ booking, settings, durationMinutes });

  return res.json({ success: true, ...preview });
});

router.post('/bookings/:id/extend', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (!['active', 'confirmed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: `Cannot extend booking with status "${booking.status}".` });
  }

  const durationMinutes = Math.max(30, parseInt(req.body.minutes || req.body.duration_minutes || req.body.hours * 60 || req.body.duration_hours * 60 || '60', 10));
  const force = req.body.force === true;
  const settings = getAllSettings();
  const preview = getExtensionPreview({ booking, settings, durationMinutes });

  if (preview.status !== 'ok' && !(force && preview.status === 'conflict')) {
    return res.status(409).json({
      success: false,
      message: preview.message,
      requires_confirmation: preview.status === 'conflict',
      preview,
    });
  }

  // Task 7: Handle extension payment
  const extensionAmount = Math.round(Number(booking.total_price || 0) * getBookingNumPeople(booking) * (durationMinutes / 60));
  const extensionPaymentMethod = req.body.payment_method || 'card';
  const extensionPaymentStatus = req.body.payment_status || (extensionPaymentMethod === 'upi' ? 'pending_verification' : 'paid');

  updateBookingTimes.run({
    id: booking.id,
    start_time: preview.current_start_time,
    end_time: preview.proposed_end_time,
  });

  // Update extension payment info
  updateExtensionPayment.run({
    id: booking.id,
    extension_amount: extensionAmount,
    extension_minutes: durationMinutes,
    extension_payment_method: extensionPaymentMethod,
    extension_payment_status: extensionPaymentStatus,
  });

  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'booking_extended',
    actor: 'admin',
    details: {
      previous_end_time: preview.current_end_time,
      new_end_time: preview.proposed_end_time,
      duration_minutes: durationMinutes,
      forced: force,
      conflict_count: preview.conflicts.length,
      extension_amount: extensionAmount,
      extension_payment_method: extensionPaymentMethod,
      extension_payment_status: extensionPaymentStatus,
    },
  });

  const updatedBooking = getBookingById.get(req.params.id);
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) {
    broadcastBookingEvent('booking_extended', {
      id: updatedBooking.id,
      reference_id: updatedBooking.reference_id,
      name: updatedBooking.name,
      service: updatedBooking.service,
      station_id: updatedBooking.station_id,
      station_number: updatedBooking.station_number,
      session_start_time: updatedBooking.session_start_time,
      session_end_time: updatedBooking.session_end_time,
      date: updatedBooking.date,
      status: updatedBooking.status,
      forced: force,
    });
  }

  return res.json({
    success: true,
    message: force && preview.status === 'conflict'
      ? 'Booking extended with override. Timeline updated.'
      : 'Booking extended successfully. Timeline updated.',
    booking: updatedBooking,
    preview,
  });
});

router.patch('/bookings/:id/payment-status', requireApiKey, (req, res) => {
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const target = req.body.target === 'extension' ? 'extension' : 'booking';
  const status = req.body.status || 'paid';
  if (!['paid', 'pending_cash', 'pending_verification', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid payment status.' });
  }

  if (target === 'extension') {
    if (!Number(booking.extension_amount || 0)) {
      return res.status(400).json({ success: false, message: 'No extension payment exists for this booking.' });
    }
    db.prepare(`
      UPDATE bookings
      SET extension_payment_status = ?,
          extension_payment_method = CASE
            WHEN ? = 'paid' AND COALESCE(extension_payment_method, '') IN ('', 'unpaid') THEN 'card'
            ELSE extension_payment_method
          END
      WHERE id = ?
    `).run(status, status, booking.id);
  } else {
    db.prepare(`
      UPDATE bookings
      SET payment_status = ?,
          payment_method = CASE
            WHEN ? = 'paid' AND COALESCE(payment_method, '') IN ('', 'unpaid') THEN 'card'
            ELSE payment_method
          END
      WHERE id = ?
    `).run(status, status, booking.id);
  }

  const updatedBooking = getBookingById.get(req.params.id);
  logBookingAudit({
    booking_id: updatedBooking.id,
    reference_id: updatedBooking.reference_id,
    action: target === 'extension' ? 'extension_payment_status_updated' : 'payment_status_updated',
    actor: 'admin',
    details: { target, status },
  });

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) {
    broadcastBookingEvent('payment_status_updated', {
      id: updatedBooking.id,
      reference_id: updatedBooking.reference_id,
      target,
      payment_status: updatedBooking.payment_status,
      extension_payment_status: updatedBooking.extension_payment_status,
    });
  }

  return res.json({
    success: true,
    booking: {
      ...updatedBooking,
      num_people: getBookingNumPeople(updatedBooking),
      total_amount: getBookingTotalAmount(updatedBooking),
      base_amount: getBaseAmount(updatedBooking),
    },
  });
});

// =============== BOOKING TIME OVERRIDE ===============
router.patch('/bookings/:id/times', requireApiKey, (req, res) => {
  const session_start_time = req.body.session_start_time || req.body.start_time;
  const session_end_time = req.body.session_end_time || req.body.end_time;
  const booking = getBookingById.get(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  if (!session_start_time || !session_end_time) {
    return res.status(400).json({ success: false, message: 'Both session_start_time and session_end_time are required.' });
  }

  // Validate time format
  const newStart = new Date(session_start_time);
  const newEnd = new Date(session_end_time);
  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid time format. Use ISO datetime.' });
  }
  if (newEnd <= newStart) {
    return res.status(400).json({ success: false, message: 'End time must be after start time.' });
  }

  const bufferTime = parseInt(getSetting('buffer_time') || '10', 10);
  const proposedProtectedEnd = addMinutes(newEnd, bufferTime);

  // Check for conflicts with other bookings on same station
  const conflicts = db.prepare(`
    SELECT *
    FROM bookings
    WHERE id != ? AND service = ? AND date = ?
      AND station_id = ?
      AND status IN ('confirmed', 'active', 'completed')
  `).all(booking.id, booking.service, booking.date, booking.station_id);

  const conflictingBookings = conflicts.filter((other) => {
    const window = getBookingWindow(other);
    const otherProtectedEnd = addMinutes(window.end, bufferTime);
    return newStart < otherProtectedEnd && proposedProtectedEnd > window.start;
  });

  if (conflictingBookings.length > 0) {
    return res.status(409).json({
      success: false,
      message: `Time conflict with ${conflictingBookings.length} other booking(s): ${conflictingBookings.map(c => c.reference_id).join(', ')}. Please choose a different time.`,
      conflicts: conflictingBookings.map(c => ({ reference_id: c.reference_id, name: c.name, start: c.session_start_time || `${c.date} ${c.time}`, end: c.session_end_time })),
    });
  }

  const oldStart = booking.session_start_time;
  const oldEnd = booking.session_end_time;

  updateBookingTimes.run({ id: req.params.id, start_time: session_start_time, end_time: session_end_time });
  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'booking_time_updated',
    actor: 'admin',
    details: {
      old_start_time: oldStart,
      old_end_time: oldEnd,
      new_start_time: session_start_time,
      new_end_time: session_end_time,
    },
  });

  // Send notification email to customer
  try {
    sendTimeChangeNotification(booking, { oldStart, oldEnd }, { newStart: session_start_time, newEnd: session_end_time });
  } catch (e) { console.error('Email error:', e.message); }

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('booking_time_updated', { id: booking.id, reference_id: booking.reference_id, name: booking.name, session_start_time, session_end_time, service: booking.service, date: booking.date, station_id: booking.station_id });

  return res.json({ success: true, message: 'Booking times updated successfully.', session_start_time, session_end_time });
});

// =============== CONTACTS INBOX ===============
router.get('/contacts', requireApiKey, (req, res) => {
  const contacts = getAllContacts.all();
  return res.json({ success: true, count: contacts.length, contacts });
});

router.patch('/contacts/:id/read', requireApiKey, (req, res) => {
  markContactRead.run(req.params.id);
  return res.json({ success: true, message: 'Marked as read.' });
});

// =============== CUSTOMERS ===============
router.get('/customers', requireApiKey, (req, res) => {
  const customers = getCustomers();
  const enriched = customers.map(c => ({
    ...c,
    loyalty: c.total_bookings >= 5 ? 'regular' : c.total_bookings >= 2 ? 'returning' : 'new',
  }));
  return res.json({ success: true, count: enriched.length, customers: enriched });
});

router.get('/customers/:phone/history', requireApiKey, (req, res) => {
  const history = getCustomerHistory(req.params.phone);
  return res.json({ success: true, count: history.length, bookings: history });
});

// =============== REVENUE ===============
router.get('/revenue', requireApiKey, (req, res) => {
  const period = req.query.period || 'week';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  let startDate;
  if (period === 'today') {
    startDate = now.toISOString().split('T')[0];
  } else if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    startDate = d.toISOString().split('T')[0];
  } else {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    startDate = d.toISOString().split('T')[0];
  }
  const endDate = now.toISOString().split('T')[0];

  const data = getRevenueByDateRange(startDate, endDate);
  const peakHours = getPeakHours(endDate);

  const totals = data.reduce((acc, r) => {
    acc.total_revenue += r.revenue;
    acc.total_bookings += r.bookings;
    acc.wallet += r.wallet_revenue;
    acc.card += r.card_revenue;
    acc.upi += r.upi_revenue;
    acc.other += r.other_revenue;
    if (r.service === 'ps5') { acc.ps5_revenue += r.revenue; acc.ps5_bookings += r.bookings; }
    else { acc.pool_revenue += r.revenue; acc.pool_bookings += r.bookings; }
    return acc;
  }, { total_revenue:0, total_bookings:0, wallet:0, card:0, upi:0, other:0, ps5_revenue:0, ps5_bookings:0, pool_revenue:0, pool_bookings:0 });

  return res.json({ success: true, period, start_date: startDate, end_date: endDate, daily: data, totals, peak_hours: peakHours });
});

router.get('/wallet-transactions', requireApiKey, (req, res) => {
  const rows = getAllWalletTransactions.all().map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    balance_after: Number(row.balance_after || 0),
  }));
  return res.json({ success: true, count: rows.length, transactions: rows });
});

// =============== STATIONS ===============
router.get('/stations', requireApiKey, (req, res) => {
  return res.json({ success: true, stations: getAllStations.all() });
});

router.patch('/stations/:id', requireApiKey, (req, res) => {
  const { status, maintenance_note, working_controllers } = req.body;
  if (status && !['available', 'maintenance'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be "available" or "maintenance".' });
  }
  if (status !== undefined) {
    updateStationStatus.run({ id: req.params.id, status: status || 'available', note: maintenance_note || null });
  }
  if (working_controllers !== undefined) {
    const cnt = parseInt(working_controllers);
    if (isNaN(cnt) || cnt < 0) {
      return res.status(400).json({ success: false, message: 'working_controllers must be a non-negative number.' });
    }
    updateStationControllers.run({ id: req.params.id, controllers: cnt });
  }
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('station_updated', { id: req.params.id, status, working_controllers });
  return res.json({ success: true, message: 'Station updated.' });
});

// =============== BLOCKED SLOTS ===============
router.get('/blocked-slots', requireApiKey, (req, res) => {
  return res.json({ success: true, slots: getAllBlockedSlots.all() });
});

router.post('/blocked-slots', requireApiKey, (req, res) => {
  const { service, date, start_time, end_time, reason } = req.body;
  if (!service || !date || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: 'service, date, start_time, end_time required.' });
  }
  insertBlockedSlot.run({ service, date, start_time, end_time, reason: reason || null });
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('blocked_slot_created', { service, date, start_time, end_time, reason: reason || null });
  return res.json({ success: true, message: 'Slot blocked.' });
});

router.delete('/blocked-slots/:id', requireApiKey, (req, res) => {
  deleteBlockedSlot.run(req.params.id);
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('blocked_slot_deleted', { id: req.params.id });
  return res.json({ success: true, message: 'Block removed.' });
});

// =============== SETTINGS ===============
router.get('/settings', requireApiKey, (req, res) => {
  return res.json({ success: true, settings: getAllSettings() });
});

router.put('/settings', requireApiKey, (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, message: 'Settings object required.' });
  }
  for (const [key, value] of Object.entries(settings)) {
    updateSetting.run(key, String(value));
  }
  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('settings_updated', { keys: Object.keys(settings) });
  return res.json({ success: true, message: 'Settings saved.' });
});

// =============== FEEDBACK (admin view) ===============
router.get('/feedback', requireApiKey, (req, res) => {
  return res.json({ success: true, feedback: getAllFeedback.all() });
});

router.get('/audit', requireApiKey, (req, res) => {
  const bookingId = req.query.booking_id ? parseInt(req.query.booking_id, 10) : null;
  const referenceId = req.query.reference_id || null;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));
  const rows = getBookingAuditTrail.all({
    booking_id: Number.isNaN(bookingId) ? null : bookingId,
    reference_id: referenceId,
    limit,
  }).map((row) => ({
    ...row,
    details: row.details_json ? JSON.parse(row.details_json) : null,
  }));

  return res.json({ success: true, count: rows.length, entries: rows });
});

module.exports = router;
