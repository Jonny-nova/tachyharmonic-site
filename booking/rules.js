"use strict";

const CAPACITY = 10;
const RATES = Object.freeze({
  supported: 30,
  standard: 50,
  solidarity: 70,
});
const VALID_RATES = new Set(Object.values(RATES));

function assertCounts(counts) {
  if (!counts || typeof counts !== "object") {
    throw new TypeError("Booking counts are required");
  }
  for (const key of ["low", "standard", "high"]) {
    if (!Number.isInteger(counts[key]) || counts[key] < 0) {
      throw new TypeError(key + " must be a non-negative integer");
    }
  }
}

function summarize(counts) {
  assertCounts(counts);
  const total = counts.low + counts.standard + counts.high;
  return {
    ...counts,
    total,
    remaining: CAPACITY - total,
    supportedCeiling: Math.max(2, counts.high),
    deficit: Math.max(0, counts.low - counts.high),
    revenue: 30 * counts.low + 50 * counts.standard + 70 * counts.high,
  };
}

function evaluateBooking(rate, counts) {
  if (!VALID_RATES.has(rate)) {
    throw new TypeError("Rate must be 30, 50, or 70");
  }
  const before = summarize(counts);
  if (before.total >= CAPACITY) {
    return { allowed: false, reason: "capacity", before };
  }

  const next = {
    low: counts.low + (rate === RATES.supported ? 1 : 0),
    standard: counts.standard + (rate === RATES.standard ? 1 : 0),
    high: counts.high + (rate === RATES.solidarity ? 1 : 0),
  };
  const after = summarize(next);

  // Solidarity bookings can repair a deficit after a cancellation.
  if (rate === RATES.solidarity) {
    return { allowed: true, reason: null, before, after };
  }
  if (rate === RATES.supported && after.low > after.supportedCeiling) {
    return { allowed: false, reason: "supported_ceiling", before, after };
  }
  if (after.deficit > after.remaining) {
    return { allowed: false, reason: "repair_capacity", before, after };
  }
  return { allowed: true, reason: null, before, after };
}

function rateAvailability(counts) {
  return Object.fromEntries(
    Object.values(RATES).map((rate) => [rate, evaluateBooking(rate, counts)])
  );
}

module.exports = {
  CAPACITY,
  RATES,
  evaluateBooking,
  rateAvailability,
  summarize,
};
