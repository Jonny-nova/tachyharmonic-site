"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CAPACITY, evaluateBooking, offerForRate, rateAvailability, summarize } = require("./rules");
const { londonWeekKey, weekCounts, weekState } = require("./state");
const { evaluateSlot, providerSlot } = require("./availability");
const { BookingGate } = require("./gate");

const NOW = "2026-09-01T09:00:00Z";
const MONDAY = "2026-09-07T09:00:00Z"; // 10:00 in London
const CALENDARS = { Primary: [], Work: [], Home: [] };
const counts = (low, standard, high) => ({ low, standard, high });
const confirmed = (id, startsAt, rate) => ({ id, startsAt, rate, status: "confirmed",
  paymentId: `pay-${id}` });

function available(state) {
  return Object.fromEntries(Object.entries(rateAvailability(state))
    .map(([rate, result]) => [Number(rate), result.allowed]));
}

function hold(id, startsAt = MONDAY, rate = 50, now = NOW) {
  return { id, startsAt, rate, now, busyByCalendar: CALENDARS,
    expiresAt: new Date(Date.parse(now) + 10 * 60_000).toISOString() };
}

class InMemoryTransactionalStore {
  constructor(bookings = []) {
    this.bookings = structuredClone(bookings);
    this.queue = Promise.resolve();
  }
  async transact(operation) {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const previous = this.queue;
    this.queue = previous.then(() => turn);
    await previous;
    try {
      const change = operation(structuredClone(this.bookings));
      if (change && typeof change.then === "function") throw new Error("Do not await in transaction");
      this.bookings = structuredClone(change.bookings);
      return change.result;
    } finally { release(); }
  }
  snapshot() { return structuredClone(this.bookings); }
}

test("the five indivisible offers map to the approved hourly units", () => {
  assert.deepEqual(Object.values([30, 50, 70, 100, 140]).map(offerForRate)
    .map((offer) => [offer.rate, offer.hours, offer.low, offer.standard, offer.high]), [
      [30, 1, 1, 0, 0], [50, 1, 0, 1, 0], [70, 1, 0, 0, 1],
      [100, 2, 0, 2, 0], [140, 2, 0, 0, 2],
    ]);
  assert.throws(() => offerForRate(60), /Rate must/);
});

test("the original supported-place and repair boundary cases still hold", () => {
  assert.deepEqual(available(counts(0, 0, 0)), { 30: true, 50: true, 70: true, 100: true, 140: true });
  assert.deepEqual(available(counts(2, 0, 0)), { 30: false, 50: true, 70: true, 100: true, 140: true });
  assert.deepEqual(available(counts(2, 6, 0)), { 30: false, 50: false, 70: true, 100: false, 140: true });
  assert.deepEqual(available(counts(2, 6, 1)), { 30: false, 50: false, 70: true, 100: false, 140: false });
  assert.deepEqual(available(counts(2, 5, 2)), { 30: false, 50: true, 70: true, 100: false, 140: false });
  assert.equal(evaluateBooking(30, counts(2, 4, 3)).after.revenue, 500);
  assert.equal(summarize(counts(5, 0, 5)).revenue, 500);
  assert.equal(summarize(counts(0, 0, 10)).revenue, 700);
  assert.equal(summarize(counts(5, 0, 5)).total, CAPACITY);
});

test("a £140 double adds two solidarity units and can grow supported capacity", () => {
  const result = evaluateBooking(140, counts(2, 2, 2));
  assert.equal(result.allowed, true);
  assert.equal(result.after.high, 4);
  assert.equal(result.after.revenue, 440);
  assert.equal(evaluateBooking(30, result.after).allowed, true);
  assert.equal(evaluateBooking(30, counts(2, 2, 2), counts(0, 0, 2)).reason, "supported_ceiling");
});

test("reserved solidarity does not repair a deficit; reserved hours block a double", () => {
  assert.equal(evaluateBooking(50, counts(2, 6, 0), counts(0, 0, 1)).reason, "repair_capacity");
  assert.equal(evaluateBooking(100, counts(0, 8, 0), counts(0, 1, 0)).reason, "capacity");
  assert.equal(evaluateBooking(140, counts(0, 8, 0)).allowed, true);
});

test("every full week reachable using all five offers preserves the £500 floor", () => {
  const queue = [counts(0, 0, 0)];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = [current.low, current.standard, current.high].join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const state = summarize(current);
    if (state.total === CAPACITY) {
      assert.ok(state.revenue >= 500, key);
      assert.ok(state.high >= state.low, key);
      continue;
    }
    for (const rate of [30, 50, 70, 100, 140]) {
      const decision = evaluateBooking(rate, current);
      if (decision.allowed) queue.push(decision.after);
    }
  }
  assert.ok(seen.size > 100);
});

test("week state counts two-hour appointments as two units across London week boundaries", () => {
  assert.equal(londonWeekKey("2026-03-29T22:30:00Z"), "2026-03-23");
  assert.equal(londonWeekKey("2026-03-29T23:30:00Z"), "2026-03-30");
  assert.equal(londonWeekKey("2026-10-25T23:30:00Z"), "2026-10-19");
  assert.equal(londonWeekKey("2026-10-26T00:30:00Z"), "2026-10-26");
  assert.deepEqual(weekState([confirmed("double", MONDAY, 140)], "2026-09-07").high, 2);
});

test("availability applies London windows, notice, horizon, and date openings", () => {
  const check = (startsAt, rate = 50, extra = {}) => evaluateSlot({
    startsAt, rate, now: NOW, busyByCalendar: CALENDARS, ...extra,
  });
  assert.equal(check(MONDAY).available, true);
  assert.equal(check("2026-09-09T12:00:00Z", 100).reason, "outside_window"); // Wed 13–15
  assert.equal(check("2026-09-11T09:00:00Z").reason, "outside_window"); // Fri 10
  assert.equal(check("2026-09-03T08:59:00Z").reason, "minimum_notice");
  assert.equal(check("2026-09-30T09:00:00Z").reason, "booking_horizon");
  assert.equal(check("2026-09-11T09:00:00Z", 50, {
    openings: [{ date: "2026-09-11", start: "10:00", end: "11:00" }],
  }).available, true);
});

test("preparation/decompression and the 60-minute gap protect separate appointments", () => {
  const bookings = [confirmed("first", MONDAY, 50)];
  assert.equal(evaluateSlot({ startsAt: "2026-09-07T10:30:00Z", rate: 50,
    now: NOW, bookings, busyByCalendar: CALENDARS }).reason, "client_buffer"); // 11:30 local
  assert.equal(evaluateSlot({ startsAt: "2026-09-07T11:00:00Z", rate: 50,
    now: NOW, bookings, busyByCalendar: CALENDARS }).available, true); // 12:00 local
  assert.equal(evaluateSlot({ startsAt: MONDAY, rate: 50, now: NOW,
    busyByCalendar: { ...CALENDARS, Work: [{ startsAt: "2026-09-07T08:45:00Z",
      endsAt: "2026-09-07T09:00:00Z" }] } }).reason, "calendar_busy");
  assert.throws(() => evaluateSlot({ startsAt: MONDAY, rate: 50, now: NOW,
    busyByCalendar: { Primary: [], Work: [] } }), /Primary, Work, and Home/);
});

test("weekend permits one whole client appointment even with a separate opening", () => {
  const saturday = "2026-09-12T11:00:00Z"; // 12:00 local
  const bookings = [confirmed("weekend", saturday, 50)];
  assert.equal(evaluateSlot({ startsAt: "2026-09-12T14:00:00Z", rate: 50,
    now: NOW, bookings, busyByCalendar: CALENDARS,
    openings: [{ date: "2026-09-12", start: "15:00", end: "16:00" }] }).reason,
  "weekend_one_appointment");
  assert.equal(evaluateSlot({ startsAt: saturday, rate: 100,
    now: NOW, busyByCalendar: CALENDARS }).available, true);
});

test("provider availability fails closed when a calendar or scheduler adapter is absent", async () => {
  await assert.rejects(providerSlot({ startsAt: MONDAY, rate: 50, now: NOW }), /adapters/);
  const calendar = { getBusy: async () => CALENDARS };
  const scheduler = { isAvailable: async () => false };
  assert.equal((await providerSlot({ calendar, scheduler, startsAt: MONDAY, rate: 50,
    now: NOW })).reason, "scheduler_unavailable");
});

test("two-hour hold, payment and confirmation stay one atomic appointment", async () => {
  const store = new InMemoryTransactionalStore();
  const gate = new BookingGate(store);
  const request = hold("double", MONDAY, 100);
  assert.equal((await gate.hold(request)).accepted, true);
  assert.equal((await gate.hold(request)).idempotent, true);
  assert.equal(weekCounts(store.snapshot(), "2026-09-07", NOW).reserved.standard, 2);
  assert.equal((await gate.recordPayment({ id: "double", paymentId: "pay-1", now: NOW })).accepted, true);
  assert.equal((await gate.beginConfirmation("double")).accepted, true);
  assert.equal((await gate.confirmAppointment({ id: "double", appointmentId: "cal-1" })).accepted, true);
  assert.equal((await gate.confirmAppointment({ id: "double", appointmentId: "cal-1" })).idempotent, true);
  assert.equal(store.snapshot().length, 1);
  assert.equal(weekState(store.snapshot(), "2026-09-07").standard, 2);
  assert.equal(weekState(store.snapshot(), "2026-09-07").revenue, 100);
});

test("simultaneous double holds cannot oversubscribe the last two hours or same time", async () => {
  const fixtures = [
    ["2026-09-07", [9, 11, 13]], ["2026-09-08", [9, 11, 13]],
    ["2026-09-09", [9, 11]],
  ].flatMap(([day, hours], dayIndex) => hours.map((hour, index) =>
    confirmed(`${dayIndex}-${index}`, `${day}T${String(hour).padStart(2, "0")}:00:00Z`, 50)));
  const store = new InMemoryTransactionalStore(fixtures);
  const gate = new BookingGate(store);
  const thursday = "2026-09-10T09:00:00Z";
  const results = await Promise.all([
    gate.hold(hold("first", thursday, 100)),
    gate.hold(hold("second", thursday, 100)),
  ]);
  assert.equal(results.filter((result) => result.accepted).length, 1);
  assert.equal(weekCounts(store.snapshot(), "2026-09-07", NOW).reserved.total, 2);
  assert.equal((await gate.hold(hold("third", "2026-09-11T11:00:00Z", 50))).reason, "capacity");
});

test("paid hold after expiry becomes a failed booking with refund and alert pending", async () => {
  const store = new InMemoryTransactionalStore();
  const gate = new BookingGate(store);
  await gate.hold(hold("late"));
  const result = await gate.recordPayment({ id: "late", paymentId: "pay-late",
    now: "2026-09-01T09:11:00Z" });
  assert.equal(result.accepted, false);
  assert.equal(result.refundPending, true);
  assert.equal(store.snapshot()[0].status, "booking_failed");
  assert.equal(weekCounts(store.snapshot(), "2026-09-07", NOW).reserved.total, 0);
  assert.equal((await gate.recordRefundInitiated({ id: "late", refundId: "refund-late" })).refundInitiated, true);
  assert.equal((await gate.recordRefundInitiated({ id: "late", refundId: "refund-late" })).idempotent, true);
});

test("known appointment failure releases all units and requests a refund, without claiming one", async () => {
  const store = new InMemoryTransactionalStore();
  const gate = new BookingGate(store);
  await gate.hold(hold("failed", MONDAY, 140));
  await gate.recordPayment({ id: "failed", paymentId: "pay-failed", now: NOW });
  await gate.beginConfirmation("failed");
  const result = await gate.failBooking({ id: "failed", code: "slot_rejected" });
  assert.equal(result.bookingConfirmed, false);
  assert.equal(result.refundPending, true);
  assert.equal(weekCounts(store.snapshot(), "2026-09-07", NOW).reserved.total, 0);
  assert.equal(store.snapshot()[0].refundStatus, "pending");
});

test("an unpaid failed hold cannot be marked refunded", async () => {
  const store = new InMemoryTransactionalStore();
  const gate = new BookingGate(store);
  await gate.hold(hold("unpaid"));
  await gate.failBooking({ id: "unpaid", code: "checkout_failed" });
  const result = await gate.recordRefundInitiated({ id: "unpaid", refundId: "refund-phantom" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "invalid_state");
  assert.equal(store.snapshot()[0].refundStatus, "none");
});

test("24+ hour whole-appointment cancellation remains honest through provider/refund failures", async () => {
  const store = new InMemoryTransactionalStore([confirmed("double", MONDAY, 140)]);
  const gate = new BookingGate(store);
  const request = await gate.requestCancellation({ id: "double", now: NOW });
  assert.equal(request.status, "cancellation_pending");
  assert.equal(request.refundInitiated, false);
  assert.equal(weekState(store.snapshot(), "2026-09-07").high, 2);
  await gate.recordActionFailure({ id: "double", action: "provider_cancellation", code: "timeout" });
  assert.equal(store.snapshot()[0].alertPending, true);
  assert.equal((await gate.recordProviderCanceled({ id: "double", providerCancellationId: "cancel-1" })).capacityReleased, true);
  assert.equal(weekState(store.snapshot(), "2026-09-07").total, 0);
  await gate.recordActionFailure({ id: "double", action: "refund", code: "provider_unavailable" });
  assert.equal(store.snapshot()[0].status, "cancellation_pending");
  assert.equal(store.snapshot()[0].refundStatus, "pending");
  assert.equal((await gate.recordRefundInitiated({ id: "double", refundId: "refund-1" })).status, "canceled");
  assert.equal((await gate.recordActionFailure({ id: "double", action: "refund",
    code: "late_timeout" })).reason, "invalid_state");
  assert.equal(store.snapshot()[0].refundStatus, "initiated");
  assert.equal((await gate.requestCancellation({ id: "double", now: NOW })).idempotent, true);
});

test("under-24-hour cancellation is human review only and retains the appointment", async () => {
  const store = new InMemoryTransactionalStore([confirmed("short", MONDAY, 100)]);
  const gate = new BookingGate(store);
  const result = await gate.requestCancellation({ id: "short", now: "2026-09-06T12:00:00Z" });
  assert.equal(result.humanReview, true);
  assert.equal(result.appointmentCanceled, false);
  assert.equal(result.refundInitiated, false);
  assert.equal(weekState(store.snapshot(), "2026-09-07").standard, 2);
});

test("human-mediated reschedule moves a whole double across weeks or denies it atomically", async () => {
  const store = new InMemoryTransactionalStore([confirmed("moving", MONDAY, 100)]);
  const gate = new BookingGate(store);
  const newStart = "2026-09-14T09:00:00Z";
  const moved = await gate.reschedule("moving", newStart, { now: NOW, busyByCalendar: CALENDARS });
  assert.equal(moved.accepted, true);
  assert.equal(moved.oldWeekState.total, 0);
  assert.equal(moved.newWeekState.standard, 2);
  const blocked = await gate.reschedule("moving", "2026-09-14T11:00:00Z", {
    now: NOW, busyByCalendar: { ...CALENDARS, Home: [{
      startsAt: "2026-09-14T10:30:00Z", endsAt: "2026-09-14T11:30:00Z",
    }] },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(store.snapshot()[0].startsAt, newStart);
});

test("invalid inputs cannot enter the weekly state", () => {
  assert.throws(() => londonWeekKey("2026-03-23T10:00:00"), /timezone/);
  assert.throws(() => londonWeekKey("2026-02-30T10:00:00Z"), /invalid/);
  assert.throws(() => weekState([], "2026-03-24"), /Monday/);
  assert.throws(() => weekState([confirmed("wrong", MONDAY, 60)], "2026-09-07"), /Rate must/);
});

test("provider contracts keep price, duration and sender under server control", () => {
  const { checkoutIntent, calendlyIntent, refundIntent, systemMessage, humanAlert } =
    require("./provider_contracts");
  assert.deepEqual(checkoutIntent({ id: "double", rate: 140 }), {
    bookingId: "double", currency: "gbp", amountPence: 14000,
    durationMinutes: 120, mode: "payment", idempotencyKey: "checkout:double",
  });
  assert.equal(calendlyIntent({ id: "double", rate: 140, startsAt: MONDAY,
    invitee: { email: "visitor@example.com" } }, { 120: "event-type-120" }).durationMinutes, 120);
  assert.throws(() => calendlyIntent({ id: "double", rate: 140, startsAt: MONDAY,
    invitee: { email: "visitor@example.com" } }, { 60: "event-type-60" }), /gated/);
  assert.equal(refundIntent({ id: "double", paymentIntentId: "pi_123", rate: 140 }).amountPence, 14000);
  assert.equal(systemMessage({ id: "double", event: "booking_confirmed",
    to: "visitor@example.com" }).sender, "transactional_provider_required");
  assert.equal(humanAlert({ id: "double", event: "booking_failed" }).to,
    "jonathan@tachyharmonic.ai");
  assert.throws(() => checkoutIntent({ id: "double", rate: 60 }), /Rate/);
});
