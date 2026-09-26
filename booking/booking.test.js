"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CAPACITY, evaluateBooking, rateAvailability, summarize } = require("./rules");
const { londonWeekKey, weekState } = require("./state");
const { BookingGate } = require("./gate");

const MONDAY = "2026-03-23T10:00:00Z";

function counts(low, standard, high) {
  return { low, standard, high };
}

function available(state) {
  return Object.fromEntries(
    Object.entries(rateAvailability(state))
      .map(([rate, result]) => [Number(rate), result.allowed])
  );
}

function makeBookings(state, startsAt = MONDAY) {
  const bookings = [];
  for (const [prefix, rate, count] of [
    ["l", 30, state.low],
    ["m", 50, state.standard],
    ["h", 70, state.high],
  ]) {
    for (let index = 1; index <= count; index++) {
      bookings.push({ id: prefix + index, rate, startsAt, status: "active" });
    }
  }
  return bookings;
}

class InMemoryTransactionalStore {
  constructor(bookings = []) {
    this.bookings = structuredClone(bookings);
    this.queue = Promise.resolve();
  }

  async transact(operation) {
    let release;
    const currentTurn = new Promise((resolve) => { release = resolve; });
    const previousTurn = this.queue;
    this.queue = previousTurn.then(() => currentTurn);
    await previousTurn;
    try {
      const change = operation(structuredClone(this.bookings));
      if (change && typeof change.then === "function") {
        throw new Error("Transactions must not await external services");
      }
      this.bookings = change.bookings;
      return change.result;
    } finally {
      release();
    }
  }

  snapshot() {
    return structuredClone(this.bookings);
  }
}

test("1. Empty week offers all three rates", () => {
  assert.deepEqual(available(counts(0, 0, 0)), { 30: true, 50: true, 70: true });
});

test("2. Two supported places close the £30 rate until solidarity grows it", () => {
  assert.deepEqual(available(counts(2, 0, 0)), { 30: false, 50: true, 70: true });
});

test("3. Two supported and six standard leave two repair slots for solidarity", () => {
  assert.deepEqual(available(counts(2, 6, 0)), { 30: false, 50: false, 70: true });
  assert.equal(evaluateBooking(50, counts(2, 6, 0)).reason, "repair_capacity");
});

test("4. With one solidarity and one slot left, only solidarity is allowed", () => {
  assert.deepEqual(available(counts(2, 6, 1)), { 30: false, 50: false, 70: true });
});

test("5. Two supported, five standard, two solidarity allow standard or solidarity", () => {
  assert.deepEqual(available(counts(2, 5, 2)), { 30: false, 50: true, 70: true });
});

test("6. The third solidarity booking opens a third supported place", () => {
  assert.deepEqual(available(counts(2, 4, 3)), { 30: true, 50: true, 70: true });
  const after = evaluateBooking(30, counts(2, 4, 3)).after;
  assert.equal(after.total, 10);
  assert.equal(after.revenue, 500);
});

test("7. Five supported plus five solidarity fill the week at £500", () => {
  const state = summarize(counts(5, 0, 5));
  assert.equal(state.total, CAPACITY);
  assert.equal(state.revenue, 500);
  assert.deepEqual(available(state), { 30: false, 50: false, 70: false });
});

test("8. Ten solidarity bookings fill the week at £700", () => {
  const state = summarize(counts(0, 0, 10));
  assert.equal(state.revenue, 700);
  assert.deepEqual(available(state), { 30: false, 50: false, 70: false });
});

test("9. Solidarity cancellation retains supported bookings and offers repair", async () => {
  const store = new InMemoryTransactionalStore(makeBookings(counts(3, 4, 3)));
  const gate = new BookingGate(store);
  const canceled = await gate.cancel("h3");
  assert.equal(canceled.changed, true);
  assert.deepEqual(
    { low: canceled.state.low, standard: canceled.state.standard, high: canceled.state.high },
    counts(3, 4, 2)
  );
  assert.equal(store.snapshot().find((booking) => booking.id === "l3").status, "active");
  assert.deepEqual(available(canceled.state), { 30: false, 50: false, 70: true });
  assert.equal((await gate.cancel("h3")).changed, false);
});

test("10. Cross-week reschedule moves the active booking and recalculates both weeks", async () => {
  const store = new InMemoryTransactionalStore(makeBookings(counts(2, 6, 2)));
  const gate = new BookingGate(store);
  const moved = await gate.reschedule("h2", "2026-03-30T10:00:00Z");
  assert.equal(moved.accepted, true);
  assert.equal(moved.oldWeek, "2026-03-23");
  assert.equal(moved.newWeek, "2026-03-30");
  assert.equal(moved.oldWeekState.total, 9);
  assert.equal(moved.oldWeekState.high, 1);
  assert.equal(moved.newWeekState.total, 1);
  assert.equal(moved.newWeekState.high, 1);
  assert.deepEqual(available(moved.oldWeekState), { 30: false, 50: false, 70: true });
});

test("11. An eleventh booking is rejected at every rate", async () => {
  const store = new InMemoryTransactionalStore(makeBookings(counts(5, 0, 5)));
  const gate = new BookingGate(store);
  for (const rate of [30, 50, 70]) {
    const result = await gate.book({ id: "extra-" + rate, rate, startsAt: MONDAY });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "capacity");
  }
  assert.equal(store.snapshot().filter((booking) => booking.status === "active").length, 10);
});

test("12. Simultaneous attempts cannot bypass capacity or supported entitlement", async () => {
  const capacityStore = new InMemoryTransactionalStore(makeBookings(counts(0, 9, 0)));
  const capacityGate = new BookingGate(capacityStore);
  const capacityAttempts = await Promise.all([
    capacityGate.book({ id: "a", rate: 50, startsAt: MONDAY }),
    capacityGate.book({ id: "b", rate: 50, startsAt: MONDAY }),
  ]);
  assert.equal(capacityAttempts.filter((result) => result.accepted).length, 1);
  assert.equal(weekState(capacityStore.snapshot(), "2026-03-23").total, 10);

  const rateStore = new InMemoryTransactionalStore(makeBookings(counts(1, 0, 0)));
  const rateGate = new BookingGate(rateStore);
  const rateAttempts = await Promise.all([
    rateGate.book({ id: "a", rate: 30, startsAt: MONDAY }),
    rateGate.book({ id: "b", rate: 30, startsAt: MONDAY }),
  ]);
  assert.equal(rateAttempts.filter((result) => result.accepted).length, 1);
  assert.equal(weekState(rateStore.snapshot(), "2026-03-23").low, 2);
});

test("London session dates set Monday–Sunday weeks across BST and GMT changes", () => {
  assert.equal(londonWeekKey("2026-03-29T22:30:00Z"), "2026-03-23");
  assert.equal(londonWeekKey("2026-03-29T23:30:00Z"), "2026-03-30");
  assert.equal(londonWeekKey("2026-10-25T23:30:00Z"), "2026-10-19");
  assert.equal(londonWeekKey("2026-10-26T00:30:00Z"), "2026-10-26");
});

test("Duplicate confirmation is idempotent; conflicting reuse is rejected", async () => {
  const store = new InMemoryTransactionalStore();
  const gate = new BookingGate(store);
  assert.equal((await gate.book({ id: "same", rate: 50, startsAt: MONDAY })).accepted, true);
  assert.equal((await gate.book({ id: "same", rate: 50, startsAt: MONDAY })).idempotent, true);
  const conflict = await gate.book({ id: "same", rate: 70, startsAt: MONDAY });
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason, "booking_id_conflict");
  assert.equal(store.snapshot().length, 1);
});

test("Cross-week reschedule into a full week is denied without moving the booking", async () => {
  const oldBooking = { id: "moving", rate: 30, startsAt: MONDAY, status: "active" };
  const fullNewWeek = makeBookings(counts(5, 0, 5), "2026-03-30T10:00:00Z")
    .map((booking) => ({ ...booking, id: "new-" + booking.id }));
  const store = new InMemoryTransactionalStore([oldBooking, ...fullNewWeek]);
  const gate = new BookingGate(store);
  const result = await gate.reschedule("moving", "2026-03-30T10:00:00Z");
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "capacity");
  assert.equal(store.snapshot().find((booking) => booking.id === "moving").startsAt, MONDAY);
});

test("Every full week reachable from an empty week satisfies the £500 floor", () => {
  const queue = [counts(0, 0, 0)];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = [current.low, current.standard, current.high].join(",");
    if (visited.has(key)) continue;
    visited.add(key);
    const state = summarize(current);
    if (state.total === CAPACITY) {
      assert.ok(state.revenue >= 500, key + " returned less than £500");
      assert.ok(state.high >= state.low, key + " has an uncovered supported deficit");
      continue;
    }
    for (const rate of [30, 50, 70]) {
      const decision = evaluateBooking(rate, current);
      if (decision.allowed) queue.push(decision.after);
    }
  }
  assert.ok(visited.size > 20);
});

test("Invalid rate and timezone-free start time are rejected", () => {
  assert.throws(() => evaluateBooking(40, counts(0, 0, 0)), /Rate must/);
  assert.throws(() => londonWeekKey("2026-03-23T10:00:00"), /timezone/);
  assert.throws(() => londonWeekKey("2026-02-30T10:00:00Z"), /invalid/);
  assert.throws(() => weekState([], "2026-03-24"), /Monday/);
});
