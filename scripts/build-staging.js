"use strict";

// Explicit public-file allowlist: never copy the repository, credentials or CNAME.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".local", "staging-assets");
const origin = "https://tachyharmonic-booking-staging.tachyharmonic-site.workers.dev";
const enabled = process.argv.includes("--enable-test-booking");
const files = [
  "index.html", "terms.html", "css/styles.css", "css/booking.css",
  "js/script.js", "js/booking.js", "js/terms.js", "booking/consent.js",
  "public/assets/favicon.svg", "public/assets/tachyharmonic-mark-light.svg",
  "assets/images/jonathan-portrait.png", "assets/images/jonathan-portrait-800.webp",
];
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Source portrait is deliberately read-only. Only generated copies are writable.
  if (fs.existsSync(destination)) fs.chmodSync(destination, 0o600);
  fs.writeFileSync(destination, fs.readFileSync(path.join(root, file)));
}
const pagePath = path.join(output, "index.html");
fs.writeFileSync(pagePath, fs.readFileSync(pagePath, "utf8")
  .replace("<head>", '<head>\n  <meta name="robots" content="noindex,nofollow">')
  .replace("<body>", '<body>\n  <p role="note" style="margin:0;padding:12px;text-align:center;background:#fff3cd;color:#332701">Staging review candidate · Stripe sandbox payments only · Not open for client bookings.</p>'));
fs.writeFileSync(path.join(output, "js", "booking-config.js"),
  `"use strict";\nwindow.TACHYHARMONIC_BOOKING = Object.freeze(${JSON.stringify({ enabled, apiBase: origin, consentVersion: "v1-2026-09-27" })});\n`);
fs.writeFileSync(path.join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
console.log(`Built ${files.length + 2} public staging files; test booking ${enabled ? "enabled" : "disabled"}.`);

