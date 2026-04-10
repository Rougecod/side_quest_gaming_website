const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'quest.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ======================== TABLES ========================
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_id TEXT UNIQUE NOT NULL,
    service TEXT NOT NULL CHECK(service IN ('ps5', 'pool')),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration_hours INTEGER NOT NULL CHECK(duration_hours IN (1, 2, 3, 5)),
    total_price INTEGER NOT NULL,
    num_people INTEGER NOT NULL DEFAULT 1,
    total_amount INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref TEXT,
    phone TEXT,
    overall INTEGER NOT NULL CHECK(overall BETWEEN 1 AND 5),
    quality INTEGER NOT NULL CHECK(quality BETWEEN 1 AND 5),
    staff INTEGER NOT NULL CHECK(staff BETWEEN 1 AND 5),
    value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes'))
  );

  CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('ps5', 'pool')),
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'maintenance')),
    maintenance_note TEXT,
    UNIQUE(type, number)
  );

  CREATE TABLE IF NOT EXISTS blocked_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL CHECK(service IN ('ps5', 'pool', 'all')),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    usn TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    wallet_balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
    source_method TEXT NOT NULL,
    reference_booking_id TEXT,
    external_reference TEXT,
    note TEXT,
    balance_after INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS booking_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER,
    reference_id TEXT,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_usn ON users(usn);
  CREATE INDEX IF NOT EXISTS idx_booking_audit_booking_id ON booking_audit_log(booking_id, created_at DESC);
`);

// ======================== MIGRATIONS ========================
const cols = db.prepare("PRAGMA table_info(bookings)").all().map(c => c.name);
if (!cols.includes('session_start_time')) db.exec(`ALTER TABLE bookings ADD COLUMN session_start_time TEXT`);
if (!cols.includes('session_end_time')) db.exec(`ALTER TABLE bookings ADD COLUMN session_end_time TEXT`);
if (!cols.includes('notified_owner')) db.exec(`ALTER TABLE bookings ADD COLUMN notified_owner INTEGER DEFAULT 0`);
if (!cols.includes('payment_method')) db.exec(`ALTER TABLE bookings ADD COLUMN payment_method TEXT DEFAULT 'cash'`);
if (!cols.includes('payment_status')) db.exec(`ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'pending'`);
if (!cols.includes('cashfree_order_id')) db.exec(`ALTER TABLE bookings ADD COLUMN cashfree_order_id TEXT`);
if (!cols.includes('cashfree_payment_id')) db.exec(`ALTER TABLE bookings ADD COLUMN cashfree_payment_id TEXT`);
if (!cols.includes('players')) db.exec(`ALTER TABLE bookings ADD COLUMN players INTEGER DEFAULT 1`);
if (!cols.includes('usn')) db.exec(`ALTER TABLE bookings ADD COLUMN usn TEXT`);
if (!cols.includes('pool_group_tier')) db.exec(`ALTER TABLE bookings ADD COLUMN pool_group_tier TEXT`);
if (!cols.includes('station_id')) db.exec(`ALTER TABLE bookings ADD COLUMN station_id INTEGER`);
if (!cols.includes('extension_amount')) db.exec(`ALTER TABLE bookings ADD COLUMN extension_amount INTEGER DEFAULT 0`);
if (!cols.includes('extension_minutes')) db.exec(`ALTER TABLE bookings ADD COLUMN extension_minutes INTEGER DEFAULT 0`);
if (!cols.includes('extension_payment_method')) db.exec(`ALTER TABLE bookings ADD COLUMN extension_payment_method TEXT`);
if (!cols.includes('extension_payment_status')) db.exec(`ALTER TABLE bookings ADD COLUMN extension_payment_status TEXT DEFAULT 'none'`);
if (!cols.includes('num_people')) db.exec(`ALTER TABLE bookings ADD COLUMN num_people INTEGER DEFAULT 1`);
if (!cols.includes('total_amount')) db.exec(`ALTER TABLE bookings ADD COLUMN total_amount INTEGER DEFAULT 0`);

// Fix status CHECK constraint — original only allows 'confirmed','cancelled', need 'active','completed' too
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'bookings'").get();
if (schema && schema.sql && schema.sql.includes("('confirmed', 'cancelled')") && !schema.sql.includes("'active'")) {
  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN TRANSACTION;
    ALTER TABLE bookings RENAME TO _bookings_old;
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_id TEXT UNIQUE NOT NULL,
      service TEXT NOT NULL CHECK(service IN ('ps5', 'pool')),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_hours INTEGER NOT NULL CHECK(duration_hours IN (1, 2, 3, 5)),
      total_price INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'active', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+5 hours', '+30 minutes')),
      session_start_time TEXT,
      session_end_time TEXT,
      notified_owner INTEGER DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      players INTEGER DEFAULT 1
    );
    INSERT INTO bookings (id, reference_id, service, date, time, duration_hours, total_price, name, phone, email, notes, status, created_at, session_start_time, session_end_time, notified_owner, payment_method) SELECT id, reference_id, service, date, time, duration_hours, total_price, name, phone, email, notes, status, created_at, session_start_time, session_end_time, notified_owner, payment_method FROM _bookings_old;
    DROP TABLE _bookings_old;
    COMMIT;
    PRAGMA foreign_keys=on;
  `);
  console.log('✅ Migration: Fixed bookings status CHECK constraint');
}

const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name);
if (!contactCols.includes('is_read')) db.exec(`ALTER TABLE contacts ADD COLUMN is_read INTEGER DEFAULT 0`);

const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('wallet_balance')) db.exec(`ALTER TABLE users ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 0`);

// Migration: add working_controllers to stations
const stationCols = db.prepare("PRAGMA table_info(stations)").all().map(c => c.name);
if (!stationCols.includes('working_controllers')) {
  db.exec(`ALTER TABLE stations ADD COLUMN working_controllers INTEGER DEFAULT 4`);
  // Set pool tables to 0 controllers (not applicable)
  db.exec(`UPDATE stations SET working_controllers = 0 WHERE type = 'pool'`);
  console.log('✅ Migration: Added working_controllers to stations');
}

// ======================== SEED DEFAULTS ========================
// Seed stations if empty
const stationCount = db.prepare("SELECT COUNT(*) as c FROM stations").get().c;
if (stationCount === 0) {
  const ins = db.prepare("INSERT INTO stations (type, number) VALUES (?, ?)");
  const seed = db.transaction(() => {
    for (let i = 1; i <= 8; i++) ins.run('ps5', i);
    for (let i = 1; i <= 4; i++) ins.run('pool', i);
  });
  seed();
}

// Seed settings if empty
const settingsCount = db.prepare("SELECT COUNT(*) as c FROM settings").get().c;
if (settingsCount === 0) {
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  const seed = db.transaction(() => {
    ins.run('ps5_rate', '150');
    ins.run('pool_rate', '200');
    ins.run('ps5_capacity', '8');
    ins.run('pool_capacity', '4');
    ins.run('weekday_open', '10');
    ins.run('weekday_close', '23');
    ins.run('weekend_open', '9');
    ins.run('weekend_close', '24');
    ins.run('whatsapp_number', '+91 98765 43210');
    ins.run('admin_email', 'admin@sidequestgaming.in');
    ins.run('upi_id', 'sidequestgaming@upi');
    ins.run('ps5_rate_morning', '100');
    ins.run('ps5_rate_afternoon', '150');
    ins.run('pool_rate_morning', '150');
    ins.run('pool_rate_afternoon', '200');
  });
  seed();
}

// Migration: add time-based rate settings if missing
const settingKeys = db.prepare("SELECT key FROM settings").all().map(r => r.key);
if (!settingKeys.includes('ps5_rate_morning')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('ps5_rate_morning','100');
if (!settingKeys.includes('ps5_rate_afternoon')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('ps5_rate_afternoon','150');
if (!settingKeys.includes('pool_rate_morning')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('pool_rate_morning','150');
if (!settingKeys.includes('pool_rate_afternoon')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('pool_rate_afternoon','200');

// Migration: add buffer_time and pool tier pricing settings
if (!settingKeys.includes('buffer_time')) {
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('buffer_time','10');
} else if (getSetting('buffer_time') === '5') {
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run('10', 'buffer_time');
  console.log('✅ Migration: Updated buffer_time default from 5 to 10');
}
if (!settingKeys.includes('pool_rate_2plus')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('pool_rate_2plus','200');
if (!settingKeys.includes('pool_rate_4plus')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('pool_rate_4plus','350');
if (!settingKeys.includes('pool_rate_8plus')) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run('pool_rate_8plus','600');

// Backfill station assignment for older bookings so the live timeline can place them on a resource.
const unassignedBookings = db.prepare(`
  SELECT *
  FROM bookings
  WHERE station_id IS NULL AND status IN ('confirmed', 'active', 'completed')
  ORDER BY date ASC, time ASC, created_at ASC, id ASC
`).all();

if (unassignedBookings.length > 0) {
  const stationsByType = {
    ps5: db.prepare("SELECT * FROM stations WHERE type = 'ps5' ORDER BY number ASC").all(),
    pool: db.prepare("SELECT * FROM stations WHERE type = 'pool' ORDER BY number ASC").all(),
  };
  const assigned = [];
  const bufferMinutes = parseInt(getSetting('buffer_time') || '10', 10);
  const updateStationId = db.prepare(`UPDATE bookings SET station_id = ? WHERE id = ?`);

  const backfill = db.transaction(() => {
    for (const booking of unassignedBookings) {
      const start = booking.session_start_time
        ? new Date(booking.session_start_time)
        : new Date(`${booking.date}T${booking.time}:00`);
      const end = booking.session_end_time
        ? new Date(booking.session_end_time)
        : new Date(start.getTime() + (booking.duration_hours || 1) * 3600000);
      const protectedEnd = new Date(end.getTime() + bufferMinutes * 60000);
      const candidates = stationsByType[booking.service] || [];

      const chosen = candidates.find((station) => {
        return !assigned.some((item) => (
          item.station_id === station.id
          && item.date === booking.date
          && start < item.protectedEnd
          && protectedEnd > item.start
        ));
      });

      if (chosen) {
        updateStationId.run(chosen.id, booking.id);
        assigned.push({
          station_id: chosen.id,
          date: booking.date,
          start,
          protectedEnd,
        });
      }
    }
  });

  backfill();
}

// ======================== HELPERS ========================
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  return db.prepare("SELECT key, value FROM settings").all()
    .reduce((obj, r) => { obj[r.key] = r.value; return obj; }, {});
}

function normalizePoolTierPeople(tier) {
  if (tier === '8plus') return 8;
  if (tier === '4plus') return 4;
  if (tier === '2plus') return 2;
  return 1;
}

function getBookingNumPeople(booking) {
  return parseInt(
    booking.num_people
    || booking.players
    || (booking.service === 'pool' ? normalizePoolTierPeople(booking.pool_group_tier) : 1),
    10,
  ) || 1;
}

function getBaseAmount(booking) {
  const numPeople = getBookingNumPeople(booking);
  const durationHours = Number(booking.duration_hours || 1);
  const ratePerPerson = Number(booking.total_price || 0);
  return Math.max(0, Math.round(ratePerPerson * numPeople * durationHours));
}

function getBookingTotalAmount(booking) {
  const stored = Number(booking.total_amount || 0);
  if (stored > 0) return stored;
  return getBaseAmount(booking) + Number(booking.extension_amount || 0);
}

db.prepare(`
  UPDATE bookings
  SET num_people = CASE
    WHEN COALESCE(players, 0) > 1 THEN players
    WHEN COALESCE(num_people, 0) > 0 THEN num_people
    WHEN service = 'pool' AND pool_group_tier = '8plus' THEN 8
    WHEN service = 'pool' AND pool_group_tier = '4plus' THEN 4
    WHEN service = 'pool' AND pool_group_tier = '2plus' THEN 2
    ELSE 1
  END
  WHERE COALESCE(num_people, 0) <= 1 OR COALESCE(players, 0) > COALESCE(num_people, 0)
`).run();

db.prepare(`
  UPDATE bookings
  SET total_amount = (COALESCE(total_price, 0) * COALESCE(NULLIF(num_people, 0), 1) * COALESCE(duration_hours, 1)) + COALESCE(extension_amount, 0)
  WHERE COALESCE(total_amount, 0) <= 0
     OR COALESCE(total_amount, 0) < ((COALESCE(total_price, 0) * COALESCE(NULLIF(num_people, 0), 1) * COALESCE(duration_hours, 1)) + COALESCE(extension_amount, 0))
`).run();

// ======================== BOOKINGS ========================
const insertBooking = db.prepare(`
  INSERT INTO bookings (
    reference_id, service, date, time, duration_hours, total_price, num_people, total_amount,
    name, phone, email, notes, payment_method, payment_status, players, usn, pool_group_tier,
    station_id, session_start_time, session_end_time
  )
  VALUES (
    @reference_id, @service, @date, @time, @duration_hours, @total_price, @num_people, @total_amount,
    @name, @phone, @email, @notes, @payment_method, @payment_status, @players, @usn, @pool_group_tier,
    @station_id, @session_start_time, @session_end_time
  )
`);

const countBookingsForSlot = db.prepare(`
  SELECT COUNT(*) as count FROM bookings
  WHERE service = @service AND date = @date AND time = @time AND status IN ('confirmed', 'active')
`);

const getAllBookings = db.prepare(`
  SELECT b.*, s.number AS station_number
  FROM bookings b
  LEFT JOIN stations s ON s.id = b.station_id
  ORDER BY b.date DESC, b.time DESC
`);

const getBookingsFiltered = (filters) => {
  let query = `
    SELECT b.*, s.number AS station_number
    FROM bookings b
    LEFT JOIN stations s ON s.id = b.station_id
    WHERE 1=1
  `;
  const params = {};
  if (filters.date) { query += ' AND b.date = @date'; params.date = filters.date; }
  if (filters.service) { query += ' AND b.service = @service'; params.service = filters.service; }
  if (filters.status) { query += ' AND b.status = @status'; params.status = filters.status; }
  query += ' ORDER BY b.date DESC, b.time DESC';
  return db.prepare(query).all(params);
};

const getBookingById = db.prepare(`
  SELECT b.*, s.number AS station_number
  FROM bookings b
  LEFT JOIN stations s ON s.id = b.station_id
  WHERE b.id = ?
`);
const getBookingByRef = db.prepare(`
  SELECT b.*, s.number AS station_number
  FROM bookings b
  LEFT JOIN stations s ON s.id = b.station_id
  WHERE b.reference_id = ?
`);

const getBookingsByDate = db.prepare(`
  SELECT b.*, s.number AS station_number
  FROM bookings b
  LEFT JOIN stations s ON s.id = b.station_id
  WHERE b.date = @date AND b.status IN ('confirmed', 'active', 'completed')
  ORDER BY b.time ASC
`);

const getDashboardStats = (date) => {
  const stats = db.prepare(`
    SELECT COUNT(*) as total_bookings,
      SUM(CASE WHEN service = 'ps5' THEN 1 ELSE 0 END) as ps5_count,
      SUM(CASE WHEN service = 'pool' THEN 1 ELSE 0 END) as pool_count,
      SUM(total_amount) as total_revenue
    FROM bookings WHERE date = ? AND status IN ('confirmed', 'active', 'completed')
  `).get(date);
  return { total_bookings: stats.total_bookings||0, ps5_count: stats.ps5_count||0, pool_count: stats.pool_count||0, total_revenue: stats.total_revenue||0 };
};

const startSession = db.prepare(`
  UPDATE bookings
  SET status = 'active', session_start_time = @start_time, session_end_time = @end_time
  WHERE id = @id
`);
const completeSession = db.prepare(`UPDATE bookings SET status = 'completed', session_end_time = @end_time WHERE id = @id`);
const updateExtensionPayment = db.prepare(`
  UPDATE bookings
  SET
    extension_amount = COALESCE(extension_amount, 0) + @extension_amount,
    extension_minutes = COALESCE(extension_minutes, 0) + @extension_minutes,
    extension_payment_method = @extension_payment_method,
    extension_payment_status = @extension_payment_status,
    total_amount = COALESCE(total_amount, 0) + @extension_amount
  WHERE id = @id
`);
const cancelBooking = db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`);
const getExpiredSessions = db.prepare(`SELECT * FROM bookings WHERE status = 'active' AND notified_owner = 0 AND session_end_time IS NOT NULL AND session_end_time <= @now`);
const markNotified = db.prepare(`UPDATE bookings SET notified_owner = 1, status = 'completed' WHERE id = ?`);
const updateBookingTimes = db.prepare(`UPDATE bookings SET session_start_time = @start_time, session_end_time = @end_time WHERE id = @id`);
const insertBookingAuditLog = db.prepare(`
  INSERT INTO booking_audit_log (booking_id, reference_id, action, actor, details_json)
  VALUES (@booking_id, @reference_id, @action, @actor, @details_json)
`);
const getBookingAuditTrail = db.prepare(`
  SELECT *
  FROM booking_audit_log
  WHERE (@booking_id IS NULL OR booking_id = @booking_id)
    AND (@reference_id IS NULL OR reference_id = @reference_id)
  ORDER BY created_at DESC, id DESC
  LIMIT @limit
`);

// Booking count by phone
const getBookingCountByPhone = db.prepare(`SELECT COUNT(*) as count FROM bookings WHERE phone = ? AND status IN ('confirmed', 'active', 'completed')`);

// Revenue queries
const getRevenueByDateRange = (startDate, endDate) => {
  return db.prepare(`
    SELECT date, service,
      COUNT(*) as bookings,
      SUM(total_amount) as revenue,
      SUM(CASE WHEN payment_method = 'wallet' THEN total_amount ELSE 0 END) as wallet_revenue,
      SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card_revenue,
      SUM(CASE WHEN payment_method = 'upi' THEN total_amount ELSE 0 END) as upi_revenue,
      SUM(CASE WHEN payment_method NOT IN ('wallet', 'card', 'upi') THEN total_amount ELSE 0 END) as other_revenue
    FROM bookings
    WHERE date >= ? AND date <= ? AND status IN ('confirmed', 'active', 'completed')
    GROUP BY date, service ORDER BY date ASC
  `).all(startDate, endDate);
};

const getPeakHours = (date) => {
  return db.prepare(`
    SELECT time, COUNT(*) as count FROM bookings
    WHERE date = ? AND status IN ('confirmed', 'active', 'completed')
    GROUP BY time ORDER BY count DESC LIMIT 5
  `).all(date);
};

// ======================== USERS ========================
const insertUser = db.prepare(`
  INSERT INTO users (name, usn, phone, email, wallet_balance)
  VALUES (@name, @usn, @phone, @email, @wallet_balance)
`);
const getUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);
const getUserByUsn = db.prepare(`SELECT * FROM users WHERE usn = ?`);
const checkUsnAvailable = db.prepare(`SELECT COUNT(*) as count FROM users WHERE usn = ?`);
const updateUserLastLogin = db.prepare(`UPDATE users SET last_login = datetime('now', '+5 hours', '+30 minutes') WHERE id = ?`);
const updateUserWalletBalance = db.prepare(`UPDATE users SET wallet_balance = ? WHERE id = ?`);
const insertWalletTransaction = db.prepare(`
  INSERT INTO wallet_transactions (
    user_id, amount, type, source_method, reference_booking_id, external_reference, note, balance_after
  )
  VALUES (
    @user_id, @amount, @type, @source_method, @reference_booking_id, @external_reference, @note, @balance_after
  )
`);
const getWalletTransactionsByUser = db.prepare(`
  SELECT wt.*, u.name, u.usn
  FROM wallet_transactions wt
  JOIN users u ON u.id = wt.user_id
  WHERE wt.user_id = ?
  ORDER BY wt.created_at DESC, wt.id DESC
`);
const getAllWalletTransactions = db.prepare(`
  SELECT wt.*, u.name, u.usn
  FROM wallet_transactions wt
  JOIN users u ON u.id = wt.user_id
  ORDER BY wt.created_at DESC, wt.id DESC
`);

// ======================== CUSTOMERS ========================
const getCustomers = () => {
  return db.prepare(`
    SELECT phone, name, email,
      COUNT(*) as total_bookings,
      SUM(total_amount) as total_spent,
      MAX(date) as last_visit,
      MIN(date) as first_visit
    FROM bookings
    WHERE status IN ('confirmed', 'active', 'completed')
    GROUP BY phone ORDER BY total_bookings DESC
  `).all();
};

const getCustomerHistory = (phone) => {
  return db.prepare(`SELECT * FROM bookings WHERE phone = ? ORDER BY date DESC, time DESC`).all(phone);
};

// ======================== CONTACTS ========================
const insertContact = db.prepare(`INSERT INTO contacts (name, email, subject, message) VALUES (@name, @email, @subject, @message)`);
const getAllContacts = db.prepare(`SELECT * FROM contacts ORDER BY created_at DESC`);
const markContactRead = db.prepare(`UPDATE contacts SET is_read = 1 WHERE id = ?`);
const getUnreadCount = db.prepare(`SELECT COUNT(*) as count FROM contacts WHERE is_read = 0`);

// ======================== FEEDBACK ========================
const insertFeedback = db.prepare(`INSERT INTO feedback (booking_ref, phone, overall, quality, staff, value, comment) VALUES (@booking_ref, @phone, @overall, @quality, @staff, @value, @comment)`);
const getAllFeedback = db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC`);

// ======================== STATIONS ========================
const getAllStations = db.prepare(`SELECT * FROM stations ORDER BY type, number`);
const updateStationStatus = db.prepare(`UPDATE stations SET status = @status, maintenance_note = @note WHERE id = @id`);
const updateStationControllers = db.prepare(`UPDATE stations SET working_controllers = @controllers WHERE id = @id`);
const getMaintenanceCount = (type) => {
  return db.prepare(`SELECT COUNT(*) as count FROM stations WHERE type = ? AND status = 'maintenance'`).get(type).count;
};
const getAvailableStationsWithControllers = (type, minControllers) => {
  return db.prepare(`SELECT * FROM stations WHERE type = ? AND status = 'available' AND working_controllers >= ? ORDER BY number`).all(type, minControllers);
};

// ======================== BLOCKED SLOTS ========================
const insertBlockedSlot = db.prepare(`INSERT INTO blocked_slots (service, date, start_time, end_time, reason) VALUES (@service, @date, @start_time, @end_time, @reason)`);
const getAllBlockedSlots = db.prepare(`SELECT * FROM blocked_slots ORDER BY date DESC`);
const deleteBlockedSlot = db.prepare(`DELETE FROM blocked_slots WHERE id = ?`);
const getBlockedSlotsForDate = db.prepare(`SELECT * FROM blocked_slots WHERE (service = @service OR service = 'all') AND date = @date`);

// ======================== SETTINGS ========================
const updateSetting = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);

function logBookingAudit({ booking_id = null, reference_id = null, action, actor = 'system', details = null }) {
  insertBookingAuditLog.run({
    booking_id,
    reference_id,
    action,
    actor,
    details_json: details ? JSON.stringify(details) : null,
  });
}

function creditWallet({ user_id, amount, source_method, reference_booking_id = null, external_reference = null, note = null }) {
  const applyCredit = db.transaction((payload) => {
    const user = getUserById.get(payload.user_id);
    if (!user) throw new Error('User not found.');
    const safeAmount = Math.max(0, parseInt(payload.amount, 10) || 0);
    if (safeAmount <= 0) throw new Error('Wallet credit amount must be greater than zero.');

    const balanceAfter = Number(user.wallet_balance || 0) + safeAmount;
    updateUserWalletBalance.run(balanceAfter, user.id);
    insertWalletTransaction.run({
      user_id: user.id,
      amount: safeAmount,
      type: 'credit',
      source_method: payload.source_method,
      reference_booking_id: payload.reference_booking_id,
      external_reference: payload.external_reference,
      note: payload.note,
      balance_after: balanceAfter,
    });

    return {
      user: getUserById.get(user.id),
      balance_after: balanceAfter,
      amount: safeAmount,
    };
  });

  return applyCredit({ user_id, amount, source_method, reference_booking_id, external_reference, note });
}

function debitWalletIfSufficient({ user_id, amount, source_method = 'wallet', reference_booking_id = null, external_reference = null, note = null }) {
  const applyDebit = db.transaction((payload) => {
    const user = getUserById.get(payload.user_id);
    if (!user) throw new Error('User not found.');
    const safeAmount = Math.max(0, parseInt(payload.amount, 10) || 0);
    if (safeAmount <= 0) throw new Error('Wallet debit amount must be greater than zero.');

    const currentBalance = Number(user.wallet_balance || 0);
    if (currentBalance < safeAmount) {
      return {
        success: false,
        current_balance: currentBalance,
        shortfall: safeAmount - currentBalance,
      };
    }

    const balanceAfter = currentBalance - safeAmount;
    updateUserWalletBalance.run(balanceAfter, user.id);
    insertWalletTransaction.run({
      user_id: user.id,
      amount: safeAmount,
      type: 'debit',
      source_method: payload.source_method,
      reference_booking_id: payload.reference_booking_id,
      external_reference: payload.external_reference,
      note: payload.note,
      balance_after: balanceAfter,
    });

    return {
      success: true,
      user: getUserById.get(user.id),
      balance_after: balanceAfter,
      amount: safeAmount,
    };
  });

  return applyDebit({ user_id, amount, source_method, reference_booking_id, external_reference, note });
}

// Payment summary for admin dashboard (Task 6)
function getPaymentSummary(date) {
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_status = 'paid' THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as total_collected,
      COALESCE(SUM(CASE WHEN payment_status IN ('pending', 'pending_cash', 'pending_verification') THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_status IN ('pending', 'pending_cash', 'pending_verification') THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as total_pending,
      COUNT(CASE WHEN payment_status IN ('pending', 'pending_cash', 'pending_verification') THEN 1 END)
        + COUNT(CASE WHEN extension_payment_status IN ('pending', 'pending_cash', 'pending_verification') AND COALESCE(extension_amount, 0) > 0 THEN 1 END) as pending_count,
      COALESCE(SUM(CASE WHEN payment_method = 'wallet' AND payment_status = 'paid' THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_method = 'wallet' AND extension_payment_status = 'paid' THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as wallet_collected,
      COALESCE(SUM(CASE WHEN payment_method = 'card' AND payment_status = 'paid' THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_method = 'card' AND extension_payment_status = 'paid' THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as card_collected,
      COALESCE(SUM(CASE WHEN payment_method = 'upi' AND payment_status = 'paid' THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_method = 'upi' AND extension_payment_status = 'paid' THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as upi_collected,
      COALESCE(SUM(CASE WHEN payment_method NOT IN ('wallet', 'card', 'upi') AND payment_status = 'paid' THEN (COALESCE(total_amount, 0) - COALESCE(extension_amount, 0)) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN extension_payment_method NOT IN ('wallet', 'card', 'upi') AND extension_payment_status = 'paid' THEN COALESCE(extension_amount, 0) ELSE 0 END), 0) as other_collected
    FROM bookings
    WHERE date = ? AND status IN ('confirmed', 'active', 'completed')
  `).get(date);
  return summary;
}

module.exports = {
  db, getSetting, getAllSettings,
  insertBooking, countBookingsForSlot, getAllBookings, getBookingsFiltered,
  getBookingById, getBookingByRef, getBookingsByDate,
  getDashboardStats, startSession, completeSession, cancelBooking,
  getExpiredSessions, markNotified, getBookingCountByPhone,
  getRevenueByDateRange, getPeakHours,
  getCustomers, getCustomerHistory,
  insertContact, getAllContacts, markContactRead, getUnreadCount,
  insertFeedback, getAllFeedback,
  getAllStations, updateStationStatus, updateStationControllers, getMaintenanceCount,
  getAvailableStationsWithControllers,
  insertBlockedSlot, getAllBlockedSlots, deleteBlockedSlot, getBlockedSlotsForDate,
  updateSetting, updateBookingTimes, updateExtensionPayment,
  insertUser, getUserById, getUserByUsn, checkUsnAvailable, updateUserLastLogin,
  creditWallet, debitWalletIfSufficient, getWalletTransactionsByUser, getAllWalletTransactions,
  insertBookingAuditLog, getBookingAuditTrail, logBookingAudit,
  getPaymentSummary, getBookingNumPeople, getBookingTotalAmount, getBaseAmount,
};
