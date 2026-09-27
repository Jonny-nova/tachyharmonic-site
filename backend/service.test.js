"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { SqliteStore } = require("./store");
const { BookingService } = require("./service");
const { evaluateSlot, providerSlot } = require("../booking/availability");
const { weekCounts, londonWeekKey } = require("../booking/state");

function databaseStore() {
  const db = new DatabaseSync(":memory:");
  const storage = { sql: { exec(sql, ...bindings) { const stmt = db.prepare(sql); return { toArray: () => stmt.all(...bindings) }; } },
    transactionSync(fn) { db.exec("BEGIN IMMEDIATE"); try { const result = fn(); db.exec("COMMIT"); return result; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
  // Cloudflare exec executes immediately, including statements whose cursor is
  // ignored; this wrapper deliberately mirrors that SQLite behaviour.
  storage.sql.exec = (sql, ...bindings) => { const stmt = db.prepare(sql); const rows = stmt.all(...bindings); return { toArray: () => rows }; };
  return { store: new SqliteStore(storage), db, storage };
}
function fixture() {
  const database = databaseStore(); let now = "2026-09-28T08:00:00.000Z";
  const calls = { create: 0, refund: 0, cancel: 0, messages: [] };
  const adapters = {
    calendar: { getBusy: async () => ({ Primary: [], Work: [], Home: [] }) },
    scheduler: { isAvailable: async () => true, listAvailable: async () => [{ startsAt: "2026-10-01T10:00:00.000Z" }],
      createAppointment: async () => { calls.create++; return { appointmentId: "event-1" }; },
      findAppointment: async () => ({ state: "unknown" }), getAppointment: async () => ({ status: "active", startsAt: "2026-10-01T10:00:00Z", endsAt: "2026-10-01T12:00:00Z" }),
      cancelAppointment: async () => { calls.cancel++; return { cancellationId: "cancel-1" }; } },
    payments: { createCheckout: async () => ({ checkoutId: "cs_1", checkoutUrl: "https://checkout.stripe.com/c/pay/test" }),
      getCheckout: async () => ({ status: "unpaid" }), expireCheckout: async () => {},
      getRefund: async () => ({ state: "unknown" }),
      refund: async () => { calls.refund++; return { refundId: "re_1" }; } },
    notifications: { send: async message => { calls.messages.push(message); } },
  };
  const service = new BookingService(database.store, adapters, { enabled: true, now: () => now, traderAddress: "TEST FIXTURE ONLY, 1 Example Street, Test Town", managementSecret: "test-management-secret-at-least-32-characters", managementBaseUrl: "https://preview.example.test/" });
  const token = Buffer.alloc(32, 42).toString("base64url");
  const input = { startsAt: "2026-10-01T10:00:00.000Z", rate: 100, name: "Example client", email: "client@example.test", note: "PRIVATE EXACT NOTE", managementToken: token, earlyStart: true, consentVersion: "v1-2026-09-27" };
  return { ...database, service, adapters, calls, token, input, setNow: value => { now = value; }, async hold() { return service.hold(input, "test_idempotency_0001"); }, pay(id) { return service.payment({ bookingId: id, paymentId: "pi_1", eventId: "evt_1", amount: 10000, currency: "gbp" }); } };
}
test("SQLite rolls back gate/private/outbox state together and survives store recreation", async () => {
  const f = fixture(); const held = await f.hold();
  assert.throws(() => f.store.mutate(state => { state.bookings.length = 0; throw new Error("crash"); }));
  const restarted = new SqliteStore(f.storage);
  assert.equal(restarted.read().bookings[0].id, held.id);
  assert.equal(restarted.read().private[held.id].note, "PRIVATE EXACT NOTE");
  assert.equal(JSON.stringify(restarted.read()).includes(f.token), false);
});
test("simultaneous same-slot holds serialize at SQLite read-check-write and idempotency is private", async () => {
  const f = fixture();
  const result = await Promise.allSettled([f.hold(), f.service.hold({ ...f.input, managementToken: Buffer.alloc(32, 43).toString("base64url") }, "test_idempotency_0002")]);
  assert.equal(result.filter(x => x.status === "fulfilled").length, 1);
  const held = result.find(x => x.status === "fulfilled").value;
  const winner = result.findIndex(x => x.status === "fulfilled");
  const winningInput = winner === 0 ? f.input : { ...f.input, managementToken: Buffer.alloc(32, 43).toString("base64url") };
  const winningKey = winner === 0 ? "test_idempotency_0001" : "test_idempotency_0002";
  assert.equal((await f.service.hold(winningInput, winningKey)).id, held.id);
  await assert.rejects(f.service.hold({ ...winningInput, rate: 140 }, winningKey), /idempotency_conflict/);
  await assert.rejects(f.service.authorize(held.id, Buffer.alloc(32, 44).toString("base64url")), /unauthorized/);
  assert.equal(JSON.stringify(held).includes("PRIVATE"), false);
});
test("paid double confirms once, then cancels and refunds whole amount with private notifications", async () => {
  const f = fixture(), held = await f.hold();
  f.pay(held.id); f.pay(held.id); await f.service.drain();
  assert.equal(f.calls.create, 1); assert.equal(f.service.record(held.id).status, "confirmed");
  assert.equal(weekCounts(f.store.read().bookings, londonWeekKey(held.startsAt), "2026-09-28T08:00:00Z").confirmed.standard, 2);
  await f.service.cancel(held.id, f.token);
  assert.equal(f.service.record(held.id).providerCancelled, false);
  await f.service.drain();
  assert.equal(f.service.record(held.id).status, "canceled"); assert.equal(f.service.record(held.id).refundStatus, "initiated");
  assert.equal(f.calls.cancel, 1); assert.equal(f.calls.refund, 1);
  assert.equal(JSON.stringify(f.calls.messages).includes("PRIVATE"), false);
});
test("cleanup-before-late-payment race records payment and refunds without appointment", async () => {
  const f = fixture(), held = await f.hold();
  f.setNow("2026-09-28T08:16:00Z"); f.service.repairJobs();
  assert.equal(f.service.record(held.id).status, "booking_failed");
  f.pay(held.id); await f.service.drain();
  assert.equal(f.service.record(held.id).paymentId, "pi_1");
  assert.equal(f.service.record(held.id).refundStatus, "initiated");
  assert.equal(f.calls.create, 0); assert.equal(f.calls.refund, 1);
  assert.equal(f.store.read().private[held.id].note, "");
});
test("unknown Calendly success reserves both hours and reconciles without duplicate creation", async () => {
  const f = fixture(), held = await f.hold();
  f.adapters.scheduler.createAppointment = async () => { f.calls.create++; throw new Error("timeout"); };
  f.pay(held.id); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "confirming");
  assert.equal(weekCounts(f.store.read().bookings, londonWeekKey(held.startsAt), "2026-09-28T08:00:00Z").reserved.standard, 2);
  f.setNow("2026-09-28T08:10:00Z"); await f.service.drain(); assert.equal(f.calls.create, 1);
  f.adapters.scheduler.findAppointment = async () => ({ state: "found", appointmentId: "event-recovered" });
  f.setNow("2026-09-28T08:20:00Z"); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "confirmed"); assert.equal(f.calls.create, 1);
});
test("refund unknown success beyond Stripe key lifetime is reconciled, never submitted again", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.adapters.payments.refund = async () => { f.calls.refund++; throw new Error("unknown"); };
  await f.service.cancel(held.id, f.token); await f.service.drain(); assert.equal(f.calls.refund, 1);
  f.setNow("2026-09-29T09:00:00Z"); await f.service.drain(); assert.equal(f.calls.refund, 1);
  f.adapters.payments.getRefund = async () => ({ state: "found", refundId: "re_recovered" });
  f.setNow("2026-09-29T10:00:00Z"); await f.service.drain();
  assert.equal(f.service.record(held.id).refundId, "re_recovered");
});
test("under-24-hour cancellation and external native cancellation require review", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.setNow("2026-10-01T09:00:00Z"); await f.service.cancel(held.id, f.token); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "review_requested"); assert.equal(f.calls.refund, 0); assert.equal(f.calls.cancel, 0);
  f.adapters.scheduler.getAppointment = async () => ({ status: "canceled" }); await f.service.reconcile();
  assert.equal(f.service.record(held.id).externalChangePending, true); assert.equal(f.calls.refund, 0);
});
test("strict scheduler boolean and full seconds prevent closing-window overflow", async () => {
  const base = { startsAt: "2026-09-30T12:00:00.001Z", rate: 50, now: "2026-09-27T08:00:00Z", busyByCalendar: { Primary: [], Work: [], Home: [] } };
  assert.equal(evaluateSlot(base).available, false);
  assert.equal((await providerSlot({ ...base, startsAt: "2026-10-01T10:00:00Z", calendar: { getBusy: async () => base.busyByCalendar }, scheduler: { isAvailable: async () => ({ available: false }) } })).available, false);
});
test("availability list uses one provider list and one three-calendar fetch", async () => {
  const f = fixture(); let calendars = 0;
  f.adapters.calendar.getBusy = async () => { calendars++; return { Primary: [], Work: [], Home: [] }; };
  f.adapters.scheduler.isAvailable = async () => { throw new Error("must not call for list"); };
  const result = await f.service.availability({ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", rate: 100 });
  assert.equal(result.slots.length, 1); assert.equal(calendars, 1);
});
test("early-start gate covers preparation buffer and expired notes disappear", async () => {
  const f = fixture();
  await assert.rejects(f.service.hold({ ...f.input, earlyStart: false }, "test_idempotency_0001"), /early_start/);
  const held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.setNow("2026-11-02T00:00:00Z"); f.service.repairJobs();
  assert.equal(f.store.read().private[held.id].note, "");
});
test("email recovery capability works across devices, expires, and is never persisted", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  const sent = f.calls.messages.find(x => x.kind === "booking_confirmed");
  const recovered = new URLSearchParams(new URL(sent.manageUrl).hash.slice(1)).get("token");
  assert.equal(recovered.length, 43); assert.notEqual(recovered, f.token);
  assert.equal((await f.service.authorize(held.id, recovered)).id, held.id);
  assert.equal(JSON.stringify(f.store.read()).includes(recovered), false);
  f.setNow("2026-11-02T00:00:00Z"); await assert.rejects(f.service.authorize(held.id, recovered), /unauthorized/);
});
test("delayed duplicate payment cannot turn confirmed no-early-start appointment into failure", async () => {
  const f = fixture(); f.input.startsAt = "2026-10-13T10:00:00Z"; f.input.earlyStart = false;
  const held = await f.hold(); f.pay(held.id); await f.service.drain();
  const contractAt = f.store.read().private[held.id].contractAt;
  f.setNow("2026-09-30T08:00:00Z");
  f.service.payment({ bookingId: held.id, paymentId: "pi_1", eventId: "evt_delayed_duplicate", amount: 10000, currency: "gbp" });
  assert.equal(f.service.record(held.id).status, "confirmed"); assert.equal(f.service.record(held.id).refundStatus, "none");
  assert.equal(f.store.read().private[held.id].contractAt, contractAt);
});
test("delayed confirmation mail is suppressed after cancellation", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id);
  f.adapters.notifications.send = async () => { throw new Error("email down"); };
  await f.service.drain(); await f.service.cancel(held.id, f.token); await f.service.drain();
  f.adapters.notifications.send = async message => { f.calls.messages.push(message); };
  f.setNow("2026-09-28T08:20:00Z"); await f.service.drain();
  assert.equal(f.calls.messages.some(x => x.kind === "booking_confirmed"), false);
});
test("London statutory end includes whole day14 across DST", () => {
  const { cancellationEndsAt, requiresEarlyStart } = require("../booking/consent");
  assert.equal(cancellationEndsAt("2026-09-28T08:00:00Z"), "2026-10-12T23:00:00.000Z");
  assert.equal(cancellationEndsAt("2026-10-12T08:00:00Z"), "2026-10-27T00:00:00.000Z");
  assert.equal(cancellationEndsAt("2026-03-15T08:00:00Z"), "2026-03-29T23:00:00.000Z");
  assert.equal(requiresEarlyStart("2026-10-12T22:59:59Z", "2026-09-28T08:00:00Z"), true);
  assert.equal(requiresEarlyStart("2026-10-12T23:00:00Z", "2026-09-28T08:00:00Z"), false);
});
test("human resolution requires canonical whole appointment and records decision before cancellation", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.setNow("2026-10-01T09:00:00Z"); await f.service.cancel(held.id, f.token);
  f.adapters.scheduler.getAppointment = async () => ({ status: "active", startsAt: "2026-10-02T10:00:00Z", endsAt: "2026-10-02T12:00:00Z" });
  await assert.rejects(f.service.resolve(held.id, { action: "cancel", reasonCode: "human_review" }), /external_time_change_requires_investigation/);
  assert.equal(f.service.record(held.id).status, "review_requested");
  f.adapters.scheduler.getAppointment = async () => ({ status: "active", startsAt: held.startsAt, endsAt: held.endsAt });
  await f.service.resolve(held.id, { action: "cancel", reasonCode: "statutory_cancellation_approved" });
  assert.equal(f.service.record(held.id).status, "cancellation_pending");
  assert.equal(f.store.read().private[held.id].resolutions[0].reasonCode, "statutory_cancellation_approved");
  await f.service.drain();
  assert.equal(f.service.record(held.id).refundStatus, "initiated");
  assert.equal(f.db.prepare("SELECT action FROM audit WHERE action='human_resolution_cancel'").all().length, 1);
});
test("new failure episodes alert again without replaying the earlier episode", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id);
  f.adapters.scheduler.createAppointment = async () => { throw new Error("timeout"); };
  await f.service.drain();
  assert.equal(f.calls.messages.filter(x => x.kind === "operational_alert").length, 1);
  f.adapters.scheduler.findAppointment = async () => ({ state: "found", appointmentId: "event-recovered" });
  f.setNow("2026-09-28T08:20:00Z"); await f.service.drain();
  f.adapters.payments.refund = async () => { throw new Error("refund_timeout"); };
  await f.service.cancel(held.id, f.token); await f.service.drain();
  assert.equal(f.calls.messages.filter(x => x.kind === "operational_alert").length, 2);
});
test("lost Checkout response is rediscovered after hold expiry and late paid booking is refunded", async () => {
  const f = fixture(), held = await f.hold();
  f.adapters.payments.createCheckout = async () => { throw new Error("response_lost_after_remote_success"); };
  await assert.rejects(f.service.checkout(held.id, f.token));
  assert.ok(f.service.record(held.id).checkoutAttemptedAt); assert.equal(f.service.record(held.id).checkoutId, undefined);
  f.setNow("2026-09-28T08:16:00Z"); f.service.repairJobs();
  const remote = { bookingId: held.id, checkoutId: "cs_recovered", paymentId: "pi_1", amount: 10000, currency: "gbp", status: "paid" };
  f.adapters.payments.findCheckout = async () => ({ state: "found", ...remote });
  f.adapters.payments.getCheckout = async () => remote;
  await f.service.reconcile();
  assert.equal(f.service.record(held.id).checkoutId, "cs_recovered");
  assert.equal(f.service.record(held.id).status, "booking_failed");
  assert.equal(f.service.record(held.id).refundStatus, "initiated"); assert.equal(f.calls.create, 0);
});
test("refund later requiring action stays monitored and reports provider recovery honestly", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain(); await f.service.cancel(held.id, f.token); await f.service.drain();
  f.adapters.payments.getRefund = async () => ({ state: "found", refundId: "re_1", status: "requires_action" });
  await f.service.reconcile(); assert.equal(f.service.record(held.id).refundStatus, "attention_required");
  f.adapters.payments.getRefund = async () => ({ state: "found", refundId: "re_1", status: "succeeded" });
  await f.service.reconcile(); assert.equal(f.service.record(held.id).refundStatus, "initiated");
  assert.equal(f.service.record(held.id).refundSettled, true);
  assert.equal(f.calls.messages.filter(x => x.kind === "refund_initiated").length, 2);
});
test("provider time change just before cancellation cannot apply old notice policy", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.adapters.scheduler.getAppointment = async () => ({ status: "active", startsAt: "2026-09-28T12:00:00Z", endsAt: "2026-09-28T14:00:00Z" });
  await f.service.cancel(held.id, f.token); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "review_requested");
  assert.equal(f.service.record(held.id).externalChangePending, true); assert.equal(f.calls.cancel, 0); assert.equal(f.calls.refund, 0);
});
test("failed Google Meet cancels known calendar event before refund and never confirms", async () => {
  const f = fixture(), held = await f.hold();
  f.adapters.scheduler.createAppointment = async () => ({ state: "conference_failed", appointmentId: "google-event-1" });
  f.pay(held.id); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "booking_failed"); assert.equal(f.calls.cancel, 1); assert.equal(f.calls.refund, 1);
  assert.equal(f.calls.messages.some(x => x.kind === "booking_confirmed"), false);
});
test("successful remote event followed by failed verification remains reserved and unrefunded", async () => {
  const f = fixture(), held = await f.hold();
  f.adapters.scheduler.createAppointment = async () => { throw Object.assign(new Error("confirmation_unverified"), { definitive: false, code: "confirmation_unverified", appointmentId: "google-existing-event" }); };
  f.pay(held.id); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "confirming"); assert.equal(f.calls.refund, 0);
  assert.equal(weekCounts(f.store.read().bookings, londonWeekKey(held.startsAt), "2026-09-28T08:00:00Z").reserved.standard, 2);
});
test("operator cancellation resumes after an earlier cancellation job stopped for a moved event", async () => {
  const f = fixture(), held = await f.hold(); f.pay(held.id); await f.service.drain();
  f.adapters.scheduler.getAppointment = async () => ({ status: "active", startsAt: "2026-10-01T11:00:00Z", endsAt: "2026-10-01T13:00:00Z" });
  await f.service.cancel(held.id, f.token); await f.service.drain();
  assert.equal(f.service.record(held.id).status, "review_requested");
  f.adapters.scheduler.getAppointment = async () => ({ status: "active", startsAt: held.startsAt, endsAt: held.endsAt });
  await f.service.resolve(held.id, { action: "cancel", reasonCode: "calendar_restored_cancellation_approved" });
  await f.service.drain();
  assert.equal(f.service.record(held.id).status, "canceled"); assert.equal(f.calls.cancel, 1); assert.equal(f.calls.refund, 1);
  assert.equal(Object.values(f.store.read().jobs).filter(j => j.kind === "cancel").length, 2);
});
test("an unpaid Checkout recovered after cleanup is expired and malformed canonical status cannot cancel", async () => {
  const f = fixture(), held = await f.hold();
  f.adapters.payments.createCheckout = async () => { throw new Error("response_lost"); };
  await assert.rejects(f.service.checkout(held.id, f.token));
  f.setNow("2026-09-28T08:16:00Z"); f.service.repairJobs(); let expired = 0;
  const remote = { bookingId: held.id, checkoutId: "cs_recovered", amount: 10000, currency: "gbp", status: "unpaid" };
  f.adapters.payments.findCheckout = async () => ({ state: "found", ...remote }); f.adapters.payments.getCheckout = async () => remote;
  f.adapters.payments.expireCheckout = async () => { expired++; };
  await f.service.reconcile(); assert.equal(expired, 1);
  const g = fixture(), booked = await g.hold(); g.pay(booked.id); await g.service.drain();
  g.adapters.scheduler.getAppointment = async () => ({});
  await g.service.cancel(booked.id, g.token); await g.service.drain();
  assert.equal(g.service.record(booked.id).status, "cancellation_pending"); assert.equal(g.calls.cancel, 0); assert.equal(g.calls.refund, 0);
});
test("invalid email cannot reserve a slot that the notification adapter could never use", async () => {
  const f = fixture();
  for (const email of ["bad<name@example.test", "bad@example.test>", "bad\u0000@example.test"]) await assert.rejects(f.service.hold({ ...f.input, email }, "test_idempotency_0001"), /invalid_email/);
  assert.equal(f.store.read().bookings.length, 0);
});
test("hold idempotency recovery survives a London midnight consent-boundary change", async () => {
  const f = fixture(); f.input.startsAt = "2026-10-13T10:00:00Z"; f.input.earlyStart = false;
  f.setNow("2026-09-28T22:55:00Z"); const held = await f.hold();
  f.setNow("2026-09-28T23:01:00Z");
  assert.equal((await f.hold()).id, held.id);
  assert.equal(f.store.read().bookings.length, 1);
  await assert.rejects(f.service.hold(f.input, "test_new_key_0000001"), /early_start_or_later_appointment_required/);
});
test("missing trader address cannot expose availability, reserve capacity, or begin payment", async () => {
  const f = fixture(); f.service.traderAddress = undefined;
  f.adapters.calendar.getBusy = async () => { throw new Error("provider must not be called"); };
  await assert.rejects(f.service.availability({ startsAt: f.input.startsAt, rate: 100 }), error => error.code === "trader_address_required" && error.status === 503);
  await assert.rejects(f.hold(), /trader_address_required/); assert.equal(f.store.read().bookings.length, 0);
  const g = fixture(), held = await g.hold(); g.service.traderAddress = "";
  g.adapters.payments.createCheckout = async () => { throw new Error("payment must not be called"); };
  await assert.rejects(g.service.checkout(held.id, g.token), /trader_address_required/);
});
test("confirmation uses original durable terms after configuration changes and message retry", async () => {
  const f = fixture(), held = await f.hold(); const saved = f.store.read().private[held.id].contractTerms;
  f.service.traderAddress = "TEST FIXTURE ONLY, 99 Different Avenue, Other Town";
  let attempts = 0;
  f.adapters.notifications.send = async message => {
    if (message.kind === "booking_confirmed") { attempts++; assert.deepEqual(message.contractTerms, saved); if (attempts === 1) throw new Error("temporary mail failure"); }
    f.calls.messages.push(message);
  };
  f.pay(held.id); await f.service.drain(); f.setNow("2026-09-28T08:20:00Z"); await f.service.drain();
  assert.equal(attempts, 2); assert.equal(f.calls.messages.filter(x => x.kind === "booking_confirmed").length, 1);
  assert.deepEqual(f.store.read().private[held.id].contractTerms, saved);
  assert.equal(saved.text.includes("99 Different"), false);
  const g = fixture(), legacy = await g.hold(); g.store.mutate(state => { delete state.private[legacy.id].contractTerms; });
  await assert.rejects(g.service.checkout(legacy.id, g.token), /contract_terms_snapshot_required/);
});
