"use strict";

const { summarize, RATES } = require("./rules");

const londonDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const validRates = new Set(Object.values(RATES));

function parseInstant(startsAt) {
  const match = typeof startsAt === "string" && startsAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) {
    throw new TypeError("Session start must be an ISO timestamp with a timezone");
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new TypeError("Session start is invalid");
  }
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) {
    throw new TypeError("Session start is invalid");
  }
  return instant;
}

function londonWeekKey(startsAt) {
  const parts = Object.fromEntries(
    londonDateFormatter.formatToParts(parseInstant(startsAt))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function assertBooking(booking) {
  if (!booking || typeof booking.id !== "string" || !booking.id) {
    throw new TypeError("Booking id is required");
  }
  if (!validRates.has(booking.rate)) {
    throw new TypeError("Booking rate must be 30, 50, or 70");
  }
  if (booking.status !== "active" && booking.status !== "canceled") {
    throw new TypeError("Booking status must be active or canceled");
  }
  londonWeekKey(booking.startsAt);
}

function weekState(bookings, weekKey) {
  const parts = typeof weekKey === "string" && weekKey.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );
  const monday = parts && new Date(Date.UTC(
    Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])
  ));
  if (
    !parts ||
    monday.getUTCFullYear() !== Number(parts[1]) ||
    monday.getUTCMonth() !== Number(parts[2]) - 1 ||
    monday.getUTCDate() !== Number(parts[3]) ||
    monday.getUTCDay() !== 1
  ) {
    throw new TypeError("Week key must be a YYYY-MM-DD Monday");
  }
  const counts = { low: 0, standard: 0, high: 0 };
  const seen = new Set();
  for (const booking of bookings) {
    assertBooking(booking);
    if (seen.has(booking.id)) {
      throw new Error("Duplicate booking id: " + booking.id);
    }
    seen.add(booking.id);
    if (booking.status !== "active" || londonWeekKey(booking.startsAt) !== weekKey) {
      continue;
    }
    if (booking.rate === RATES.supported) counts.low++;
    if (booking.rate === RATES.standard) counts.standard++;
    if (booking.rate === RATES.solidarity) counts.high++;
  }
  return summarize(counts);
}

module.exports = { assertBooking, londonWeekKey, parseInstant, weekState };
