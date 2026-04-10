const express = require('express');
const { getBookingByRef, getBookingNumPeople, getBookingTotalAmount, getBaseAmount } = require('../db');
const router = express.Router();

/**
 * GET /api/session/:ref
 * Returns booking details + session countdown info for customer timer page
 * Enhanced with countdown, elapsed, and 10-minute warning
 */
router.get('/:ref', (req, res) => {
  const booking = getBookingByRef.get(req.params.ref);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found. Please check your reference ID.' });
  }

  const now = new Date();

  let sessionStart;
  let sessionEnd;
  let timeRemainingMs;
  let elapsedMs;
  let sessionStatus;
  const WARNING_MS = 10 * 60 * 1000; // 10 minutes warning
  const numPeople = getBookingNumPeople(booking);
  const totalAmount = getBookingTotalAmount(booking);
  const baseAmount = getBaseAmount(booking);
  const baseDurationMs = Math.max(1, Number(booking.duration_hours || 1)) * 60 * 60 * 1000;
  const extensionDurationMs = Math.max(0, Number(booking.extension_minutes || 0)) * 60 * 1000;
  const totalDurationMs = baseDurationMs + extensionDurationMs;

  sessionStart = booking.session_start_time
    ? new Date(booking.session_start_time)
    : new Date(`${booking.date}T${booking.time}:00+05:30`);
  sessionEnd = booking.session_end_time
    ? new Date(booking.session_end_time)
    : new Date(sessionStart.getTime() + totalDurationMs);

  if (booking.status === 'completed') {
    sessionStatus = 'ended';
    timeRemainingMs = 0;
    elapsedMs = Math.max(0, sessionEnd.getTime() - sessionStart.getTime());
  } else if (booking.status === 'cancelled') {
    sessionStatus = 'cancelled';
    timeRemainingMs = 0;
    elapsedMs = 0;
  } else {
    const startsIn = sessionStart.getTime() - now.getTime();

    if (startsIn > 0) {
      sessionStatus = 'upcoming';
      timeRemainingMs = Math.max(0, sessionEnd.getTime() - sessionStart.getTime());
      elapsedMs = 0;
    } else if (now < sessionEnd) {
      timeRemainingMs = sessionEnd.getTime() - now.getTime();
      elapsedMs = now.getTime() - sessionStart.getTime();
      sessionStatus = timeRemainingMs <= WARNING_MS ? 'warning' : 'active';
    } else {
      sessionStatus = 'ended';
      timeRemainingMs = 0;
      elapsedMs = sessionEnd.getTime() - sessionStart.getTime();
    }
  }

  return res.json({
    success: true,
    booking: {
      reference_id: booking.reference_id,
      service: booking.service,
      name: booking.name,
      date: booking.date,
      time: booking.time,
      duration_hours: booking.duration_hours,
      rate_per_person: booking.total_price,
      num_people: numPeople,
      total_amount: totalAmount,
      base_amount: baseAmount,
      extension_amount: Number(booking.extension_amount || 0),
      extension_minutes: Number(booking.extension_minutes || 0),
      status: booking.status,
      usn: booking.usn,
      pool_group_tier: booking.pool_group_tier,
    },
    session: {
      status: sessionStatus,
      start_time: sessionStart.toISOString(),
      end_time: sessionEnd.toISOString(),
      time_remaining_ms: timeRemainingMs !== null ? Math.max(0, timeRemainingMs || 0) : null,
      time_remaining_min: timeRemainingMs !== null ? Math.max(0, Math.ceil((timeRemainingMs || 0) / 60000)) : null,
      elapsed_ms: Math.max(0, elapsedMs || 0),
      elapsed_min: Math.max(0, Math.ceil((elapsedMs || 0) / 60000)),
      total_duration_ms: Math.max(0, sessionEnd.getTime() - sessionStart.getTime()),
      total_duration_min: Math.max(0, Math.ceil((sessionEnd.getTime() - sessionStart.getTime()) / 60000)),
      warning_threshold_ms: WARNING_MS,
      total_cost: totalAmount,
    },
  });
});

module.exports = router;
