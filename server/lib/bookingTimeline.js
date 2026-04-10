const {
  db,
  getAllStations,
  getBlockedSlotsForDate,
} = require('../db');

function parseDateTime(date, time) {
  return new Date(`${date}T${time}:00`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

function getDurationMinutes(durationHours = 1) {
  return Math.max(30, Math.round(Number(durationHours || 1) * 60));
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
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
  const dayDate = new Date(`${queryDate}T00:00:00`);
  const day = dayDate.getDay();
  const isWeekend = day === 0 || day === 6;

  return {
    openHour: parseInt(isWeekend ? (settings.weekend_open || '9') : (settings.weekday_open || '10'), 10),
    closeHour: parseInt(isWeekend ? (settings.weekend_close || '24') : (settings.weekday_close || '23'), 10),
    type: isWeekend ? 'weekend' : 'weekday',
  };
}

function buildTimeline(service, queryDate, settings, options = {}) {
  const bufferTime = parseInt(settings.buffer_time || '10', 10);
  const { openHour, closeHour, type } = getBusinessHours(settings, queryDate);
  const businessOpen = new Date(`${queryDate}T${String(openHour).padStart(2, '0')}:00:00`);
  const businessClose = new Date(`${queryDate}T${String(closeHour).padStart(2, '0')}:00:00`);
  const nowIST = options.now || new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const capacityLimit = parseInt(settings[`${service}_capacity`] || '0', 10);
  const stations = getAllStations.all()
    .filter((station) => station.type === service)
    .slice(0, capacityLimit > 0 ? capacityLimit : undefined);

  const bookings = db.prepare(`
    SELECT *
    FROM bookings
    WHERE service = ?
      AND date = ?
      AND status IN ('confirmed', 'active', 'completed')
      AND station_id IS NOT NULL
    ORDER BY time ASC
  `).all(service, queryDate);

  const blockedSlots = getBlockedSlotsForDate.all({ service, date: queryDate }).map((slot) => ({
    id: `block-${slot.id}`,
    label: slot.reason || 'Blocked',
    kind: 'blocked',
    start: parseDateTime(slot.date, slot.start_time),
    end: parseDateTime(slot.date, slot.end_time),
    reason: slot.reason || null,
  }));

  let nextAvailable = null;
  let nextAvailableStation = null;
  const nextAvailableMs = { value: Number.POSITIVE_INFINITY };

  const timeline = stations.map((station) => {
    const stationBookings = bookings
      .filter((booking) => booking.station_id === station.id)
      .map((booking) => {
        const window = getBookingWindow(booking);
        const availableAt = addMinutes(window.end, bufferTime);
        const displayName = options.isAdmin ? booking.name : 'Booked';
        return {
          id: booking.id,
          reference_id: booking.reference_id,
          name: displayName,
          status: booking.status,
          start_time: window.start.toISOString(),
          end_time: window.end.toISOString(),
          available_at: availableAt.toISOString(),
          players: booking.players,
          pool_group_tier: booking.pool_group_tier,
          kind: 'booking',
        };
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const previewEvent = options.previewExtension && options.previewExtension.station_id === station.id
      ? {
          id: 'preview-extension',
          label: options.previewExtension.label || 'Extension preview',
          kind: 'preview',
          start: new Date(options.previewExtension.start_time),
          end: new Date(options.previewExtension.end_time),
          reference_id: options.previewExtension.reference_id || null,
          status: 'preview',
          reason: options.previewExtension.reason || null,
        }
      : null;

    const events = [
      ...stationBookings.map((booking) => ({
        id: booking.id,
        label: booking.name,
        kind: booking.status === 'active' ? 'active' : 'booked',
        start: new Date(booking.start_time),
        end: new Date(booking.end_time),
        reference_id: booking.reference_id,
        status: booking.status,
      })),
      ...blockedSlots,
      ...(previewEvent ? [previewEvent] : []),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    let cursor = nowIST > businessOpen ? nowIST : businessOpen;
    let currentStatus = station.status === 'maintenance' ? 'maintenance' : 'available';
    let nextAt = cursor;
    let currentLabel = station.status === 'maintenance' ? 'Under maintenance' : 'Available now';

    if (station.status === 'maintenance') {
      nextAt = null;
    } else {
      for (const event of events) {
        const eventProtectedEnd = ['booking', 'active', 'preview'].includes(event.kind)
          ? addMinutes(event.end, bufferTime)
          : event.end;

        if (cursor < event.start) {
          break;
        }

        if (overlaps(cursor, addHours(cursor, 1), event.start, eventProtectedEnd) || (cursor >= event.start && cursor < eventProtectedEnd)) {
          cursor = eventProtectedEnd;
          currentStatus = event.kind === 'blocked'
            ? 'blocked'
            : event.kind === 'active'
              ? 'active'
              : event.kind === 'preview'
                ? 'preview'
                : 'booked';
          currentLabel = event.kind === 'blocked'
            ? (event.reason || 'Blocked')
            : `${event.label} until ${formatTime(event.end)}`;
        }
      }

      if (cursor > businessClose || addHours(cursor, 1) > businessClose) {
        currentStatus = 'closed';
        currentLabel = 'No 1-hour slot left today';
        nextAt = null;
      } else {
        nextAt = cursor;
        if (cursor.getTime() !== (nowIST > businessOpen ? nowIST : businessOpen).getTime()) {
          currentStatus = currentStatus === 'available' ? 'buffer' : currentStatus;
        }
      }
    }

    if (nextAt && nextAt.getTime() < nextAvailableMs.value) {
      nextAvailableMs.value = nextAt.getTime();
      nextAvailable = nextAt;
      nextAvailableStation = station.number;
    }

    return {
      station_id: station.id,
      station_number: station.number,
      station_status: station.status,
      working_controllers: station.working_controllers,
      now_status: currentStatus,
      now_label: currentLabel,
      next_available: nextAt ? nextAt.toISOString() : null,
      bookings: stationBookings,
      events: events.map((event) => ({
        id: event.id,
        label: event.label,
        kind: event.kind,
        start_time: event.start.toISOString(),
        end_time: event.end.toISOString(),
        available_at: ['booking', 'active', 'preview'].includes(event.kind)
          ? addMinutes(event.end, bufferTime).toISOString()
          : event.end.toISOString(),
        reference_id: event.reference_id || null,
        status: event.status || null,
        reason: event.reason || null,
      })),
    };
  });

  return {
    service,
    date: queryDate,
    buffer_time: bufferTime,
    business_hours: {
      open: `${String(openHour).padStart(2, '0')}:00`,
      close: `${String(closeHour).padStart(2, '0')}:00`,
      type,
    },
    next_available: nextAvailable ? formatTime(nextAvailable) : null,
    next_available_iso: nextAvailable ? nextAvailable.toISOString() : null,
    next_available_station: nextAvailableStation,
    timeline,
  };
}

function findBookingConflicts({ booking, proposedStart, proposedEnd, bufferTime }) {
  const proposedProtectedEnd = addMinutes(proposedEnd, bufferTime);

  const otherBookings = db.prepare(`
    SELECT b.*, s.number AS station_number
    FROM bookings b
    LEFT JOIN stations s ON s.id = b.station_id
    WHERE b.id != ?
      AND b.service = ?
      AND b.date = ?
      AND b.station_id = ?
      AND b.status IN ('confirmed', 'active', 'completed')
  `).all(booking.id, booking.service, booking.date, booking.station_id);

  return otherBookings
    .filter((other) => {
      const window = getBookingWindow(other);
      const otherProtectedEnd = addMinutes(window.end, bufferTime);
      return overlaps(proposedStart, proposedProtectedEnd, window.start, otherProtectedEnd);
    })
    .sort((a, b) => {
      const aStart = getBookingWindow(a).start.getTime();
      const bStart = getBookingWindow(b).start.getTime();
      return aStart - bStart;
    });
}

function getExtensionPreview({ booking, settings, durationHours = 1, durationMinutes = null }) {
  const bufferTime = parseInt(settings.buffer_time || '10', 10);
  const currentWindow = getBookingWindow(booking);
  const resolvedMinutes = Math.max(30, parseInt(durationMinutes || (durationHours * 60), 10));
  const proposedStart = currentWindow.end;
  const proposedEnd = addMinutes(currentWindow.end, resolvedMinutes);
  const { closeHour } = getBusinessHours(settings, booking.date);
  const businessClose = new Date(`${booking.date}T${String(closeHour).padStart(2, '0')}:00:00`);

  const blockedSlots = getBlockedSlotsForDate.all({ service: booking.service, date: booking.date }).filter((slot) => {
    const blockStart = parseDateTime(slot.date, slot.start_time);
    const blockEnd = parseDateTime(slot.date, slot.end_time);
    return overlaps(proposedStart, proposedEnd, blockStart, blockEnd);
  });

  const conflicts = findBookingConflicts({
    booking,
    proposedStart,
    proposedEnd,
    bufferTime,
  });

  let status = 'ok';
  let message = 'No conflict detected for this extension.';

  if (proposedEnd > businessClose) {
    status = 'outside_business_hours';
    message = `Extension runs past closing time at ${formatTime(businessClose)}.`;
  } else if (blockedSlots.length > 0) {
    status = 'blocked';
    message = `A blocked slot starts at ${formatTime(parseDateTime(blockedSlots[0].date, blockedSlots[0].start_time))}.`;
  } else if (conflicts.length > 0) {
    const nextConflict = conflicts[0];
    const nextConflictWindow = getBookingWindow(nextConflict);
    status = 'conflict';
    message = `The next slot is booked by ${nextConflict.name} at ${formatTime(nextConflictWindow.start)}.`;
  }

  const previewTimeline = buildTimeline(booking.service, booking.date, settings, {
    previewExtension: {
      station_id: booking.station_id,
      start_time: proposedStart.toISOString(),
      end_time: proposedEnd.toISOString(),
      reference_id: booking.reference_id,
      label: `${booking.name} extension`,
      reason: message,
    },
  });

  return {
    booking,
    duration_minutes: resolvedMinutes,
    duration_hours: resolvedMinutes / 60,
    current_start_time: currentWindow.start.toISOString(),
    current_end_time: currentWindow.end.toISOString(),
    proposed_start_time: proposedStart.toISOString(),
    proposed_end_time: proposedEnd.toISOString(),
    buffer_time: bufferTime,
    status,
    can_extend: status === 'ok',
    message,
    conflicts: conflicts.map((conflict) => {
      const window = getBookingWindow(conflict);
      return {
        id: conflict.id,
        reference_id: conflict.reference_id,
        name: conflict.name,
        station_number: conflict.station_number,
        start_time: window.start.toISOString(),
        end_time: window.end.toISOString(),
      };
    }),
    blocked_slots: blockedSlots.map((slot) => ({
      id: slot.id,
      reason: slot.reason || null,
      start_time: parseDateTime(slot.date, slot.start_time).toISOString(),
      end_time: parseDateTime(slot.date, slot.end_time).toISOString(),
    })),
    timeline_preview: previewTimeline,
  };
}

module.exports = {
  parseDateTime,
  addMinutes,
  addHours,
  formatTime,
  formatDate,
  overlaps,
  getBookingWindow,
  getBusinessHours,
  buildTimeline,
  findBookingConflicts,
  getExtensionPreview,
};
