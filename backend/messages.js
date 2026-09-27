'use strict';

// Only explicit transaction facts are rendered. Intake notes are never accepted
// into a message, provider metadata, or operational alert.
const CONTACT = 'jonathan@tachyharmonic.ai';
const { assertContractTerms } = require('../booking/contract-terms');
const COPY = Object.freeze({
  booking_confirmed: ['Your Tachyharmonic appointment is confirmed', 'Your appointment is confirmed.'],
  booking_failed: ['Your Tachyharmonic booking could not be completed', 'No appointment has been confirmed. If payment was taken, a full refund is being arranged. You can choose another time.'],
  cancellation_confirmed: ['Your Tachyharmonic appointment is cancelled', 'Your appointment has been cancelled. Any refund due will be confirmed separately.'],
  refund_initiated: ['Your Tachyharmonic refund has been initiated', 'Stripe has accepted your refund. This does not mean the funds have reached your account yet; your payment provider determines when they arrive.'],
  cancellation_refund_pending: ['Your Tachyharmonic request is still being processed', 'Your cancellation or refund is still being processed. This message does not confirm that cancellation or a refund has completed. Jonathan will follow up if action is needed.'],
  manual_review_received: ['Your request has been received', 'Your request has been recorded for Jonathan to review. No cancellation or refund decision has been made yet.'],
  operational_alert: ['Tachyharmonic booking needs attention', 'A booking needs operational review. Check the private booking record and provider state before taking action.'],
});

function renderMessage({ kind, bookingId, startsAt, durationMinutes, amount, manageUrl, meetingUrl, status, consent, contractAt, cancellationEndsAt, contractTerms }) {
  if (!COPY[kind]) throw new Error('Unknown transaction message');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId || '')) throw new Error('Invalid booking identity');
  const [subject, introduction] = COPY[kind];
  if (kind === 'booking_confirmed') {
    assertContractTerms(contractTerms);
    if (!consent) throw new Error('Durable consent record required');
  }
  const lines = [introduction, '', `Booking reference: ${bookingId}`];
  if (startsAt) {
    const date = new Date(startsAt);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid appointment date');
    lines.push(`Appointment time: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' }).format(date)} (Europe/London)`);
  }
  if ([60, 120].includes(durationMinutes)) lines.push(`Duration: ${durationMinutes === 60 ? 'one hour' : 'two hours'}`);
  if ([3000, 5000, 7000, 10000, 14000].includes(amount)) lines.push(`Amount: £${(amount / 100).toFixed(2)}`);
  if (kind === 'booking_confirmed' && meetingUrl) {
    const url = new URL(meetingUrl);
    if (url.origin !== 'https://meet.google.com' || !/^\/[a-z-]+$/.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error('Invalid meeting link');
    lines.push(`Join your appointment on Google Meet: ${url.href}`);
  }
  if (kind === 'booking_confirmed' && consent) {
    if (typeof consent.earlyStart !== 'boolean' || typeof consent.version !== 'string' || typeof consent.wording !== 'string' || consent.wording.length > 2000) throw new Error('Invalid consent record');
    for (const value of [contractAt, cancellationEndsAt, consent.at]) if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid contract timestamp');
    const display = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
    lines.push('', `Contract confirmed: ${display(contractAt)} (Europe/London).`,
      `The normal statutory cancellation period ends immediately before ${display(cancellationEndsAt)} (Europe/London).`,
      `Early performance requested: ${consent.earlyStart ? 'Yes' : 'No'}.`,
      `Choice recorded: ${display(consent.at)} (Europe/London); terms version ${consent.version}.`,
      `The choice presented was: ${consent.wording}`,
      'Your statutory rights take precedence over the appointment cancellation policy.');
  }
  if (kind === 'operational_alert' && /^[a-z_]{1,80}$/.test(status || '')) lines.push(`Recorded state: ${status}`);
  if (manageUrl && kind !== 'operational_alert') {
    const url = new URL(manageUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid management link');
    lines.push('', `View your booking or request a cancellation: ${url.href}`);
  }
  if (kind === 'booking_confirmed') lines.push('', `Booking terms snapshot: ${contractTerms.version}`, contractTerms.text);
  lines.push('', `For enquiries or rescheduling, reply to ${CONTACT}.`);
  return { subject, text: lines.join('\n'), reply_to: CONTACT };
}

module.exports = { CONTACT, COPY, renderMessage };
