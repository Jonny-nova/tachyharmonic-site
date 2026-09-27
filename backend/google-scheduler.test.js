'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleScheduler } = require('./google-scheduler');
const { ProviderError, createAdapters } = require('./providers');
const REQUEST = { bookingId: 'booking-123', startsAt: '2026-10-01T10:00:00Z', durationMinutes: 120, name: 'Client', email: 'client@example.test', note: 'PRIVATE NOTE' };
const success = { createRequest: { status: { statusCode: 'success' } }, conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] };
const response = (data, status=200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
function fixture() {
  const calls=[]; let event; let mode='success'; let deleteWorks=true; let calendarAccess=true; let timeoutAfterInsert=false; let conflict=false; let getStatus=200; let deleteConflict=false; let busy={Primary:[],Work:[],Home:[]};
  const scheduler=createGoogleScheduler({ env:{GOOGLE_CALENDAR_PRIMARY:'host@example.test'}, ProviderError, now:()=>Date.parse('2026-09-27T10:00:00Z'), googleToken:async()=>'fixture',calendar:{getBusy:async()=>busy},fetcher:async(url, init)=>{
    calls.push({url,init});
    if(init.method==='POST') {
      if(conflict) return response({},409);
      const input=JSON.parse(init.body); event={...input, etag:'"version1"',status:'confirmed',organizer:{self:true},conferenceData:mode==='success'?success:{createRequest:{status:{statusCode:mode}}}};
      if(timeoutAfterInsert) throw new Error('timeout');
      return response(event);
    }
    if(init.method==='DELETE') {if(deleteConflict)return response({},412);if(deleteWorks)event=undefined;return response(null,204);}
    if(url.includes('maxResults')) return calendarAccess?response({kind:'calendar#events',timeZone:'Europe/London',accessRole:'owner'}):response({},404);
    if(getStatus!==200)return response({},getStatus);
    return event?response(event):response({},404);
  }});
  return {scheduler,calls,get event(){return event},set mode(v){mode=v},set deleteWorks(v){deleteWorks=v},set calendarAccess(v){calendarAccess=v},set timeoutAfterInsert(v){timeoutAfterInsert=v},set conflict(v){conflict=v},set busy(v){busy=v},set getStatus(v){getStatus=v},set deleteConflict(v){deleteConflict=v}};
}
test('Google creates one exact paid appointment with private correlation, Meet and restricted guest permissions',async()=>{
  const f=fixture(); const result=await f.scheduler.createAppointment(REQUEST);const post=f.calls.find(x=>x.init.method==='POST');const body=JSON.parse(post.init.body);
  assert.match(result.appointmentId,/^th[0-9a-f]{64}$/);assert.equal(result.meetingUrl,'https://meet.google.com/abc-defg-hij');
  assert.equal(body.end.dateTime,'2026-10-01T12:00:00.000Z');assert.deepEqual(body.extendedProperties,{private:{booking_id:'booking-123',source:'tachyharmonic-v1'}});
  assert.equal(body.guestsCanModify,false);assert.equal(body.guestsCanInviteOthers,false);assert.equal(body.guestsCanSeeOtherGuests,false);
  assert.equal(body.conferenceData.createRequest.requestId,result.appointmentId);assert.equal(new URL(post.url).searchParams.get('conferenceDataVersion'),'1');assert.equal(new URL(post.url).searchParams.get('sendUpdates'),'all');
  assert.ok(!JSON.stringify(f.calls).includes('PRIVATE NOTE'));assert.equal(f.calls.at(-1).init.method,'GET');
});
test('stable event ID recovers unknown create and duplicate ID without another appointment',async()=>{
  const f=fixture();f.timeoutAfterInsert=true;await assert.rejects(f.scheduler.createAppointment(REQUEST),e=>!e.definitive);
  const recovered=await f.scheduler.findAppointment(REQUEST);assert.equal(recovered.state,'found');assert.equal(f.calls.filter(x=>x.init.method==='POST').length,1);
  f.timeoutAfterInsert=false;f.conflict=true;const repeated=await f.scheduler.createAppointment(REQUEST);assert.equal(repeated.appointmentId,recovered.appointmentId);
});
test('pending or failed Meet never confirms; reconciliation preserves deterministic identity',async()=>{
  const f=fixture();f.mode='pending';await assert.rejects(f.scheduler.createAppointment(REQUEST),e=>!e.definitive&&e.code==='conference_pending');
  const pending=await f.scheduler.findAppointment(REQUEST);assert.equal(pending.state,'pending');
  f.event.conferenceData.createRequest.status.statusCode='failure';assert.equal((await f.scheduler.findAppointment(REQUEST)).state,'conference_failed');
  f.event.conferenceData=success;assert.equal((await f.scheduler.findAppointment(REQUEST)).state,'found');assert.equal(f.calls.filter(x=>x.init.method==='POST').length,1);
});
test('canonical read failures after a committed insert never prove creation failed',async()=>{
  for(const status of [400,401,403,404,410,422,500]) {
    const f=fixture();f.getStatus=status;
    await assert.rejects(f.scheduler.createAppointment(REQUEST),e=>e.definitive===false&&!!e.appointmentId);
    assert.ok(f.event);f.getStatus=200;assert.equal((await f.scheduler.findAppointment(REQUEST)).state,'found');
  }
});
test('canonical wrong duration, guest mutation permissions or correlation cannot confirm',async()=>{
  for(const change of [e=>{e.end.dateTime='2026-10-01T11:00:00Z'},e=>{e.extendedProperties.private.booking_id='another'},e=>{e.guestsCanModify=true},e=>{e.organizer.self=false},e=>{e.attendees=[]}]) {
    const f=fixture();await f.scheduler.createAppointment(REQUEST);change(f.event);assert.equal((await f.scheduler.findAppointment(REQUEST)).state,'unknown');
  }
});
test('guest decline does not cancel or reschedule the host appointment',async()=>{
  const f=fixture();const result=await f.scheduler.createAppointment(REQUEST);f.event.attendees[0].responseStatus='declined';
  const event=await f.scheduler.getAppointment({appointmentId:result.appointmentId});assert.equal(event.status,'active');assert.equal(event.startsAt,'2026-10-01T10:00:00.000Z');
});
test('cancellation requires canonical disappearance and retained calendar access, not DELETE acknowledgement alone',async()=>{
  const f=fixture();const result={...await f.scheduler.createAppointment(REQUEST),expectedStartsAt:REQUEST.startsAt,expectedEndsAt:'2026-10-01T12:00:00Z'};f.deleteWorks=false;
  await assert.rejects(f.scheduler.cancelAppointment(result),/cancellation_unconfirmed/);
  f.deleteWorks=true;assert.ok((await f.scheduler.cancelAppointment(result)).cancellationId);
  assert.equal((await f.scheduler.getAppointment(result)).status,'canceled');
  f.calendarAccess=false;await assert.rejects(f.scheduler.getAppointment(result));
});
test('cancellation refuses a moved event and guards a later edit using its canonical etag',async()=>{
  const f=fixture();const result={...await f.scheduler.createAppointment(REQUEST),expectedStartsAt:REQUEST.startsAt,expectedEndsAt:'2026-10-01T12:00:00Z'};
  f.event.start.dateTime='2026-10-01T11:00:00Z';await assert.rejects(f.scheduler.cancelAppointment(result),/event_time_changed/);assert.equal(f.calls.filter(x=>x.init.method==='DELETE').length,0);
  f.event.start.dateTime=REQUEST.startsAt;f.deleteConflict=true;await assert.rejects(f.scheduler.cancelAppointment(result),e=>e.code==='http_412'&&!e.definitive);assert.ok(f.event);assert.equal(f.calls.at(-1).init.headers['If-Match'],'"version1"');
});
test('missing uncertain creation remains unknown, not permission to make another appointment',async()=>{
  const f=fixture();assert.equal((await f.scheduler.findAppointment(REQUEST)).state,'unknown');assert.equal(f.calls.filter(x=>x.init.method==='POST').length,0);
});
test('Google slot candidates are bounded and genuine busy data gates protected time',async()=>{
  const f=fixture();const slots=await f.scheduler.listAvailable({from:'2026-10-01T10:01:00Z',to:'2026-10-02T10:00:00Z',durationMinutes:120});assert.equal(slots[0].startsAt,'2026-10-01T10:30:00.000Z');assert.ok(slots.length<49);
  await assert.rejects(f.scheduler.listAvailable({from:'2026-10-01T10:00:00Z',to:'2026-10-09T10:00:00Z',durationMinutes:60}));
  assert.equal(await f.scheduler.isAvailable(REQUEST),true);f.busy={Primary:[],Work:[{startsAt:'2026-10-01T09:40:00Z',endsAt:'2026-10-01T09:50:00Z'}],Home:[]};assert.equal(await f.scheduler.isAvailable(REQUEST),false);
});
test('Google scheduler is explicit and cannot use Calendly aggregate data accidentally',()=>{
  assert.throws(()=>createAdapters({SCHEDULER_PROVIDER:'google',CALENDAR_SOURCE:'calendly'}),/google_calendar_source_required/);
  assert.throws(()=>createAdapters({SCHEDULER_PROVIDER:'typo'}),/unknown_scheduler_provider/);
});

test('booking calendar outside conflict coverage fails before availability or creation',async()=>{
  let calls=0;
  const scheduler=createGoogleScheduler({env:{GOOGLE_BOOKING_CALENDAR:'unchecked',GOOGLE_CALENDAR_PRIMARY:'primary',GOOGLE_CALENDAR_WORK:'work',GOOGLE_CALENDAR_HOME:'home'},ProviderError,now:()=>0,googleToken:async()=>{calls++;return 'token'},calendar:{getBusy:async()=>{calls++;}},fetcher:async()=>{calls++;}});
  await assert.rejects(scheduler.listAvailable({from:REQUEST.startsAt,to:'2026-10-02T10:00:00Z',durationMinutes:120}),/booking_calendar_not_checked/);
  await assert.rejects(scheduler.isAvailable(REQUEST),/booking_calendar_not_checked/);
  await assert.rejects(scheduler.createAppointment(REQUEST),/booking_calendar_not_checked/);
  assert.equal(calls,0);
});

test('token failure is explicitly undispatched but event transport failure remains unknown',async()=>{
  let calls=0,tokenFails=true;
  const scheduler=createGoogleScheduler({env:{GOOGLE_CALENDAR_PRIMARY:'primary'},ProviderError,now:()=>0,googleToken:async()=>{if(tokenFails)throw new Error('token offline');return 'token'},calendar:{},fetcher:async()=>{calls++;throw new Error('event response lost')}});
  await assert.rejects(scheduler.createAppointment(REQUEST),e=>e.notDispatched===true&&!e.definitive);
  assert.equal(calls,0);
  tokenFails=false;
  await assert.rejects(scheduler.createAppointment(REQUEST),e=>e.notDispatched!==true&&!e.definitive);
  assert.equal(calls,1);
});
