"use strict";

(function (root) {
  async function loadTerms(config, fetcher) {
    if (!config || typeof config.apiBase !== "string" || !config.apiBase) throw new Error("terms_unavailable");
    const base = new URL(config.apiBase);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !["", "/"].includes(base.pathname)) throw new Error("terms_unavailable");
    const response = await fetcher(new URL("/api/terms", base).href, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error("terms_unavailable");
    const terms = await response.json();
    if (!terms || typeof terms.version !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(terms.version) || typeof terms.text !== "string" || terms.text.length < 100 || terms.text.length > 16000 || typeof terms.traderAddress !== "string" || terms.traderAddress.trim().length < 10 || terms.traderAddress.length > 600 || !terms.text.includes(terms.traderAddress)) throw new Error("terms_unavailable");
    return terms;
  }
  async function renderTerms(document, config, fetcher) {
    const status = document.getElementById("terms-load-status"), snapshot = document.getElementById("terms-snapshot"), address = document.getElementById("trader-address");
    if (!status || !snapshot || !address) return;
    try {
      const terms = await loadTerms(config, fetcher);
      snapshot.textContent = terms.text;
      snapshot.hidden = false;
      address.textContent = terms.traderAddress;
      status.textContent = "Current booking terms loaded. Please read these before payment.";
    } catch {
      snapshot.textContent = "";
      snapshot.hidden = true;
      address.textContent = "unavailable — please contact Jonathan before booking";
      status.textContent = "The current trader details and booking terms could not be loaded. Please contact Jonathan before booking.";
    }
  }
  if (typeof module === "object" && module.exports) module.exports = { loadTerms, renderTerms };
  if (root.document) renderTerms(root.document, root.TACHYHARMONIC_BOOKING, root.fetch.bind(root));
})(typeof window === "object" ? window : globalThis);
