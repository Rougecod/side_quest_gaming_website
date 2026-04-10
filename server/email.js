const nodemailer = require('nodemailer');
const { getSetting } = require('./db');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function formatPrice(amount) {
  return `₹${(amount || 0).toLocaleString('en-IN')}`;
}

function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  if (hour === 0) return `12:${m} AM`;
  if (hour === 12) return `12:${m} PM`;
  return hour > 12 ? `${hour - 12}:${m} PM` : `${hour}:${m} AM`;
}

function formatDateTimeIST(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Use env vars with fallbacks for contact info
function getContactEmail() { return process.env.CONTACT_EMAIL || 'hello@sidequestgaming.in'; }
function getContactPhone() { return process.env.CONTACT_PHONE || '+91 98765 43210'; }
function getVenueAddress() { return process.env.VENUE_ADDRESS || '123 Gaming Street, Tech Park, Bangalore'; }
function getAdminEmail() { return getSetting('admin_email') || process.env.ADMIN_EMAIL; }

const HEADER = `
  <div style="background: linear-gradient(135deg, #39FF14 0%, #00cc44 100%); padding: 30px; text-align: center;">
    <h1 style="margin: 0; color: #0a0a0a; font-size: 28px; letter-spacing: 4px;">SIDE QUEST</h1>
    <p style="margin: 8px 0 0; color: #0a0a0a; font-size: 14px;">GAMING CENTER</p>
  </div>`;

function getFooter() {
  return `
  <div style="background: #111; padding: 20px; text-align: center; color: #555; font-size: 12px;">
    <p>Side Quest Gaming Center — ${getVenueAddress()}</p>
  </div>`;
}

function wrap(body) {
  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; border-radius: 12px; overflow: hidden;">
    ${HEADER}<div style="padding: 30px;">${body}</div>${getFooter()}</div>`;
}

// ---- Booking Confirmation (customer) ----
async function sendBookingConfirmation(booking) {
  if (!booking.email) return;
  const serviceName = booking.service === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
  const totalAmount = booking.total_amount || booking.total_price || 0;
  const html = wrap(`
    <h2 style="color: #39FF14; margin-top: 0;">Booking Confirmed! ✅</h2>
    <p>Hi <strong>${booking.name}</strong>,</p>
    <p>Your booking has been confirmed:</p>
    <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #39FF14;">
      <table style="width: 100%; border-collapse: collapse; color: #fff;">
        <tr><td style="padding:8px 0;color:#888">Reference</td><td style="padding:8px 0;font-weight:bold;color:#39FF14">${booking.reference_id}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Service</td><td style="padding:8px 0">${serviceName}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Date</td><td style="padding:8px 0">${booking.date}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Time</td><td style="padding:8px 0">${formatTime(booking.time)}</td></tr>
        <tr><td style="padding:8px 0;color:#888">People</td><td style="padding:8px 0">${booking.num_people || booking.players || 1}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Duration</td><td style="padding:8px 0">${booking.duration_hours} Hour${booking.duration_hours > 1 ? 's' : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#888">Session Ends</td><td style="padding:8px 0">${formatDateTimeIST(booking.session_end_time)}</td></tr>
        <tr><td style="padding:8px 0;color:#888;border-top:1px solid #333">Total</td><td style="padding:8px 0;font-size:20px;font-weight:bold;color:#39FF14;border-top:1px solid #333">${formatPrice(totalAmount)}</td></tr>
      </table>
    </div>
    <p style="color:#888;font-size:13px;margin-top:30px">Contact us at ${getContactEmail()} or ${getContactPhone()}.</p>
  `);
  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: booking.email,
      subject: `Booking Confirmed — ${booking.reference_id}`,
      html,
    });
    console.log(`✉️  Confirmation email sent to ${booking.email}`);
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Admin booking notification ----
async function sendAdminBookingNotification(booking) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const serviceName = booking.service === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
  const totalAmount = booking.total_amount || booking.total_price || 0;
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#39FF14">🎮 New Booking Received</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#666">Reference</td><td style="padding:6px 0;font-weight:bold">${booking.reference_id}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0">${serviceName}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Date / Time</td><td style="padding:6px 0">${booking.date} at ${formatTime(booking.time)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">People</td><td style="padding:6px 0">${booking.num_people || booking.players || 1}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Duration</td><td style="padding:6px 0">${booking.duration_hours}h</td></tr>
      <tr><td style="padding:6px 0;color:#666">Total</td><td style="padding:6px 0;font-weight:bold">${formatPrice(totalAmount)}</td></tr>
      <tr><td colspan="2" style="padding:10px 0;border-top:1px solid #eee"></td></tr>
      <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0">${booking.name}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Phone</td><td style="padding:6px 0">${booking.phone}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${booking.email || 'N/A'}</td></tr>
    </table></div>`;
  try {
    await transporter.sendMail({
      from: `"Side Quest Booking System" <${process.env.SMTP_USER}>`,
      to: adminEmail, subject: `New Booking: ${booking.reference_id} — ${serviceName}`, html,
    });
    console.log(`✉️  Admin notification sent for ${booking.reference_id}`);
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Contact notification ----
async function sendContactNotification(contact) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2>📩 New Contact Message</h2>
    <p><strong>${contact.name}</strong> (${contact.email})</p>
    ${contact.subject ? `<p>Subject: ${contact.subject}</p>` : ''}
    <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin-top:12px">
      <p style="margin:0;white-space:pre-wrap;color:#333">${contact.message}</p>
    </div></div>`;
  try {
    await transporter.sendMail({
      from: `"Side Quest Contact Form" <${process.env.SMTP_USER}>`,
      to: adminEmail, subject: `Contact: ${contact.subject || 'New Message'} — ${contact.name}`, html,
    });
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Session ended notification (to owner) ----
async function sendSessionEndedEmail(booking) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const serviceName = booking.service === 'ps5' ? 'PS5 Station' : 'Pool Table';
  const whatsappNum = getSetting('whatsapp_number') || getContactPhone();
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2>⏰ Session Ended — ${booking.reference_id}</h2>
    <p>The following session has ended and the station is now free:</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0;font-weight:bold">${booking.name} — ${booking.phone}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0">${serviceName}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Session</td><td style="padding:6px 0">${formatTime(booking.time)} (${booking.duration_hours}h)</td></tr>
      <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;font-weight:bold">${formatPrice(booking.total_amount || booking.total_price)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Reference</td><td style="padding:6px 0">${booking.reference_id}</td></tr>
      <tr><td style="padding:6px 0;color:#666">WhatsApp</td><td style="padding:6px 0">${whatsappNum}</td></tr>
    </table>
    <p style="margin-top:16px">Please check if the customer has vacated the station.<br>The station is now available for the next booking.</p>
  </div>`;
  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `⏰ Session Ended — ${booking.name} | ${serviceName} | ${booking.reference_id}`,
      html,
    });
    console.log(`✉️  Session ended email sent for ${booking.reference_id}`);
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Payment verified notification (to customer) ----
async function sendPaymentVerifiedEmail(booking) {
  if (!booking.email) return;
  const totalAmount = booking.total_amount || booking.total_price || 0;
  const html = wrap(`
    <h2 style="color:#39FF14;margin-top:0">Payment Verified ✅</h2>
    <p>Hi <strong>${booking.name}</strong>, your payment for booking <strong>${booking.reference_id}</strong> has been verified.</p>
    <p>Amount: <strong>${formatPrice(totalAmount)}</strong></p>
    <p style="color:#888;font-size:13px;margin-top:20px">See you at Side Quest Gaming Center!</p>
  `);
  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: booking.email, subject: `Payment Verified — ${booking.reference_id}`, html,
    });
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Payment notification to admin (Issue #4a) ----
async function sendPaymentNotificationToAdmin(booking, paymentId, method) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const totalAmount = booking.total_amount || booking.total_price || 0;

  const methodLabels = {
    phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm', razorpay: 'Razorpay',
    upi: 'UPI', card: 'Card', netbanking: 'Net Banking',
    wallet: 'Wallet', online: 'Online'
  };

  const serviceName = booking.service === 'ps5' ? '🎮 PS5 Gaming' : '🎱 Pool Table';
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#39FF14,#00cc44);padding:16px 20px">
      <h1 style="margin:0;color:#0a0a0a;font-size:1.2rem;letter-spacing:3px">💳 PAYMENT RECEIVED — SIDE QUEST</h1>
    </div>
    <div style="padding:20px;background:#fff;color:#333">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666">Reference</td><td style="padding:6px 0;font-weight:bold;color:#00aa33">${booking.reference_id}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0;font-weight:bold">${booking.name} — ${booking.phone}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0">${serviceName}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Date & Time</td><td style="padding:6px 0">${booking.date} at ${formatTime(booking.time)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Duration</td><td style="padding:6px 0">${booking.duration_hours} Hour${booking.duration_hours > 1 ? 's' : ''}</td></tr>
        <tr style="border-top:2px solid #39FF14"><td style="padding:10px 0;font-weight:bold;font-size:16px">Amount Received</td><td style="padding:10px 0;font-weight:bold;font-size:18px;color:#00aa33">${formatPrice(totalAmount)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Payment Method</td><td style="padding:6px 0">${methodLabels[method] || method}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Transaction ID</td><td style="padding:6px 0;font-size:12px">${paymentId}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${booking.email || 'N/A'}</td></tr>
      </table>
    </div>
    <div style="background:#111;padding:12px;text-align:center;color:#555;font-size:11px">Side Quest Gaming Center</div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"Side Quest Payment System" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `💳 ₹${totalAmount} Received — ${booking.name} | ${booking.reference_id}`,
      html,
    });
    console.log(`💳 Payment notification sent for ${booking.reference_id}`);
  } catch (err) { console.error('Payment notification email error:', err.message); }
}

// ---- Session started notification to admin (Issue #4e) ----
async function sendSessionStartedEmail(booking, startTime, endTime) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const serviceName = booking.service === 'ps5' ? 'PS5 Station' : 'Pool Table';
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#39FF14">▶ Session Started — ${booking.reference_id}</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0;font-weight:bold">${booking.name}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0">${serviceName}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Duration</td><td style="padding:6px 0">${booking.duration_hours}h</td></tr>
      <tr><td style="padding:6px 0;color:#666">Started</td><td style="padding:6px 0">${startTime}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Expected End</td><td style="padding:6px 0;font-weight:bold;color:#ff4444">${endTime}</td></tr>
    </table></div>`;
  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `▶ Session Started — ${booking.name} | ${serviceName} | ${booking.reference_id}`,
      html,
    });
    console.log(`▶ Session started email sent for ${booking.reference_id}`);
  } catch (err) { console.error('Email error:', err.message); }
}

// ---- Daily summary email ----
async function sendDailySummaryEmail(date, stats, bookings) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;

  const ps5Bookings = bookings.filter(b => b.service === 'ps5');
  const poolBookings = bookings.filter(b => b.service === 'pool');
  const ps5Revenue = ps5Bookings.reduce((s, b) => s + (b.total_amount || b.total_price), 0);
  const poolRevenue = poolBookings.reduce((s, b) => s + (b.total_amount || b.total_price), 0);

  const rows = bookings.map(b => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${b.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${b.service === 'ps5' ? 'PS5' : 'Pool'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatTime(b.time)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${b.duration_hours}h</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatPrice(b.total_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${b.status}</td>
    </tr>
  `).join('');

  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#39FF14,#00cc44);padding:20px;text-align:center">
      <h1 style="margin:0;color:#0a0a0a;letter-spacing:4px">SIDE QUEST</h1>
      <p style="margin:4px 0 0;color:#0a0a0a;font-size:13px">DAILY SUMMARY — ${date}</p>
    </div>
    <div style="padding:24px;background:#fff;color:#333">
      <h2 style="margin-top:0">📊 Today's Summary</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0">Total Bookings</td><td style="padding:8px 0;font-weight:bold;text-align:right">${stats.total_bookings}</td></tr>
        <tr><td style="padding:8px 0">PS5 Sessions</td><td style="padding:8px 0;text-align:right">${ps5Bookings.length} bookings — ${formatPrice(ps5Revenue)}</td></tr>
        <tr><td style="padding:8px 0">Pool Sessions</td><td style="padding:8px 0;text-align:right">${poolBookings.length} bookings — ${formatPrice(poolRevenue)}</td></tr>
        <tr style="border-top:2px solid #39FF14"><td style="padding:12px 0;font-weight:bold;font-size:18px">Total Revenue</td><td style="padding:12px 0;font-weight:bold;font-size:18px;text-align:right;color:#00cc44">${formatPrice(stats.total_revenue)}</td></tr>
      </table>

      <h3>Booking Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Name</th><th style="padding:8px;text-align:left">Service</th><th style="padding:8px;text-align:left">Time</th><th style="padding:8px;text-align:left">Dur</th><th style="padding:8px;text-align:left">Amount</th><th style="padding:8px;text-align:left">Status</th></tr>
        ${rows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999">No bookings today</td></tr>'}
      </table>
    </div>
    <div style="background:#111;padding:16px;text-align:center;color:#555;font-size:11px">Side Quest Gaming Center — ${getVenueAddress()}</div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `📊 Side Quest Daily Summary — ${date}`,
      html,
    });
    console.log(`📊 Daily summary email sent for ${date}`);
  } catch (err) { console.error('Daily summary email error:', err.message); }
}

// ---- UPI verification notification to admin (Fix #4) ----
async function sendUpiVerificationNotification(booking, txnId) {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return;
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#ffbb33,#ff8800);padding:16px 20px">
      <h1 style="margin:0;color:#0a0a0a;font-size:1.1rem;letter-spacing:2px">
        📱 UPI PAYMENT — VERIFY REQUIRED
      </h1>
    </div>
    <div style="padding:20px;background:#fff;color:#333">
      <p style="font-size:14px;color:#555;margin-bottom:16px">
        A customer has completed a direct UPI payment and is requesting confirmation.
        Please check your UPI app and verify the payment, then mark the booking as paid
        from the admin dashboard.
      </p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666">Reference</td>
            <td style="padding:6px 0;font-weight:bold;color:#00aa33">${booking.reference_id}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Customer</td>
            <td style="padding:6px 0;font-weight:bold">${booking.name} — ${booking.phone}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Service</td>
            <td style="padding:6px 0">${booking.service === 'ps5' ? '🎮 PS5 Gaming' : '🎱 Pool Table'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Date & Time</td>
            <td style="padding:6px 0">${booking.date} at ${formatTime(booking.time)}</td></tr>
        <tr style="border-top:2px solid #ffbb33">
            <td style="padding:10px 0;font-weight:bold">Amount</td>
            <td style="padding:10px 0;font-weight:bold;font-size:18px;color:#ff8800">
              ${formatPrice(booking.total_amount || booking.total_price)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">UPI Txn ID given</td>
            <td style="padding:6px 0">${txnId || '⚠️ Not provided by customer'}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:13px;color:#888">
        Go to Admin Dashboard → find this booking → verify UPI payment received →
        mark as active/start session.
      </p>
    </div>
    <div style="background:#111;padding:12px;text-align:center;color:#555;font-size:11px">
      Side Quest Gaming Center
    </div>
  </div>`;

  try {
    await transporter.sendMail({
      from: `"Side Quest Payment" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `📱 Verify UPI Payment — ${booking.name} | ₹${booking.total_amount || booking.total_price} | ${booking.reference_id}`,
      html,
    });
  } catch (err) { console.error('UPI notification email error:', err.message); }
}

// ---- Time change notification to customer (Feature #5) ----
async function sendTimeChangeNotification(booking, oldTimes, newTimes) {
  if (!booking.email) return;
  const serviceName = booking.service === 'ps5' ? 'PS5 Gaming' : 'Pool Table';
  const html = wrap(`
    <h2 style="color:#3B82F6;margin-top:0">Booking Time Updated ⏰</h2>
    <p>Hi <strong>${booking.name}</strong>,</p>
    <p>Your session time for booking <strong>${booking.reference_id}</strong> has been updated by the admin:</p>
    <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #3B82F6;">
      <table style="width:100%;border-collapse:collapse;color:#fff;">
        <tr><td style="padding:8px 0;color:#888">Service</td><td style="padding:8px 0">${serviceName}</td></tr>
        <tr><td style="padding:8px 0;color:#888">New Check-in</td><td style="padding:8px 0;font-weight:bold;color:#3B82F6">${newTimes.newStart}</td></tr>
        <tr><td style="padding:8px 0;color:#888">New Check-out</td><td style="padding:8px 0;font-weight:bold;color:#3B82F6">${newTimes.newEnd}</td></tr>
      </table>
    </div>
    <p style="color:#888;font-size:13px;margin-top:20px">If you have questions, contact us at ${getContactEmail()} or ${getContactPhone()}.</p>
  `);
  try {
    await transporter.sendMail({
      from: `"Side Quest Gaming Center" <${process.env.SMTP_USER}>`,
      to: booking.email,
      subject: `Booking Time Updated — ${booking.reference_id}`,
      html,
    });
    console.log(`✉️  Time change notification sent to ${booking.email}`);
  } catch (err) { console.error('Email error:', err.message); }
}

module.exports = {
  sendBookingConfirmation,
  sendAdminBookingNotification,
  sendContactNotification,
  sendSessionEndedEmail,
  sendPaymentVerifiedEmail,
  sendPaymentNotificationToAdmin,
  sendSessionStartedEmail,
  sendDailySummaryEmail,
  sendUpiVerificationNotification,
  sendTimeChangeNotification,
};
