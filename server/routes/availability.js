const express = require('express');
const { getAllSettings, getAllStations } = require('../db');
const {
  buildTimeline,
  formatDate,
  formatTime,
} = require('../lib/bookingTimeline');

const router = express.Router();

router.get('/', (req, res) => {
  const { service, date } = req.query;
  const settings = getAllSettings();

  if (!service || !['ps5', 'pool'].includes(service)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing "service" param. Must be "ps5" or "pool".',
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing "date" param. Use YYYY-MM-DD format.',
    });
  }

  const data = buildTimeline(service, date, settings, { isAdmin: false });
  const slots = data.timeline.map((station) => ({
    station_id: station.station_id,
    station_number: station.station_number,
    available: !!station.next_available && station.next_available.startsWith(`${date}T`),
    next_available: station.next_available ? formatTime(new Date(station.next_available)) : null,
  }));

  return res.status(200).json({ success: true, ...data, slots });
});

router.get('/timeline', (req, res) => {
  const { service, date } = req.query;
  const settings = getAllSettings();

  if (!service || !['ps5', 'pool'].includes(service)) {
    return res.status(400).json({ success: false, message: 'Invalid service. Must be "ps5" or "pool".' });
  }

  const queryDate = date || formatDate(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })));
  const data = buildTimeline(service, queryDate, settings, { isAdmin: false });

  return res.json({ success: true, ...data });
});

router.get('/controllers', (req, res) => {
  const { service, players } = req.query;
  if (!service || service !== 'ps5') {
    return res.status(400).json({ success: false, message: 'Controller check only applies to PS5.' });
  }

  const groupSize = parseInt(players, 10) || 1;
  const stations = getAllStations.all().filter((station) => station.type === 'ps5' && station.status === 'available');

  const available = stations.filter((station) => station.working_controllers >= groupSize);
  const insufficient = stations.filter((station) => station.working_controllers < groupSize && station.working_controllers > 0);

  if (available.length === 0) {
    const maxControllers = Math.max(...stations.map((station) => station.working_controllers), 0);
    return res.json({
      success: true,
      can_book: false,
      message: `Sorry, no stations currently have enough working controllers for your group of ${groupSize}. The maximum available is ${maxControllers} controllers. Please check back later or try a smaller group size.`,
      available_stations: [],
      unavailable_stations: insufficient.map((station) => ({
        id: station.id,
        number: station.number,
        working_controllers: station.working_controllers,
      })),
      max_controllers: maxControllers,
    });
  }

  return res.json({
    success: true,
    can_book: true,
    available_stations: available.map((station) => ({
      id: station.id,
      number: station.number,
      working_controllers: station.working_controllers,
    })),
    message: `${available.length} station(s) available for your group of ${groupSize}.`,
  });
});

router.get('/validate-slot', (req, res) => {
  const { service, station_id, start_time } = req.query;
  const settings = getAllSettings();

  if (!service || !['ps5', 'pool'].includes(service)) {
    return res.status(400).json({ success: false, message: 'Invalid service. Must be "ps5" or "pool".' });
  }

  if (!station_id || !start_time) {
    return res.status(400).json({ success: false, message: 'station_id and start_time are required.' });
  }

  const selectedStart = new Date(start_time);
  if (Number.isNaN(selectedStart.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid start_time. Use ISO datetime.' });
  }

  const date = formatDate(selectedStart);
  const timelineData = buildTimeline(service, date, settings);
  const station = timelineData.timeline.find((item) => String(item.station_id) === String(station_id));

  if (!station || !station.next_available) {
    return res.status(409).json({
      success: false,
      available: false,
      message: 'Slot no longer available. Please pick a different time.',
    });
  }

  const stationNext = new Date(station.next_available);
  const available = stationNext.getTime() === selectedStart.getTime();

  return res.json({
    success: true,
    available,
    message: available ? 'Slot is still available.' : 'Slot no longer available. Please pick a different time.',
    station_next_available: station.next_available,
    timeline_updated_at: new Date().toISOString(),
  });
});

module.exports = router;
