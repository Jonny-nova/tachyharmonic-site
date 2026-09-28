"use strict";

// One SQLite Durable Object owns all weeks. Callbacks are synchronous: never do
// network IO inside a transaction or let a SQL cursor survive an await.
const emptyState = () => ({ bookings: [], private: {}, idempotency: {}, events: {}, jobs: {}, limits: {} });
class SqliteStore {
  constructor(storage) {
    this.storage = storage;
    storage.sql.exec("CREATE TABLE IF NOT EXISTS booking_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)");
    storage.sql.exec("CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, booking_id TEXT, action TEXT NOT NULL)");
    storage.sql.exec("INSERT OR IGNORE INTO booking_state(id,value) VALUES(1,?)", JSON.stringify(emptyState()));
  }
  read() { return JSON.parse(this.storage.sql.exec("SELECT value FROM booking_state WHERE id=1").toArray()[0].value); }
  mutate(callback) {
    return this.storage.transactionSync(() => {
      const state = this.read();
      const result = callback(state);
      if (result && typeof result.then === "function") throw new TypeError("Store transaction must be synchronous");
      this.storage.sql.exec("UPDATE booking_state SET value=? WHERE id=1", JSON.stringify(state));
      return result;
    });
  }
  transact(callback) {
    return this.mutate((state) => {
      const output = callback(state.bookings);
      state.bookings = output.bookings;
      return output.result;
    });
  }
  audit(id, action, now) {
    if (!/^[a-z0-9_]+$/.test(action)) throw new TypeError("Safe audit action required");
    this.storage.sql.exec("INSERT INTO audit(at,booking_id,action) VALUES(?,?,?)", now, id || null, action);
  }
}
module.exports = { SqliteStore, emptyState };
