/**
 * Database Cleanup Script — Task 0
 * Wipes booking and audit data, preserves schema, users, settings, stations.
 * Run: node server/cleanup_bookings.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'quest.db');
const db = new Database(dbPath);

console.log('🧹 Starting database cleanup...');

const tables = ['bookings', 'booking_audit_log'];

db.transaction(() => {
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  ✅ Deleted ${count} rows from "${table}"`);
  }
  // Reset autoincrement counters
  db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('bookings', 'booking_audit_log')`).run();
  console.log('  ✅ Reset autoincrement counters');
})();

// Verify preserved tables
const preserved = ['users', 'settings', 'stations', 'contacts', 'feedback', 'blocked_slots'];
for (const t of preserved) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  console.log(`  📦 "${t}" preserved: ${count} rows`);
}

console.log('\n✅ Cleanup complete. Schema, users, settings, and stations are intact.');
db.close();
