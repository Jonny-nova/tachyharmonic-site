"use strict";

const { BookingGate, HOLD_MS } = require("../booking/gate");
const { evaluateSlot, CALENDARS, PREPARATION_MS, DECOMPRESSION_MS } = require("../booking/availability");
const { offerForRate, evaluateBooking } = require("../booking/rules");
const { parseInstant, londonWeekKey, weekCounts } = require("../booking/state");
const { VERSION, WORDING, cancellationEndsAt, requiresEarlyStart } = require("../booking/consent");
const { createContractTerms, assertContractTerms } = require("../booking/contract-terms");
const DAY = 86400000;
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), x => x.toString(16).padStart(2, "0")).join("");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const equalHash = (a, b) => { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; };
const noticeKinds = { confirmed: "booking_confirmed", failure: "booking_failed", review: "manual_review_received", refund: "refund_initiated", alert: "operational_alert", pending: "cancellation_refund_pending", canceled: "cancellation_confirmed" };
const enqueue = (state, id, kind, now) => {
  const record = state.bookings.find(x => x.id === id);
  const episode = ["notice_alert", "notice_pending"].includes(kind) ? `:${record.status}:${record.refundStatus || "none"}:${record.lastFailureAction || "none"}` : kind === "notice_refund" ? `:${record.refundRecoveryCount || 0}` : kind === "cancel" ? `:${record.cancellationGeneration || 0}` : "";
  const key = `${id}:${kind}${episode}`;
  if (!state.jobs[key]) {
    const snapshot = kind.startsWith("notice_") ? { bookingId: id, kind: noticeKinds[kind.slice(7)], idempotencyKey: key,
      email: state.private[id].email, startsAt: record.startsAt, durationMinutes: offerForRate(record.rate).durationMinutes, amount: record.rate * 100, status: record.status } : undefined;
    state.jobs[key] = { key, id, kind, attempts: 0, due: now, status: "pending", snapshot };
  }
};

class BookingService {
  constructor(store, adapters, { now = () => new Date().toISOString(), openings = [], consentVersion = VERSION, consentText = WORDING, traderAddress, managementSecret, managementBaseUrl, enabled = false } = {}) {
    this.store = store; this.adapters = adapters; this.now = now; this.openings = openings;
    this.consentVersion = consentVersion; this.consentText = consentText; this.enabled = enabled; this.gate = new BookingGate(store);
    this.managementSecret = managementSecret; this.managementBaseUrl = managementBaseUrl;
    this.traderAddress = traderAddress;
  }
  contractTerms() {
    try { return createContractTerms({ traderAddress: this.traderAddress }); }
    catch { throw fail("trader_address_required", 503); }
  }
  record(id) { return this.store.read().bookings.find(x => x.id === id); }
  publicRecord(record) {
    const offer = offerForRate(record.rate);
    return { id: record.id, startsAt: record.startsAt, endsAt: new Date(Date.parse(record.startsAt) + offer.durationMinutes * 60000).toISOString(),
      rate: record.rate, amount: record.rate * 100, currency: "gbp", durationMinutes: offer.durationMinutes,
      status: record.status, expiresAt: record.expiresAt, refundStatus: record.refundStatus || "none", retryPending: !!record.retryPending,
      providerCancelled: !!record.providerCancelled, externalChangePending: !!record.externalChangePending, failureCode: record.failureCode || null,
      ...(["confirmed", "review_requested"].includes(record.status) && !record.externalChangePending && record.meetingUrl ? { meetingUrl: record.meetingUrl } : {}) };
  }
  async authorize(id, token) {
    if (!tokenPattern.test(token || "")) throw fail("unauthorized", 401);
    const digest = await hash(token);
    const secret = this.store.read().private[id];
    const record = this.record(id);
    if (!secret || secret.revoked || Date.parse(this.now()) > Date.parse(record.startsAt) + 30 * DAY) throw fail("unauthorized", 401);
    if (!equalHash(secret.tokenHash, digest)) {
      if (!this.managementSecret || !equalHash(await hash(await this.emailToken(id)), digest)) throw fail("unauthorized", 401);
    }
    return record;
  }
  async emailToken(id) {
    if (typeof this.managementSecret !== "string" || this.managementSecret.length < 32) throw fail("management_secret_required", 503);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(this.managementSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`booking-management:v1:${id}`)));
    return btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async managementUrl(id) {
    if (!this.managementBaseUrl) throw fail("management_url_required", 503);
    const url = new URL(this.managementBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw fail("management_url_invalid", 503);
    url.hash = new URLSearchParams({ booking: id, token: await this.emailToken(id) }).toString();
    return url.href;
  }
  async checkSlot(startsAt, rate, excludeId) {
    const offer = offerForRate(rate), start = parseInstant(startsAt).getTime();
    const busyByCalendar = await this.adapters.calendar.getBusy({ calendars: CALENDARS,
      startsAt: new Date(start - PREPARATION_MS).toISOString(),
      endsAt: new Date(start + offer.durationMinutes * 60000 + DECOMPRESSION_MS).toISOString() });
    const now = this.now(), bookings = this.store.read().bookings;
    const slot = evaluateSlot({ startsAt, rate, now, bookings, excludeId, busyByCalendar, openings: this.openings });
    if (!slot.available) return { ...slot, busyByCalendar };
    if (await this.adapters.scheduler.isAvailable({ startsAt, durationMinutes: offer.durationMinutes }) !== true) return { available: false, reason: "scheduler_unavailable", busyByCalendar };
    const counts = weekCounts(bookings.filter(x => x.id !== excludeId), londonWeekKey(startsAt), now);
    const decision = evaluateBooking(rate, counts.confirmed, counts.reserved);
    return { ...slot, available: decision.allowed, reason: decision.reason, busyByCalendar };
  }
  async availability({ startsAt, from, to, rate }) {
    if (!this.enabled) throw fail("booking_unavailable", 503);
    this.contractTerms();
    offerForRate(rate);
    if (startsAt) { const { busyByCalendar, ...slot } = await this.checkSlot(startsAt, rate); return slot; }
    const start = parseInstant(from).getTime(), end = parseInstant(to).getTime();
    if (end <= start || end - start > 7 * DAY) throw fail("range_must_be_one_week_or_less");
    const candidates = await this.adapters.scheduler.listAvailable({ from, to, durationMinutes: offerForRate(rate).durationMinutes });
    if (!Array.isArray(candidates) || candidates.length > 500) throw fail("invalid_provider_availability", 503);
    const busyByCalendar = await this.adapters.calendar.getBusy({ calendars: CALENDARS,
      startsAt: new Date(start - PREPARATION_MS).toISOString(),
      endsAt: new Date(end + offerForRate(rate).durationMinutes * 60000 + DECOMPRESSION_MS).toISOString() });
    const slots = [], bookings = this.store.read().bookings, now = this.now();
    for (const candidate of candidates) {
      if (Date.parse(candidate.startsAt) < start || Date.parse(candidate.startsAt) >= end) continue;
      const slot = evaluateSlot({ startsAt: candidate.startsAt, rate, now, bookings, busyByCalendar, openings: this.openings });
      const counts = weekCounts(bookings, londonWeekKey(candidate.startsAt), now);
      if (slot.available && evaluateBooking(rate, counts.confirmed, counts.reserved).allowed && !slots.some(x => x.startsAt === slot.startsAt)) slots.push(slot);
    }
    return { slots, rate };
  }
  async hold(input, key) {
    if (!this.enabled) throw fail("booking_unavailable", 503);
    const allowed = new Set(["startsAt", "rate", "name", "email", "note", "earlyStart", "consentVersion", "managementToken"]);
    if (!input || Object.keys(input).some(k => !allowed.has(k))) throw fail("invalid_fields");
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key || "")) throw fail("idempotency_key_required");
    if (!tokenPattern.test(input.managementToken || "")) throw fail("invalid_management_token");
    offerForRate(input.rate); const start = parseInstant(input.startsAt).getTime();
    if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 120 || /[\r\n\x00-\x1f]/.test(input.name)) throw fail("invalid_name");
    if (typeof input.email !== "string" || input.email.length > 254 || !/^[^\s<>@\x00-\x1f]+@[^\s<>@\x00-\x1f]+\.[^\s<>@\x00-\x1f]+$/.test(input.email)) throw fail("invalid_email");
    if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1200)) throw fail("invalid_note");
    if (typeof input.earlyStart !== "boolean" || input.consentVersion !== this.consentVersion) throw fail("consent_version_required");
    const fingerprint = await hash(JSON.stringify(input)), tokenHash = await hash(input.managementToken), keyHash = await hash(key);
    const old = this.store.read().idempotency[keyHash];
    if (old) { if (old.fingerprint !== fingerprint) throw fail("idempotency_conflict", 409); return this.publicRecord(this.record(old.id)); }
    const contractTerms = this.contractTerms();
    if (!input.earlyStart && requiresEarlyStart(new Date(start - PREPARATION_MS).toISOString(), this.now())) throw fail("early_start_or_later_appointment_required");
    const slot = await this.checkSlot(input.startsAt, input.rate);
    if (!slot.available) throw fail(slot.reason, 409);
    const id = crypto.randomUUID(), now = this.now(), expiresAt = new Date(Date.parse(now) + HOLD_MS).toISOString();
    // Gate, private data, and idempotency entry commit in a single transaction.
    return this.store.mutate(state => {
      const concurrent = state.idempotency[keyHash];
      if (concurrent) { if (concurrent.fingerprint !== fingerprint) throw fail("idempotency_conflict", 409); return this.publicRecord(state.bookings.find(x => x.id === concurrent.id)); }
      const gate = new BookingGate({ transact: callback => { const result = callback(state.bookings); state.bookings = result.bookings; return result.result; } });
      const result = gate.hold({ id, startsAt: new Date(start).toISOString(), rate: input.rate, now, expiresAt, busyByCalendar: slot.busyByCalendar, openings: this.openings });
      if (!result.accepted) throw fail(result.reason, 409);
      state.private[id] = { tokenHash, name: input.name.trim(), email: input.email, note: input.note || "", contractAt: null, contractTerms,
        consent: { version: input.consentVersion, wording: this.consentText, earlyStart: input.earlyStart, at: now }, noteDeleteAt: expiresAt };
      state.idempotency[keyHash] = { id, fingerprint };
      this.store.audit(id, "hold_created", now);
      return this.publicRecord(state.bookings.find(x => x.id === id));
    });
  }
  async checkout(id, token) {
    if (!this.enabled) throw fail("booking_unavailable", 503);
    const record = await this.authorize(id, token);
    this.contractTerms();
    try { assertContractTerms(this.store.read().private[id].contractTerms); }
    catch { throw fail("contract_terms_snapshot_required", 503); }
    if (record.status !== "held" || Date.parse(record.expiresAt) <= Date.parse(this.now())) throw fail("hold_expired", 409);
    if (record.checkoutUrl) return { checkoutUrl: record.checkoutUrl, status: record.status };
    const privateRecord = this.store.read().private[id];
    const checkoutExpiresAt = record.checkoutExpiresAt || new Date(Date.parse(this.now()) + 31 * 60000).toISOString();
    this.store.mutate(state => { const current = state.bookings.find(x => x.id === id); current.checkoutExpiresAt = checkoutExpiresAt; current.checkoutAttemptedAt ||= this.now(); });
    const checkout = await this.adapters.payments.createCheckout({ bookingId: id, amount: record.rate * 100, currency: "gbp", email: privateRecord.email,
      idempotencyKey: `${id}:checkout`, expiresAt: checkoutExpiresAt });
    if (!checkout.checkoutId || !/^https:\/\/checkout\.stripe\.com\//.test(checkout.checkoutUrl || "")) throw fail("invalid_checkout_response", 503);
    this.store.mutate(state => { const current = state.bookings.find(x => x.id === id); Object.assign(current, checkout); });
    return { checkoutUrl: checkout.checkoutUrl, status: this.record(id).status };
  }
  payment(event) {
    const record = this.record(event.bookingId);
    if (!record || event.amount !== record.rate * 100 || event.currency !== "gbp" || typeof event.paymentId !== "string" || typeof event.eventId !== "string") throw fail("payment_mismatch", 409);
    const now = this.now();
    return this.store.mutate(state => {
      if (state.events[event.eventId]) return { received: true, duplicate: true };
      const gate = new BookingGate({ transact: cb => { const output = cb(state.bookings); state.bookings = output.bookings; return output.result; } });
      const result = gate.recordPayment({ id: record.id, paymentId: event.paymentId, now });
      if (result.reason) throw fail(result.reason, 409);
      state.events[event.eventId] = now;
      if (!result.idempotent) this.store.audit(record.id, "payment_verified", now);
      const current = state.bookings.find(x => x.id === record.id);
      const paidAt = event.paidAt ? parseInstant(event.paidAt).toISOString() : now;
      state.private[record.id].paidAt ||= paidAt;
      state.private[record.id].paymentVerifiedAt = now;
      if (!record.paymentId && !state.private[record.id].consent.earlyStart && requiresEarlyStart(new Date(Date.parse(record.startsAt) - PREPARATION_MS).toISOString(), now)) {
        current.status = "booking_failed"; current.failureCode = "early_start_not_requested"; current.refundStatus = "pending"; current.alertPending = true;
      }
      state.private[record.id].noteDeleteAt = new Date(Date.parse(record.startsAt) + 30 * DAY).toISOString();
      enqueue(state, record.id, current.refundStatus === "pending" ? "refund" : "confirm", now);
      if (current.status === "booking_failed") { state.private[record.id].note = ""; enqueue(state, record.id, "notice_failure", now); }
      return { received: true };
    });
  }
  async cancel(id, token) {
    await this.authorize(id, token);
    const result = this.gate.requestCancellation({ id, now: this.now() });
    if (result.reason) throw fail(result.reason, 409);
    this.repairJobs();
    return this.publicRecord(this.record(id));
  }
  async resolve(id, input) {
    if (!input || Object.keys(input).some(key => !["action", "reasonCode"].includes(key)) || !["retain", "cancel"].includes(input.action) || !/^[a-z0-9_]{3,80}$/.test(input.reasonCode || "")) throw fail("invalid_resolution");
    const record = this.record(id);
    if (!record || !["confirmed", "review_requested"].includes(record.status)) throw fail("resolution_state_conflict", 409);
    const canonical = await this.adapters.scheduler.getAppointment({ appointmentId: record.appointmentId });
    if (!["active", "canceled"].includes(canonical.status)) throw fail("provider_state_unknown", 409);
    const sameTime = Date.parse(canonical.startsAt) === Date.parse(record.startsAt) && Date.parse(canonical.endsAt) === Date.parse(record.startsAt) + offerForRate(record.rate).durationMinutes * 60000;
    if (canonical.status === "active" && !sameTime) throw fail("external_time_change_requires_investigation", 409);
    if (input.action === "retain" && canonical.status !== "active") throw fail("cannot_retain_canceled_provider_appointment", 409);
    const now = this.now();
    this.store.mutate(state => {
      const current = state.bookings.find(x => x.id === id), secret = state.private[id];
      secret.resolutions ||= [];
      secret.resolutions.push({ action: input.action, reasonCode: input.reasonCode, at: now, providerStatus: canonical.status });
      current.externalChangePending = false; current.alertPending = false; current.retryPending = false;
      if (input.action === "retain") current.status = "confirmed";
      else {
        current.cancellationGeneration = (current.cancellationGeneration || 0) + 1;
        current.status = "cancellation_pending"; current.requestedAt = now;
        current.providerCancelled = canonical.status === "canceled";
        current.refundStatus = current.providerCancelled ? "pending" : "none";
        if (current.providerCancelled) current.providerCancellationId = current.appointmentId;
      }
      this.store.audit(id, `human_resolution_${input.action}`, now);
    });
    this.repairJobs();
    return this.publicRecord(this.record(id));
  }
  repairJobs() {
    const now = this.now();
    this.store.mutate(state => {
      for (const record of state.bookings) {
        const secret = state.private[record.id];
        if (record.status === "held" && Date.parse(record.expiresAt) <= Date.parse(now)) {
          record.status = "booking_failed"; record.failureCode = "hold_expired";
          if (record.checkoutId) enqueue(state, record.id, "expire", now);
        }
        if (secret && (record.status === "booking_failed" || Date.parse(secret.noteDeleteAt) <= Date.parse(now))) secret.note = "";
        if (record.status === "booking_failed" && record.checkoutId && !record.paymentId && !record.checkoutTerminal) enqueue(state, record.id, "expire", now);
        if (["paid_pending", "confirming"].includes(record.status)) enqueue(state, record.id, "confirm", now);
        if (record.status === "cancellation_pending" && !record.providerCancelled) enqueue(state, record.id, "cancel", now);
        if (record.refundStatus === "pending") enqueue(state, record.id, "refund", now);
        if (record.status === "review_requested") enqueue(state, record.id, "notice_review", now);
        if (record.status === "cancellation_pending") enqueue(state, record.id, record.providerCancelled ? "notice_canceled" : "notice_pending", now);
        if (record.status === "confirmed") enqueue(state, record.id, "notice_confirmed", now);
        if (record.status === "booking_failed" && record.paymentId) enqueue(state, record.id, "notice_failure", now);
        if (record.refundStatus === "initiated") enqueue(state, record.id, "notice_refund", now);
        if (record.alertPending) enqueue(state, record.id, "notice_alert", now);
      }
      for (const [key, limit] of Object.entries(state.limits)) if (limit.until < Date.parse(now)) delete state.limits[key];
    });
  }
  async runJob(job) {
    const r = this.record(job.id), secret = this.store.read().private[job.id], offer = offerForRate(r.rate);
    const request = { bookingId: r.id, startsAt: r.startsAt, durationMinutes: offer.durationMinutes, name: secret.name, email: secret.email, idempotencyKey: job.key };
    if (job.kind === "confirm") {
      if (!["paid_pending", "confirming"].includes(r.status)) return;
      this.gate.beginConfirmation(r.id);
      // Once an attempt might have reached Calendly, never repeat creation until
      // its identity has been reconciled. A provider unable to prove absence must
      // return unknown, retain capacity and alert the human.
      if (r.creationAttempted) {
        const found = await this.adapters.scheduler.findAppointment(request);
        if (found.state === "found") { this.completeConfirmation(r.id, found.appointmentId, found.meetingUrl); return; }
        if (found.state === "conference_failed") { this.queueFailedMeeting(r.id, found.appointmentId); return; }
        if (found.state !== "absent") throw fail("confirmation_unknown", 503);
      }
      const slot = await this.checkSlot(r.startsAt, r.rate, r.id);
      if (!slot.available) { this.gate.failBooking({ id: r.id, code: "slot_unavailable_after_payment" }); return; }
      if (!secret.consent.earlyStart && requiresEarlyStart(new Date(Date.parse(r.startsAt) - PREPARATION_MS).toISOString(), this.now())) {
        this.gate.failBooking({ id: r.id, code: "early_start_not_requested" }); return;
      }
      this.store.mutate(state => { state.bookings.find(x => x.id === r.id).creationAttempted = true; });
      try {
        const appointment = await this.adapters.scheduler.createAppointment(request);
        if (appointment.state === "conference_failed") { this.queueFailedMeeting(r.id, appointment.appointmentId); return; }
        this.completeConfirmation(r.id, appointment.appointmentId, appointment.meetingUrl);
      } catch (error) {
        if (error.notDispatched === true) this.store.mutate(state => { state.bookings.find(x => x.id === r.id).creationAttempted = false; });
        if (error.definitive === true) { this.gate.failBooking({ id: r.id, code: "provider_rejected" }); return; }
        throw error;
      }
    } else if (job.kind === "cancel_failed_confirmation") {
      if (r.status !== "confirming" || !r.appointmentId) return;
      const current = await this.adapters.scheduler.getAppointment({ appointmentId: r.appointmentId });
      if (!["active", "canceled"].includes(current.status)) throw fail("cancellation_unknown", 503);
      if (current.status === "active") {
        if (Date.parse(current.startsAt) !== Date.parse(r.startsAt) || Date.parse(current.endsAt) !== Date.parse(r.startsAt) + offer.durationMinutes * 60000) throw fail("external_time_change_requires_investigation", 409);
        await this.adapters.scheduler.cancelAppointment({ appointmentId: r.appointmentId, idempotencyKey: job.key,
          expectedStartsAt: r.startsAt, expectedEndsAt: new Date(Date.parse(r.startsAt) + offer.durationMinutes * 60000).toISOString() });
      }
      this.gate.failBooking({ id: r.id, code: "meeting_creation_failed" });
    } else if (job.kind === "cancel") {
      if (r.providerCancelled || r.status !== "cancellation_pending") return;
      const current = await this.adapters.scheduler.getAppointment({ appointmentId: r.appointmentId });
      if (!["active", "canceled"].includes(current.status)) throw fail("cancellation_unknown", 503);
      if (current.status === "active" && (Date.parse(current.startsAt) !== Date.parse(r.startsAt) || Date.parse(current.endsAt) !== Date.parse(r.startsAt) + offer.durationMinutes * 60000)) {
        this.store.mutate(state => { const record = state.bookings.find(x => x.id === r.id); record.status = "review_requested"; record.externalChangePending = true; record.alertPending = true; });
        return;
      }
      const result = current.status === "canceled" ? { cancellationId: r.appointmentId } : await this.adapters.scheduler.cancelAppointment({ appointmentId: r.appointmentId, idempotencyKey: job.key,
        expectedStartsAt: r.startsAt, expectedEndsAt: new Date(Date.parse(r.startsAt) + offer.durationMinutes * 60000).toISOString() });
      this.gate.recordProviderCanceled({ id: r.id, providerCancellationId: result.cancellationId });
    } else if (job.kind === "refund") {
      if (r.refundStatus !== "pending") return;
      if (Date.parse(this.now()) - Date.parse(job.firstAttemptAt) > 23 * 3600000) {
        const found = await this.adapters.payments.getRefund({ paymentId: r.paymentId, bookingId: r.id, amount: r.rate * 100 });
        if (found.state !== "found" || ["failed", "canceled"].includes(found.status)) throw fail("refund_manual_reconciliation_required", 503);
        this.recordRefundResult(r.id, found); return;
      }
      const result = await this.adapters.payments.refund({ bookingId: r.id, paymentId: r.paymentId, amount: r.rate * 100, idempotencyKey: job.key });
      this.recordRefundResult(r.id, result);
    } else if (job.kind === "expire") {
      if (r.paymentId || r.checkoutTerminal) return;
      await this.adapters.payments.expireCheckout({ checkoutId: r.checkoutId });
    } else if (job.kind.startsWith("notice_")) {
      const valid = job.kind === "notice_confirmed" ? r.status === "confirmed" : job.kind === "notice_pending" ? (r.status === "cancellation_pending" && !r.providerCancelled) || ["pending", "attention_required"].includes(r.refundStatus) : job.kind === "notice_review" ? r.status === "review_requested" : job.kind === "notice_refund" ? r.refundStatus === "initiated" : true;
      if (!valid) return;
      if (Date.parse(this.now()) - Date.parse(job.firstAttemptAt) > 23 * 3600000) throw fail("notification_manual_reconciliation_required", 503);
      await this.adapters.notifications.send({ ...job.snapshot,
        ...(job.kind !== "notice_alert" ? { manageUrl: await this.managementUrl(r.id) } : {}),
        ...(job.kind === "notice_confirmed" ? { consent: secret.consent, contractAt: secret.contractAt, cancellationEndsAt: cancellationEndsAt(secret.contractAt), meetingUrl: r.meetingUrl, contractTerms: secret.contractTerms } : {}),
      });
    }
  }
  recordRefundResult(id, result) {
    this.store.mutate(state => {
      const gate = new BookingGate({ transact: cb => { const output = cb(state.bookings); state.bookings = output.bookings; return output.result; } });
      const recorded = gate.recordRefundInitiated({ id, refundId: result.refundId });
      if (recorded.reason) throw fail(recorded.reason, 409);
      if (result.status === "requires_action") {
        const record = state.bookings.find(x => x.id === id);
        record.refundStatus = "attention_required";
        record.alertPending = true;
        enqueue(state, id, "notice_pending", this.now());
        enqueue(state, id, "notice_alert", this.now());
      }
    });
  }
  queueFailedMeeting(id, appointmentId) {
    if (typeof appointmentId !== "string" || !appointmentId) throw fail("provider_identity_required", 503);
    this.store.mutate(state => {
      const record = state.bookings.find(x => x.id === id);
      record.appointmentId = appointmentId; record.alertPending = true; record.lastFailureAction = "meeting_creation";
      enqueue(state, id, "cancel_failed_confirmation", this.now());
    });
  }
  completeConfirmation(id, appointmentId, meetingUrl) {
    if (meetingUrl && !/^https:\/\/meet\.google\.com\/[a-z-]+$/.test(meetingUrl)) throw fail("invalid_meeting_url", 503);
    this.store.mutate(state => {
      const gate = new BookingGate({ transact: cb => { const result = cb(state.bookings); state.bookings = result.bookings; return result.result; } });
      const result = gate.confirmAppointment({ id, appointmentId });
      if (!result.accepted) throw fail("confirmation_state_conflict", 409);
      const secret = state.private[id], record = state.bookings.find(x => x.id === id);
      if (meetingUrl) record.meetingUrl = meetingUrl;
      secret.contractAt ||= this.now();
      if (!result.idempotent) this.store.audit(id, "appointment_confirmed", secret.contractAt);
      if (!secret.consent.earlyStart && requiresEarlyStart(new Date(Date.parse(record.startsAt) - PREPARATION_MS).toISOString(), secret.contractAt)) {
        record.status = "cancellation_pending"; record.alertPending = true; record.failureCode = "early_start_not_requested";
      }
    });
  }
  async drain(limit = 10) {
    this.repairJobs();
    for (let i = 0; i < limit; i++) {
      const now = this.now();
      const job = Object.values(this.store.read().jobs).find(x => x.status !== "done" && Date.parse(x.due) <= Date.parse(now));
      if (!job) break;
      this.store.mutate(state => { const j = state.jobs[job.key]; j.status = "running"; j.attempts++; j.firstAttemptAt ||= now; j.due = new Date(Date.parse(now) + 60000).toISOString(); });
      try {
        await this.runJob(this.store.read().jobs[job.key]);
        this.store.mutate(state => {
          state.jobs[job.key].status = "done";
          if (!job.kind.startsWith("notice_")) {
            const record = state.bookings.find(x => x.id === job.id);
            const unresolved = Object.values(state.jobs).some(j => j.id === job.id && !j.kind.startsWith("notice_") && j.status !== "done" && j.attempts > 0);
            record.retryPending = unresolved;
            record.alertPending = unresolved || record.externalChangePending || record.refundStatus === "attention_required" || record.status === "review_requested" || record.status === "booking_failed";
            if (!unresolved) delete record.lastFailureAction;
          }
        });
        this.store.audit(job.id, `${job.kind}_completed`, this.now());
      } catch {
        this.store.mutate(state => {
          const j = state.jobs[job.key]; j.status = "pending"; j.due = new Date(Date.parse(now) + Math.min(3600000, 10000 * 2 ** Math.min(j.attempts, 8))).toISOString();
          const r = state.bookings.find(x => x.id === job.id); r.retryPending = true; r.alertPending = true;
          if (!job.kind.startsWith("notice_")) r.lastFailureAction = job.kind;
          if (!job.kind.startsWith("notice_")) enqueue(state, job.id, "notice_alert", now);
        });
        this.store.audit(job.id, `${job.kind}_retry`, this.now());
      }
      this.repairJobs();
    }
  }
  async reconcile() {
    const state = this.store.read(), now = Date.parse(this.now());
    const candidates = state.bookings.filter(r => (r.checkoutAttemptedAt && !r.paymentId && !r.checkoutTerminal) ||
      (r.appointmentId && ["confirmed", "review_requested"].includes(r.status) && Date.parse(r.startsAt) + DAY > now) ||
      (r.refundId && ["initiated", "attention_required"].includes(r.refundStatus) && !r.refundSettled));
    const cursor = candidates.length ? (state.reconcileCursor || 0) % candidates.length : 0;
    const batch = [...candidates.slice(cursor), ...candidates.slice(0, cursor)].slice(0, 5);
    this.store.mutate(s => { s.reconcileCursor = candidates.length ? (cursor + batch.length) % candidates.length : 0; });
    for (const r of batch) {
      if (r.checkoutAttemptedAt && !r.checkoutId && !r.paymentId) {
        try {
          const found = await this.adapters.payments.findCheckout({ bookingId: r.id, amount: r.rate * 100,
            createdAfter: new Date(Date.parse(r.checkoutAttemptedAt) - 60000).toISOString(), createdBefore: new Date(Date.parse(r.expiresAt) + 60000).toISOString() });
          if (found.state === "found" && found.bookingId === r.id && found.amount === r.rate * 100 && found.currency === "gbp") {
            this.store.mutate(s => { s.bookings.find(x => x.id === r.id).checkoutId = found.checkoutId; });
            r.checkoutId = found.checkoutId;
          } else this.store.mutate(s => { const current = s.bookings.find(x => x.id === r.id); current.alertPending = true; current.lastFailureAction = "checkout_reconciliation"; });
        } catch { this.store.audit(r.id, "checkout_identity_reconcile_retry", this.now()); }
      }
      if (r.checkoutId && !r.paymentId && !r.checkoutTerminal) {
        try { const checkout = await this.adapters.payments.getCheckout({ checkoutId: r.checkoutId });
          if (checkout.bookingId !== r.id) throw fail("payment_correlation_mismatch", 409);
          if (checkout.status === "paid") this.payment({ ...checkout, eventId: `reconcile:${r.checkoutId}` });
          else if (checkout.status === "expired") this.store.mutate(s => { s.bookings.find(x => x.id === r.id).checkoutTerminal = true; });
        } catch { this.store.audit(r.id, "payment_reconcile_retry", this.now()); }
      }
      if (r.appointmentId && ["confirmed", "review_requested"].includes(r.status)) {
        try { const appointment = await this.adapters.scheduler.getAppointment({ appointmentId: r.appointmentId });
          if (appointment.status === "canceled" || (appointment.startsAt && Date.parse(appointment.startsAt) !== Date.parse(r.startsAt)) || (appointment.endsAt && Date.parse(appointment.endsAt) !== Date.parse(r.startsAt) + offerForRate(r.rate).durationMinutes * 60000)) {
            // A native cancel may be one half of an uncontrolled reschedule.
            // Preserve units until a human reconciles it; never infer a refund
            // decision from an external link, particularly within 24 hours.
            this.store.mutate(state => { const current = state.bookings.find(x => x.id === r.id); current.status = "review_requested"; current.externalChangePending = true; current.alertPending = true; });
          }
        } catch { this.store.audit(r.id, "provider_reconcile_retry", this.now()); }
      }
      if (r.refundId && ["initiated", "attention_required"].includes(r.refundStatus) && !r.refundSettled) {
        try { const refund = await this.adapters.payments.getRefund({ paymentId: r.paymentId, bookingId: r.id, amount: r.rate * 100 });
          if (refund.state === "found" && refund.refundId === r.refundId && ["failed", "canceled", "requires_action"].includes(refund.status)) {
            this.store.mutate(state => { const current = state.bookings.find(x => x.id === r.id); current.refundStatus = "attention_required"; current.alertPending = true; enqueue(state, r.id, "notice_pending", this.now()); });
          }
          if (refund.state === "found" && refund.refundId === r.refundId && ["pending", "succeeded"].includes(refund.status) && r.refundStatus === "attention_required") {
            this.store.mutate(s => { const current = s.bookings.find(x => x.id === r.id); current.refundStatus = "initiated"; current.refundRecoveryCount = (current.refundRecoveryCount || 0) + 1; current.alertPending = false; });
          }
          if (refund.state === "found" && refund.refundId === r.refundId && refund.status === "succeeded") this.store.mutate(s => { s.bookings.find(x => x.id === r.id).refundSettled = true; });
        } catch { this.store.audit(r.id, "refund_reconcile_retry", this.now()); }
      }
    }
    await this.drain(5);
  }
}
module.exports = { BookingService, hash, fail };
