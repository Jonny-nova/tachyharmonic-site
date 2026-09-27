import { DurableObject } from "cloudflare:workers";
import storeModule from "./store.js";
import serviceModule from "./service.js";
import providerModule from "./providers.js";
import consentModule from "../booking/consent.js";
const { SqliteStore } = storeModule;
const { BookingService, hash, fail } = serviceModule;
const { createAdapters } = providerModule;
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });

async function limitedBody(request) {
  if (Number(request.headers.get("Content-Length")) > 16384) throw fail("body_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw fail("body_too_large", 413); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

export class BookingOffice extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.queue = Promise.resolve();
    this.store = new SqliteStore(ctx.storage);
    this.service = new BookingService(this.store, createAdapters(env), {
      enabled: env.BOOKING_ENABLED === "true", consentVersion: env.CONSENT_VERSION || consentModule.VERSION,
      consentText: consentModule.WORDING,
      traderAddress: env.TRADER_ADDRESS,
      managementSecret: env.MANAGEMENT_SIGNING_SECRET, managementBaseUrl: env.MANAGEMENT_BASE_URL,
      openings: JSON.parse(env.DATE_OPENINGS || "[]"),
    });
  }
  serial(fn) { const next = this.queue.then(fn, fn); this.queue = next.catch(() => {}); return next; }
  async fetch(request) {
    return this.serial(async () => {
      let cors = {};
      try {
        const url = new URL(request.url), origin = request.headers.get("Origin"), webhook = /^\/api\/webhooks\/(stripe|calendly)$/.test(url.pathname);
        const allowed = (this.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
        if (!webhook && origin && !allowed.includes(origin)) throw fail("origin_denied", 403);
        if (origin && allowed.includes(origin)) cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key" };
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (!webhook) {
          const ip = await hash(request.headers.get("CF-Connecting-IP") || "local");
          const now = Date.now();
          this.store.mutate(state => { const limit = state.limits[ip]; if (!limit || limit.until <= now) state.limits[ip] = { count: 1, until: now + 60000 }; else if (++limit.count > 60) throw fail("rate_limited", 429); });
        }
        // Establish durable wakeup before any state-changing request. Alarms
        // recover queued jobs after a process restart or lost HTTP response.
        if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60000);
        const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
        if (request.method === "GET" && url.pathname === "/api/health") return reply({ status: "ok", bookingEnabled: this.service.enabled }, 200, cors);
        if (request.method === "GET" && url.pathname === "/api/terms") return reply({ ...this.service.contractTerms(), traderAddress: this.env.TRADER_ADDRESS.trim() }, 200, cors);
        if (request.method === "GET" && url.pathname === "/api/availability") return reply(await this.service.availability({ startsAt: url.searchParams.get("startsAt"), from: url.searchParams.get("from"), to: url.searchParams.get("to"), rate: Number(url.searchParams.get("rate")) }), 200, cors);
        const admin = url.pathname.match(/^\/api\/admin\/bookings\/([0-9a-f-]{36})(?:\/(resolve))?$/);
        if (admin) {
          if (!this.env.ADMIN_TOKEN || !token || await hash(token) !== await hash(this.env.ADMIN_TOKEN)) throw fail("unauthorized", 401);
          if (request.method === "POST" && admin[2] === "resolve") {
            if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) throw fail("json_required", 415);
            return reply(await this.service.resolve(admin[1], JSON.parse(await limitedBody(request))), 200, cors);
          }
          if (request.method !== "GET" || admin[2]) throw fail("not_found", 404);
          this.service.repairJobs();
          const state = this.store.read();
          const record = state.bookings.find(x => x.id === admin[1]);
          if (!record) throw fail("not_found", 404);
          this.store.audit(record.id, "private_record_read", new Date().toISOString());
          return reply({ ...this.service.publicRecord(record), intake: state.private[record.id] && {
            name: state.private[record.id].name, email: state.private[record.id].email,
            note: record.status === "confirmed" && (state.private[record.id].consent.earlyStart || Date.now() >= Date.parse(consentModule.cancellationEndsAt(state.private[record.id].contractAt))) ? state.private[record.id].note : null,
            consent: state.private[record.id].consent, contractAt: state.private[record.id].contractAt, resolutions: state.private[record.id].resolutions || [],
          } }, 200, cors);
        }
        const match = url.pathname.match(/^\/api\/bookings\/([0-9a-f-]{36})(?:\/(checkout|cancel))?$/);
        if (match && request.method === "GET" && !match[2]) return reply(this.service.publicRecord(await this.service.authorize(match[1], token)), 200, cors);
        if (match && request.method === "POST" && match[2] === "checkout") return reply(await this.service.checkout(match[1], token), 200, cors);
        if (match && request.method === "POST" && match[2] === "cancel") return reply(await this.service.cancel(match[1], token), 202, cors);
        if (request.method === "POST" && url.pathname === "/api/holds") {
          if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) throw fail("json_required", 415);
          const input = JSON.parse(await limitedBody(request));
          return reply(await this.service.hold(input, request.headers.get("Idempotency-Key")), 201, cors);
        }
        if (request.method === "POST" && webhook) {
          const raw = await limitedBody(request);
          if (url.pathname.endsWith("stripe")) {
            const event = await this.service.adapters.payments.verifyWebhook(raw, request.headers.get("Stripe-Signature"));
            if (event.kind === "payment_completed") this.service.payment(event);
            else if (event.kind === "refund_updated") await this.service.reconcile();
          } else {
            const event = await this.service.adapters.scheduler.verifyWebhook(raw, request.headers.get("Calendly-Webhook-Signature"));
            // Never trust webhook ordering or cancellation state: fetch the
            // canonical provider object during reconciliation instead.
            if (event.kind !== "ignored" && !this.store.read().events[event.eventId]) {
              await this.service.reconcile();
              this.store.mutate(state => { state.events[event.eventId] = new Date().toISOString(); });
            }
          }
          return reply({ received: true });
        }
        throw fail("not_found", 404);
      } catch (error) {
        const status = error.status || (error instanceof TypeError || error instanceof SyntaxError ? 400 : 503);
        return reply({ error: error.code && /^[a-z0-9_]+$/.test(error.code) ? error.code : status === 400 ? "invalid_request" : "service_unavailable" }, status, cors);
      }
    });
  }
  async alarm() {
    return this.serial(async () => {
      // Reschedule first: an unsuccessful provider call cannot disable retries.
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      await this.service.reconcile();
    });
  }
}
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (env.ASSETS && pathname !== "/api" && !pathname.startsWith("/api/")) {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("X-Robots-Tag", "noindex");
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const id = env.BOOKING_OFFICE.idFromName("tachyharmonic-all-weeks-v1");
    return env.BOOKING_OFFICE.get(id).fetch(request);
  },
};
