"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { validateProbe, runProbe } = require("./staging-google-probe");
const URL = "https://tachyharmonic-booking-staging.tachyharmonic-site.workers.dev/api/admin/staging/google-probe";
const ENV = { STRIPE_MODE: "test", STAGING_PROVIDER_CHECKS: "true", SCHEDULER_PROVIDER: "google" };
const INPUT = { probeId: "d1166d32-01c2-4ace-99c2-c003e0af4442", startsAt: "2026-10-02T10:00:00Z", durationMinutes: 60 };
const NOW = Date.parse("2026-09-28T10:00:00Z");

test("probe requires exact staging host, explicit flag, test mode and fixed validated input", () => {
  const request = validateProbe(ENV, URL, INPUT, NOW);
  assert.equal(request.email, "mrbonello@gmail.com"); assert.equal(request.stagingProbe, true);
  assert.equal(request.bookingId, "staging-probe-" + INPUT.probeId);
  for (const env of [{ ...ENV, STAGING_PROVIDER_CHECKS: undefined }, { ...ENV, STRIPE_MODE: "live" }, { ...ENV, SCHEDULER_PROVIDER: "calendly" }]) assert.throws(() => validateProbe(env, URL, INPUT, NOW), /not_found/);
  assert.throws(() => validateProbe(ENV, "https://tachyharmonic.ai/api/admin/staging/google-probe", INPUT, NOW), /not_found/);
  for (const input of [{ ...INPUT, email: "other@example.test" }, { ...INPUT, durationMinutes: 30 }, { ...INPUT, probeId: "arbitrary" }, { ...INPUT, startsAt: "2026-09-28T11:00:00Z" }]) assert.throws(() => validateProbe(ENV, URL, input, NOW));
});

function fixture() {
  let active = false, creates = 0, cancellations = 0;
  const appointment = { appointmentId: "deterministic-test-id", meetingUrl: "https://meet.google.com/abc-defg-hij" };
  const adapters = {
    calendar: { getBusy: async () => ({ Primary: [], Work: [], Home: [] }) },
    scheduler: {
      createAppointment: async () => { creates++; active = true; return appointment; },
      findAppointment: async () => active ? { state: "found", ...appointment } : { state: "unknown", appointmentId: appointment.appointmentId },
      getAppointment: async () => active ? { status: "active", startsAt: INPUT.startsAt, endsAt: "2026-10-02T11:00:00Z" } : { status: "canceled", missing: true },
      cancelAppointment: async () => { cancellations++; active = false; return { cancellationId: "cancelled" }; },
    },
  };
  return { adapters, get creates() { return creates; }, get cancellations() { return cancellations; } };
}

test("probe confirms stable identity, canonical time and Meet then always deletes test event", async () => {
  const f = fixture(); const result = await runProbe(f.adapters, validateProbe(ENV, URL, INPUT, NOW));
  assert.equal(result.passed, true); assert.equal(result.cleanup, "verified"); assert.equal(result.attendeeMatches, true);
  assert.equal(f.creates, 2); assert.equal(f.cancellations, 1);
  assert.equal(JSON.stringify(result).includes("deterministic-test-id"), false);
  assert.equal(JSON.stringify(result).includes("meet.google.com"), false);
});

test("probe never creates over busy time and does not claim cleanup for uncertain missing writes", async () => {
  const f = fixture(); f.adapters.calendar.getBusy = async () => ({ Primary: [{ startsAt: INPUT.startsAt, endsAt: "2026-10-02T11:00:00Z" }], Work: [], Home: [] });
  const blocked = await runProbe(f.adapters, validateProbe(ENV, URL, INPUT, NOW));
  assert.equal(blocked.outcome, "calendar_conflict"); assert.equal(f.creates, 0);
  const g = fixture(); g.adapters.scheduler.createAppointment = async () => { throw new Error("SENSITIVE provider body"); };
  const unknown = await runProbe(g.adapters, validateProbe(ENV, URL, INPUT, NOW));
  assert.equal(unknown.cleanup, "unverified"); assert.equal(unknown.passed, false);
  assert.equal(JSON.stringify(unknown).includes("SENSITIVE"), false);
});

test("probe cleans a pending Meet event even if confirmation never succeeds", async () => {
  const f = fixture(), original = f.adapters.scheduler.createAppointment;
  f.adapters.scheduler.createAppointment = async request => { await original(request); throw new Error("conference_pending"); };
  f.adapters.scheduler.findAppointment = async () => ({ state: "pending", appointmentId: "deterministic-test-id" });
  const result = await runProbe(f.adapters, validateProbe(ENV, URL, INPUT, NOW), async () => {});
  assert.equal(result.passed, false); assert.equal(result.cleanup, "verified"); assert.equal(f.cancellations, 1);
});
