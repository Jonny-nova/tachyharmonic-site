"use strict";

const { offerForRate } = require("./rules");
const { parseInstant } = require("./state");

const HUMAN_CONTACT = "jonathan@tachyharmonic.ai";

function bookingId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new TypeError("An opaque booking id is required");
  }
  return value;
}

// The browser supplies an offer choice, never an amount or Stripe Price id.
function checkoutIntent({ id, rate }) {
  const offer = offerForRate(rate);
  return {
    bookingId: bookingId(id), currency: "gbp", amountPence: rate * 100,
    durationMinutes: offer.durationMinutes, mode: "payment",
    idempotencyKey: `checkout:${id}`,
  };
}

function calendlyIntent({ id, rate, startsAt, invitee }, eventTypes) {
  const offer = offerForRate(rate);
  if (!eventTypes || typeof eventTypes[offer.durationMinutes] !== "string" ||
      !eventTypes[offer.durationMinutes]) {
    throw new TypeError("A gated Calendly event type is required for this duration");
  }
  if (!invitee || typeof invitee.email !== "string" || !invitee.email.includes("@")) {
    throw new TypeError("Invitee email is required");
  }
  return {
    bookingId: bookingId(id), eventType: eventTypes[offer.durationMinutes],
    startsAt: parseInstant(startsAt).toISOString(), durationMinutes: offer.durationMinutes,
    invitee: { email: invitee.email, name: invitee.name },
  };
}

function refundIntent({ id, paymentIntentId, rate }) {
  offerForRate(rate);
  if (typeof paymentIntentId !== "string" || !/^pi_[a-zA-Z0-9_]+$/.test(paymentIntentId)) {
    throw new TypeError("A verified Stripe PaymentIntent id is required");
  }
  return {
    bookingId: bookingId(id), paymentIntentId, amountPence: rate * 100,
    idempotencyKey: `full-refund:${id}`,
  };
}

// Transactional sender is a separate server-side port; the Porkbun mailbox is
// only for human correspondence. The worker must persist and retry delivery.
const SYSTEM_EVENTS = new Set([
  "booking_confirmed", "booking_failed", "cancellation_confirmed",
  "cancellation_pending", "refund_initiated", "review_requested",
]);
function systemMessage({ id, event, to, data = {} }) {
  bookingId(id);
  if (!SYSTEM_EVENTS.has(event) || typeof to !== "string" || !to.includes("@")) {
    throw new TypeError("Known system event and recipient required");
  }
  if (data && (typeof data !== "object" || Array.isArray(data))) {
    throw new TypeError("Message data must be structured");
  }
  return { eventId: `${id}:${event}`, to, template: event, data,
    sender: "transactional_provider_required" };
}

function humanAlert({ id, event }) {
  bookingId(id);
  if (!["booking_failed", "refund_pending", "cancellation_pending", "review_requested"].includes(event)) {
    throw new TypeError("Unknown human review event");
  }
  return { eventId: `${id}:human:${event}`, to: HUMAN_CONTACT, template: event,
    sender: "transactional_provider_required" };
}

module.exports = {
  HUMAN_CONTACT, calendlyIntent, checkoutIntent, humanAlert, refundIntent, systemMessage,
};
