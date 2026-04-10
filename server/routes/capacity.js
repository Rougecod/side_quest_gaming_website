const express = require('express');
const { countBookingsForSlot, getAllSettings, getAllStations } = require('../db');

const router = express.Router();

/**
 * GET /api/capacity/today?date=2026-03-20&service=ps5
 * Dynamic capacity from settings, includes controller info
 */
router.get('/today', (req, res) => {
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const serviceFilter = req.query.service;

  const settings = getAllSettings();

  const CAPACITY = {
    ps5: parseInt(settings.ps5_capacity || '8'),
    pool: parseInt(settings.pool_capacity || '4'),
  };

  const dayDate = new Date(date + 'T00:00:00');
  const day = dayDate.getDay();
  const isWeekend = day === 0 || day === 6;
  const startHour = parseInt(isWeekend ? (settings.weekend_open || '9') : (settings.weekday_open || '10'));
  const endHour = parseInt(isWeekend ? (settings.weekend_close || '24') : (settings.weekday_close || '23'));

  const result = {};
  const services = serviceFilter ? [serviceFilter] : ['ps5', 'pool'];

  for (const service of services) {
    if (!CAPACITY[service]) continue;

    const cap = CAPACITY[service];
    let totalBooked = 0;
    const slots = [];

    for (let hour = startHour; hour < endHour; hour++) {
      const time = `${hour.toString().padStart(2, '0')}:00`;
      const { count } = countBookingsForSlot.get({ service, date, time });
      totalBooked += count;
      slots.push({
        time,
        booked: count,
        available: Math.max(0, cap - count),
        full: count >= cap,
      });
    }

    const maxBookedSlot = Math.max(...slots.map(s => s.booked), 0);
    const allFull = slots.length > 0 && slots.every(s => s.full);

    // Get station controller info for PS5
    let controllerInfo = null;
    if (service === 'ps5') {
      const stations = getAllStations.all().filter(s => s.type === 'ps5');
      controllerInfo = stations.map(s => ({
        id: s.id,
        number: s.number,
        status: s.status,
        working_controllers: s.working_controllers,
      }));
    }

    result[service] = {
      total: cap,
      max_booked_in_slot: maxBookedSlot,
      total_bookings_today: totalBooked,
      all_slots_full: allFull,
      slots,
      ...(controllerInfo ? { stations: controllerInfo } : {}),
    };
  }

  return res.json({
    success: true,
    date,
    buffer_time: parseInt(settings.buffer_time || '5'),
    ...result,
  });
});

module.exports = router;
