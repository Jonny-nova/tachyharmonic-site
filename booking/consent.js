(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TachyharmonicConsent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "v1-2026-09-27";
  const WORDING = "I expressly request preparation and my session to begin within my 14-day cancellation period. I understand that, if I cancel after work begins, a proportionate amount for work actually supplied may be payable where the law permits, and that my statutory cancellation right ends once the service is fully performed.";
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  function parts(value) { return Object.fromEntries(formatter.formatToParts(new Date(value)).filter(x => x.type !== "literal").map(x => [x.type, Number(x.value)])); }
  function cancellationEndsAt(contractAt) {
    if (!Number.isFinite(Date.parse(contractAt))) throw new TypeError("Contract timestamp required");
    const local = parts(contractAt);
    // Fourteen days after the day of formation: the right expires at the end
    // of London day 14, so early performance stops at local midnight day 15.
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + 15));
    for (const offset of [0, -3600000]) {
      const candidate = new Date(date.getTime() + offset), p = parts(candidate);
      if (p.year === date.getUTCFullYear() && p.month === date.getUTCMonth() + 1 && p.day === date.getUTCDate() && p.hour === 0) return candidate.toISOString();
    }
    throw new TypeError("London cancellation boundary unavailable");
  }
  function requiresEarlyStart(preparationAt, contractAt) { return Date.parse(preparationAt) < Date.parse(cancellationEndsAt(contractAt)); }
  return { VERSION, WORDING, cancellationEndsAt, requiresEarlyStart };
});
