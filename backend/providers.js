'use strict';

const { CONTACT, renderMessage } = require('./messages');
const { createGoogleScheduler } = require('./google-scheduler');
const AMOUNTS = new Set([3000, 5000, 7000, 10000, 14000]);
const encoder = new TextEncoder();
const VERSION = '2026-08-26.dahlia';

class ProviderError extends Error {
  constructor(provider, code, definitive = false) {
    super(`${provider}: ${code}`);
    this.name = 'ProviderError'; this.provider = provider; this.code = code; this.definitive = definitive;
  }
}
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new ProviderError('configuration', name, true);
  return value;
}
function identity(value) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value || '')) throw new ProviderError('input', 'invalid_identity', true);
  return value;
}
function instant(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new ProviderError('input', 'invalid_time', true);
  return time;
}
function amountCheck(amount, currency = 'gbp') {
  if (!AMOUNTS.has(amount) || currency !== 'gbp') throw new ProviderError('input', 'invalid_amount', true);
}
function eventPath(uri) {
  const url = new URL(uri);
  if (url.origin !== 'https://api.calendly.com' || !/^\/scheduled_events\/[A-Za-z0-9-]+$/.test(url.pathname) || url.search || url.hash) throw new ProviderError('calendly', 'invalid_event_identity');
  return url.pathname;
}
function form(fields) { return new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined)); }
async function verifySignedBody(rawBody, header, secret, now, tolerance) {
  required(secret, 'missing_webhook_secret');
  if (!(typeof rawBody === 'string' || rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer)) throw new ProviderError('webhook', 'raw_body_required', true);
  const bytes = typeof rawBody === 'string' ? encoder.encode(rawBody) : new Uint8Array(rawBody);
  const values = String(header || '').split(',').map(x => x.trim().split('='));
  const timestamps = values.filter(([k]) => k === 't');
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > tolerance) throw new ProviderError('webhook', 'invalid_signature', true);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const prefix = encoder.encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.length + bytes.length); payload.set(prefix); payload.set(bytes, prefix.length);
  let valid = false;
  for (const [version, hex] of values) {
    if (version === 'v1' && /^[a-fA-F0-9]{64}$/.test(hex || '')) {
      const signature = Uint8Array.from(hex.match(/../g), x => parseInt(x, 16));
      if (await crypto.subtle.verify('HMAC', key, signature, payload)) valid = true;
    }
  }
  if (!valid) throw new ProviderError('webhook', 'invalid_signature', true);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ProviderError('webhook', 'invalid_body', true); }
}

function createAdapters(env, options = {}) {
  const fetcher = options.fetch || globalThis.fetch;
  const now = options.now || Date.now;
  async function request(provider, url, init = {}) {
    let response;
    // workerd rejects redirect:'error'. Manual plus the non-2xx check below
    // preserves fail-closed redirects without forwarding provider credentials.
    try { response = await fetcher(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) }); }
    catch { throw new ProviderError(provider, 'response_unknown'); }
    if (!response.ok) {
      // Timeouts, conflicts, rate limits and 5xx may follow a successful write.
      throw new ProviderError(provider, `http_${response.status}`, [400, 401, 403, 404, 422].includes(response.status));
    }
    try { return await response.json(); }
    catch { throw new ProviderError(provider, 'invalid_response'); }
  }
  function stripeKey() {
    const key = required(env.STRIPE_SECRET_KEY, 'missing_stripe_key');
    const live = env.STRIPE_MODE === 'live' && env.ALLOW_LIVE_PAYMENTS === 'true';
    if (!(live ? /^[sr]k_live_/ : /^[sr]k_test_/).test(key)) throw new ProviderError('stripe', 'mode_key_mismatch', true);
    return key;
  }
  function stripe(path, fields, idempotencyKey) {
    const headers = { Authorization: `Bearer ${stripeKey()}`, 'Stripe-Version': VERSION };
    if (fields) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['Idempotency-Key'] = required(idempotencyKey, 'missing_idempotency_key'); }
    return request('stripe', `https://api.stripe.com/v1${path}`, { method: fields ? 'POST' : 'GET', headers, ...(fields ? { body: form(fields) } : {}) });
  }
  function checkoutResult(session) {
    if (session.livemode !== (env.STRIPE_MODE === 'live' && env.ALLOW_LIVE_PAYMENTS === 'true')) throw new ProviderError('stripe', 'unexpected_mode');
    identity(session.metadata?.booking_id);
    if (session.client_reference_id !== session.metadata.booking_id || session.mode !== 'payment') throw new ProviderError('stripe', 'invalid_correlation');
    amountCheck(session.amount_total, session.currency);
    const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (session.payment_status === 'paid' && !/^pi_[A-Za-z0-9]+$/.test(paymentId || '')) throw new ProviderError('stripe', 'missing_payment_identity');
    return { status: session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'expired' : 'unpaid', checkoutId: session.id, bookingId: session.metadata.booking_id, paymentId, amount: session.amount_total, currency: session.currency };
  }
  const payments = {
    async createCheckout({ bookingId, amount, currency, email, idempotencyKey, expiresAt, successUrl, cancelUrl }) {
      identity(bookingId); amountCheck(amount, currency);
      // Stripe minimum is 30 minutes. The durable core expires at its own 15m
      // deadline, calls expireCheckout, and refunds every late payment.
      // The core fixes this timestamp at first attempt (at least 31m ahead).
      // Preserve it on retries: Stripe idempotency rejects changed parameters.
      const expires = Math.floor(instant(expiresAt) / 1000);
      if (expires > Math.floor(now() / 1000) + 24 * 3600) throw new ProviderError('input', 'invalid_expiry', true);
      const success = new URL(required(successUrl || env.CHECKOUT_SUCCESS_URL, 'missing_success_url'));
      const cancel = new URL(required(cancelUrl || env.CHECKOUT_CANCEL_URL, 'missing_cancel_url'));
      if (success.protocol !== 'https:' || cancel.protocol !== 'https:') throw new ProviderError('configuration', 'https_required', true);
      success.hash = new URLSearchParams({ booking: bookingId, checkout: 'returned' }).toString();
      cancel.hash = new URLSearchParams({ booking: bookingId }).toString();
      const integration = required(env.STRIPE_INTEGRATION_IDENTIFIER, 'missing_integration_identifier');
      if (!/-[a-z]{8}$/.test(integration)) throw new ProviderError('configuration', 'invalid_integration_identifier', true);
      const session = await stripe('/checkout/sessions', {
        mode: 'payment', client_reference_id: bookingId, customer_email: email,
        'metadata[booking_id]': bookingId, 'payment_intent_data[metadata][booking_id]': bookingId,
        'line_items[0][price_data][currency]': 'gbp', 'line_items[0][price_data][unit_amount]': amount,
        'line_items[0][price_data][product_data][name]': amount >= 10000 ? 'Tachyharmonic two-hour appointment' : 'Tachyharmonic one-hour appointment',
        'line_items[0][quantity]': 1, expires_at: expires, success_url: success.href, cancel_url: cancel.href,
        integration_identifier: integration,
      }, idempotencyKey);
      if (!/^cs_[A-Za-z0-9_]+$/.test(session.id || '') || typeof session.url !== 'string' || new URL(session.url).origin !== 'https://checkout.stripe.com') throw new ProviderError('stripe', 'invalid_checkout_response');
      return { checkoutId: session.id, checkoutUrl: session.url };
    },
    async getCheckout({ checkoutId }) { identity(checkoutId); return checkoutResult(await stripe(`/checkout/sessions/${checkoutId}`)); },
    async findCheckout({ bookingId, createdAfter, createdBefore, amount }) {
      // A lost create response must be recovered by identity, never by creating
      // another session. Read a bounded interval completely before accepting a
      // unique match. Empty/partial/ambiguous results never prove absence.
      try {
        identity(bookingId);
        const start = instant(createdAfter), end = instant(createdBefore);
        if (end < start || end - start > 86400000) return { state: 'unknown' };
        let cursor; const matches = [];
        for (let page = 0; page < 3; page++) {
          const result = await stripe(`/checkout/sessions?${form({ 'created[gte]': Math.floor(start / 1000), 'created[lte]': Math.ceil(end / 1000), limit: 100, starting_after: cursor })}`);
          if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean') return { state: 'unknown' };
          for (const candidate of result.data) {
            if (candidate.metadata?.booking_id !== bookingId || candidate.client_reference_id !== bookingId) continue;
            const normalized = checkoutResult(candidate);
            if (amount !== undefined && normalized.amount !== amount) return { state: 'unknown' };
            if (!/^cs_[A-Za-z0-9_]+$/.test(normalized.checkoutId || '')) return { state: 'unknown' };
            matches.push(normalized);
          }
          if (!result.has_more) return matches.length === 1 ? { state: 'found', ...matches[0] } : { state: 'unknown' };
          const next = result.data.at(-1)?.id;
          if (!/^cs_[A-Za-z0-9_]+$/.test(next || '') || next === cursor) return { state: 'unknown' };
          cursor = next;
        }
      } catch { /* A failed read cannot establish whether creation succeeded. */ }
      return { state: 'unknown' };
    },
    async expireCheckout({ checkoutId }) { identity(checkoutId); const result = await stripe(`/checkout/sessions/${checkoutId}/expire`, {}, `expire-${checkoutId}`); return { status: result.status }; },
    async refund({ paymentId, bookingId, amount, idempotencyKey }) {
      if (!/^pi_[A-Za-z0-9]+$/.test(paymentId || '')) throw new ProviderError('input', 'invalid_payment_identity', true);
      amountCheck(amount);
      const result = await stripe('/refunds', { payment_intent: paymentId, amount, ...(bookingId ? { 'metadata[booking_id]': identity(bookingId) } : {}) }, idempotencyKey);
      if (!/^re_[A-Za-z0-9]+$/.test(result.id || '') || !['pending', 'succeeded', 'requires_action', 'failed', 'canceled'].includes(result.status) || result.amount !== amount || result.payment_intent !== paymentId) throw new ProviderError('stripe', 'refund_not_accepted');
      return { refundId: result.id, status: result.status };
    },
    async getRefund({ paymentId, bookingId, amount, refundId, excludeRefundIds = [] }) {
      try {
        if (!/^pi_[A-Za-z0-9]+$/.test(paymentId || '')) return { state: 'unknown' };
        identity(bookingId);
        if (refundId && !/^re_[A-Za-z0-9]+$/.test(refundId)) return { state: 'unknown' };
        const response = refundId ? { data: [await stripe(`/refunds/${refundId}`)], has_more: false } : await stripe(`/refunds?${form({ payment_intent: paymentId, limit: 100 })}`);
        if (!Array.isArray(response.data) || response.has_more) return { state: 'unknown' };
        const matches = response.data.filter(x => (!refundId || x.id === refundId) && !excludeRefundIds.includes(x.id) && /^re_[A-Za-z0-9]+$/.test(x.id || '') && x.payment_intent === paymentId && x.metadata?.booking_id === bookingId && AMOUNTS.has(x.amount) && (amount === undefined || x.amount === amount) && ['pending', 'succeeded', 'failed', 'canceled', 'requires_action'].includes(x.status));
        return matches.length === 1 ? { state: 'found', refundId: matches[0].id, status: matches[0].status, amount: matches[0].amount } : { state: 'unknown' };
      } catch { return { state: 'unknown' }; }
    },
    async refundRetryEligibility({ paymentId, bookingId, amount, refundId }) {
      try {
        if (!/^pi_[A-Za-z0-9]+$/.test(paymentId || '') || !/^re_[A-Za-z0-9]+$/.test(refundId || '')) return { eligible: false };
        identity(bookingId); amountCheck(amount);
        const response = await stripe(`/refunds?${form({ payment_intent: paymentId, limit: 100 })}`);
        if (!Array.isArray(response.data) || response.has_more !== false) return { eligible: false };
        const previous = response.data.find(x => x.id === refundId);
        if (!previous || previous.payment_intent !== paymentId || previous.metadata?.booking_id !== bookingId || previous.amount !== amount || !['failed', 'canceled'].includes(previous.status)) return { eligible: false };
        // Include manual/unrelated-metadata refunds: any unresolved or paid-out
        // refund on this payment prevents another full-amount attempt.
        if (response.data.some(x => !/^re_[A-Za-z0-9]+$/.test(x.id || '') || x.payment_intent !== paymentId || !['failed', 'canceled'].includes(x.status))) return { eligible: false };
        return { eligible: true, previousStatus: previous.status };
      } catch { return { eligible: false }; }
    },
    async verifyWebhook(rawBody, signature) {
      const event = await verifySignedBody(rawBody, signature, env.STRIPE_WEBHOOK_SECRET, now(), 300);
      identity(event.id);
      if (event.livemode !== (env.STRIPE_MODE === 'live' && env.ALLOW_LIVE_PAYMENTS === 'true')) throw new ProviderError('stripe', 'unexpected_mode', true);
      if (['refund.updated', 'refund.failed', 'refund.created'].includes(event.type)) {
        const refund = event.data?.object;
        return { eventId: event.id, kind: 'refund_updated', paymentId: refund?.payment_intent, bookingId: refund?.metadata?.booking_id, refundId: refund?.id };
      }
      const kinds = { 'checkout.session.completed': 'payment_completed', 'checkout.session.async_payment_succeeded': 'payment_completed', 'checkout.session.async_payment_failed': 'payment_failed', 'checkout.session.expired': 'checkout_expired' };
      if (!kinds[event.type]) return { eventId: event.id, kind: 'ignored' };
      const session = checkoutResult(event.data?.object);
      if (kinds[event.type] === 'payment_completed' && session.status !== 'paid') return { eventId: event.id, kind: 'ignored' };
      return { ...session, eventId: event.id, kind: kinds[event.type], ...(Number.isFinite(event.created) ? { paidAt: new Date(event.created * 1000).toISOString() } : {}) };
    },
  };

  function calendly(path, body) {
    return request('calendly', `https://api.calendly.com${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${required(env.CALENDLY_TOKEN, 'missing_calendly_token')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  function eventType(durationMinutes) {
    if (![60, 120].includes(durationMinutes)) throw new ProviderError('input', 'invalid_duration', true);
    const uri = required(env[durationMinutes === 60 ? 'CALENDLY_EVENT_TYPE_60' : 'CALENDLY_EVENT_TYPE_120'], 'missing_event_type');
    if (!/^https:\/\/api\.calendly\.com\/event_types\/[A-Za-z0-9-]+$/.test(uri)) throw new ProviderError('configuration', 'invalid_event_type', true);
    return uri;
  }
  async function collection(path) {
    const items = []; let current = path;
    for (let page = 0; page < 30; page++) {
      const data = await calendly(current);
      if (!Array.isArray(data.collection)) throw new ProviderError('calendly', 'invalid_collection');
      items.push(...data.collection);
      if (!data.pagination?.next_page) return items;
      const next = new URL(data.pagination.next_page);
      if (next.origin !== 'https://api.calendly.com' || next.pathname !== new URL(`https://api.calendly.com${path}`).pathname) throw new ProviderError('calendly', 'invalid_pagination');
      current = next.pathname + next.search;
    }
    throw new ProviderError('calendly', 'pagination_limit');
  }
  const scheduler = {
    async listAvailable({ from, to, durationMinutes }) {
      if (instant(to) <= instant(from) || instant(to) - instant(from) > 31 * 86400000) throw new ProviderError('input', 'invalid_range', true);
      const data = await collection(`/event_type_available_times?${form({ event_type: eventType(durationMinutes), start_time: new Date(from).toISOString(), end_time: new Date(to).toISOString() })}`);
      return data.filter(x => x.status === 'available' && x.invitees_remaining > 0).map(x => ({ startsAt: new Date(instant(x.start_time)).toISOString() }));
    },
    async isAvailable({ startsAt, durationMinutes }) {
      const slots = await scheduler.listAvailable({ from: startsAt, to: new Date(instant(startsAt) + 60000).toISOString(), durationMinutes });
      return slots.some(x => instant(x.startsAt) === instant(startsAt));
    },
    async createAppointment({ bookingId, startsAt, durationMinutes, name, email }) {
      identity(bookingId);
      // Both verified V1 event types use Zoom. Calendly's Scheduling API guide
      // requires location.kind when the event type specifies a location.
      const resource = (await calendly('/invitees', { event_type: eventType(durationMinutes), start_time: new Date(instant(startsAt)).toISOString(), invitee: { name, email, timezone: 'Europe/London' }, location: { kind: 'zoom_conference' }, tracking: { utm_source: 'tachyharmonic', utm_content: bookingId } })).resource;
      eventPath(resource?.event);
      if (resource.status !== 'active' || resource.email?.toLowerCase() !== email.toLowerCase() || resource.tracking?.utm_content !== bookingId) throw new ProviderError('calendly', 'unconfirmed_creation');
      const canonical = (await calendly(eventPath(resource.event))).resource;
      if (canonical?.uri !== resource.event || canonical.status !== 'active' || canonical.event_type !== eventType(durationMinutes) || instant(canonical.start_time) !== instant(startsAt) || instant(canonical.end_time) !== instant(startsAt) + durationMinutes * 60000) throw new ProviderError('calendly', 'unconfirmed_event_details');
      return { appointmentId: resource.event };
    },
    async findAppointment({ bookingId, startsAt, durationMinutes, email }) {
      // An empty eventually-consistent listing cannot authorize another create.
      try {
        identity(bookingId);
        const events = await collection(`/scheduled_events?${form({ user: required(env.CALENDLY_USER_URI, 'missing_calendly_user'), invitee_email: email, min_start_time: new Date(instant(startsAt) - 1000).toISOString(), max_start_time: new Date(instant(startsAt) + 1000).toISOString() })}`);
        const matches = [];
        for (const event of events) {
          if (instant(event.start_time) !== instant(startsAt) || instant(event.end_time) !== instant(startsAt) + durationMinutes * 60000 || event.event_type !== eventType(durationMinutes) || event.status !== 'active') continue;
          const invitees = await collection(`${eventPath(event.uri)}/invitees`);
          if (invitees.some(x => x.tracking?.utm_content === bookingId && x.email?.toLowerCase() === email.toLowerCase() && x.status === 'active')) matches.push(event.uri);
        }
        return matches.length === 1 ? { state: 'found', appointmentId: matches[0] } : { state: 'unknown' };
      } catch { return { state: 'unknown' }; }
    },
    async cancelAppointment({ appointmentId }) {
      const result = await calendly(`${eventPath(appointmentId)}/cancellation`, { reason: 'Cancellation requested through Tachyharmonic' });
      if (!result.resource?.created_at) throw new ProviderError('calendly', 'unconfirmed_cancellation');
      return { cancellationId: `${appointmentId}/cancellation` };
    },
    async getAppointment({ appointmentId }) {
      const result = (await calendly(eventPath(appointmentId))).resource;
      return { status: ['active', 'canceled'].includes(result?.status) ? result.status : 'unknown', ...(result?.start_time ? { startsAt: new Date(instant(result.start_time)).toISOString() } : {}), ...(result?.end_time ? { endsAt: new Date(instant(result.end_time)).toISOString() } : {}) };
    },
    async verifyWebhook(rawBody, signature) {
      const event = await verifySignedBody(rawBody, signature, env.CALENDLY_WEBHOOK_SECRET, now(), 180);
      // Calendly does not supply a top-level event ID. Hash stable event data,
      // not the signature timestamp, so redelivery has the same identity.
      const fingerprint = encoder.encode(JSON.stringify([event.event, event.created_at, event.payload?.uri]));
      const digest = await crypto.subtle.digest('SHA-256', fingerprint);
      const eventId = 'cal_' + [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      if (!['invitee.canceled', 'invitee.created'].includes(event.event)) return { eventId, kind: 'ignored' };
      eventPath(event.payload?.event);
      if (!event.payload.uri || !event.created_at) throw new ProviderError('calendly', 'invalid_webhook', true);
      return { eventId, kind: event.event === 'invitee.canceled' ? 'appointment_canceled' : 'appointment_created', appointmentId: event.payload.event, bookingId: event.payload.tracking?.utm_content, rescheduled: event.payload.rescheduled === true };
    },
  };

  let googleAccess; let googleExpiry = 0;
  async function googleToken() {
    if (googleAccess && googleExpiry > now() + 60000) return googleAccess;
    const token = await request('google', 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', client_id: required(env.GOOGLE_CLIENT_ID, 'missing_google_client'), client_secret: required(env.GOOGLE_CLIENT_SECRET, 'missing_google_secret'), refresh_token: required(env.GOOGLE_REFRESH_TOKEN, 'missing_google_refresh') }) });
    googleAccess = required(token.access_token, 'missing_google_access'); googleExpiry = now() + Number(token.expires_in || 0) * 1000;
    return googleAccess;
  }
  const calendar = {
    async getBusy({ startsAt, endsAt }) {
      if (instant(endsAt) <= instant(startsAt)) throw new ProviderError('input', 'invalid_range', true);
      if (env.CALENDAR_SOURCE === 'calendly') {
        // This endpoint returns an aggregate, not calendar identities. The flag
        // records an operator check that Primary, Work and Home are all selected
        // under Check for conflicts. Recheck that configuration before launch
        // and after any calendar-connection change. Never infer it from no events.
        if (env.CALENDLY_CONFLICT_CALENDARS_VERIFIED !== 'true') throw new ProviderError('configuration', 'calendar_coverage_not_verified', true);
        const user = required(env.CALENDLY_USER_URI, 'missing_calendly_user');
        if (!/^https:\/\/api\.calendly\.com\/users\/[A-Za-z0-9-]+$/.test(user)) throw new ProviderError('configuration', 'invalid_calendly_user', true);
        const start = instant(startsAt), end = instant(endsAt);
        if (start < now() || end - start > 32 * 86400000) throw new ProviderError('input', 'invalid_busy_range', true);
        const union = [];
        // A visitor week plus protected buffers can exceed the endpoint's
        // seven-day limit. Fetch every adjacent window and fail the entire
        // request if any window is missing or fails.
        for (let cursor = start; cursor < end; cursor += 7 * 86400000) {
          const data = await calendly(`/user_busy_times?${form({ user, start_time: new Date(cursor).toISOString(), end_time: new Date(Math.min(end, cursor + 7 * 86400000)).toISOString() })}`);
          if (!Array.isArray(data.collection)) throw new ProviderError('calendly', 'invalid_busy_collection');
          for (const item of data.collection) {
            if (!['calendly', 'reserved', 'external'].includes(item.type)) throw new ProviderError('calendly', 'unknown_busy_type');
            const eventStart = instant(item.start_time), eventEnd = instant(item.end_time);
            if (eventEnd <= eventStart) throw new ProviderError('calendly', 'invalid_busy_interval');
            const protectedStart = item.buffered_start_time ? Math.min(eventStart, instant(item.buffered_start_time)) : eventStart;
            const protectedEnd = item.buffered_end_time ? Math.max(eventEnd, instant(item.buffered_end_time)) : eventEnd;
            const interval = { startsAt: new Date(protectedStart).toISOString(), endsAt: new Date(protectedEnd).toISOString() };
            if (!union.some(x => x.startsAt === interval.startsAt && x.endsAt === interval.endsAt)) union.push(interval);
          }
        }
        // Repeating the all-conflict union is conservative; these arrays do not
        // claim to identify an event's originating Google calendar.
        return { Primary: union.map(x => ({ ...x })), Work: union.map(x => ({ ...x })), Home: union.map(x => ({ ...x })) };
      }
      if (env.CALENDAR_SOURCE && env.CALENDAR_SOURCE !== 'google') throw new ProviderError('configuration', 'unknown_calendar_source', true);
      const ids = { Primary: required(env.GOOGLE_CALENDAR_PRIMARY, 'missing_primary'), Work: required(env.GOOGLE_CALENDAR_WORK, 'missing_work'), Home: required(env.GOOGLE_CALENDAR_HOME, 'missing_home') };
      if (new Set(Object.values(ids)).size !== 3) throw new ProviderError('configuration', 'three_distinct_calendars_required', true);
      // Google freeBusy excludes transparent events without fetching their text.
      const result = await request('google', 'https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeMin: startsAt, timeMax: endsAt, timeZone: 'Europe/London', items: Object.values(ids).map(id => ({ id })) }) });
      if (instant(result.timeMin) > instant(startsAt) || instant(result.timeMax) < instant(endsAt)) throw new ProviderError('google', 'incomplete_calendar_range');
      const busy = {};
      for (const [name, id] of Object.entries(ids)) {
        const item = result.calendars?.[id];
        if (!item || (item.errors && (!Array.isArray(item.errors) || item.errors.length)) || !Array.isArray(item.busy)) throw new ProviderError('google', 'calendar_unavailable');
        busy[name] = item.busy.map(x => { if (instant(x.end) <= instant(x.start)) throw new ProviderError('google', 'invalid_busy_interval'); return { startsAt: x.start, endsAt: x.end }; });
      }
      return busy;
    },
  };
  const notifications = {
    async send(message) {
      const rendered = renderMessage(message);
      const from = required(env.TRANSACTIONAL_FROM, 'missing_transactional_sender');
      if (!/^[^<>\r\n]+<[^<>\s]+@(?:[a-z0-9-]+\.)*tachyharmonic\.ai>$/i.test(from) || from.toLowerCase().includes(CONTACT)) throw new ProviderError('configuration', 'independent_sender_required', true);
      if (env.TRANSACTIONAL_DOMAIN_VERIFIED !== 'true') throw new ProviderError('configuration', 'sender_not_verified', true);
      const to = message.kind === 'operational_alert' ? CONTACT : message.email;
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to || '')) throw new ProviderError('input', 'invalid_recipient', true);
      const result = await request('resend', 'https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${required(env.RESEND_API_KEY, 'missing_email_key')}`, 'Content-Type': 'application/json', 'Idempotency-Key': required(message.idempotencyKey, 'missing_idempotency_key') }, body: JSON.stringify({ from, to: [to], ...rendered }) });
      if (!result.id) throw new ProviderError('resend', 'unconfirmed_send');
      return { messageId: result.id };
    },
  };
  if (env.SCHEDULER_PROVIDER && !['google', 'calendly'].includes(env.SCHEDULER_PROVIDER)) throw new ProviderError('configuration', 'unknown_scheduler_provider', true);
  if (env.SCHEDULER_PROVIDER === 'google' && env.CALENDAR_SOURCE !== 'google') throw new ProviderError('configuration', 'google_calendar_source_required', true);
  const selectedScheduler = env.SCHEDULER_PROVIDER === 'google' ? createGoogleScheduler({ env, fetcher, googleToken, calendar, ProviderError, now }) : scheduler;
  return { payments, scheduler: selectedScheduler, calendar, notifications };
}

module.exports = { createAdapters, ProviderError, verifySignedBody };
