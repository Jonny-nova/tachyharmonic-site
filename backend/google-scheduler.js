'use strict';

// Direct host-calendar appointments: there is no public scheduling URL.
function createGoogleScheduler({ env, fetcher, googleToken, calendar, ProviderError, now }) {
  const required = (value, code) => { if (typeof value !== 'string' || !value) throw new ProviderError('google', code, true); return value; };
  const instant = value => { const time = Date.parse(value); if (!Number.isFinite(time)) throw new ProviderError('google', 'invalid_time', true); return time; };
  const calendarId = () => required(env.GOOGLE_BOOKING_CALENDAR || env.GOOGLE_CALENDAR_PRIMARY, 'missing_booking_calendar');
  const calendarPath = () => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}`;
  const validateId = id => { if (!/^th[0-9a-f]{64}$/.test(id || '')) throw new ProviderError('google', 'invalid_event_identity', true); return id; };
  const eventUrl = id => `${calendarPath()}/events/${validateId(id)}`;
  async function eventId(bookingId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId || '')) throw new ProviderError('google', 'invalid_booking_identity', true);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tachyharmonic:v1:${bookingId}`));
    // Hex is a subset of Google's base32hex event-ID alphabet (0-9, a-v).
    return 'th' + [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function call(url, { method = 'GET', body, allowMissing = false, allowConflict = false, etag } = {}) {
    let result;
    try { result = await fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${await googleToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new ProviderError('google', 'response_unknown'); }
    if (allowMissing && [404, 410].includes(result.status)) return null;
    if (allowConflict && result.status === 409) return { conflict: true };
    if (!result.ok) throw new ProviderError('google', `http_${result.status}`, [400, 401, 403, 404, 422].includes(result.status));
    if (result.status === 204) return {};
    try { return await result.json(); } catch { throw new ProviderError('google', 'invalid_response'); }
  }
  async function accessible() {
    // A missing event is not evidence of cancellation if access to its calendar
    // was lost. Require an independently readable canonical calendar first.
    const info = await call(`${calendarPath()}/events?maxResults=1&fields=kind,timeZone,accessRole`);
    if (info.kind !== 'calendar#events' || !['owner', 'writer'].includes(info.accessRole) || !info.timeZone) throw new ProviderError('google', 'calendar_access_unverified');
  }
  function meet(event) {
    const conference = event.conferenceData;
    const status = conference?.createRequest?.status?.statusCode;
    if (status === 'failure') return { conferenceStatus: 'failure' };
    const video = conference?.entryPoints?.find(x => x.entryPointType === 'video');
    if (status !== 'success' || conference?.conferenceSolution?.key?.type !== 'hangoutsMeet' || !video?.uri) return { conferenceStatus: 'pending' };
    const url = new URL(video.uri);
    if (url.origin !== 'https://meet.google.com' || !/^\/[a-z-]+$/.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new ProviderError('google', 'invalid_meeting_url');
    return { conferenceStatus: 'success', meetingUrl: url.href };
  }
  async function canonical(id, request) {
    const event = await call(eventUrl(id), { allowMissing: true });
    if (!event) { await accessible(); return { status: 'canceled', missing: true }; }
    if (event.id !== id) throw new ProviderError('google', 'event_identity_mismatch');
    if (event.status === 'cancelled') return { status: 'canceled' };
    const correlation = event.extendedProperties?.private;
    if (correlation?.source !== 'tachyharmonic-v1' || await eventId(correlation.booking_id) !== id || event.organizer?.self !== true) throw new ProviderError('google', 'event_correlation_mismatch');
    if (event.status !== 'confirmed' || event.guestsCanModify === true || event.guestsCanInviteOthers === true) throw new ProviderError('google', 'unsafe_event_state');
    const startsAt = new Date(instant(event.start?.dateTime)).toISOString(), endsAt = new Date(instant(event.end?.dateTime)).toISOString();
    if (request && (correlation.booking_id !== request.bookingId || instant(startsAt) !== instant(request.startsAt) || instant(endsAt) !== instant(request.startsAt) + request.durationMinutes * 60000 || !event.attendees?.some(x => x.email?.toLowerCase() === request.email.toLowerCase()))) throw new ProviderError('google', 'event_details_mismatch');
    return { status: 'active', startsAt, endsAt, etag: event.etag, ...meet(event) };
  }
  return {
    async listAvailable({ from, to, durationMinutes }) {
      if (![60, 120].includes(durationMinutes)) throw new ProviderError('google', 'invalid_duration', true);
      const start = instant(from), end = instant(to), step = 30 * 60000;
      if (end <= start || end - start > 7 * 86400000) throw new ProviderError('google', 'invalid_range', true);
      // Candidate instants only. BookingService applies all London windows,
      // date openings, calendar conflicts, buffers, notice and financial rules.
      const candidates = [];
      for (let cursor = Math.ceil(Math.max(start, now()) / step) * step; cursor < end; cursor += step) candidates.push({ startsAt: new Date(cursor).toISOString() });
      return candidates;
    },
    async isAvailable({ startsAt, durationMinutes }) {
      if (![60, 120].includes(durationMinutes)) throw new ProviderError('google', 'invalid_duration', true);
      const start = instant(startsAt) - 30 * 60000, end = instant(startsAt) + (durationMinutes + 30) * 60000;
      const busy = await calendar.getBusy({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
      for (const name of ['Primary', 'Work', 'Home']) {
        if (!Array.isArray(busy[name])) throw new ProviderError('google', 'calendar_unavailable');
        if (busy[name].some(x => instant(x.startsAt) < end && instant(x.endsAt) > start)) return false;
      }
      return true;
    },
    async createAppointment(request) {
      const { bookingId, startsAt, durationMinutes, name, email } = request;
      if (![60, 120].includes(durationMinutes)) throw new ProviderError('google', 'invalid_duration', true);
      const id = await eventId(bookingId);
      await call(`${calendarPath()}/events?conferenceDataVersion=1&sendUpdates=all`, { method: 'POST', allowConflict: true, body: {
        id, summary: 'Tachyharmonic appointment', description: 'For cancellation or rescheduling, use your private Tachyharmonic booking link or contact jonathan@tachyharmonic.ai. Declining this invitation does not cancel the booking.',
        start: { dateTime: new Date(instant(startsAt)).toISOString(), timeZone: 'Europe/London' },
        end: { dateTime: new Date(instant(startsAt) + durationMinutes * 60000).toISOString(), timeZone: 'Europe/London' },
        attendees: [{ email, displayName: name, responseStatus: 'needsAction' }],
        guestsCanModify: false, guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false,
        transparency: 'opaque', visibility: 'private',
        extendedProperties: { private: { booking_id: bookingId, source: 'tachyharmonic-v1' } },
        conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      } });
      // A POST response (including duplicate-ID409) never by itself confirms.
      let event;
      try { event = await canonical(id, request); }
      catch { throw Object.assign(new ProviderError('google', 'confirmation_unverified'), { appointmentId: id }); }
      if (event.status !== 'active' || event.conferenceStatus !== 'success') throw Object.assign(new ProviderError('google', event.conferenceStatus === 'failure' ? 'conference_failed' : 'conference_pending'), { appointmentId: id });
      return { appointmentId: id, meetingUrl: event.meetingUrl };
    },
    async findAppointment(request) {
      const id = await eventId(request.bookingId);
      try {
        const event = await canonical(id, request);
        if (event.status !== 'active') return { state: 'unknown', appointmentId: id };
        if (event.conferenceStatus === 'failure') return { state: 'conference_failed', appointmentId: id };
        if (event.conferenceStatus !== 'success') return { state: 'pending', appointmentId: id };
        return { state: 'found', appointmentId: id, meetingUrl: event.meetingUrl };
      } catch { return { state: 'unknown', appointmentId: id }; }
    },
    async getAppointment({ appointmentId }) { return canonical(appointmentId); },
    async cancelAppointment({ appointmentId, expectedStartsAt, expectedEndsAt }) {
      const before = await canonical(appointmentId);
      if (before.status !== 'canceled') {
        if (!expectedStartsAt || !expectedEndsAt || instant(before.startsAt) !== instant(expectedStartsAt) || instant(before.endsAt) !== instant(expectedEndsAt)) throw new ProviderError('google', 'event_time_changed');
        if (typeof before.etag !== 'string' || !before.etag) throw new ProviderError('google', 'event_version_unverified');
        await call(`${eventUrl(appointmentId)}?sendUpdates=all`, { method: 'DELETE', allowMissing: true, etag: before.etag });
      }
      const after = await canonical(appointmentId);
      if (after.status !== 'canceled') throw new ProviderError('google', 'cancellation_unconfirmed');
      return { cancellationId: `google-canceled-${appointmentId}` };
    },
    async verifyWebhook() { throw new ProviderError('google', 'webhook_not_supported', true); },
  };
}

module.exports = { createGoogleScheduler };
