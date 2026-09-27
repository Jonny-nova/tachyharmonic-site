"use strict";

const { offerForRate, summarize } = require("./rules");

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});
const STATUSES = new Set([
  "active", "held", "paid_pending", "confirming", "confirmed",
  "booking_failed", "cancellation_pending", "canceled", "review_requested",
]);
const RESERVED = new Set(["held", "paid_pending", "confirming"]);

function parseInstant(value) {
  const match = typeof value === "string" && value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) throw new TypeError("Session start must be an ISO timestamp with a timezone");
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new TypeError("Session start is invalid");
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new TypeError("Session start is invalid");
  return instant;
}

function londonParts(value) {
  const parts = Object.fromEntries(londonFormatter.formatToParts(parseInstant(value))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday,
  };
}

function londonDateKey(value) {
  const p = londonParts(value);
  return [p.year, String(p.month).padStart(2, "0"), String(p.day).padStart(2, "0")].join("-");
}

function londonWeekKey(value) {
  const p = londonParts(value);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function assertWeekKey(weekKey) {
  const parts = typeof weekKey === "string" && weekKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const monday = parts && new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (!parts || monday.getUTCFullYear() !== Number(parts[1]) ||
      monday.getUTCMonth() !== Number(parts[2]) - 1 ||
      monday.getUTCDate() !== Number(parts[3]) || monday.getUTCDay() !== 1) {
    throw new TypeError("Week key must be a YYYY-MM-DD Monday");
  }
}

function assertBooking(booking) {
  if (!booking || typeof booking.id !== "string" || !booking.id) {
    throw new TypeError("Booking id is required");
  }
  offerForRate(booking.rate);
  if (!STATUSES.has(booking.status)) throw new TypeError("Booking status is invalid");
  londonWeekKey(booking.startsAt);
  if (booking.status === "held" && booking.expiresAt !== undefined) parseInstant(booking.expiresAt);
}

function isConfirmed(record) {
  return record.status === "active" || record.status === "confirmed" ||
    record.status === "review_requested" ||
    (record.status === "cancellation_pending" && !record.providerCancelled);
}

function isReserved(record, now) {
  if (!RESERVED.has(record.status)) return false;
  if (record.status === "held" && record.expiresAt &&
      parseInstant(record.expiresAt).getTime() <= parseInstant(now).getTime()) return false;
  return true;
}

function occupiesSlot(record, now) {
  return isConfirmed(record) || isReserved(record, now);
}

function weekCounts(bookings, weekKey, now = new Date().toISOString()) {
  assertWeekKey(weekKey);
  const confirmed = { low: 0, standard: 0, high: 0 };
  const reserved = { low: 0, standard: 0, high: 0 };
  const seen = new Set();
  for (const booking of bookings) {
    assertBooking(booking);
    if (seen.has(booking.id)) throw new Error("Duplicate booking id: " + booking.id);
    seen.add(booking.id);
    if (londonWeekKey(booking.startsAt) !== weekKey) continue;
    const target = isConfirmed(booking) ? confirmed : isReserved(booking, now) ? reserved : null;
    if (!target) continue;
    const offer = offerForRate(booking.rate);
    target.low += offer.low;
    target.standard += offer.standard;
    target.high += offer.high;
  }
  return { confirmed: summarize(confirmed), reserved: summarize(reserved) };
}

function weekState(bookings, weekKey, now) {
  return weekCounts(bookings, weekKey, now).confirmed;
}

module.exports = {
  assertBooking, isConfirmed, isReserved, londonDateKey, londonParts, londonWeekKey,
  occupiesSlot, parseInstant, weekCounts, weekState,
};
