'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { COPY, renderMessage: render } = require('./messages');
const { createContractTerms, VERSION: TERMS_VERSION } = require('../booking/contract-terms');
const { VERSION, WORDING, cancellationEndsAt } = require('../booking/consent');
const contractAt = '2026-09-28T08:00:00Z';
const contractTerms = createContractTerms({ traderAddress: 'TEST FIXTURE ONLY, 1 Example Street, Test Town, ZZ1 1ZZ' });
const confirmedFacts = { contractTerms, contractAt, cancellationEndsAt: cancellationEndsAt(contractAt), consent: { version: VERSION, wording: WORDING, earlyStart: true, at: '2026-09-28T07:55:00Z' } };
const renderMessage = input => render({ ...confirmedFacts, ...input });
test('six transactional templates plus operational alert use only explicit facts', () => {
  assert.equal(Object.keys(COPY).length, 7);
  for (const kind of Object.keys(COPY)) {
    const message = renderMessage({ kind, bookingId: 'abc', startsAt: '2026-10-01T10:00:00Z', durationMinutes: 120, amount: 14000, note: 'SECRET', rawNotes: 'SECRET', name: '<script>SECRET</script>' });
    assert.ok(!JSON.stringify(message).includes('SECRET'));
    assert.match(message.text, /Europe\/London/); assert.match(message.text, /two hours/); assert.match(message.text, /£140.00/);
    assert.equal(message.reply_to, 'jonathan@tachyharmonic.ai');
  }
});
test('failure/pending/refund language never claims completed funds or an appointment', () => {
  assert.match(renderMessage({ kind: 'booking_failed', bookingId: 'abc' }).text, /No appointment has been confirmed/);
  assert.match(renderMessage({ kind: 'refund_initiated', bookingId: 'abc' }).text, /does not mean the funds have reached/);
  assert.match(renderMessage({ kind: 'manual_review_received', bookingId: 'abc' }).text, /No cancellation or refund decision/);
  assert.match(renderMessage({ kind: 'manual_review_received', bookingId: 'abc' }).text, /valid statutory cancellation right/);
  assert.match(renderMessage({ kind: 'cancellation_refund_pending', bookingId: 'abc' }).text, /does not confirm/);
});
test('management links are absent unless real secure link supplied', () => {
  assert.ok(!renderMessage({ kind: 'booking_confirmed', bookingId: 'abc' }).text.includes('https://'));
  assert.throws(() => renderMessage({ kind: 'booking_confirmed', bookingId: 'abc', manageUrl: 'javascript:alert(1)' }));
});
test('only confirmed messages include a verified Google Meet URL',()=>{
  const input={bookingId:'abc',meetingUrl:'https://meet.google.com/abc-defg-hij'};
  assert.match(renderMessage({...input,kind:'booking_confirmed'}).text,/Join your appointment on Google Meet/);
  assert.ok(!renderMessage({...input,kind:'cancellation_refund_pending'}).text.includes('meet.google.com'));
  for(const meetingUrl of ['http://meet.google.com/abc','https://evil.test/abc','https://meet.google.com/abc?x=1','https://meet.google.com@evil.test/abc']) assert.throws(()=>renderMessage({...input,kind:'booking_confirmed',meetingUrl}));
});
test('confirmation records the exact consent choice and contract cancellation period', () => {
  const { VERSION, WORDING, cancellationEndsAt } = require('../booking/consent');
  const contractAt = '2026-09-28T08:00:00Z';
  const message = renderMessage({ kind: 'booking_confirmed', bookingId: 'abc', contractAt, cancellationEndsAt: cancellationEndsAt(contractAt), consent: { version: VERSION, wording: WORDING, earlyStart: true, at: '2026-09-28T07:55:00Z' } });
  assert.ok(message.text.includes(WORDING)); assert.ok(message.text.includes(VERSION));
  assert.match(message.text, /Early performance requested: Yes/);
  assert.match(message.text, /Contract confirmed:/);
  assert.match(message.text, /ends immediately before/);
});
test('confirmed email embeds durable full booking terms and usable cancellation form',()=>{
  const message=renderMessage({kind:'booking_confirmed',bookingId:'abc'});
  for(const phrase of ['Jonathan Bonello','TEST FIXTURE ONLY','£30 supported','£50 standard','£70 solidarity','£100 standard','£140 solidarity','At least 24 hours','Under 24 hours','14 days after the day','proportionate amount','Model cancellation form','Name of consumer(s)','Address of consumer(s)','Signature of consumer(s)','Date:','jonathan@tachyharmonic.ai',TERMS_VERSION]) assert.ok(message.text.includes(phrase),phrase);
  assert.ok(message.text.includes(contractTerms.text));
  assert.ok(!message.text.includes('https://'));
});
test('missing address or missing durable contract data fails closed without fabricating information',()=>{
  for(const traderAddress of [undefined,'','short','12345\u0000Example']) assert.throws(()=>createContractTerms({traderAddress}),/trader_address_required/);
  assert.throws(()=>render({kind:'booking_confirmed',bookingId:'abc'}),/Durable contract terms required/);
  assert.throws(()=>render({kind:'booking_confirmed',bookingId:'abc',contractTerms}),/Durable consent record required/);
  assert.doesNotThrow(()=>render({kind:'operational_alert',bookingId:'INTEGRATION-TEST'}));
});
test('existing confirmation uses its saved snapshot verbatim despite a newer address or terms version',()=>{
  const saved=JSON.parse(JSON.stringify(contractTerms));
  createContractTerms({traderAddress:'NEW TEST FIXTURE, 99 Different Road, Test Town, ZZ2 2ZZ'});
  const message=renderMessage({kind:'booking_confirmed',bookingId:'abc',contractTerms:saved});
  assert.ok(message.text.includes(saved.text));assert.ok(!message.text.includes('Different Road'));
  assert.ok(Object.isFrozen(contractTerms));
});
