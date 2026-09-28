"use strict";

const HOST = "tachyharmonic-booking-staging.tachyharmonic-site.workers.dev";
const ATTENDEE = "mrbonello@gmail.com";
const error = (code, status) => Object.assign(new Error(code), { code, status });

function validateProbe(env, url, input, now = Date.now()) {
  if (new URL(url).hostname !== HOST || env.STRIPE_MODE !== "test" || env.STAGING_PROVIDER_CHECKS !== "true" || env.SCHEDULER_PROVIDER !== "google") throw error("not_found", 404);
  if (!input || Object.keys(input).some(k => !["probeId", "startsAt", "durationMinutes"].includes(k)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.probeId || "") || ![60, 120].includes(input.durationMinutes) || typeof input.startsAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.startsAt)) throw error("invalid_probe", 400);
  const start = Date.parse(input.startsAt);
  if (!Number.isFinite(start) || start < now + 48 * 3600000 || start > now + 28 * 86400000) throw error("invalid_probe_time", 400);
  return { bookingId: `staging-probe-${input.probeId.toLowerCase()}`, startsAt: new Date(start).toISOString(), durationMinutes: input.durationMinutes,
    email: ATTENDEE, name: "STAGING TEST — Jonathan", stagingProbe: true };
}

async function runProbe(adapters, request, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const start = Date.parse(request.startsAt), endsAt = new Date(start + request.durationMinutes * 60000).toISOString();
  const evidence = { startsAt: request.startsAt, endsAt, durationMinutes: request.durationMinutes, calendarsChecked: false,
    attendeeMatches: false, meetCreated: false, sameEvent: false, canonicalTimesMatch: false, cleanup: "not_needed", passed: false };
  let attempted = false, appointmentId, definitelyNotCreated = false;
  try {
    const busy = await adapters.calendar.getBusy({ startsAt: new Date(start - 30 * 60000).toISOString(), endsAt: new Date(Date.parse(endsAt) + 30 * 60000).toISOString() });
    if (!["Primary", "Work", "Home"].every(key => Array.isArray(busy[key]))) throw error("calendar_unverified", 503);
    evidence.calendarsChecked = true;
    if (Object.values(busy).some(intervals => intervals.length)) { evidence.outcome = "calendar_conflict"; return evidence; }
    attempted = true;
    let first;
    try { first = await adapters.scheduler.createAppointment(request); }
    catch (failure) {
      definitelyNotCreated = failure.notDispatched === true || failure.definitive === true;
      if (definitelyNotCreated) throw failure;
      // Meet provisioning is asynchronous. Canonical identity checks remain in
      // the scheduler; an absent or unknown event never permits another write.
      for (let attempt = 0; attempt < 5; attempt++) {
        const found = await adapters.scheduler.findAppointment(request);
        appointmentId = found.appointmentId;
        if (found.state === "found") { first = found; break; }
        if (found.state !== "pending") break;
        await wait(1000);
      }
      if (!first) throw error("appointment_unverified", 503);
    }
    appointmentId = first.appointmentId;
    const repeated = await adapters.scheduler.createAppointment(request);
    evidence.sameEvent = !!appointmentId && repeated.appointmentId === appointmentId;
    evidence.meetCreated = /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(first.meetingUrl || "") && repeated.meetingUrl === first.meetingUrl;
    const canonical = await adapters.scheduler.getAppointment({ appointmentId });
    evidence.canonicalTimesMatch = canonical.status === "active" && Date.parse(canonical.startsAt) === start && Date.parse(canonical.endsAt) === Date.parse(endsAt);
    // Both create calls perform canonical attendee/correlation verification.
    evidence.attendeeMatches = evidence.sameEvent;
    evidence.outcome = evidence.sameEvent && evidence.meetCreated && evidence.canonicalTimesMatch ? "verified" : "appointment_unverified";
  } catch (failure) {
    evidence.outcome = "provider_verification_failed";
    evidence.errorCode = typeof failure.code === "string" && /^[a-z0-9_]{1,80}$/.test(failure.code) ? failure.code : "provider_unavailable";
  } finally {
    if (attempted && !definitelyNotCreated) {
      evidence.cleanup = "unverified";
      try {
        if (!appointmentId) appointmentId = (await adapters.scheduler.findAppointment(request)).appointmentId;
        if (appointmentId) {
          const before = await adapters.scheduler.getAppointment({ appointmentId });
          // Missing after an uncertain write cannot establish safe cleanup.
          if (before.status === "active") {
            await adapters.scheduler.cancelAppointment({ appointmentId, expectedStartsAt: request.startsAt, expectedEndsAt: endsAt });
            const after = await adapters.scheduler.getAppointment({ appointmentId });
            if (after.status === "canceled") evidence.cleanup = "verified";
          }
        }
      } catch { /* Keep the response explicitly unresolved for operator action. */ }
    }
  }
  evidence.passed = evidence.outcome === "verified" && evidence.cleanup === "verified";
  return evidence;
}

module.exports = { validateProbe, runProbe };
