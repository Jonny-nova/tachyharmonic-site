"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { loadTerms, renderTerms } = require("./terms");
const config = { apiBase: "https://preview.example.test", enabled: false };
const traderAddress = "TEST FIXTURE ONLY, 1 Example Street, Test Town";
const snapshot = { ...require("../booking/contract-terms").createContractTerms({ traderAddress }), traderAddress };

test("public terms load independently of booking switch with no credentials or referrer", async () => {
  let request;
  assert.deepEqual(await loadTerms(config, async (url, init) => { request = { url, init }; return Response.json(snapshot); }), snapshot);
  assert.equal(request.url, "https://preview.example.test/api/terms");
  assert.equal(request.init.credentials, "omit"); assert.equal(request.init.cache, "no-store"); assert.equal(request.init.referrerPolicy, "no-referrer");
  await assert.rejects(loadTerms({ apiBase: "http://unsafe.example.test" }, async () => { throw new Error("should not fetch"); }));
  await assert.rejects(loadTerms(config, async () => Response.json({ ...snapshot, traderAddress: "unknown" })));
});

test("terms rendering uses literal text and shows an explicit unavailable state after failure", async () => {
  const nodes = Object.fromEntries(["terms-load-status", "terms-snapshot", "trader-address"].map(id => [id, { textContent: "", hidden: true, set innerHTML(value) { throw new Error("HTML injection forbidden"); } }]));
  const document = { getElementById: id => nodes[id] };
  const malicious = { ...snapshot, text: snapshot.text + "\n<script>unsafe()</script>" };
  await renderTerms(document, config, async () => Response.json(malicious));
  assert.equal(nodes["terms-snapshot"].textContent, malicious.text);
  assert.equal(nodes["terms-snapshot"].hidden, false);
  assert.equal(nodes["trader-address"].textContent, traderAddress);
  await renderTerms(document, config, async () => new Response("", { status: 503 }));
  assert.equal(nodes["terms-snapshot"].hidden, true);
  assert.equal(nodes["terms-snapshot"].textContent, "");
  assert.match(nodes["terms-load-status"].textContent, /could not be loaded/);
});
