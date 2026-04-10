const cron = require('node-cron');
const { getExpiredSessions, markNotified, getBookingsFiltered, getDashboardStats } = require('./db');
const { sendSessionEndedEmail, sendDailySummaryEmail } = require('./email');

/**
 * Session completion checker — runs every minute
 * Finds active sessions past their end time and notifies the owner
 */
function startSessionChecker() {
  setInterval(() => {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const nowStr = istNow.toISOString().slice(0, 19).replace('T', ' ');

    const expired = getExpiredSessions.all({ now: nowStr });

    for (const booking of expired) {
      console.log(`⏰ Session ended: ${booking.reference_id} — ${booking.name}`);

      // Send notification email to owner
      sendSessionEndedEmail(booking);

      // Mark as notified + completed
      markNotified.run(booking.id);

      // Fire SSE event to admin dashboard
      if (global.notifyAdminClients) {
        global.notifyAdminClients('session_ended', { name: booking.name, reference_id: booking.reference_id });
      }
    }

    if (expired.length > 0) {
      console.log(`✅ Processed ${expired.length} expired session(s)`);
    }
  }, 60 * 1000); // Every 60 seconds

  console.log('🔄 Session checker started (runs every 60s)');
}

/**
 * Daily summary email — runs at 11:00 PM IST every day
 */
function startDailySummary() {
  // 11:00 PM IST = 5:30 PM UTC (IST is UTC+5:30)
  // cron uses server time, so we calculate for IST
  cron.schedule('30 17 * * *', () => {
    console.log('📊 Sending daily summary email...');

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const stats = getDashboardStats(today);
    const bookings = getBookingsFiltered({ date: today });

    sendDailySummaryEmail(today, stats, bookings);
  }, {
    timezone: 'UTC'
  });

  console.log('📊 Daily summary cron scheduled (11:00 PM IST daily)');
}

module.exports = { startSessionChecker, startDailySummary };
