"use strict";

const { offerForRate } = require("./rules");
const { londonDateKey, londonParts, occupiesSlot, parseInstant } = require("./state");

const CALENDARS = Object.freeze(["Primary", "Work", "Home"]);
const PREPARATION_MS = 30 * 60_000;
const DECOMPRESSION_MS = 30 * 60_000;
const MIN_NOTICE_MS = 48 * 60 * 60_000;
const HORIZON_MS = 28 * 24 * 60 * 60_000;
const WINDOWS = Object.freeze({
  0: [[12 * 60, 14 * 60]],
  1: [[10 * 60, 16 * 60]],
  2: [[10 * 60, 20 * 60]],
  3: [[10 * 60, 14 * 60]],
  4: [[10 * 60, 20 * 60]],
  5: [[12 * 60, 20 * 60]],
  6: [[12 * 60, 14 * 60]],
});

function minutes(value) {
  const match = typeof value === "string" && value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new TypeError("Opening times must be HH:mm");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function appointmentWindow(start, end, openings) {
  const localStart = londonParts(new Date(start).toISOString());
  const localEnd = londonParts(new Date(end).toISOString());
  const date = londonDateKey(new Date(start).toISOString());
  if (date !== londonDateKey(new Date(end).toISOString())) return false;
  const weekday = new Date(Date.UTC(localStart.year, localStart.month - 1, localStart.day)).getUTCDay();
  const intervals = [...WINDOWS[weekday]];
  for (const opening of openings) {
    if (!opening || typeof opening.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(opening.date)) {
      throw new TypeError("Opening date must be YYYY-MM-DD");
    }
    const from = minutes(opening.start);
    const to = minutes(opening.end);
    if (to <= from) throw new TypeError("Opening end must be after start");
    if (opening.date === date) intervals.push([from, to]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const from = localStart.hour * 60 + localStart.minute + localStart.second / 60 + (start % 1000) / 60000;
  const to = localEnd.hour * 60 + localEnd.minute + localEnd.second / 60 + (end % 1000) / 60000;
  return merged.some(([windowStart, windowEnd]) => from >= windowStart && to <= windowEnd);
}

function evaluateSlot({ startsAt, rate, now, bookings = [], busyByCalendar, openings = [], excludeId }) {
  const offer = offerForRate(rate);
  const start = parseInstant(startsAt).getTime();
  const current = parseInstant(now).getTime();
  const end = start + offer.durationMinutes * 60_000;
  if (start - current < MIN_NOTICE_MS) return { available: false, reason: "minimum_notice" };
  if (start - current > HORIZON_MS) return { available: false, reason: "booking_horizon" };
  if (!appointmentWindow(start, end, openings)) return { available: false, reason: "outside_window" };

  if (!busyByCalendar || CALENDARS.some((name) => !Array.isArray(busyByCalendar[name]))) {
    throw new TypeError("Fresh busy intervals for Primary, Work, and Home are required");
  }
  const protectedStart = start - PREPARATION_MS;
  const protectedEnd = end + DECOMPRESSION_MS;
  for (const name of CALENDARS) {
    for (const event of busyByCalendar[name]) {
      const busyStart = parseInstant(event.startsAt).getTime();
      const busyEnd = parseInstant(event.endsAt).getTime();
      if (busyEnd <= busyStart) throw new TypeError("Busy interval end must follow start");
      if (overlaps(protectedStart, protectedEnd, busyStart, busyEnd)) {
        return { available: false, reason: "calendar_busy", calendar: name };
      }
    }
  }

  const date = londonDateKey(startsAt);
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  for (const booking of bookings) {
    if (booking.id === excludeId || !occupiesSlot(booking, now)) continue;
    const bookingStart = parseInstant(booking.startsAt).getTime();
    const bookingEnd = bookingStart + offerForRate(booking.rate).durationMinutes * 60_000;
    if ((day === 0 || day === 6) && londonDateKey(booking.startsAt) === date) {
      return { available: false, reason: "weekend_one_appointment" };
    }
    if (overlaps(protectedStart, protectedEnd,
      bookingStart - PREPARATION_MS, bookingEnd + DECOMPRESSION_MS)) {
      return { available: false, reason: "client_buffer" };
    }
  }
  return { available: true, reason: null, startsAt, endsAt: new Date(end).toISOString() };
}

// Live callers must supply both adapters. Missing/failed calendar reads never become empty availability.
async function providerSlot({ calendar, scheduler, ...request }) {
  if (!calendar || typeof calendar.getBusy !== "function" ||
      !scheduler || typeof scheduler.isAvailable !== "function") {
    throw new TypeError("Calendar and scheduler adapters are required");
  }
  const offer = offerForRate(request.rate);
  const start = parseInstant(request.startsAt).getTime();
  const interval = {
    startsAt: new Date(start - PREPARATION_MS).toISOString(),
    endsAt: new Date(start + offer.durationMinutes * 60_000 + DECOMPRESSION_MS).toISOString(),
    calendars: CALENDARS,
  };
  const busyByCalendar = await calendar.getBusy(interval);
  const local = evaluateSlot({ ...request, busyByCalendar });
  if (!local.available) return local;
  const remoteAvailable = await scheduler.isAvailable({ startsAt: request.startsAt, durationMinutes: offer.durationMinutes });
  return remoteAvailable === true ? local : { available: false, reason: "scheduler_unavailable" };
}

module.exports = {
  CALENDARS, DECOMPRESSION_MS, HORIZON_MS, MIN_NOTICE_MS, PREPARATION_MS,
  WINDOWS, evaluateSlot, providerSlot,
};
