"use strict";

// Counts are paid client hours, not appointments. A double has one identity and two units.
const CAPACITY = 10;
const RATES = Object.freeze({
  supported: 30,
  standard: 50,
  solidarity: 70,
  standardDouble: 100,
  solidarityDouble: 140,
});
const OFFERS = Object.freeze({
  30: Object.freeze({ rate: 30, durationMinutes: 60, hours: 1, low: 1, standard: 0, high: 0 }),
  50: Object.freeze({ rate: 50, durationMinutes: 60, hours: 1, low: 0, standard: 1, high: 0 }),
  70: Object.freeze({ rate: 70, durationMinutes: 60, hours: 1, low: 0, standard: 0, high: 1 }),
  100: Object.freeze({ rate: 100, durationMinutes: 120, hours: 2, low: 0, standard: 2, high: 0 }),
  140: Object.freeze({ rate: 140, durationMinutes: 120, hours: 2, low: 0, standard: 0, high: 2 }),
});

function offerForRate(rate) {
  const offer = OFFERS[rate];
  if (!offer || offer.rate !== rate) {
    throw new TypeError("Rate must be 30, 50, 70, 100, or 140");
  }
  return offer;
}

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
    low: counts.low,
    standard: counts.standard,
    high: counts.high,
    total,
    remaining: CAPACITY - total,
    supportedCeiling: Math.max(2, counts.high),
    deficit: Math.max(0, counts.low - counts.high),
    revenue: 30 * counts.low + 50 * counts.standard + 70 * counts.high,
  };
}

// Reserved holds consume hours. They cannot unlock a supported place or repair a
// confirmed supported deficit until the solidarity appointment is confirmed.
function evaluateBooking(rate, confirmedCounts, reservedCounts = { low: 0, standard: 0, high: 0 }) {
  const offer = offerForRate(rate);
  const before = summarize(confirmedCounts);
  const reserved = summarize(reservedCounts);
  const occupiedAfter = before.total + reserved.total + offer.hours;
  if (occupiedAfter > CAPACITY) {
    return { allowed: false, reason: "capacity", before };
  }

  const after = summarize({
    low: before.low + offer.low,
    standard: before.standard + offer.standard,
    high: before.high + offer.high,
  });
  if (offer.high) {
    return { allowed: true, reason: null, before, after };
  }
  const lowCommittedAfter = before.low + reserved.low + offer.low;
  if (offer.low && lowCommittedAfter > Math.max(2, before.high)) {
    return { allowed: false, reason: "supported_ceiling", before, after };
  }
  const remaining = CAPACITY - occupiedAfter;
  const deficit = Math.max(0, lowCommittedAfter - before.high);
  if (deficit > remaining) {
    return { allowed: false, reason: "repair_capacity", before, after };
  }
  return { allowed: true, reason: null, before, after };
}

function rateAvailability(confirmedCounts, reservedCounts) {
  return Object.fromEntries(
    Object.values(RATES).map((rate) => [rate, evaluateBooking(rate, confirmedCounts, reservedCounts)])
  );
}

module.exports = { CAPACITY, OFFERS, RATES, evaluateBooking, offerForRate, rateAvailability, summarize };
