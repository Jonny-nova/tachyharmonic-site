"use strict";

const { evaluateBooking } = require("./rules");
const { assertBooking, londonWeekKey, weekState } = require("./state");

// The store must serialize read-check-write transactions across all weeks.
// A production adapter must use durable, transactional storage.
class BookingGate {
  constructor(store) {
    if (!store || typeof store.transact !== "function") {
      throw new TypeError("A transactional booking store is required");
    }
    this.store = store;
  }

  book({ id, startsAt, rate }) {
    const proposed = { id, startsAt, rate, status: "active" };
    assertBooking(proposed);
    const week = londonWeekKey(startsAt);

    return this.store.transact((bookings) => {
      const existing = bookings.find((booking) => booking.id === id);
      if (existing) {
        if (
          existing.status === "active" &&
          existing.startsAt === startsAt &&
          existing.rate === rate
        ) {
          return {
            bookings,
            result: { accepted: true, idempotent: true, week, state: weekState(bookings, week) },
          };
        }
        return { bookings, result: { accepted: false, reason: "booking_id_conflict", week } };
      }

      const decision = evaluateBooking(rate, weekState(bookings, week));
      if (!decision.allowed) {
        return { bookings, result: { accepted: false, reason: decision.reason, week } };
      }
      const next = [...bookings, proposed];
      return {
        bookings: next,
        result: { accepted: true, idempotent: false, week, state: weekState(next, week) },
      };
    });
  }

  cancel(id) {
    if (typeof id !== "string" || !id) throw new TypeError("Booking id is required");
    return this.store.transact((bookings) => {
      const current = bookings.find((booking) => booking.id === id);
      if (!current) {
        return { bookings, result: { changed: false, reason: "unknown_booking" } };
      }
      const week = londonWeekKey(current.startsAt);
      if (current.status === "canceled") {
        return {
          bookings,
          result: { changed: false, reason: "already_canceled", week, state: weekState(bookings, week) },
        };
      }
      const next = bookings.map((booking) => (
        booking.id === id ? { ...booking, status: "canceled" } : booking
      ));
      return {
        bookings: next,
        result: { changed: true, week, state: weekState(next, week) },
      };
    });
  }

  reschedule(id, newStartsAt) {
    if (typeof id !== "string" || !id) throw new TypeError("Booking id is required");
    const newWeek = londonWeekKey(newStartsAt);
    return this.store.transact((bookings) => {
      const current = bookings.find((booking) => booking.id === id);
      if (!current || current.status !== "active") {
        return { bookings, result: { accepted: false, reason: "unknown_active_booking" } };
      }
      const oldWeek = londonWeekKey(current.startsAt);
      if (current.startsAt === newStartsAt) {
        return {
          bookings,
          result: { accepted: true, idempotent: true, oldWeek, newWeek },
        };
      }

      if (oldWeek !== newWeek) {
        const withoutMovingBooking = bookings.filter((booking) => booking.id !== id);
        const decision = evaluateBooking(
          current.rate,
          weekState(withoutMovingBooking, newWeek)
        );
        if (!decision.allowed) {
          return {
            bookings,
            result: { accepted: false, reason: decision.reason, oldWeek, newWeek },
          };
        }
      }

      const next = bookings.map((booking) => (
        booking.id === id ? { ...booking, startsAt: newStartsAt } : booking
      ));
      return {
        bookings: next,
        result: {
          accepted: true,
          idempotent: false,
          oldWeek,
          newWeek,
          oldWeekState: weekState(next, oldWeek),
          newWeekState: weekState(next, newWeek),
        },
      };
    });
  }
}

module.exports = { BookingGate };
