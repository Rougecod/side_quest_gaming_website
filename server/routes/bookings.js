const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  insertBooking, getBookingCountByPhone, getBookingByRef, db,
  getAllSettings, getAvailableStationsWithControllers, getBlockedSlotsForDate,
  logBookingAudit, getSetting, getBookingNumPeople, getBookingTotalAmount,
  getUserByUsn, creditWallet, debitWalletIfSufficient,
} = require('../db');
const {
  sendBookingConfirmation,
  sendAdminBookingNotification,
  sendPaymentVerifiedEmail,
  sendPaymentNotificationToAdmin,
  sendUpiVerificationNotification,
} = require('../email');
const { getExtensionPreview } = require('../lib/bookingTimeline');
const { createRazorpayOrder, verifyRazorpaySignature } = require('../lib/paymentGateway');
const { getPricingTier, resolveRateForService } = require('../lib/pricing');

const router = express.Router();

const POOL_TIER_PEOPLE = {
  '2plus': 2,
  '4plus': 4,
  '8plus': 8,
};

function getIstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function formatIstDate(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatUtcForDb(date) {
  return new Date(date).toISOString();
}

function parseDateTime(date, time) {
  return new Date(`${date}T${time}:00+05:30`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

function getBookingWindow(booking) {
  const start = booking.session_start_time
    ? new Date(booking.session_start_time)
    : parseDateTime(booking.date, booking.time);
  const end = booking.session_end_time
    ? new Date(booking.session_end_time)
    : addHours(start, booking.duration_hours || 1);
  return { start, end };
}

function getBusinessHours(settings, queryDate) {
  const dayDate = new Date(`${queryDate}T00:00:00+05:30`);
  const day = dayDate.getDay();
  const isWeekend = day === 0 || day === 6;

  return {
    openHour: parseInt(isWeekend ? (settings.weekend_open || '9') : (settings.weekday_open || '10'), 10),
    closeHour: parseInt(isWeekend ? (settings.weekend_close || '24') : (settings.weekday_close || '23'), 10),
  };
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getEligibleStations({ service, playerCount, settings, preferredStationId }) {
  const capacityLimit = parseInt(settings[`${service}_capacity`] || '0', 10);
  const allStations = db.prepare(`
    SELECT *
    FROM stations
    WHERE type = ? AND status = 'available'
    ORDER BY number ASC
  `).all(service);

  const limited = capacityLimit > 0 ? allStations.slice(0, capacityLimit) : allStations;
  const controllerFiltered = service === 'ps5'
    ? limited.filter((station) => station.working_controllers >= playerCount)
    : limited;

  if (preferredStationId) {
    return controllerFiltered.filter((station) => station.id === preferredStationId);
  }

  return controllerFiltered;
}

function findStationForBooking({ service, date, startTime, durationHours, playerCount, preferredStationId, settings }) {
  const bufferMinutes = parseInt(settings.buffer_time || '10', 10);
  const proposedStart = parseDateTime(date, startTime);
  const proposedEnd = addHours(proposedStart, durationHours);
  const proposedProtectedEnd = addMinutes(proposedEnd, bufferMinutes);
  const { openHour, closeHour } = getBusinessHours(settings, date);

  const dayOpen = new Date(`${date}T${String(openHour).padStart(2, '0')}:00:00+05:30`);
  const dayClose = new Date(`${date}T${String(closeHour).padStart(2, '0')}:00:00+05:30`);
  if (proposedStart < dayOpen || proposedEnd > dayClose) {
    return { error: 'Selected slot is outside business hours.' };
  }

  const blockedSlots = getBlockedSlotsForDate.all({ service, date });
  const blockedConflict = blockedSlots.find((slot) => {
    const blockedStart = parseDateTime(slot.date, slot.start_time);
    const blockedEnd = parseDateTime(slot.date, slot.end_time);
    return overlaps(proposedStart, proposedEnd, blockedStart, blockedEnd);
  });
  if (blockedConflict) {
    return { error: `This slot is blocked${blockedConflict.reason ? `: ${blockedConflict.reason}` : '.'}` };
  }

  const eligibleStations = getEligibleStations({ service, playerCount, settings, preferredStationId });
  if (eligibleStations.length === 0) {
    return { error: service === 'ps5'
      ? 'No PS5 station with enough controllers is available for that slot.'
      : 'No pool table is available for that slot.' };
  }

  const existingBookings = db.prepare(`
    SELECT *
    FROM bookings
    WHERE service = ?
      AND date = ?
      AND status IN ('confirmed', 'active', 'completed')
      AND station_id IS NOT NULL
    ORDER BY session_start_time ASC, time ASC
  `).all(service, date);

  for (const station of eligibleStations) {
    const stationConflict = existingBookings.some((booking) => {
      if (booking.station_id !== station.id) return false;
      const existingWindow = getBookingWindow(booking);
      const existingProtectedEnd = addMinutes(existingWindow.end, bufferMinutes);
      return overlaps(proposedStart, proposedProtectedEnd, existingWindow.start, existingProtectedEnd);
    });

    if (!stationConflict) {
      return { station, proposedStart, proposedEnd };
    }
  }

  return { error: preferredStationId
    ? 'That resource is no longer available for the selected time.'
    : 'That slot was just taken. Please pick the next available time shown in the timeline.' };
}

function normalizePoolTierPeople(tier) {
  return POOL_TIER_PEOPLE[tier] || 1;
}

function getRequestedPeople({ service, players, pool_group_tier }) {
  if (service === 'ps5') return Math.max(1, parseInt(players || '1', 10));
  return normalizePoolTierPeople(pool_group_tier);
}

function calculateAmount({ ratePerPerson, numPeople, durationMinutes }) {
  return Math.max(0, Math.round(Number(ratePerPerson || 0) * Number(numPeople || 1) * (Number(durationMinutes || 60) / 60)));
}

function getWalletContext({ usn, booking }) {
  const cleanUsn = String(usn || '').trim().toUpperCase();
  if (!cleanUsn) {
    return { error: 'Sign in to use wallet payments.' };
  }

  const user = getUserByUsn.get(cleanUsn);
  if (!user) {
    return { error: 'Wallet account not found for this USN.' };
  }

  if (booking?.usn && booking.usn !== cleanUsn) {
    return { error: 'Wallet can only be used by the same logged-in user who made this booking.' };
  }

  return { user };
}

function getPublicBookingSummary(booking) {
  const numPeople = getBookingNumPeople(booking);
  const baseAmount = Math.max(0, getBookingTotalAmount(booking) - Number(booking.extension_amount || 0));
  return {
    reference_id: booking.reference_id,
    service: booking.service,
    name: booking.name,
    phone: booking.phone,
    email: booking.email,
    date: booking.date,
    time: booking.time,
    duration_hours: booking.duration_hours,
    extension_minutes: Number(booking.extension_minutes || 0),
    rate_per_person: Number(booking.total_price || 0),
    num_people: numPeople,
    total_amount: getBookingTotalAmount(booking),
    base_amount: baseAmount,
    extension_amount: Number(booking.extension_amount || 0),
    payment_method: booking.payment_method,
    payment_status: booking.payment_status,
    extension_payment_method: booking.extension_payment_method,
    extension_payment_status: booking.extension_payment_status,
    station_id: booking.station_id,
    station_number: booking.station_number,
    session_start_time: booking.session_start_time,
    session_end_time: booking.session_end_time,
    status: booking.status,
    usn: booking.usn,
    pool_group_tier: booking.pool_group_tier,
  };
}

router.get('/public/:reference_id', (req, res) => {
  const booking = getBookingByRef.get(req.params.reference_id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' });
  }

  return res.json({ success: true, booking: getPublicBookingSummary(booking) });
});

router.get('/public/:reference_id/extension-preview', (req, res) => {
  const booking = getBookingByRef.get(req.params.reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const durationMinutes = Math.max(30, parseInt(req.query.minutes || '30', 10));
  const settings = getAllSettings();
  const preview = getExtensionPreview({ booking, settings, durationMinutes });
  const amount = calculateAmount({
    ratePerPerson: booking.total_price,
    numPeople: getBookingNumPeople(booking),
    durationMinutes,
  });

  return res.json({
    success: true,
    booking: getPublicBookingSummary(booking),
    preview,
    extra_amount: amount,
  });
});

router.post('/public/:reference_id/extension-order', async (req, res) => {
  const booking = getBookingByRef.get(req.params.reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  const durationMinutes = Math.max(30, parseInt(req.body.duration_minutes || '30', 10));
  const settings = getAllSettings();
  const preview = getExtensionPreview({ booking, settings, durationMinutes });

  if (preview.status !== 'ok') {
    return res.status(409).json({ success: false, message: preview.message, preview });
  }

  const extraAmount = calculateAmount({
    ratePerPerson: booking.total_price,
    numPeople: getBookingNumPeople(booking),
    durationMinutes,
  });

  try {
    const razorpay = await createRazorpayOrder({
      receipt: `${booking.reference_id}-ext-${Date.now()}`,
      amountPaise: extraAmount * 100,
      notes: {
        reference_id: booking.reference_id,
        booking_type: 'extension',
        duration_minutes: String(durationMinutes),
      },
    });

    if (razorpay.not_configured) {
      return res.status(503).json({
        success: false,
        not_configured: true,
        message: 'Online payment gateway not configured. Please choose Card, UPI, or Wallet later.',
      });
    }

    return res.json({
      success: true,
      key_id: razorpay.key_id,
      order: razorpay.order,
      amount: extraAmount,
      amount_paise: extraAmount * 100,
      preview,
      booking: getPublicBookingSummary(booking),
    });
  } catch (error) {
    console.error('Extension Razorpay order error:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Unable to create extension payment order.' });
  }
});

router.post('/public/:reference_id/extend', (req, res) => {
  const booking = getBookingByRef.get(req.params.reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (!['confirmed', 'active'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: `Cannot extend a booking with status "${booking.status}".` });
  }

  const durationMinutes = Math.max(30, parseInt(req.body.duration_minutes || '30', 10));
  const paymentMethod = req.body.payment_method || 'card';
  const settings = getAllSettings();
  const preview = getExtensionPreview({ booking, settings, durationMinutes });

  if (preview.status !== 'ok') {
    return res.status(409).json({ success: false, message: preview.message, preview });
  }

  const extensionAmount = calculateAmount({
    ratePerPerson: booking.total_price,
    numPeople: getBookingNumPeople(booking),
    durationMinutes,
  });

  let extensionPaymentStatus = req.body.payment_status
    || (paymentMethod === 'upi' ? 'pending_verification' : 'paid');
  let walletContext = null;

  if (paymentMethod === 'wallet') {
    walletContext = getWalletContext({ usn: req.body.usn, booking });
    if (walletContext.error) {
      return res.status(400).json({ success: false, message: walletContext.error });
    }
  }

  if (paymentMethod === 'card') {
    const orderId = req.body.razorpay_order_id;
    const paymentId = req.body.razorpay_payment_id;
    const signature = req.body.razorpay_signature;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay payment details.' });
    }

    if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }

    extensionPaymentStatus = 'paid';
  }

  if (paymentMethod === 'upi') {
    extensionPaymentStatus = 'pending_verification';
  }

  const updateBooking = db.transaction(() => {
    if (paymentMethod === 'wallet') {
      const walletResult = debitWalletIfSufficient({
        user_id: walletContext.user.id,
        amount: extensionAmount,
        source_method: 'wallet',
        reference_booking_id: booking.reference_id,
        note: 'Session extension payment',
      });

      if (!walletResult.success) return walletResult;
    }

    db.prepare(`
      UPDATE bookings
      SET
        session_end_time = ?,
        extension_minutes = COALESCE(extension_minutes, 0) + ?,
        extension_amount = COALESCE(extension_amount, 0) + ?,
        extension_payment_method = ?,
        extension_payment_status = ?,
        total_amount = COALESCE(total_amount, 0) + ?
      WHERE id = ?
    `).run(
      formatUtcForDb(preview.proposed_end_time),
      durationMinutes,
      extensionAmount,
      paymentMethod,
      extensionPaymentStatus,
      extensionAmount,
      booking.id,
    );

    logBookingAudit({
      booking_id: booking.id,
      reference_id: booking.reference_id,
      action: 'booking_extended',
      actor: 'customer',
      details: {
        duration_minutes: durationMinutes,
        extension_amount: extensionAmount,
        payment_method: paymentMethod,
        payment_status: extensionPaymentStatus,
        previous_end_time: booking.session_end_time,
        new_end_time: formatUtcForDb(preview.proposed_end_time),
      },
    });

    return { success: true };
  });

  const updateResult = updateBooking();
  if (!updateResult.success) {
    return res.status(409).json({
      success: false,
      wallet_insufficient: true,
      current_balance: updateResult.current_balance,
      shortfall: updateResult.shortfall,
      message: `Wallet balance is insufficient. Add ₹${updateResult.shortfall} or switch to Card / UPI.`,
    });
  }

  const updatedBooking = getBookingByRef.get(req.params.reference_id);

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
      total_amount: getBookingTotalAmount(updatedBooking),
      extension_amount: updatedBooking.extension_amount,
      extension_payment_status: updatedBooking.extension_payment_status,
      status: updatedBooking.status,
    });
  }

  return res.json({
    success: true,
    message: paymentMethod === 'upi'
      ? 'Extension saved. Please complete and verify your UPI payment.'
      : paymentMethod === 'wallet'
        ? 'Extension paid from wallet and applied successfully.'
        : 'Extension paid and applied successfully.',
    booking: getPublicBookingSummary(updatedBooking),
    preview,
  });
});

router.post('/', (req, res) => {
  const { service, players, name, phone, usn, email, notes, pool_group_tier, desired_start_time, preferred_station_id } = req.body;
  const missing = [];
  if (!service) missing.push('service');
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');

  if (missing.length > 0) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!['ps5', 'pool'].includes(service)) {
    return res.status(400).json({ success: false, message: 'Invalid service.' });
  }

  let cleanUsn = null;
  if (usn) {
    cleanUsn = usn.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(cleanUsn)) {
      return res.status(400).json({ success: false, message: 'USN must be exactly 10 alphanumeric characters.' });
    }
  }

  let cleanTier = null;
  if (service === 'pool' && pool_group_tier) {
    if (!['2plus', '4plus', '8plus'].includes(pool_group_tier)) {
      return res.status(400).json({ success: false, message: 'Invalid pool group tier.' });
    }
    cleanTier = pool_group_tier;
  }

  const settings = getAllSettings();
  const nowIST = getIstNow();
  const today = formatIstDate(nowIST);
  const requestedStart = desired_start_time ? new Date(desired_start_time) : nowIST;

  if (Number.isNaN(requestedStart.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid desired_start_time. Use ISO datetime.' });
  }

  const bookingDate = formatIstDate(requestedStart);
  if (bookingDate !== today) {
    return res.status(400).json({ success: false, message: 'Bookings are currently limited to today only.' });
  }

  if (requestedStart.getTime() < nowIST.getTime() - 60000) {
    return res.status(400).json({ success: false, message: 'Selected slot is already in the past.' });
  }

  const playerCount = getRequestedPeople({ service, players, pool_group_tier: cleanTier });
  if (service === 'ps5' && playerCount > 1) {
    const availableStations = getAvailableStationsWithControllers('ps5', playerCount);
    if (availableStations.length === 0) {
      const allStations = db.prepare(`
        SELECT *
        FROM stations
        WHERE type = 'ps5' AND status = 'available'
        ORDER BY working_controllers DESC
      `).all();
      const maxControllers = allStations.length > 0 ? allStations[0].working_controllers : 0;
      return res.status(400).json({
        success: false,
        controller_error: true,
        message: `Sorry, no PS5 station currently has enough working controllers for your group of ${playerCount}. The maximum available at any station is ${maxControllers} controller(s).`,
        max_controllers: maxControllers,
      });
    }
  }

  const selectedTime = formatTime(requestedStart);
  const slotMatch = findStationForBooking({
    service,
    date: bookingDate,
    startTime: selectedTime,
    durationHours: 1,
    playerCount,
    preferredStationId: preferred_station_id ? parseInt(preferred_station_id, 10) : null,
    settings,
  });

  if (slotMatch.error) {
    return res.status(409).json({ success: false, message: slotMatch.error });
  }

  const ratePerPerson = resolveRateForService({
    service,
    startDate: slotMatch.proposedStart,
    settings,
  });
  const totalAmount = calculateAmount({
    ratePerPerson,
    numPeople: playerCount,
    durationMinutes: 60,
  });

  const year = new Date().getFullYear();
  const reference_id = `SIDEQUEST-${year}-${uuidv4().replace(/-/g, '').substring(0, 4).toUpperCase()}`;

  try {
    const createBooking = db.transaction(() => {
      const rechecked = findStationForBooking({
        service,
        date: bookingDate,
        startTime: selectedTime,
        durationHours: 1,
        playerCount,
        preferredStationId: preferred_station_id ? parseInt(preferred_station_id, 10) : null,
        settings,
      });

      if (rechecked.error || !rechecked.station) {
        throw new Error(rechecked.error || 'Slot unavailable');
      }

      insertBooking.run({
        reference_id,
        service,
        date: bookingDate,
        time: selectedTime,
        duration_hours: 1,
        total_price: ratePerPerson,
        num_people: playerCount,
        total_amount: totalAmount,
        name: name.trim(),
        phone: phone.trim(),
        email: email ? email.trim() : null,
        notes: notes ? notes.trim() : null,
        payment_method: 'unpaid',
        payment_status: 'pending',
        players: service === 'ps5' ? playerCount : 1,
        usn: cleanUsn,
        pool_group_tier: cleanTier,
        station_id: rechecked.station.id,
        session_start_time: formatUtcForDb(rechecked.proposedStart),
        session_end_time: formatUtcForDb(rechecked.proposedEnd),
      });

      logBookingAudit({
        reference_id,
        action: 'booking_created',
        actor: 'customer',
        details: {
          service,
          date: bookingDate,
          time: selectedTime,
          station_id: rechecked.station.id,
          station_number: rechecked.station.number,
          pricing_tier: getPricingTier(rechecked.proposedStart),
          num_people: playerCount,
          rate_per_person: ratePerPerson,
          total_amount: totalAmount,
        },
      });

      return rechecked.station;
    });

    req.station = createBooking();
  } catch (error) {
    console.error('Database error:', error.message);
    const statusCode = error.message && error.message.toLowerCase().includes('slot') ? 409 : 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 409 ? error.message : 'Failed to save booking. Please try again.',
    });
  }

  const booking = getBookingByRef.get(reference_id);
  sendBookingConfirmation({ ...booking, total_amount: getBookingTotalAmount(booking), num_people: getBookingNumPeople(booking) });
  sendAdminBookingNotification({ ...booking, total_amount: getBookingTotalAmount(booking), num_people: getBookingNumPeople(booking) });

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) {
    broadcastBookingEvent('new_booking', {
      ...booking,
      total_amount: getBookingTotalAmount(booking),
      num_people: getBookingNumPeople(booking),
    });
  }

  return res.status(201).json({
    success: true,
    message: 'Booking confirmed successfully!',
    booking: {
      ...getPublicBookingSummary(booking),
      station_number: req.station.number,
    },
  });
});

router.get('/loyalty', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone required.' });
  const result = getBookingCountByPhone.get(phone.trim());
  return res.json({ success: true, total_bookings: result ? result.count : 0 });
});

router.post('/cancel', (req, res) => {
  const { reference_id, phone } = req.body;
  if (!reference_id || !phone) {
    return res.status(400).json({ success: false, message: 'Reference ID and phone number are required.' });
  }

  const booking = getBookingByRef.get(reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.phone.replace(/\s/g, '') !== phone.replace(/\s/g, '')) {
    return res.status(403).json({ success: false, message: 'Phone number does not match the booking.' });
  }
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'This booking has already been cancelled.' });
  if (booking.status === 'completed') return res.status(400).json({ success: false, message: 'Cannot cancel a completed session.' });
  if (booking.status === 'active') return res.status(400).json({ success: false, message: 'Cannot cancel an active session.' });

  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(booking.id);
  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'booking_cancelled',
    actor: 'customer',
    details: { previous_status: booking.status },
  });

  const broadcastBookingEvent = req.app.get('broadcastBookingEvent');
  if (broadcastBookingEvent) broadcastBookingEvent('booking_cancelled', { ...booking, status: 'cancelled' });

  return res.json({ success: true, message: 'Booking cancelled successfully.' });
});

router.post('/create-order', async (req, res) => {
  const { reference_id, payment_method } = req.body;
  if (!reference_id) return res.status(400).json({ success: false, message: 'reference_id required' });

  const booking = getBookingByRef.get(reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Booking is cancelled.' });
  if (booking.payment_status === 'paid') {
    return res.json({ success: false, already_paid: true, message: 'Already paid.' });
  }

  const totalAmount = getBookingTotalAmount(booking);

  try {
    const razorpay = await createRazorpayOrder({
      receipt: booking.reference_id,
      amountPaise: totalAmount * 100,
      notes: {
        reference_id: booking.reference_id,
        booking_type: 'booking',
        preferred_method: payment_method || 'card',
      },
    });

    if (razorpay.not_configured) {
      return res.status(503).json({
        success: false,
        not_configured: true,
        message: 'Online payment gateway not configured yet. Use Wallet or UPI option.',
      });
    }

    db.prepare('UPDATE bookings SET cashfree_order_id = ? WHERE reference_id = ?')
      .run(razorpay.order.id, reference_id);

    return res.json({
      success: true,
      key_id: razorpay.key_id,
      order: razorpay.order,
      amount: totalAmount,
      amount_paise: totalAmount * 100,
      booking: getPublicBookingSummary(booking),
    });
  } catch (error) {
    console.error('Razorpay create-order error:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not create payment order.' });
  }
});

router.post('/verify-payment', (req, res) => {
  const {
    reference_id,
    payment_method,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!reference_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment verification fields.' });
  }

  const booking = getBookingByRef.get(reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  if (!verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  })) {
    return res.status(400).json({ success: false, message: 'Payment verification failed.' });
  }

  const normalizedMethod = payment_method === 'upi' ? 'upi' : 'card';

  db.prepare(`
    UPDATE bookings
    SET payment_status = 'paid',
        payment_method = ?,
        cashfree_order_id = ?,
        cashfree_payment_id = ?
    WHERE id = ?
  `).run(normalizedMethod, razorpay_order_id, razorpay_payment_id, booking.id);

  const updatedBooking = getBookingByRef.get(reference_id);
  try { sendPaymentVerifiedEmail({ ...updatedBooking, total_amount: getBookingTotalAmount(updatedBooking) }); } catch (error) {}
  try { sendPaymentNotificationToAdmin({ ...updatedBooking, total_amount: getBookingTotalAmount(updatedBooking) }, razorpay_payment_id, normalizedMethod); } catch (error) {}

  logBookingAudit({
    booking_id: booking.id,
    reference_id: booking.reference_id,
    action: 'payment_verified',
    actor: 'customer',
    details: {
      payment_method: normalizedMethod,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
    },
  });

  const notify = req.app.get('notifyAdminClients');
  if (notify) {
    notify('payment_received', {
      name: updatedBooking.name,
      reference_id: updatedBooking.reference_id,
      amount: getBookingTotalAmount(updatedBooking),
    });
  }

  return res.json({ success: true, booking: getPublicBookingSummary(updatedBooking) });
});

router.post('/record-cash', (req, res) => {
  const { reference_id, usn } = req.body;
  if (!reference_id) return res.status(400).json({ success: false, message: 'reference_id required' });

  const booking = getBookingByRef.get(reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.payment_status === 'paid') {
    return res.json({ success: true, booking: getPublicBookingSummary(booking), already_paid: true });
  }

  const walletContext = getWalletContext({ usn, booking });
  if (walletContext.error) {
    return res.status(400).json({ success: false, message: walletContext.error });
  }

  const amount = getBookingTotalAmount(booking);
  const payWithWallet = db.transaction(() => {
    const debitResult = debitWalletIfSufficient({
      user_id: walletContext.user.id,
      amount,
      source_method: 'wallet',
      reference_booking_id: booking.reference_id,
      note: 'Booking payment',
    });

    if (!debitResult.success) return debitResult;

    db.prepare(`
      UPDATE bookings
      SET payment_method = 'wallet', payment_status = 'paid'
      WHERE reference_id = ?
    `).run(reference_id);

    logBookingAudit({
      booking_id: booking.id,
      reference_id,
      action: 'wallet_payment_completed',
      actor: 'customer',
      details: { amount, balance_after: debitResult.balance_after },
    });

    return { success: true, balance_after: debitResult.balance_after };
  });

  const result = payWithWallet();
  if (!result.success) {
    return res.status(409).json({
      success: false,
      wallet_insufficient: true,
      current_balance: result.current_balance,
      shortfall: result.shortfall,
      message: `Wallet balance is insufficient. Add ₹${result.shortfall} or switch to Card / UPI.`,
    });
  }

  const updatedBooking = getBookingByRef.get(reference_id);

  const notify = req.app.get('notifyAdminClients');
  if (notify) {
    notify('payment_received', {
      name: updatedBooking.name,
      reference_id,
      amount: getBookingTotalAmount(updatedBooking),
    });
  }

  res.json({
    success: true,
    booking: getPublicBookingSummary(updatedBooking),
    wallet_balance: result.balance_after,
  });
});

router.post('/record-upi', async (req, res) => {
  const { reference_id, transaction_id } = req.body;
  if (!reference_id) return res.status(400).json({ success: false, message: 'reference_id required' });

  const booking = getBookingByRef.get(reference_id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

  db.prepare(`
    UPDATE bookings
    SET payment_method = 'upi', payment_status = 'pending_verification', cashfree_payment_id = ?
    WHERE reference_id = ?
  `).run(transaction_id || 'UPI-DIRECT', reference_id);

  try {
    const adminEmail = getSetting('admin_email') || process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendUpiVerificationNotification({ ...booking, total_amount: getBookingTotalAmount(booking) }, transaction_id);
    }
  } catch (error) {
    console.error('Email err:', error.message);
  }

  const notify = req.app.get('notifyAdminClients');
  if (notify) {
    notify('upi_payment_pending', {
      name: booking.name,
      reference_id,
      amount: getBookingTotalAmount(booking),
      transaction_id: transaction_id || 'No TXN ID provided',
    });
  }

  res.json({ success: true });
});

module.exports = router;
