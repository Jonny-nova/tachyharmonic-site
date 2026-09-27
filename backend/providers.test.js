'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createAdapters, verifySignedBody } = require('./providers');
const NOW = Date.parse('2026-09-27T10:00:00Z');
const env = {
  STRIPE_SECRET_KEY: ['rk', 'test', 'fixture'].join('_'), STRIPE_WEBHOOK_SECRET: 'test-signing-fixture',
  STRIPE_INTEGRATION_IDENTIFIER: 'tachyharmonic-abcdefgh', CHECKOUT_SUCCESS_URL: 'https://example.test/#booking=abc', CHECKOUT_CANCEL_URL: 'https://example.test/#booking=abc',
  CALENDLY_TOKEN: 'fixture', CALENDLY_WEBHOOK_SECRET: 'test-signing-fixture', CALENDLY_USER_URI: 'https://api.calendly.com/users/host', CALENDLY_EVENT_TYPE_60: 'https://api.calendly.com/event_types/one', CALENDLY_EVENT_TYPE_120: 'https://api.calendly.com/event_types/two',
  GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture', GOOGLE_REFRESH_TOKEN: 'fixture', GOOGLE_CALENDAR_PRIMARY: 'primary', GOOGLE_CALENDAR_WORK: 'work', GOOGLE_CALENDAR_HOME: 'home',
  RESEND_API_KEY: 'fixture', TRANSACTIONAL_FROM: 'Tachyharmonic <appointments@bookings.tachyharmonic.ai>', TRANSACTIONAL_DOMAIN_VERIFIED: 'true',
};
function reply(body, status = 200) { return new Response(JSON.stringify(body), { status }); }
function adapters(fetch, overrides = {}) { return createAdapters({ ...env, ...overrides }, { fetch, now: () => NOW }); }
function sign(body, timestamp = NOW / 1000) { return `t=${timestamp},v1=${createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')}`; }
function session(overrides = {}) { return { id: 'cs_test_abc', livemode: false, metadata: { booking_id: 'abc' }, client_reference_id: 'abc', mode: 'payment', amount_total: 5000, currency: 'gbp', payment_status: 'paid', payment_intent: 'pi_abc', ...overrides }; }

for (const amount of [3000, 5000, 7000, 10000, 14000]) test(`Checkout uses server-approved ${amount} pence and opaque correlation`, async () => {
  let request;
  const { payments } = adapters(async (url, init) => { request = { url, init }; return reply({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/abc' }); });
  await payments.createCheckout({ bookingId: 'abc', amount, currency: 'gbp', email: 'client@example.test', idempotencyKey: 'checkout-abc', expiresAt: new Date(NOW + 1860000).toISOString(), note: 'PRIVATE' });
  const body = request.init.body;
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), String(amount));
  assert.equal(body.get('metadata[booking_id]'), 'abc');
  assert.equal(body.get('payment_method_types'), null);
  assert.equal(body.get('expires_at'), String(NOW / 1000 + 1860));
  assert.equal(request.init.headers['Idempotency-Key'], 'checkout-abc');
  assert.ok(!body.toString().includes('PRIVATE'));
});
test('Checkout rejects unsupported amount and live credential in default test mode without network', async () => {
  let calls = 0; const { payments } = adapters(async () => { calls++; }, { STRIPE_SECRET_KEY: ['rk', 'live', 'fixture'].join('_') });
  const input = { bookingId: 'abc', amount: 6000, currency: 'gbp', expiresAt: new Date(NOW + 1860000).toISOString(), idempotencyKey: 'abc' };
  await assert.rejects(payments.createCheckout(input), /invalid_amount/);
  await assert.rejects(payments.createCheckout({ ...input, amount: 5000 }), /mode_key_mismatch/);
  assert.equal(calls, 0);
});
test('Checkout retry retains identical provider body while clock advances', async () => {
  let clock = NOW; const bodies = [];
  const payments = createAdapters(env, { now: () => clock, fetch: async (url, init) => { bodies.push(init.body.toString()); return reply({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/abc' }); } }).payments;
  const input = { bookingId: 'abc', amount: 5000, currency: 'gbp', email: 'client@example.test', idempotencyKey: 'checkout-abc', expiresAt: new Date(NOW + 1860000).toISOString() };
  await payments.createCheckout(input); clock += 120000; await payments.createCheckout(input);
  assert.equal(bodies[0], bodies[1]);
});
test('lost Checkout recovery accepts only a unique fully paginated correlated session', async () => {
  const args = { bookingId: 'abc', amount: 5000, createdAfter: new Date(NOW - 60000).toISOString(), createdBefore: new Date(NOW + 960000).toISOString() };
  let calls = 0;
  const payments = adapters(async url => {
    calls++; const query = new URL(url).searchParams;
    assert.ok(query.has('created[gte]')); assert.ok(query.has('created[lte]'));
    return query.has('starting_after') ? reply({ data: [session()], has_more: false }) : reply({ data: [session({ id: 'cs_test_other', metadata: { booking_id: 'other' }, client_reference_id: 'other' })], has_more: true });
  }).payments;
  const found = await payments.findCheckout(args);
  assert.equal(calls, 2); assert.equal(found.state, 'found'); assert.equal(found.checkoutId, 'cs_test_abc'); assert.equal(found.status, 'paid');
  for (const result of [{ data: [], has_more: false }, { data: [session(), session({ id: 'cs_test_duplicate' })], has_more: false }, { data: [session({ amount_total: 7000 })], has_more: false }, { data: [session({ currency: 'usd' })], has_more: false }, { data: [] }]) {
    assert.deepEqual(await adapters(async () => reply(result)).payments.findCheckout(args), { state: 'unknown' });
  }
  assert.deepEqual(await adapters(async () => reply({}, 500)).payments.findCheckout(args), { state: 'unknown' });
});
test('Stripe raw signed hooks validate payment status, amount, mode, correlation and signature', async () => {
  const { payments } = adapters(() => assert.fail('no fetch'));
  const event = { id: 'evt_abc', livemode: false, type: 'checkout.session.completed', data: { object: session() } };
  const call = e => { const body = JSON.stringify(e); return payments.verifyWebhook(body, sign(body)); };
  assert.equal((await call(event)).kind, 'payment_completed');
  assert.equal((await call({ ...event, data: { object: session({ payment_status: 'unpaid' }) } })).kind, 'ignored');
  for (const changes of [{ currency: 'usd' }, { amount_total: 9999 }, { client_reference_id: 'other' }, { payment_intent: null }, { livemode: true }]) await assert.rejects(call({ ...event, data: { object: session(changes) } }));
  const body = JSON.stringify(event);
  await assert.rejects(payments.verifyWebhook(body + ' ', sign(body)), /invalid_signature/);
  await assert.rejects(payments.verifyWebhook(body, sign(body, NOW / 1000 - 301)), /invalid_signature/);
  await assert.rejects(payments.verifyWebhook(body, sign(body, NOW / 1000 + 301)), /invalid_signature/);
  await assert.rejects(verifySignedBody(event, sign(body), env.STRIPE_WEBHOOK_SECRET, NOW, 300), /raw_body_required/);
});
test('unknown writes stay uncertain, explicit rejection is definitive, errors never echo provider text', async () => {
  const args = { paymentId: 'pi_abc', amount: 5000, idempotencyKey: 'refund-abc' };
  for (const status of [408, 409, 429, 500]) await assert.rejects(adapters(async () => reply({ secret: 'PRIVATE' }, status)).payments.refund(args), error => !error.definitive && !error.message.includes('PRIVATE'));
  await assert.rejects(adapters(async () => reply({}, 400)).payments.refund(args), error => error.definitive === true);
  await assert.rejects(adapters(async () => { throw new Error('PRIVATE'); }).payments.refund(args), error => !error.definitive && !error.message.includes('PRIVATE'));
});
test('signed refund lifecycle event wakes authoritative reconciliation', async () => {
  const body = JSON.stringify({ id: 'evt_refund', livemode: false, type: 'refund.failed', data: { object: { id: 're_abc', payment_intent: 'pi_abc', metadata: { booking_id: 'abc' } } } });
  const result = await adapters(() => assert.fail('no fetch')).payments.verifyWebhook(body, sign(body));
  assert.deepEqual(result, { eventId: 'evt_refund', kind: 'refund_updated', paymentId: 'pi_abc', bookingId: 'abc', refundId: 're_abc' });
});
test('refund initiation requires accepted correlated provider response, reconciliation never invents absence', async () => {
  const args = { paymentId: 'pi_abc', bookingId: 'abc', amount: 5000, idempotencyKey: 'refund-abc' };
  const result = await adapters(async () => reply({ id: 're_abc', payment_intent: 'pi_abc', amount: 5000, status: 'pending' })).payments.refund(args);
  assert.equal(result.refundId, 're_abc');
  await assert.rejects(adapters(async () => reply({ id: 're_abc', payment_intent: 'pi_abc', amount: 5000, status: 'failed' })).payments.refund(args), /refund_not_accepted/);
  assert.deepEqual(await adapters(async () => reply({ data: [], has_more: false })).payments.getRefund(args), { state: 'unknown' });
  assert.deepEqual(await adapters(async () => reply({ data: [{ id: 're_abc', payment_intent: 'pi_abc', metadata: { booking_id: 'abc' }, status: 'pending', amount: 5000 }] })).payments.getRefund(args), { state: 'found', refundId: 're_abc', status: 'pending', amount: 5000 });
});
test('Calendly booking sends minimum invitee fields and opaque tracking, omits note/native links', async () => {
  let body;
  const scheduler = adapters(async (url, init) => {
    if (init.method === 'GET') return reply({ resource: { uri: 'https://api.calendly.com/scheduled_events/abc', status: 'active', event_type: env.CALENDLY_EVENT_TYPE_120, start_time: '2026-10-01T10:00:00Z', end_time: '2026-10-01T12:00:00Z' } });
    body = JSON.parse(init.body); return reply({ resource: { event: 'https://api.calendly.com/scheduled_events/abc', status: 'active', email: 'client@example.test', tracking: { utm_content: 'abc' }, cancel_url: 'PRIVATE' } });
  }).scheduler;
  const result = await scheduler.createAppointment({ bookingId: 'abc', startsAt: '2026-10-01T10:00:00Z', durationMinutes: 120, name: 'Client', email: 'client@example.test', note: 'PRIVATE' });
  assert.equal(body.event_type, env.CALENDLY_EVENT_TYPE_120);
  assert.deepEqual(body.location, { kind: 'zoom_conference' });
  assert.ok(!JSON.stringify(body).includes('PRIVATE'));
  assert.deepEqual(result, { appointmentId: 'https://api.calendly.com/scheduled_events/abc' });
});
test('Calendly uncertainty reconciles only unique opaque tracking identity', async () => {
  const args = { bookingId: 'abc', startsAt: '2026-10-01T10:00:00Z', durationMinutes: 60, email: 'client@example.test' };
  assert.deepEqual(await adapters(async () => reply({ collection: [] })).scheduler.findAppointment(args), { state: 'unknown' });
  const result = await adapters(async url => url.includes('/invitees') ? reply({ collection: [{ status: 'active', email: args.email, tracking: { utm_content: 'abc' } }] }) : reply({ collection: [{ uri: 'https://api.calendly.com/scheduled_events/abc', start_time: args.startsAt, end_time: '2026-10-01T11:00:00Z', status: 'active', event_type: env.CALENDLY_EVENT_TYPE_60 }] })).scheduler.findAppointment(args);
  assert.deepEqual(result, { state: 'found', appointmentId: 'https://api.calendly.com/scheduled_events/abc' });
});
test('Calendly creation and recovery cannot confirm a wrong start or duration', async () => {
  const args = { bookingId: 'abc', startsAt: '2026-10-01T10:00:00Z', durationMinutes: 120, name: 'Client', email: 'client@example.test' };
  for (const wrong of [{ start_time: '2026-10-01T10:00:00Z', end_time: '2026-10-01T11:00:00Z' }, { start_time: '2026-10-01T11:00:00Z', end_time: '2026-10-01T13:00:00Z' }]) {
    const event = { uri: 'https://api.calendly.com/scheduled_events/abc', status: 'active', event_type: env.CALENDLY_EVENT_TYPE_120, ...wrong };
    const adapter = adapters(async (url, init) => init.method === 'POST' ? reply({ resource: { event: event.uri, status: 'active', email: args.email, tracking: { utm_content: 'abc' } } }) : reply({ resource: event, collection: [event] })).scheduler;
    await assert.rejects(adapter.createAppointment(args), error => error.code === 'unconfirmed_event_details' && error.definitive === false);
    assert.deepEqual(await adapter.findAppointment(args), { state: 'unknown' });
  }
});
test('Calendly signed cancellations deduplicate across delivery timestamps and reject tampering', async () => {
  const body = JSON.stringify({ event: 'invitee.canceled', created_at: '2026-09-27T10:00:00Z', payload: { uri: 'https://api.calendly.com/scheduled_events/abc/invitees/def', event: 'https://api.calendly.com/scheduled_events/abc', rescheduled: true } });
  const scheduler = adapters(() => assert.fail('no fetch')).scheduler;
  const a = await scheduler.verifyWebhook(body, sign(body));
  const b = await scheduler.verifyWebhook(body, sign(body, NOW / 1000 - 1));
  assert.equal(a.eventId, b.eventId); assert.equal(a.kind, 'appointment_canceled'); assert.equal(a.rescheduled, true);
  await assert.rejects(scheduler.verifyWebhook(body + ' ', sign(body)), /invalid_signature/);
});
function calendarResponse() { return { timeMin: '2026-10-01T10:00:00Z', timeMax: '2026-10-01T14:00:00Z', calendars: { primary: { busy: [] }, work: { errors: null, busy: [{ start: '2026-10-01T11:00:00Z', end: '2026-10-01T12:00:00Z' }] }, home: { busy: [] } } }; }
test('Google freeBusy checks all three calendars and refuses incomplete/error/malformed data', async () => {
  const args = { startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-01T14:00:00Z' };
  const run = value => adapters(async url => url.includes('/token') ? reply({ access_token: 'fixture', expires_in: 3600 }) : reply(value)).calendar.getBusy(args);
  const result = await run(calendarResponse()); assert.deepEqual(Object.keys(result), ['Primary', 'Work', 'Home']); assert.equal(result.Work.length, 1);
  const missing = calendarResponse(); delete missing.calendars.home; await assert.rejects(run(missing));
  const failed = calendarResponse(); failed.calendars.home.errors = [{ reason: 'notFound' }]; await assert.rejects(run(failed));
  const invalid = calendarResponse(); invalid.calendars.work.busy[0].end = 'invalid'; await assert.rejects(run(invalid));
  const short = calendarResponse(); short.timeMax = '2026-10-01T13:00:00Z'; await assert.rejects(run(short));
});
test('email uses independent verified sender, no intake, idempotency and fixed alert recipient', async () => {
  let request;
  const send = adapters(async (url, init) => { request = { url, init }; return reply({ id: 'email-abc' }); }).notifications.send;
  await send({ kind: 'operational_alert', bookingId: 'abc', email: 'attacker@example.test', idempotencyKey: 'alert-abc', note: 'PRIVATE', status: 'refund_pending' });
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body.to, ['jonathan@tachyharmonic.ai']); assert.ok(!request.init.body.includes('PRIVATE'));
  assert.equal(request.init.headers['Idempotency-Key'], 'alert-abc');
  await assert.rejects(adapters(() => assert.fail('no fetch'), { TRANSACTIONAL_DOMAIN_VERIFIED: 'false' }).notifications.send({ kind: 'booking_failed', bookingId: 'abc' }), /sender_not_verified/);
});
test('Calendly conflict union requires explicitly verified coverage and fresh successful data', async () => {
  const args = { startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-01T14:00:00Z' };
  await assert.rejects(adapters(() => assert.fail('no fetch'), { CALENDAR_SOURCE: 'calendly' }).calendar.getBusy(args), /coverage_not_verified/);
  const config = { CALENDAR_SOURCE: 'calendly', CALENDLY_CONFLICT_CALENDARS_VERIFIED: 'true' };
  let calls = 0;
  const calendar = adapters(async url => {
    calls++; assert.ok(url.startsWith('https://api.calendly.com/user_busy_times?'));
    return reply({ collection: [{ type: 'external', start_time: '2026-10-01T11:00:00Z', end_time: '2026-10-01T12:00:00Z' }] });
  }, config).calendar;
  const result = await calendar.getBusy(args); await calendar.getBusy(args);
  assert.equal(calls, 2); assert.deepEqual(result.Primary, result.Work); assert.deepEqual(result.Home, result.Work);
  assert.equal(result.Home.length, 1);
  await assert.rejects(adapters(async () => reply({}, 424), config).calendar.getBusy(args), /http_424/);
  await assert.rejects(adapters(async () => reply({}), config).calendar.getBusy(args), /invalid_busy_collection/);
  await assert.rejects(adapters(async () => reply({ collection: [{ type: 'external', start_time: 'invalid', end_time: args.endsAt }] }), config).calendar.getBusy(args));
});
test('Calendly conflict union splits buffered week into complete <=7-day windows', async () => {
  const windows = [];
  const calendar = adapters(async url => {
    const query = new URL(url).searchParams; windows.push([Date.parse(query.get('start_time')), Date.parse(query.get('end_time'))]);
    return reply({ collection: [{ type: 'calendly', start_time: '2026-10-02T11:00:00Z', end_time: '2026-10-02T12:00:00Z', buffered_start_time: '2026-10-02T10:30:00Z', buffered_end_time: '2026-10-02T12:30:00Z' }] });
  }, { CALENDAR_SOURCE: 'calendly', CALENDLY_CONFLICT_CALENDARS_VERIFIED: 'true' }).calendar;
  const result = await calendar.getBusy({ startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-08T12:00:00Z' });
  assert.equal(windows.length, 2); assert.equal(windows[0][1], windows[1][0]);
  assert.ok(windows.every(([a,b]) => b-a <= 7*86400000));
  assert.deepEqual(result.Primary, [{ startsAt: '2026-10-02T10:30:00.000Z', endsAt: '2026-10-02T12:30:00.000Z' }]);
});

