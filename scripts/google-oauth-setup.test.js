"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { createHash } = require("node:crypto");
const { REDIRECT_URI, SCOPES, parseClient, createAttempt, validateCallback, extractCredentials, exchangeCode } = require("./google-oauth-setup");
const client = { clientId: "test-client.apps.googleusercontent.com", clientSecret: "synthetic-test-secret" };

test("OAuth uses fixed Google endpoints, narrow scopes, state and S256 without secret disclosure", () => {
  const first = createAttempt(client), second = createAttempt(client), url = new URL(first.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), SCOPES.join(" "));
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(first.verifier).digest("base64url"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline"); assert.equal(url.searchParams.get("prompt"), "consent");
  assert.notEqual(first.state, second.state); assert.notEqual(first.verifier, second.verifier);
  assert.equal(first.authorizationUrl.includes(client.clientSecret), false); assert.equal(first.authorizationUrl.includes(first.verifier), false);
});
test("callback rejects missing, wrong or duplicated state/code and foreign origins", () => {
  const { state } = createAttempt(client), callback = `/oauth/callback?state=${state}&code=synthetic-code`;
  assert.equal(validateCallback(callback, state), "synthetic-code");
  for (const value of ["/oauth/callback?code=x", callback + "&state=other", callback + "&code=second", "//evil.test/oauth/callback?state=" + state + "&code=x", "/oauth/callback?state=wrong&code=x"]) assert.throws(() => validateCallback(value, state));
  assert.throws(() => validateCallback(`/oauth/callback?state=${state}&error=access_denied&error_description=PRIVATE`, state), error => error.safeCode === "authorization_declined" && !error.message.includes("PRIVATE"));
});
test("downloaded client must be web type with exact callback; token persistence allowlists only three secrets", () => {
  const web = { client_id: client.clientId, client_secret: client.clientSecret, redirect_uris: [REDIRECT_URI], token_uri: "https://evil.test/token" };
  assert.deepEqual(parseClient(JSON.stringify({ web })), client);
  assert.throws(() => parseClient(JSON.stringify({ installed: web })));
  assert.throws(() => parseClient(JSON.stringify({ web: { ...web, redirect_uris: ["http://localhost:8765/oauth/callback"] } })));
  assert.throws(() => extractCredentials(client, { access_token: "never-save", scope: SCOPES.join(" ") }), /refresh_token_missing/);
  assert.throws(() => extractCredentials(client, { refresh_token: "test-refresh", scope: SCOPES[0] }), /required_scopes_not_granted/);
  assert.deepEqual(Object.keys(extractCredentials(client, { refresh_token: "test-refresh", access_token: "never-save", scope: SCOPES.join(" "), code: "never-save" })).sort(), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);
});
test("token exchange sends verifier and exact redirect only to Google and suppresses errors", async () => {
  const attempt = createAttempt(client);
  const saved = await exchangeCode(client, attempt, "test-code", async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token"); assert.equal(options.redirect, "error");
    assert.equal(options.body.get("code_verifier"), attempt.verifier); assert.equal(options.body.get("redirect_uri"), REDIRECT_URI);
    assert.equal(options.body.get("client_secret"), client.clientSecret);
    return { ok: true, json: async () => ({ refresh_token: "test-refresh", scope: SCOPES.join(" ") }) };
  });
  assert.equal(saved.GOOGLE_REFRESH_TOKEN, "test-refresh");
  await assert.rejects(exchangeCode(client, attempt, "test-code", async () => { throw new Error("PRIVATE provider response"); }), error => error.message === "token_exchange_failed");
});
