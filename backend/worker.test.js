"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { buildSync } = require("esbuild");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");

test("real workerd provider fetch accepts manual redirects and rejects them without following credentials", { timeout: 120000 }, async () => {
  const source = `
    import providers from './providers.js'; import google from './google-scheduler.js';
    export default {async fetch(request) {
      try {
        if(new URL(request.url).pathname==='/calendar') {
          const adapters=providers.createAdapters({GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret',GOOGLE_REFRESH_TOKEN:'fixture-refresh',GOOGLE_CALENDAR_PRIMARY:'primary',GOOGLE_CALENDAR_WORK:'work',GOOGLE_CALENDAR_HOME:'home'});
          await adapters.calendar.getBusy({startsAt:'2026-10-02T10:00:00Z',endsAt:'2026-10-02T11:00:00Z'});
        } else {
          const scheduler=google.createGoogleScheduler({env:{GOOGLE_CALENDAR_PRIMARY:'primary'},ProviderError:providers.ProviderError,fetcher:fetch,googleToken:async()=>'fixture-token',calendar:{},now:Date.now});
          await scheduler.createAppointment({bookingId:'runtime-probe',startsAt:'2026-10-02T10:00:00Z',durationMinutes:60,name:'Fixture',email:'fixture@example.test'});
        }
        return Response.json({unexpectedSuccess:true});
      }catch(error){return Response.json({code:error.code,definitive:error.definitive});}
    }};
  `;
  const script = buildSync({ stdin: { contents: source, resolveDir: __dirname, sourcefile: "provider-runtime-test.mjs" }, bundle: true, write: false, format: "esm", platform: "browser" }).outputFiles[0].text;
  const destinations = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27", outboundService: async request => {
    destinations.push(new URL(request.url).hostname);
    return new Response(null, { status: 302, headers: { Location: "https://credential-leak.example.test/" } });
  } }));
  try {
    for (const route of ["calendar", "scheduler"]) {
      const result = await (await mf.dispatchFetch("https://test.local/" + route)).json();
      assert.deepEqual(result, { code: "http_302", definitive: false });
    }
    assert.deepEqual(destinations, ["oauth2.googleapis.com", "www.googleapis.com"]);
  } finally { await mf.dispose(); }
});

test("public terms disclose only the approved current snapshot and fail closed without an address", { timeout: 120000 }, async () => {
  const script = buildSync({ entryPoints: [path.join(__dirname, "worker.mjs")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  for (const traderAddress of [undefined, "TEST FIXTURE ONLY, 1 Example Street, Test Town"]) {
    const options = convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27",
      durableObjects: { BOOKING_OFFICE: { className: "BookingOffice", useSQLite: true } },
      bindings: { BOOKING_ENABLED: "false", ADMIN_TOKEN: "not-public-admin-secret", STRIPE_SECRET_KEY: "not-public-payment-secret", ...(traderAddress ? { TRADER_ADDRESS: traderAddress } : {}) } });
    const mf = new Miniflare(options);
    try {
      const response = await mf.dispatchFetch("https://preview.example.test/api/terms");
      assert.equal(response.status, traderAddress ? 200 : 503);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const result = await response.json();
      if (traderAddress) {
        assert.deepEqual(Object.keys(result).sort(), ["text", "traderAddress", "version"]);
        const snapshot = require("../booking/contract-terms").createContractTerms({ traderAddress });
        assert.equal(result.text, snapshot.text); assert.equal(result.version, snapshot.version);
        assert.equal(result.traderAddress, traderAddress);
      } else assert.deepEqual(result, { error: "trader_address_required" });
      assert.equal(JSON.stringify(result).includes("not-public"), false);
    } finally { await mf.dispose(); }
  }
});
test("private live validation hides booking APIs from callers without the test token", { timeout: 120000 }, async () => {
  const script = buildSync({ entryPoints: [path.join(__dirname, "worker.mjs")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27",
    durableObjects: { BOOKING_OFFICE: { className: "BookingOffice", useSQLite: true } },
    bindings: { BOOKING_ENABLED: "true", PRIVATE_LIVE_TEST: "true", PRIVATE_LIVE_TEST_TOKEN: "fixture-private-live-token", TRADER_ADDRESS: "TEST FIXTURE ONLY, 1 Example Street, Test Town" } }));
  try {
    for (const token of [null, "wrong-token"]) {
      const headers = token ? { "X-Private-Test-Token": token } : {};
      const response = await mf.dispatchFetch("https://test.local/api/availability?rate=30&startsAt=2026-10-06T10:00:00Z", { headers });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
    }
    const authorized = await mf.dispatchFetch("https://test.local/api/availability?rate=30&startsAt=2026-10-06T10:00:00Z", { headers: { "X-Private-Test-Token": "fixture-private-live-token" } });
    assert.notEqual(authorized.status, 404);
    assert.equal((await mf.dispatchFetch("https://test.local/api/health")).status, 200);
  } finally { await mf.dispose(); }
});
test("retention inventory is admin-only and unavailable to browsers or write methods", { timeout: 120000 }, async () => {
  const script = buildSync({ entryPoints: [path.join(__dirname, "worker.mjs")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27",
    durableObjects: { BOOKING_OFFICE: { className: "BookingOffice", useSQLite: true } },
    bindings: { BOOKING_ENABLED: "false", ADMIN_TOKEN: "private-admin-token", ALLOWED_ORIGINS: "https://tachyharmonic.ai" } }));
  const url = "https://api.example.test/api/admin/retention-inventory";
  try {
    for (const options of [{}, { headers: { Authorization: "Bearer wrong" } },
      { headers: { Origin: "https://tachyharmonic.ai", Authorization: "Bearer private-admin-token" } },
      { method: "POST", headers: { Authorization: "Bearer private-admin-token" }, body: "{}" }]) {
      const response = await mf.dispatchFetch(url, options);
      assert.equal(response.status, options.headers?.Origin || options.method ? 404 : 401);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
    const response = await mf.dispatchFetch(url, { headers: { Authorization: "Bearer private-admin-token" } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json(); assert.ok(Number.isFinite(Date.parse(body.asOf)));
    assert.deepEqual({ ...body, asOf: null }, { asOf: null, total: 0, records: [], nextCursor: null });
    assert.equal((await mf.dispatchFetch("https://api.example.test/api/health")).status, 200);
  } finally { await mf.dispose(); }
});
test("staging assets are uncacheable and unindexed while all API paths remain in the booking worker", { timeout: 120000 }, async () => {
  const script = buildSync({ entryPoints: [path.join(__dirname, "worker.mjs")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  const options = convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27",
    durableObjects: { BOOKING_OFFICE: { className: "BookingOffice", useSQLite: true } }, bindings: { BOOKING_ENABLED: "false" },
    serviceBindings: { ASSETS: async request => new Response("staging asset", { status: new URL(request.url).pathname === "/missing" ? 404 : 200, headers: { "Cache-Control": "public, max-age=3600" } }) } });
  const mf = new Miniflare(options);
  try {
    for (const pathname of ["/", "/missing"]) {
      const response = await mf.dispatchFetch("https://preview.example.test" + pathname);
      assert.equal(response.status, pathname === "/missing" ? 404 : 200);
      assert.equal(await response.text(), "staging asset");
      assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(response.headers.get("X-Robots-Tag"), "noindex");
    }
    for (const pathname of ["/api", "/api/unknown", "/api/health"]) {
      const response = await mf.dispatchFetch("https://preview.example.test" + pathname);
      assert.equal(response.status, pathname === "/api/health" ? 200 : 404);
      assert.match(response.headers.get("Content-Type"), /application\/json/);
      assert.notEqual(await response.text(), "staging asset");
    }
  } finally { await mf.dispose(); }
});
test("real workerd SQLite Durable Object persists rate limits across restart, CORS and auth fail closed", { timeout: 120000 }, async () => {
  const bundle = buildSync({ entryPoints: [path.join(__dirname, "worker.mjs")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "tachy-booking-do-"));
  const options = convertV4MiniflareOptions({ modules: true, script: bundle, compatibilityDate: "2026-09-27", durableObjects: { BOOKING_OFFICE: { className: "BookingOffice", useSQLite: true } }, resourcePersistencePath: persist,
    bindings: { BOOKING_ENABLED: "false", ALLOWED_ORIGINS: "https://preview.example.test", ADMIN_TOKEN: "private-admin-token" } });
  let mf;
  try {
    mf = new Miniflare(options);
    let response = await mf.dispatchFetch("https://api.example.test/api/health", { headers: { Origin: "https://preview.example.test" } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://preview.example.test");
    response = await mf.dispatchFetch("https://api.example.test/api/health", { headers: { Origin: "https://evil.test" } }); assert.equal(response.status, 403);
    response = await mf.dispatchFetch("https://api.example.test/api/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); assert.equal(response.status, 503);
    response = await mf.dispatchFetch("https://api.example.test/api/holds", { method: "POST", headers: { "Content-Type": "application/json-not-really" }, body: "{}" }); assert.equal(response.status, 415);
    response = await mf.dispatchFetch("https://api.example.test/api/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(16385) }); assert.equal(response.status, 413);
    response = await mf.dispatchFetch("https://api.example.test/api/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: "private-note-invalid-json" }); assert.equal(response.status, 400);
    assert.equal((await response.text()).includes("private-note"), false);
    response = await mf.dispatchFetch("https://api.example.test/api/admin/bookings/00000000-0000-0000-0000-000000000000"); assert.equal(response.status, 401);
    response = await mf.dispatchFetch("https://api.example.test/api/admin/staging/google-probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); assert.equal(response.status, 401);
    response = await mf.dispatchFetch("https://api.example.test/api/admin/staging/google-probe", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer private-admin-token" }, body: "{}" }); assert.equal(response.status, 404);
    for (let i = 0; i < 55; i++) await mf.dispatchFetch("https://api.example.test/api/health");
    await mf.dispose(); mf = new Miniflare(options);
    response = await mf.dispatchFetch("https://api.example.test/api/health"); assert.equal(response.status, 429);
  } finally { if (mf) await mf.dispose(); if (path.dirname(path.resolve(persist)) === path.resolve(os.tmpdir()) && path.basename(persist).startsWith("tachy-booking-do-")) fs.rmSync(persist, { recursive: true, force: true }); }
});

test("workerd survives a paid-booking restart and serializes concurrent final-slot holds", { timeout: 120000 }, async () => {
  const source = `
    import {DurableObject} from 'cloudflare:workers';
    import stores from './store.js'; import services from './service.js';
    export class TestOffice extends DurableObject {
      constructor(ctx,env) { super(ctx,env); this.store=new stores.SqliteStore(ctx.storage);
        const adapters={calendar:{getBusy:async()=>({Primary:[],Work:[],Home:[]})},scheduler:{isAvailable:async()=>true,createAppointment:async()=>({appointmentId:'event-test'})},payments:{},notifications:{send:async()=>{}}};
        this.service=new services.BookingService(this.store,adapters,{enabled:true,now:()=> '2026-09-28T08:00:00Z',traderAddress:'TEST FIXTURE ONLY, 1 Example Street, Test Town',managementSecret:'test-secret-at-least-thirty-two-chars',managementBaseUrl:'https://preview.example.test/'});
      }
      async fetch(request) { const input=await request.json(); try {
        if(input.action==='hold')return Response.json(await this.service.hold(input.booking,input.key));
        if(input.action==='pay') {this.service.payment({bookingId:input.id,paymentId:'pi_1',eventId:'evt_1',amount:10000,currency:'gbp'});return Response.json({ok:true});}
        if(input.action==='drain')await this.service.drain();
        return Response.json({bookings:this.store.read().bookings});
      }catch(e){return Response.json({error:e.code||'error'},{status:409});}}
    }
    export default {fetch(request,env){return env.TEST.get(env.TEST.idFromName('one')).fetch(request)}};
  `;
  const script = buildSync({ stdin: { contents: source, resolveDir: __dirname, sourcefile: "durability-test.mjs" }, bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] }).outputFiles[0].text;
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "tachy-booking-do-"));
  const options = convertV4MiniflareOptions({ modules: true, script, compatibilityDate: "2026-09-27", durableObjects: { TEST: { className: "TestOffice", useSQLite: true } }, resourcePersistencePath: persist });
  let mf;
  try {
    mf = new Miniflare(options);
    const request = body => mf.dispatchFetch("https://test.local/", { method: "POST", body: JSON.stringify(body) });
    const booking = { startsAt: "2026-10-01T10:00:00Z", rate: 100, name: "Test client", email: "test@example.test", earlyStart: true, consentVersion: "v1-2026-09-27", managementToken: Buffer.alloc(32, 4).toString("base64url") };
    const outcomes = await Promise.all([request({ action: "hold", booking, key: "durable_key_000001" }), request({ action: "hold", booking, key: "durable_key_000002" })]);
    assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409]);
    const held = await outcomes.find(x => x.status === 200).json();
    await request({ action: "pay", id: held.id });
    await mf.dispose(); mf = new Miniflare(options);
    let state = await (await request({ action: "read" })).json();
    assert.equal(state.bookings.length, 1); assert.equal(state.bookings[0].status, "paid_pending");
    state = await (await request({ action: "drain" })).json();
    assert.equal(state.bookings[0].status, "confirmed"); assert.equal(state.bookings[0].appointmentId, "event-test");
  } finally { if (mf) await mf.dispose(); if (path.dirname(path.resolve(persist)) === path.resolve(os.tmpdir()) && path.basename(persist).startsWith("tachy-booking-do-")) fs.rmSync(persist, { recursive: true, force: true }); }
});
