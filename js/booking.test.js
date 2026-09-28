"use strict";

// Synthetic browser/API contract tests. No provider, real payment or deployed
// store is involved; these results must never be presented as live evidence.
const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createApi, createFlow, describeRecord, errorMessage, managementLink, mount,
  needsEarlyStart, readFragment, validConfig } = require("./booking");

const NOW = Date.parse("2026-09-27T12:00:00Z");
const token = "a".repeat(43);
const baseRecord = { id: "booking-1", rate: 50, startsAt: "2026-10-03T11:00:00Z", endsAt: "2026-10-03T12:00:00Z",
  status: "held", expiresAt: "2026-09-27T12:15:00Z", refundStatus: "none" };
const input = { startsAt: baseRecord.startsAt, rate: 50, name: "Synthetic Visitor", email: "visitor@example.test",
  note: "Synthetic private note", earlyStart: true, consentVersion: "v1-draft" };
const encode = value => Buffer.from(value, "binary").toString("base64");

test("disabled or invalid configuration makes no API/storage calls and prevents form submission", () => {
  for (const config of [{ enabled: false, apiBase: "https://example.test", consentVersion: "v1-draft" },
    { enabled: true, apiBase: "", consentVersion: "v1-draft" }]) {
    const listeners = [], win = { document: { getElementById: () => ({ addEventListener: (type, fn) => listeners.push([type, fn]) }) },
      fetch() { assert.fail("Disabled preview must not fetch"); }, get sessionStorage() { assert.fail("Disabled preview must not persist input"); } };
    mount(win, config);
    assert.equal(listeners[0][0], "submit");
    let stopped = false; listeners[0][1]({ preventDefault() { stopped = true; } }); assert.equal(stopped, true);
  }
  assert.equal(validConfig({ enabled: true, apiBase: "https://api.example.test", consentVersion: "v1-draft" }), true);
  assert.equal(validConfig({ enabled: true, apiBase: "http://api.example.test", consentVersion: "v1-draft" }), false);
  assert.equal(validConfig({ enabled: true, apiBase: "https://user:password@api.example.test", consentVersion: "v1-draft" }), false);
});

test("early performance includes preparation and ends after London calendar day 14", () => {
  const boundary = Date.parse("2026-10-11T23:30:00Z");
  assert.equal(needsEarlyStart(new Date(boundary - 1).toISOString(), NOW), true);
  assert.equal(needsEarlyStart(new Date(boundary).toISOString(), NOW), false);
});

test("Meet link remains available during personal review of an unchanged booking and requires an exact safe URL", () => {
  const record = { ...baseRecord, status: "confirmed", meetingUrl: "https://meet.google.com/abc-defg-hij" };
  assert.equal(describeRecord(record).meetingUrl, record.meetingUrl);
  assert.equal(describeRecord({ ...record, status: "review_requested" }).meetingUrl, record.meetingUrl);
  for (const status of ["held", "confirming", "canceled", "cancellation_pending"]) assert.equal(describeRecord({ ...record, status }).meetingUrl, null);
  assert.equal(describeRecord({ ...record, status: "review_requested", externalChangePending: true }).meetingUrl, undefined);
  assert.equal(describeRecord({ ...record, externalChangePending: true }).meetingUrl, undefined);
  for (const meetingUrl of ["javascript:alert(1)", "https://meet.google.com.evil.test/abc-defg-hij", "https://user@meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij?token=private", "http://meet.google.com/abc-defg-hij"]) assert.equal(describeRecord({ ...record, meetingUrl }).meetingUrl, null);
});

test("private links keep access token in fragment, never query, and reject invalid credentials", () => {
  const link = managementLink({ href: "https://example.test/index.html?old=1#contact" }, "booking-1", token);
  const url = new URL(link);
  assert.equal(url.search, "");
  assert.deepEqual(readFragment(url.hash), { id: "booking-1", token });
  assert.deepEqual(readFragment("#booking=booking-1"), { id: "booking-1", token: null });
  assert.equal(readFragment("#contact"), null);
  assert.throws(() => readFragment("#booking=booking-1&token=short"));
});

test("transport uses bearer auth, stable idempotency, no cookies/referrer and handles API failures", async () => {
  let request;
  const api = createApi({ apiBase: "https://api.example.test/", fetchImpl: async (url, options) => {
    request = { url, options }; return { ok: true, json: async () => baseRecord };
  } });
  await api("/api/holds", { method: "POST", token, key: "key-1", body: { rate: 50 } });
  assert.equal(request.url, "https://api.example.test/api/holds");
  assert.equal(request.options.headers.Authorization, "Bearer " + token);
  assert.equal(request.options.headers["Idempotency-Key"], "key-1");
  assert.equal(request.options.credentials, "omit"); assert.equal(request.options.referrerPolicy, "no-referrer");
  const broken = createApi({ apiBase: "https://api.example.test", fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ error: "capacity" }) }) });
  await assert.rejects(broken("/api/holds"), error => error.status === 409 && error.message === "capacity");
});

test("lost hold response recovers one booking with same key/token after page refresh", async () => {
  let context = null, committed = false; const requests = [];
  const api = async (route, options) => {
    requests.push({ route, ...options });
    if (!committed) { committed = true; throw new TypeError("Network response lost after commit"); }
    return baseRecord;
  };
  const options = { api, read: () => context, save: value => { context = value; }, cryptoApi: webcrypto, encode, now: () => NOW };
  await assert.rejects(createFlow(options).hold(input));
  const saved = JSON.stringify(context);
  for (const privateValue of [input.name, input.email, input.note]) assert.equal(saved.includes(privateValue), false);
  assert.match(context.token, /^[A-Za-z0-9_-]{43}$/);
  const recovered = await createFlow(options).hold(input);
  assert.equal(recovered.id, "booking-1"); assert.equal(requests[0].key, requests[1].key);
  assert.equal(requests[0].body.managementToken, requests[1].body.managementToken);
  assert.equal(context.id, "booking-1");
});

test("uncertain hold cannot be replaced with a different request while it may still exist", async () => {
  let context, calls = 0;
  const flow = createFlow({ api: async () => { calls++; throw new Error("network"); },
    read: () => context, save: v => { context = v; }, cryptoApi: webcrypto, encode, now: () => NOW });
  await assert.rejects(flow.hold(input));
  await assert.rejects(flow.hold({ ...input, rate: 70 }), /previous_request_uncertain/);
  assert.equal(calls, 1);
});

test("storage refusal prevents any attempt to create a hold", async () => {
  const flow = createFlow({ api: () => assert.fail("No API call before recovery saved"), read: () => null,
    save: () => { throw new Error("storage_unavailable"); }, cryptoApi: webcrypto, encode });
  await assert.rejects(flow.hold(input), /storage_unavailable/);
});

test("fake API journey covers all five prices and only accepts verified appointment confirmation", async () => {
  for (const rate of [30, 50, 70, 100, 140]) {
    let context, record = { ...baseRecord, rate,
      endsAt: new Date(Date.parse(baseRecord.startsAt) + (rate >= 100 ? 120 : 60) * 60000).toISOString() };
    const api = async (route, request) => {
      if (route === "/api/holds") { assert.equal(request.body.rate, rate); return record; }
      assert.equal(request.token, context.token);
      if (route.endsWith("/checkout")) return { checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic-only" };
      return record;
    };
    const flow = createFlow({ api, read: () => context, save: value => { context = value; }, cryptoApi: webcrypto, encode, now: () => NOW });
    const held = await flow.hold({ ...input, rate });
    assert.equal(describeRecord(held, NOW).canPay, true);
    assert.equal(await flow.checkout(context), "https://checkout.stripe.com/c/pay/synthetic-only");
    record = { ...record, status: "paid_pending" };
    assert.match(describeRecord(await flow.hold({ ...input, rate }), NOW).message, /not confirmed yet/);
    record = { ...record, status: "confirmed" };
    assert.equal(describeRecord(await flow.hold({ ...input, rate }), NOW).title, "Your appointment is confirmed");
  }
});

test("checkout only redirects to verified HTTPS Stripe checkout hostname", async () => {
  for (const checkoutUrl of ["https://checkout.stripe.com.evil.test/pay", "javascript:alert(1)", "http://checkout.stripe.com/pay", "https://user:secret@checkout.stripe.com/pay"]) {
    const flow = createFlow({ api: async () => ({ checkoutUrl }), read: () => null, save() {}, cryptoApi: webcrypto });
    await assert.rejects(flow.checkout({ id: "booking-1", token }), /invalid_checkout_response/);
  }
});

test("cancellation and refund states never falsely report completed actions", () => {
  const state = fields => describeRecord({ ...baseRecord, ...fields }, NOW);
  for (const status of ['held', 'paid_pending', 'confirming', 'confirmed']) {
    assert.equal(state({ status, refundStatus: 'none' }).refund, '');
    assert.equal(state({ status, refundStatus: undefined }).refund, '');
  }
  assert.match(state({ status: 'canceled', refundStatus: 'unexpected' }).refund, /status needs checking/);
  assert.match(state({ status: "cancellation_pending", providerCancelled: false, refundStatus: "pending" }).message, /has not yet been confirmed/);
  assert.match(state({ status: "cancellation_pending", providerCancelled: true, refundStatus: "pending" }).refund, /has not yet been confirmed/);
  assert.match(state({ status: "canceled", refundStatus: "initiated" }).refund, /initiation has been confirmed/);
  assert.match(state({ status: "review_requested" }).message, /remains booked/);
  const external = state({ status: "review_requested", externalChangePending: true });
  assert.doesNotMatch(external.message, /remains booked/);
  assert.match(external.message, /may no longer be valid/);
  assert.equal(external.canRestart, false);
  assert.match(state({ status: "booking_failed", refundStatus: "pending" }).title, /No appointment/);
  assert.equal(state({ status: "confirming" }).canRestart, false);
  assert.throws(() => state({ status: "anything_unverified" }), /invalid_server_response/);
  assert.match(errorMessage(new Error("Server said token=secret")), /could not verify/);
  assert.equal(errorMessage(new Error("Server said token=secret")).includes("secret"), false);
});

test("static candidate remains disabled and does not collect AI preferences", () => {
  const base = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
  const config = fs.readFileSync(path.join(__dirname, "booking-config.js"), "utf8");
  assert.match(config, /enabled:\s*false/); assert.match(config, /apiBase:\s*""/);
  assert.match(html, /This form is a preview\. It does not send or save your answers/);
  assert.doesNotMatch(html, /name="summary-interest"/);
  assert.match(html, /id="booking-submit"[^>]+disabled/);
  assert.match(html, /maxlength="1200"/); assert.match(html, /terms\.html#privacy/);
  const consent = require("../booking/consent");
  assert.ok(html.includes(consent.WORDING));
  assert.ok(fs.readFileSync(path.join(base, "terms.html"), "utf8").includes(consent.WORDING));
});

// Minimal DOM event surface: exercise mount's actual navigation and network
// handlers without claiming browser layout or live-provider verification.
function mountedBooking({ stored, hash = '', handle, visible = false, terms = { version: 'test-v1', text: 'Terms: TEST FIXTURE ONLY, 1 Example Street', traderAddress: 'TEST FIXTURE ONLY, 1 Example Street' } }) {
  class Element {
    constructor() { this.hidden = false; this.disabled = false; this.value = ''; this.listeners = {}; this.children = []; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    async fire(type, event = {}) { for (const callback of this.listeners[type] || []) await callback(event); }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    querySelectorAll() { return []; }
    querySelector(selector) { return selector === 'input[name="rate"]' ? element('first-rate') : null; }
    reportValidity() { return true; }
    reset() {}
    dispatchEvent() {}
    focus() { this.focused = true; }
  }
  const nodes = new Map(), element = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  element('booking-management').hidden = true; element('booking-timezone').value = 'Europe/London';
  const storage = new Map(stored ? [['tachyharmonic-booking-v1', JSON.stringify(stored)]] : []);
  const win = new Element();
  const doc = new Element(); doc.hidden = !visible; doc.getElementById = element; doc.createElement = () => new Element();
  const timers = new Map(); let timerId = 0;
  Object.assign(win, { document: doc, crypto: webcrypto, btoa: encode, navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location: { href: 'https://example.test/index.html' + hash, hash, assign: url => { win.redirect = url; } },
    history: { replaceState: (_state, _title, next) => { win.location.hash = next; win.location.href = 'https://example.test/index.html' + next; } },
    fetch: async (url, request) => {
      if (url.endsWith('/api/terms')) {
        if (terms instanceof Error) throw terms;
        return new Response(JSON.stringify(terms), { headers: { 'Content-Type': 'application/json' } });
      }
      calls.push({ url, request }); return new Response(JSON.stringify(await handle(url, request)), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const calls = [];
  mount(win, { enabled: true, apiBase: 'https://api.example.test', consentVersion: 'v1-2026-09-27' });
  return { win, element, calls, storage, timers, async poll() { const [id, callback] = timers.entries().next().value; timers.delete(id); await callback(); }, async navigate(next) { win.location.hash = next; return win.fire('hashchange'); } };
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('successful Checkout return stays neutral and polls delayed canonical payment without repaying', async () => {
  let status = 'held';
  const fixture = mountedBooking({ visible: true, stored: { id: baseRecord.id, token }, hash: '#booking=booking-1&checkout=returned',
    handle: async () => ({ ...baseRecord, status, expiresAt: '2099-01-01T00:00:00Z' }) });
  await settle();
  assert.match(fixture.element('booking-status-message').textContent, /not yet been verified/);
  assert.equal(fixture.element('resume-checkout').hidden, true);
  await fixture.element('resume-checkout').fire('click');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.timers.size, 1);
  status = 'confirmed'; await fixture.poll();
  assert.equal(fixture.element('booking-status-title').textContent, 'Your appointment is confirmed');
  assert.equal(fixture.timers.size, 0);
  assert.ok(fixture.calls.every(call => call.request.method === 'GET'));
});

test('unverified Checkout hint stops after ten automatic checks and survives refresh without becoming payment proof', async () => {
  const fixture = mountedBooking({ visible: true, stored: { id: baseRecord.id, token }, hash: '#booking=booking-1&checkout=returned',
    handle: async () => ({ ...baseRecord, expiresAt: '2099-01-01T00:00:00Z' }) });
  await settle();
  for (let i = 0; i < 10; i++) await fixture.poll();
  assert.equal(fixture.calls.length, 11);
  assert.equal(fixture.timers.size, 0);
  assert.match(fixture.element('booking-status-message').textContent, /Automatic checks have paused/);
  const reopened = mountedBooking({ visible: true, stored: JSON.parse(fixture.storage.get('tachyharmonic-booking-v1')), hash: '#booking=booking-1',
    handle: async () => ({ ...baseRecord, expiresAt: '2099-01-01T00:00:00Z' }) });
  await settle();
  assert.equal(reopened.timers.size, 0);
  assert.equal(reopened.element('resume-checkout').hidden, true);
  assert.match(reopened.element('booking-status-message').textContent, /not yet been verified/);
});

test('checkout remains closed when current terms cannot be disclosed', async () => {
  for (const terms of [new Error('offline'), {}, { version: 'v1', text: 'Missing business address', traderAddress: 'TEST FIXTURE ONLY, 1 Example Street' }]) {
    const fixture = mountedBooking({ stored: { id: baseRecord.id, token }, terms,
      handle: async () => ({ ...baseRecord, expiresAt: '2099-01-01T00:00:00Z' }) });
    await settle();
    assert.equal(fixture.element('resume-checkout').disabled, true);
    assert.equal(fixture.element('booking-submit').disabled, true);
    assert.equal(fixture.element('retry-booking-terms').hidden, false);
    await fixture.element('resume-checkout').fire('click');
    assert.ok(fixture.calls.every(call => !call.url.endsWith('/checkout')));
    assert.equal(fixture.win.redirect, undefined);
  }
});

test('terms are disclosed as text before a recovered booking can resume payment', async () => {
  const terms = { version: 'test-v1', text: '<script>not executable</script> TEST FIXTURE ONLY, 1 Example Street', traderAddress: 'TEST FIXTURE ONLY, 1 Example Street' };
  const fixture = mountedBooking({ stored: { id: baseRecord.id, token }, terms,
    handle: async url => url.endsWith('/checkout') ? { checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } : { ...baseRecord, expiresAt: '2099-01-01T00:00:00Z' } });
  await settle();
  assert.equal(fixture.element('booking-terms-text').textContent, terms.text);
  assert.equal(fixture.element('booking-terms-disclosure').hidden, false);
  assert.equal(fixture.element('resume-checkout').disabled, false);
  await fixture.element('resume-checkout').fire('click');
  assert.equal(fixture.win.redirect, 'https://checkout.stripe.com/c/pay/test');
});

test('refresh and BFCache back recover status by GET without reposting a hold or checkout', async () => {
  let status = 'held';
  const fixture = mountedBooking({ stored: { id: baseRecord.id, token }, hash: '#booking=' + baseRecord.id,
    handle: async () => ({ ...baseRecord, expiresAt: '2099-01-01T00:00:00Z', status }) });
  await settle(); assert.equal(fixture.element('resume-checkout').hidden, false);
  status = 'confirmed'; await fixture.win.fire('pageshow', { persisted: true });
  assert.equal(fixture.element('booking-status-title').textContent, 'Your appointment is confirmed');
  assert.ok(fixture.calls.every(call => call.request.method === 'GET' && !call.url.endsWith('/checkout')));
  const reopened = mountedBooking({ stored: JSON.parse(fixture.storage.get('tachyharmonic-booking-v1')), hash: fixture.win.location.hash,
    handle: async () => ({ ...baseRecord, status: 'confirmed' }) });
  await settle(); assert.equal(reopened.calls.length, 1); assert.equal(reopened.calls[0].request.method, 'GET');
});

test('same-document private link switches credentials and ignores an older response', async () => {
  const older = deferred(), secondToken = 'b'.repeat(43);
  const fixture = mountedBooking({ stored: { id: 'booking-1', token }, hash: '#booking=booking-1',
    handle: async url => url.endsWith('/booking-1') ? older.promise : { ...baseRecord, id: 'booking-2', status: 'confirmed' } });
  await settle(); await fixture.navigate('#booking=booking-2&token=' + secondToken);
  assert.equal(fixture.calls.at(-1).request.headers.Authorization, 'Bearer ' + secondToken);
  assert.equal(fixture.win.location.hash, '#booking=booking-2');
  older.resolve({ ...baseRecord, status: 'canceled' }); await settle();
  assert.match(fixture.element('booking-summary').textContent, /booking-2/);
  assert.equal(fixture.element('booking-status-title').textContent, 'Your appointment is confirmed');
  await fixture.navigate('#booking=booking-1');
  assert.equal(fixture.calls.at(-1).request.headers.Authorization, 'Bearer ' + token);
});

test('late refresh cannot replace a new-booking form or a completed cancellation', async () => {
  let pending;
  const fixture = mountedBooking({ stored: { id: baseRecord.id, token }, hash: '#booking=' + baseRecord.id,
    handle: async (_url, request) => request.method === 'POST' ? { ...baseRecord, status: 'cancellation_pending' } : pending ? pending.promise : { ...baseRecord, status: 'confirmed' } });
  await settle(); pending = deferred(); const refresh = fixture.element('refresh-booking').fire('click');
  await fixture.element('confirm-cancellation').fire('click');
  pending.resolve({ ...baseRecord, status: 'confirmed' }); await refresh;
  assert.equal(fixture.element('booking-status-title').textContent, 'Cancellation pending');
  pending = null; await fixture.element('refresh-booking').fire('click');
  pending = deferred(); const olderRefresh = fixture.element('refresh-booking').fire('click');
  await fixture.element('new-booking').fire('click'); pending.resolve({ ...baseRecord, status: 'confirmed' }); await olderRefresh;
  assert.equal(fixture.element('intake-preview').hidden, false);
  assert.equal(fixture.element('booking-management').hidden, true);
  assert.equal(fixture.element('load-times').disabled, true);
  assert.equal(fixture.element('first-rate').focused, true);
});

test('navigating away from a pending checkout cannot redirect the new booking to the old payment', async () => {
  const checkout = deferred();
  const fixture = mountedBooking({ stored: { id: 'booking-1', token }, hash: '#booking=booking-1', handle: async url =>
    url.endsWith('/checkout') ? checkout.promise : { ...baseRecord, id: url.split('/').at(-1), expiresAt: '2099-01-01T00:00:00Z' } });
  await settle(); const payment = fixture.element('resume-checkout').fire('click');
  await fixture.navigate('#booking=booking-2&token=' + 'b'.repeat(43));
  checkout.resolve({ checkoutUrl: 'https://checkout.stripe.com/c/pay/old-booking' }); await payment;
  assert.equal(fixture.win.redirect, undefined);
  await fixture.navigate('#booking=invalid&token=short');
  assert.equal(fixture.element('cancel-booking').hidden, true);
  assert.equal(fixture.element('resume-checkout').hidden, true);
  assert.equal(fixture.element('management-error').hidden, false);
});
