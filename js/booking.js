(function (root, factory) {
  "use strict";
  const booking = factory(typeof module === "object" && module.exports ? require("../booking/consent") : root.TachyharmonicConsent);
  if (typeof module === "object" && module.exports) module.exports = booking;
  else booking.mount(root, root.TACHYHARMONIC_BOOKING || {});
})(typeof window === "undefined" ? globalThis : window, function (consent) {
  "use strict";
  const DAY = 86400000;
  const STORAGE_KEY = "tachyharmonic-booking-v1";
  const TOKEN = /^[A-Za-z0-9_-]{43}$/;
  const ID = /^[A-Za-z0-9_-]{1,100}$/;
  const RATES = [30, 50, 70, 100, 140];
  const STATES = ["held", "paid_pending", "confirming", "confirmed", "booking_failed", "cancellation_pending", "canceled", "review_requested"];

  function needsEarlyStart(startsAt, now = Date.now()) {
    if (!consent) return true;
    return consent.requiresEarlyStart(new Date(Date.parse(startsAt) - 30 * 60000).toISOString(), new Date(now).toISOString());
  }

  function validConfig(config) {
    if (config.enabled !== true || !config.apiBase || !config.consentVersion) return false;
    try {
      const url = new URL(config.apiBase);
      return !url.username && !url.password && !url.search && !url.hash &&
        (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
    } catch { return false; }
  }

  function randomToken(cryptoApi) {
    return String.fromCharCode(...cryptoApi.getRandomValues(new Uint8Array(32)));
  }

  function managementLink(location, id, token) {
    if (!ID.test(id) || !TOKEN.test(token)) throw new Error("invalid_recovery_link");
    const url = new URL(location.href);
    url.search = "";
    url.hash = new URLSearchParams({ booking: id, token }).toString();
    return url.href;
  }

  function readFragment(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const id = params.get("booking"), token = params.get("token");
    if (!id) return null;
    if (!ID.test(id) || (token !== null && !TOKEN.test(token))) throw new Error("invalid_recovery_link");
    return { id, token };
  }

  function validateRecord(record) {
    if (!record || !ID.test(record.id) || !STATES.includes(record.status) ||
        !RATES.includes(record.rate) || !Number.isFinite(Date.parse(record.startsAt)) ||
        !Number.isFinite(Date.parse(record.endsAt)) || Date.parse(record.endsAt) <= Date.parse(record.startsAt)) {
      throw new Error("invalid_server_response");
    }
    return record;
  }

  function describeRecord(record, now = Date.now()) {
    validateRecord(record);
    if (record.externalChangePending) {
      return { title: "Appointment change needs review", message: "The scheduling provider reports a change to your appointment. Jonathan needs to reconcile it with your booking. The time shown below may no longer be valid; please contact him before relying on it.",
        refund: "No refund outcome is implied by this change. Please contact Jonathan for the current position.",
        canPay: false, canCancel: false, canRestart: false, pending: false };
    }
    const expired = record.status === "held" && Date.parse(record.expiresAt) <= now;
    const descriptions = {
      held: ["Time held — payment still needed", "Your time is held temporarily. You do not have a confirmed appointment yet."],
      paid_pending: ["Payment received — checking the appointment", "Your payment is recorded. The appointment is not confirmed yet. Please wait for the result before booking again."],
      confirming: ["Securing your appointment", "Your payment is recorded and the appointment is being checked. It is not confirmed yet. Please wait for the result before booking again."],
      confirmed: ["Your appointment is confirmed", "Your payment and appointment have both been confirmed."],
      booking_failed: ["No appointment was booked", "This booking did not complete. You do not have an appointment for this booking."],
      cancellation_pending: record.providerCancelled
        ? ["Appointment canceled — refund pending", "Your appointment is canceled. Refund initiation is still pending; please check the refund status below."]
        : ["Cancellation pending", "Your cancellation request is recorded, but cancellation has not yet been confirmed. The appointment remains reserved while this is resolved."],
      canceled: ["Your appointment is canceled", "Cancellation of the whole appointment has been confirmed."],
      review_requested: ["Your request is awaiting personal review", "Your request has been recorded for Jonathan to review. Your appointment remains booked; no automatic cancellation or refund has taken place."],
    };
    const [title, message] = expired
      ? ["The temporary hold has expired", "No appointment is confirmed. If you completed payment, check the status again while it is reconciled; do not pay again."]
      : descriptions[record.status];
    const refund = {
      none: "", pending: "A refund is pending. Refund initiation has not yet been confirmed.",
      initiated: "Refund initiation has been confirmed. The time it takes to appear with your bank can vary.",
      succeeded: "The payment provider reports the refund as completed. Your bank may take time to display it.",
      failed: "The refund has not completed. Jonathan needs to review it; please contact him if you need help.",
      attention_required: "The payment provider reports a problem with the refund. Jonathan needs to review it; refund completion has not been confirmed.",
    }[record.refundStatus || "none"] || "The refund status needs checking. Please contact Jonathan.";
    const meetingUrl = ["confirmed", "review_requested"].includes(record.status) && /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(record.meetingUrl || "") ? record.meetingUrl : null;
    return { title, message, refund, meetingUrl, canPay: record.status === "held" && !expired,
      canCancel: record.status === "confirmed", canRestart: ["booking_failed", "canceled", "confirmed"].includes(record.status),
      pending: ["paid_pending", "confirming", "cancellation_pending"].includes(record.status) || record.refundStatus === "pending" };
  }

  function createApi({ apiBase, fetchImpl, timeoutMs = 20000 }) {
    const base = apiBase.replace(/\/$/, "");
    return async function request(path, { method = "GET", token, key, body } = {}) {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = "Bearer " + token;
        if (key) headers["Idempotency-Key"] = key;
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const response = await fetchImpl(base + path, { method, headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: abort.signal,
          credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error" });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(typeof data.error === "string" ? data.error : data.code || "request_failed");
          error.status = response.status;
          throw error;
        }
        return data;
      } finally { clearTimeout(timer); }
    };
  }

  // Only opaque identifiers and an irreversible input fingerprint are persisted.
  // Name, email and note stay in the form until submitted; they are never saved here.
  function createFlow({ api, read, save, cryptoApi, encode = btoa, now = Date.now }) {
    const makeToken = () => encode(randomToken(cryptoApi)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return {
      async hold(input) {
        const fingerprint = Array.from(new Uint8Array(await cryptoApi.subtle.digest("SHA-256",
          new TextEncoder().encode(JSON.stringify(input)))), x => x.toString(16).padStart(2, "0")).join("");
        let context = read();
        if (context?.id) return validateRecord(await api("/api/bookings/" + encodeURIComponent(context.id), { token: context.token }));
        if (context?.fingerprint && context.fingerprint !== fingerprint && context.createdAt > now() - 20 * 60000) {
          throw new Error("previous_request_uncertain");
        }
        if (!context || context.fingerprint !== fingerprint) context = { key: makeToken(), token: makeToken(), fingerprint, createdAt: now() };
        save(context); // Storage must work before any request can reserve a time.
        let record;
        try {
          record = validateRecord(await api("/api/holds", { method: "POST", key: context.key,
            body: { ...input, managementToken: context.token } }));
        } catch (error) {
          // A definitive validation/capacity rejection has not created a hold.
          // Network errors and 5xx may have committed: retain the same retry key.
          if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) save(null);
          throw error;
        }
        save({ id: record.id, token: context.token, key: context.key });
        return record;
      },
      async checkout(context) {
        const result = await api("/api/bookings/" + encodeURIComponent(context.id) + "/checkout", { method: "POST", token: context.token });
        const url = new URL(result.checkoutUrl);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) throw new Error("invalid_checkout_response");
        return url.href;
      },
    };
  }

  function errorMessage(error) {
    const code = error?.message;
    const messages = {
      unauthorized: "The private booking link could not be verified. Open the full link you saved, or email Jonathan for help.",
      invalid_recovery_link: "This private booking link is incomplete or invalid. Open the full saved link, or email Jonathan.",
      previous_request_uncertain: "The previous booking request may have reached the server. Retry with the same details, or wait 20 minutes before choosing differently. No payment has been requested.",
      early_start_or_later_appointment_required: "For this time, please request early preparation or choose an appointment after the cancellation period ends. Read the early-performance terms for details.",
      consent_version_required: "The booking terms have changed. Reload the page and read the current terms before trying again.",
      hold_expired: "The temporary hold has expired. Check the booking status before choosing another time, especially if you completed payment.",
      booking_unavailable: "Online booking is currently unavailable. Please email Jonathan or try again later.",
      storage_unavailable: "This browser cannot safely retain your private booking access in this tab. Enable session storage or use another browser before booking.",
      invalid_name: "Please enter your name without line breaks, using up to 120 characters.",
      invalid_email: "Please check your email address.",
      invalid_note: "Please keep your optional note to 1,200 characters.",
    };
    if (messages[code]) return messages[code];
    if (["capacity", "supported_ceiling", "repair_capacity", "calendar_busy", "client_buffer", "scheduler_unavailable", "outside_window", "minimum_notice", "booking_horizon", "weekend_one_appointment"].includes(code)) {
      return "That time or rate is no longer available. Refresh the available times and choose again.";
    }
    return "We could not verify the result. Please check or retry the same request before booking again. You can also email Jonathan for help.";
  }

  function mount(win, config) {
    const doc = win.document, el = id => doc.getElementById(id), form = el("intake-preview");
    if (!form) return;
    form.addEventListener("submit", event => event.preventDefault());
    if (!validConfig(config)) return; // Disabled preview never reads storage or calls a provider.
    if (!consent || config.consentVersion !== consent.VERSION) return;
    el("early-start-wording").textContent = consent.WORDING;
    let context;
    const read = () => {
      try { return JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) || "null"); }
      catch { throw new Error("storage_unavailable"); }
    };
    const save = value => {
      try {
        if (value?.id && TOKEN.test(value.token || "")) {
          const access = JSON.parse(win.sessionStorage.getItem(STORAGE_KEY + "-access") || "{}");
          access[value.id] = { id: value.id, token: value.token };
          win.sessionStorage.setItem(STORAGE_KEY + "-access", JSON.stringify(access));
        }
        if (value) win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        else win.sessionStorage.removeItem(STORAGE_KEY);
        context = value;
      } catch { throw new Error("storage_unavailable"); }
    };
    const api = createApi({ apiBase: config.apiBase, fetchImpl: win.fetch.bind(win) });
    const flow = createFlow({ api, read, save, cryptoApi: win.crypto, encode: win.btoa.bind(win) });
    let currentRecord, selectedSlot, slots = [], week = 0, requestSequence = 0, statusSequence = 0, loading = false, submitting = false, pollTimer, termsReady = false;
    const isCurrent = access => context?.id === access?.id && context?.token === access?.token;
    const openedAt = Date.now(), rangeStart = openedAt + 48 * 3600000, horizon = openedAt + 28 * DAY;
    const rate = () => Number(form.querySelector('input[name="rate"]:checked')?.value);
    const zone = () => el("booking-timezone").value;
    const dateTime = value => new Intl.DateTimeFormat("en-GB", { timeZone: zone(), weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
    const showError = (error, management = false) => {
      const target = el(management ? "management-error" : "booking-error");
      target.textContent = errorMessage(error); target.hidden = false;
      if (!management) target.focus();
    };
    const clearError = () => { el("booking-error").hidden = true; el("management-error").hidden = true; };
    const updateConsent = () => {
      const early = !!selectedSlot && needsEarlyStart(selectedSlot.startsAt);
      el("early-start-group").hidden = !early; el("early-start").required = early;
      if (!early) el("early-start").checked = false;
      el("booking-submit").disabled = !selectedSlot || submitting || !termsReady;
    };
    async function loadTerms() {
      termsReady = false; updateConsent(); el("resume-checkout").disabled = true;
      el("booking-current-terms").hidden = false;
      el("retry-booking-terms").hidden = true;
      el("booking-terms-disclosure").hidden = true;
      el("booking-terms-status").textContent = "Checking current booking terms…";
      try {
        const terms = await api("/api/terms");
        if (typeof terms.version !== "string" || !terms.version.trim() || terms.version.length > 200 ||
            typeof terms.text !== "string" || !terms.text.trim() || terms.text.length > 100000 ||
            typeof terms.traderAddress !== "string" || terms.traderAddress.trim().length < 10 ||
            !terms.text.includes(terms.traderAddress)) throw new Error("invalid_terms_response");
        el("booking-terms-text").textContent = terms.text;
        el("booking-terms-disclosure").hidden = false;
        el("booking-terms-status").textContent = "Current terms are available below, including the business contact address. Please read them before continuing.";
        termsReady = true;
      } catch {
        el("booking-terms-text").textContent = "";
        el("booking-terms-status").textContent = "The current booking terms could not be loaded. Payment is unavailable until they can be shown. Please retry or email Jonathan.";
        el("retry-booking-terms").hidden = false;
      }
      updateConsent(); el("resume-checkout").disabled = !termsReady;
    }
    const renderSlots = () => {
      el("booking-slots").replaceChildren();
      slots.forEach((slot, index) => {
        const label = doc.createElement("label"), input = doc.createElement("input"), text = doc.createElement("span");
        label.className = "form-choice booking-slot";
        input.type = "radio"; input.name = "startsAt"; input.value = slot.startsAt; input.required = true;
        input.id = "booking-slot-" + index; input.checked = selectedSlot?.startsAt === slot.startsAt;
        input.addEventListener("change", () => { selectedSlot = slot; updateConsent(); });
        text.textContent = dateTime(slot.startsAt) + " – " + new Intl.DateTimeFormat("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(slot.endsAt));
        label.append(input, text); el("booking-slots").append(label);
      });
    };
    const updateWeekControls = () => {
      el("previous-week").disabled = loading || week === 0;
      el("next-week").disabled = loading || rangeStart + (week + 1) * 7 * DAY >= horizon;
      el("load-times").disabled = loading || !RATES.includes(rate());
    };
    async function loadSlots() {
      if (!RATES.includes(rate()) || submitting) return;
      const sequence = ++requestSequence, selectedRate = rate();
      loading = true; selectedSlot = null; slots = []; renderSlots(); updateConsent(); updateWeekControls(); clearError();
      el("booking-times").setAttribute("aria-busy", "true");
      el("slot-status").textContent = "Checking current availability…";
      const from = new Date(rangeStart + week * 7 * DAY).toISOString();
      const to = new Date(Math.min(horizon, rangeStart + (week + 1) * 7 * DAY)).toISOString();
      el("booking-range").textContent = dateTime(from) + " to " + dateTime(to);
      try {
        const result = await api("/api/availability?" + new URLSearchParams({ from, to, rate: String(selectedRate) }));
        if (sequence !== requestSequence) return;
        if (!Array.isArray(result.slots)) throw new Error("invalid_server_response");
        const duration = selectedRate >= 100 ? 120 : 60;
        slots = result.slots.filter(s => Number.isFinite(Date.parse(s.startsAt)) && Number.isFinite(Date.parse(s.endsAt)) &&
          Date.parse(s.startsAt) >= Date.parse(from) && Date.parse(s.startsAt) < Date.parse(to) &&
          Date.parse(s.endsAt) - Date.parse(s.startsAt) === duration * 60000)
          .filter((s, i, all) => all.findIndex(other => other.startsAt === s.startsAt) === i)
          .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
        renderSlots();
        el("slot-status").textContent = slots.length ? "Choose a time below. It is checked again before payment." : "No times are available at this rate in this week. Try another week or rate, or email Jonathan.";
      } catch (error) {
        if (sequence === requestSequence) { el("slot-status").textContent = "Availability could not be checked. No time is reserved."; showError(error); }
      } finally {
        if (sequence === requestSequence) { loading = false; el("booking-times").removeAttribute("aria-busy"); updateWeekControls(); }
      }
    }
    function renderRecord(record) {
      currentRecord = validateRecord(record);
      const view = describeRecord(record);
      form.hidden = true; el("booking-management").hidden = false;
      el("booking-status-title").textContent = view.title;
      el("booking-status-message").textContent = view.message;
      el("booking-summary").textContent = dateTime(record.startsAt) + " · " + (record.rate >= 100 ? "Two hours" : "One hour") + " · £" + record.rate + " · Reference: " + record.id;
      el("booking-refund").textContent = view.refund;
      el("booking-meeting").hidden = !view.meetingUrl;
      if (view.meetingUrl) el("booking-meeting-link").href = view.meetingUrl;
      else el("booking-meeting-link").removeAttribute("href");
      el("resume-checkout").hidden = !view.canPay;
      el("cancel-booking").hidden = !view.canCancel;
      el("new-booking").hidden = !view.canRestart;
      el("new-booking").textContent = record.status === "confirmed" ? "Book another appointment" : "Choose another appointment";
      el("booking-last-checked").textContent = "Last checked at " + new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()) + ".";
      el("cancellation-confirm").hidden = true;
      clearTimeout(pollTimer);
      if (view.pending && !doc.hidden) pollTimer = setTimeout(() => refresh(false), 12000);
    }
    async function refresh(focus = false) {
      if (!context?.id || !TOKEN.test(context.token || "")) return;
      const access = { ...context }, sequence = ++statusSequence;
      el("refresh-booking").disabled = true; clearError();
      try {
        const record = await api("/api/bookings/" + encodeURIComponent(access.id), { token: access.token });
        if (!isCurrent(access) || sequence !== statusSequence) return;
        renderRecord(record);
        if (focus) el("booking-status-title").focus();
      } catch (error) { if (isCurrent(access) && sequence === statusSequence) { clearTimeout(pollTimer); showError(error, true); } }
      finally { if (isCurrent(access) && sequence === statusSequence) el("refresh-booking").disabled = false; }
    }
    async function checkout() {
      if (!termsReady) return;
      const access = { ...context };
      el("resume-checkout").disabled = true; clearError();
      try { const url = await flow.checkout(access); if (isCurrent(access)) win.location.assign(url); }
      catch (error) { if (isCurrent(access)) showError(error, true); }
      finally { if (isCurrent(access)) el("resume-checkout").disabled = false; }
    }

    // The API remains disabled unless both the explicit switch and origin are valid.
    el("booking-label").textContent = "Book a session";
    el("intake-preview-status").textContent = "Choose your appointment and time. Your booking is confirmed only when payment and the appointment have both been verified.";
    el("rate-note").textContent = "The £30 supported rate is for one-hour appointments only. Availability depends on the time and weekly capacity remaining.";
    el("booking-times").disabled = false;
    el("slot-status").textContent = "Choose a rate, then find available times.";
    el("booking-submit").textContent = "Hold this time and continue to payment";
    el("payment-explanation").hidden = false;
    try {
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localZone !== "Europe/London") {
        const option = doc.createElement("option"); option.value = localZone; option.textContent = "Your time zone (" + localZone + ")";
        el("booking-timezone").append(option); el("booking-timezone").value = localZone;
      }
    } catch { /* London remains the explicit fallback. */ }
    form.querySelectorAll('input[name="rate"]').forEach(input => input.addEventListener("change", () => { week = 0; loadSlots(); }));
    el("load-times").addEventListener("click", loadSlots);
    el("previous-week").addEventListener("click", () => { if (week > 0) { week--; loadSlots(); } });
    el("next-week").addEventListener("click", () => { if (rangeStart + (week + 1) * 7 * DAY < horizon) { week++; loadSlots(); } });
    el("booking-timezone").addEventListener("change", () => { renderSlots(); if (currentRecord) renderRecord(currentRecord); });
    form.addEventListener("submit", async () => {
      if (submitting || !termsReady || !selectedSlot || !form.reportValidity()) return;
      updateConsent();
      if (!form.reportValidity()) return;
      submitting = true; updateConsent(); clearError(); form.setAttribute("aria-busy", "true");
      try {
        const record = await flow.hold({ startsAt: selectedSlot.startsAt, rate: rate(),
          name: el("booking-name").value.trim(), email: el("booking-email").value.trim(), note: el("intake-note").value,
          earlyStart: el("early-start").checked, consentVersion: config.consentVersion });
        context = read();
        win.history.replaceState(null, "", "#" + new URLSearchParams({ booking: record.id }));
        renderRecord(record); el("booking-status-title").focus();
        if (describeRecord(record).canPay) await checkout();
      } catch (error) { showError(error, !!context?.id); }
      finally { submitting = false; updateConsent(); form.removeAttribute("aria-busy"); }
    });
    el("refresh-booking").addEventListener("click", () => refresh(true));
    el("resume-checkout").addEventListener("click", checkout);
    el("copy-management").addEventListener("click", async () => {
      try { await win.navigator.clipboard.writeText(managementLink(win.location, context.id, context.token)); el("management-feedback").textContent = "Private booking link copied. Save it somewhere safe."; }
      catch { el("management-feedback").textContent = "The link could not be copied. Keep this tab open or contact Jonathan for booking help."; }
    });
    el("cancel-booking").addEventListener("click", () => {
      const short = Date.parse(currentRecord.startsAt) - Date.now() < DAY;
      el("cancellation-explanation").textContent = short
        ? "This appointment starts in less than 24 hours. Send Jonathan a request for personal review? This will not automatically cancel your appointment or issue a refund."
        : "Cancel this whole appointment? Once cancellation is confirmed, the full refund process will begin. Provider delays may leave a pending status. Your statutory rights still apply.";
      el("confirm-cancellation").textContent = short ? "Send review request" : "Confirm cancellation";
      el("cancellation-confirm").hidden = false; el("confirm-cancellation").focus();
    });
    el("keep-booking").addEventListener("click", () => { el("cancellation-confirm").hidden = true; el("cancel-booking").focus(); });
    el("confirm-cancellation").addEventListener("click", async () => {
      if (!context?.id || !currentRecord || !describeRecord(currentRecord).canCancel) return;
      const access = { ...context }, sequence = ++statusSequence;
      el("confirm-cancellation").disabled = true; clearError();
      try {
        const record = await api("/api/bookings/" + encodeURIComponent(access.id) + "/cancel", { method: "POST", token: access.token });
        if (isCurrent(access) && sequence === statusSequence) { renderRecord(record); el("booking-status-title").focus(); }
      }
      catch (error) { if (isCurrent(access) && sequence === statusSequence) showError(error, true); }
      finally { el("confirm-cancellation").disabled = false; }
    });
    el("new-booking").addEventListener("click", () => {
      if (!currentRecord || !describeRecord(currentRecord).canRestart) return;
      save(null); statusSequence++; currentRecord = null; clearTimeout(pollTimer); form.hidden = false; el("booking-management").hidden = true;
      form.reset(); el("intake-note").dispatchEvent(new Event("input"));
      win.history.replaceState(null, "", "#contact"); selectedSlot = null; slots = []; renderSlots(); updateConsent(); updateWeekControls(); form.querySelector('input[name="rate"]').focus();
    });
    doc.addEventListener("visibilitychange", () => {
      if (doc.hidden) clearTimeout(pollTimer);
      else if (context?.id) refresh(false);
    });
    async function recover() {
      statusSequence++; clearTimeout(pollTimer);
      currentRecord = null;
      for (const id of ["resume-checkout", "cancel-booking", "new-booking", "booking-meeting", "cancellation-confirm"]) el(id).hidden = true;
      for (const id of ["booking-summary", "booking-refund", "booking-last-checked"]) el(id).textContent = "";
      el("booking-meeting-link").removeAttribute("href");
      el("booking-status-title").textContent = "Checking your booking";
      el("booking-status-message").textContent = "Checking the current status before you continue.";
      if (new URLSearchParams(win.location.hash.slice(1)).has("booking")) { form.hidden = true; el("booking-management").hidden = false; }
      try {
        context = read();
        if (context?.id && ID.test(context.id) && TOKEN.test(context.token || "")) save(context);
        const fragment = readFragment(win.location.hash);
        if (fragment?.token) save({ id: fragment.id, token: fragment.token });
        else if (fragment && context?.id !== fragment.id) {
          const access = JSON.parse(win.sessionStorage.getItem(STORAGE_KEY + "-access") || "{}");
          if (!access[fragment.id] || !TOKEN.test(access[fragment.id].token || "")) throw new Error("invalid_recovery_link");
          save(access[fragment.id]);
        }
        if (context?.id) {
          if (!ID.test(context.id) || !TOKEN.test(context.token || "")) throw new Error("invalid_recovery_link");
          form.hidden = true; el("booking-management").hidden = false;
          win.history.replaceState(null, "", "#" + new URLSearchParams({ booking: context.id }));
          await refresh(true);
        }
      } catch (error) {
        context = null;
        el("booking-status-title").textContent = "Booking access could not be verified";
        el("booking-status-message").textContent = "No booking action has been taken.";
        showError(error, !el("booking-management").hidden);
      }
    }
    win.addEventListener("hashchange", () => { if (new URLSearchParams(win.location.hash.slice(1)).has("booking")) return recover(); });
    win.addEventListener("pageshow", event => { if (event.persisted) return recover(); });
    el("retry-booking-terms").addEventListener("click", loadTerms);
    loadTerms();
    recover();
    updateWeekControls();
  }
  return { createApi, createFlow, describeRecord, errorMessage, managementLink, mount, needsEarlyStart, readFragment, validConfig, validateRecord };
});
