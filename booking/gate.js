"use strict";

const { evaluateBooking, offerForRate } = require("./rules");
const { evaluateSlot } = require("./availability");
const { assertBooking, londonWeekKey, parseInstant, weekCounts, weekState } = require("./state");

const HOLD_MS = 15 * 60_000;
const CANCELLATION_MS = 24 * 60 * 60_000;

// transact must serialize every read-check-write operation across all weeks and
// persist the returned records atomically. Provider calls never run inside it.
class BookingGate {
  constructor(store) {
    if (!store || typeof store.transact !== "function") {
      throw new TypeError("A durable transactional booking store is required");
    }
    this.store = store;
  }

  hold({ id, startsAt, rate, now, expiresAt, busyByCalendar, openings = [] }) {
    const current = parseInstant(now).getTime();
    const expiry = parseInstant(expiresAt).getTime();
    if (expiry <= current || expiry > current + HOLD_MS) {
      throw new TypeError("Hold expiry must be within 15 minutes");
    }
    const proposed = { id, startsAt, rate, status: "held", expiresAt };
    assertBooking(proposed);
    const week = londonWeekKey(startsAt);
    return this.store.transact((bookings) => {
      const existing = bookings.find((booking) => booking.id === id);
      if (existing) {
        const same = existing.status === "held" && existing.startsAt === startsAt &&
          existing.rate === rate && existing.expiresAt === expiresAt && expiry > current;
        return { bookings, result: same
          ? { accepted: true, idempotent: true, week }
          : { accepted: false, reason: "booking_id_conflict", week } };
      }
      const slot = evaluateSlot({ startsAt, rate, now, bookings, busyByCalendar, openings });
      if (!slot.available) {
        return { bookings, result: { accepted: false, reason: slot.reason, week } };
      }
      const counts = weekCounts(bookings, week, now);
      const decision = evaluateBooking(rate, counts.confirmed, counts.reserved);
      if (!decision.allowed) {
        return { bookings, result: { accepted: false, reason: decision.reason, week } };
      }
      const next = [...bookings, proposed];
      return { bookings: next, result: { accepted: true, idempotent: false, week,
        hours: offerForRate(rate).hours, state: weekCounts(next, week, now) } };
    });
  }

  recordPayment({ id, paymentId, now }) {
    if (typeof paymentId !== "string" || !paymentId) throw new TypeError("Payment id is required");
    const current = parseInstant(now).getTime();
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { accepted: false, reason: "unknown_booking" } };
      if (record.paymentId) {
        return { bookings, result: record.paymentId === paymentId
          ? { accepted: ["paid_pending", "confirming", "confirmed"].includes(record.status),
            idempotent: true, status: record.status, refundPending: record.refundStatus === "pending" }
          : { accepted: false, reason: "payment_id_conflict" } };
      }
      if (!["held", "booking_failed"].includes(record.status)) {
        return { bookings, result: { accepted: false, reason: "invalid_state" } };
      }
      const expired = record.status === "booking_failed" || parseInstant(record.expiresAt).getTime() <= current;
      const next = bookings.map((item) => item.id === id ? {
        ...item, paymentId, status: expired ? "booking_failed" : "paid_pending",
        refundStatus: expired ? "pending" : "none", alertPending: expired,
        failureCode: expired ? "hold_expired_after_payment" : undefined,
      } : item);
      return { bookings: next, result: { accepted: !expired,
        status: expired ? "booking_failed" : "paid_pending", refundPending: expired } };
    });
  }

  beginConfirmation(id) {
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { accepted: false, reason: "unknown_booking" } };
      if (record.status === "confirming") {
        return { bookings, result: { accepted: true, idempotent: true } };
      }
      if (record.status !== "paid_pending") {
        return { bookings, result: { accepted: false, reason: "invalid_state" } };
      }
      const next = bookings.map((item) => item.id === id ? { ...item, status: "confirming" } : item);
      return { bookings: next, result: { accepted: true, idempotent: false } };
    });
  }

  confirmAppointment({ id, appointmentId }) {
    if (typeof appointmentId !== "string" || !appointmentId) {
      throw new TypeError("Appointment id is required");
    }
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { accepted: false, reason: "unknown_booking" } };
      if (record.status === "confirmed") {
        return { bookings, result: record.appointmentId === appointmentId
          ? { accepted: true, idempotent: true }
          : { accepted: false, reason: "appointment_id_conflict" } };
      }
      if (record.status !== "confirming" || !record.paymentId) {
        return { bookings, result: { accepted: false, reason: "invalid_state" } };
      }
      const next = bookings.map((item) => item.id === id ? {
        ...item, status: "confirmed", appointmentId, retryPending: false,
      } : item);
      return { bookings: next, result: { accepted: true, idempotent: false,
        week: londonWeekKey(record.startsAt), state: weekState(next, londonWeekKey(record.startsAt)) } };
    });
  }

  failBooking({ id, code }) {
    if (typeof code !== "string" || !/^[a-z0-9_]+$/.test(code)) {
      throw new TypeError("A non-sensitive failure code is required");
    }
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { changed: false, reason: "unknown_booking" } };
      if (record.status === "booking_failed") {
        return { bookings, result: { changed: false, reason: "already_failed" } };
      }
      if (!["held", "paid_pending", "confirming"].includes(record.status)) {
        return { bookings, result: { changed: false, reason: "invalid_state" } };
      }
      const next = bookings.map((item) => item.id === id ? {
        ...item, status: "booking_failed", failureCode: code,
        refundStatus: item.paymentId ? "pending" : "none", alertPending: true,
      } : item);
      return { bookings: next, result: { changed: true, bookingConfirmed: false,
        refundPending: Boolean(record.paymentId), alertPending: true } };
    });
  }

  requestCancellation({ id, now }) {
    const current = parseInstant(now).getTime();
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { changed: false, reason: "unknown_booking" } };
      if (["review_requested", "cancellation_pending", "canceled"].includes(record.status)) {
        return { bookings, result: { changed: false, idempotent: true, status: record.status,
          refundInitiated: record.refundStatus === "initiated" } };
      }
      if (record.status !== "confirmed" && record.status !== "active") {
        return { bookings, result: { changed: false, reason: "invalid_state" } };
      }
      const shortNotice = parseInstant(record.startsAt).getTime() - current < CANCELLATION_MS;
      const status = shortNotice ? "review_requested" : "cancellation_pending";
      const next = bookings.map((item) => item.id === id ? {
        ...item, status, requestedAt: now, providerCancelled: false,
        refundStatus: "none", alertPending: shortNotice,
      } : item);
      return { bookings: next, result: { changed: true, status,
        appointmentCanceled: false, refundInitiated: false, humanReview: shortNotice } };
    });
  }

  recordProviderCanceled({ id, providerCancellationId }) {
    if (typeof providerCancellationId !== "string" || !providerCancellationId) {
      throw new TypeError("Provider cancellation id is required");
    }
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record || record.status !== "cancellation_pending") {
        return { bookings, result: { changed: false, reason: "invalid_state" } };
      }
      if (record.providerCancelled) {
        return { bookings, result: record.providerCancellationId === providerCancellationId
          ? { changed: false, idempotent: true }
          : { changed: false, reason: "provider_cancellation_id_conflict" } };
      }
      const next = bookings.map((item) => item.id === id ? {
        ...item, providerCancelled: true, providerCancellationId,
        refundStatus: "pending", retryPending: false,
      } : item);
      return { bookings: next, result: { changed: true, refundPending: true,
        capacityReleased: true } };
    });
  }

  recordRefundInitiated({ id, refundId }) {
    if (typeof refundId !== "string" || !refundId) throw new TypeError("Refund id is required");
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (record && record.refundId) {
        return { bookings, result: { changed: false, idempotent: record.refundId === refundId,
          reason: record.refundId === refundId ? null : "refund_id_conflict" } };
      }
      if (!record || !record.paymentId || record.refundStatus !== "pending" ||
          !["booking_failed", "cancellation_pending", "canceled"].includes(record.status) ||
          (record.status === "cancellation_pending" && !record.providerCancelled)) {
        return { bookings, result: { changed: false, reason: "invalid_state" } };
      }
      const nextStatus = record.status === "cancellation_pending" ? "canceled" : record.status;
      const next = bookings.map((item) => item.id === id ? {
        ...item, status: nextStatus, refundStatus: "initiated", refundId,
        retryPending: false,
      } : item);
      return { bookings: next, result: { changed: true, status: nextStatus,
        refundInitiated: true } };
    });
  }

  recordActionFailure({ id, action, code }) {
    if (!["appointment_confirmation", "provider_cancellation", "refund"].includes(action) ||
        typeof code !== "string" || !/^[a-z0-9_]+$/.test(code)) {
      throw new TypeError("Action and non-sensitive failure code are required");
    }
    return this.store.transact((bookings) => {
      const record = bookings.find((item) => item.id === id);
      if (!record) return { bookings, result: { changed: false, reason: "unknown_booking" } };
      const canFail = action === "appointment_confirmation"
        ? record.status === "confirming"
        : action === "provider_cancellation"
          ? record.status === "cancellation_pending" && !record.providerCancelled
          : record.refundStatus === "pending" && Boolean(record.paymentId);
      if (!canFail) return { bookings, result: { changed: false, reason: "invalid_state" } };
      const next = bookings.map((item) => item.id === id ? {
        ...item, lastFailure: { action, code }, retryPending: true, alertPending: true,
        refundStatus: action === "refund" ? "pending" : item.refundStatus,
      } : item);
      return { bookings: next, result: { changed: true, pending: true, alertPending: true } };
    });
  }

  // Internal human-mediated move. A public Calendly reschedule URL must not call this.
  reschedule(id, newStartsAt, { now, busyByCalendar, openings = [] }) {
    if (typeof id !== "string" || !id) throw new TypeError("Booking id is required");
    const newWeek = londonWeekKey(newStartsAt);
    return this.store.transact((bookings) => {
      const current = bookings.find((item) => item.id === id);
      if (!current || !["confirmed", "active"].includes(current.status)) {
        return { bookings, result: { accepted: false, reason: "unknown_active_booking" } };
      }
      const oldWeek = londonWeekKey(current.startsAt);
      if (current.startsAt === newStartsAt) {
        return { bookings, result: { accepted: true, idempotent: true, oldWeek, newWeek } };
      }
      const slot = evaluateSlot({ startsAt: newStartsAt, rate: current.rate, now,
        bookings, busyByCalendar, openings, excludeId: id });
      if (!slot.available) {
        return { bookings, result: { accepted: false, reason: slot.reason, oldWeek, newWeek } };
      }
      if (oldWeek !== newWeek) {
        const without = bookings.filter((item) => item.id !== id);
        const counts = weekCounts(without, newWeek, now);
        const decision = evaluateBooking(current.rate, counts.confirmed, counts.reserved);
        if (!decision.allowed) {
          return { bookings, result: { accepted: false, reason: decision.reason, oldWeek, newWeek } };
        }
      }
      const next = bookings.map((item) => item.id === id ? { ...item, startsAt: newStartsAt } : item);
      return { bookings: next, result: { accepted: true, idempotent: false, oldWeek, newWeek,
        oldWeekState: weekState(next, oldWeek, now), newWeekState: weekState(next, newWeek, now) } };
    });
  }
}

module.exports = { BookingGate, CANCELLATION_MS, HOLD_MS };
