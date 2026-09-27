"use strict";

// One-time local setup only. No provider actions, automatic browser opening,
// deployed secrets update or logging of callback URLs/token responses.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const REDIRECT_URI = "http://127.0.0.1:8765/oauth/callback";
const SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
]);
const OUTPUT_FILE = path.resolve(__dirname, "../.local/google-credentials.json");
const safeError = code => Object.assign(new Error(code), { safeCode: code });

function parseClient(json) {
  let document;
  try { document = JSON.parse(json); } catch { throw safeError("invalid_client_file"); }
  const client = document?.web;
  if (!client || typeof client.client_id !== "string" || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(client.client_id) ||
      typeof client.client_secret !== "string" || !client.client_secret || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(REDIRECT_URI)) {
    throw safeError("web_client_with_exact_redirect_required");
  }
  // Never use endpoint URLs supplied by the downloaded document.
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

function createAttempt(client) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: REDIRECT_URI,
    response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent",
    include_granted_scopes: "false", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return { state, verifier, authorizationUrl: url.href, used: false };
}

function validateCallback(requestUrl, state) {
  if (typeof requestUrl !== "string" || requestUrl.length > 8192 || !requestUrl.startsWith("/")) throw safeError("invalid_callback");
  const url = new URL(requestUrl, REDIRECT_URI);
  if (url.origin !== new URL(REDIRECT_URI).origin || url.pathname !== "/oauth/callback") throw safeError("invalid_callback");
  const states = url.searchParams.getAll("state");
  const received = Buffer.from(states[0] || "");
  const expected = Buffer.from(state);
  if (states.length !== 1 || received.length !== expected.length || !timingSafeEqual(received, expected)) throw safeError("state_mismatch");
  if (url.searchParams.has("error")) throw safeError("authorization_declined");
  const codes = url.searchParams.getAll("code");
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) throw safeError("authorization_code_missing");
  return codes[0];
}

function extractCredentials(client, result) {
  if (!result || typeof result.refresh_token !== "string" || !result.refresh_token) throw safeError("refresh_token_missing");
  const granted = new Set(typeof result.scope === "string" ? result.scope.split(/\s+/) : []);
  if (!SCOPES.every(scope => granted.has(scope))) throw safeError("required_scopes_not_granted");
  // Exclude access token, auth code, verifier and provider response fields.
  return { GOOGLE_CLIENT_ID: client.clientId, GOOGLE_CLIENT_SECRET: client.clientSecret, GOOGLE_REFRESH_TOKEN: result.refresh_token };
}

async function exchangeCode(client, attempt, code, fetcher = fetch) {
  let response, result;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret,
        code, code_verifier: attempt.verifier, grant_type: "authorization_code", redirect_uri: REDIRECT_URI }) });
    if (!response.ok) throw safeError("token_exchange_rejected");
    result = await response.json();
  } catch (error) { throw safeError(error.safeCode || "token_exchange_failed"); }
  return extractCredentials(client, result);
}

function protectFile(file) {
  fs.chmodSync(file, 0o600);
  if (process.platform === "win32") {
    const system32 = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
    const owner = execFileSync(path.join(system32, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const sid = owner.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw safeError("private_file_permissions_failed");
    execFileSync(path.join(system32, "icacls.exe"), [file, "/inheritance:r", "/grant:r", `*${sid}:F`], { windowsHide: true, stdio: "pipe" });
  }
}

function saveCredentials(credentials) {
  const directory = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const handle = fs.openSync(OUTPUT_FILE, "wx", 0o600); // Never replace existing credentials silently.
  try {
    // Establish restrictive permissions before writing any secret bytes.
    protectFile(OUTPUT_FILE);
    fs.writeFileSync(handle, JSON.stringify(credentials, null, 2) + "\n", "utf8");
    fs.fsyncSync(handle);
  } catch {
    fs.closeSync(handle);
    fs.unlinkSync(OUTPUT_FILE); // Only the exact file just created by this call.
    throw safeError("private_credentials_save_failed");
  }
  fs.closeSync(handle);
}

async function run(clientFile) {
  if (!clientFile) throw safeError("usage_node_scripts_google_oauth_setup_js_client_json_path");
  if (fs.existsSync(OUTPUT_FILE)) throw safeError("credentials_already_exist_preserve_before_rotation");
  let json;
  try { if (fs.statSync(clientFile).size > 65536) throw new Error(); json = fs.readFileSync(clientFile, "utf8").replace(/^\uFEFF/, ""); }
  catch { throw safeError("client_file_unreadable"); }
  const client = parseClient(json), attempt = createAttempt(client);
  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = error => {
      if (finished) return; finished = true; clearTimeout(timer);
      server.close(() => error ? reject(error) : resolve());
      server.closeIdleConnections();
    };
    const server = http.createServer(async (request, response) => {
      const respond = (status, message) => {
        response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'", "Connection": "close" });
        response.end(message);
      };
      if (request.method !== "GET" || request.headers.host !== "127.0.0.1:8765" || request.socket.remoteAddress !== "127.0.0.1") { respond(400, "Invalid local callback."); return; }
      if (attempt.used || finished) { respond(409, "This authorization attempt is already complete."); return; }
      let code;
      try { code = validateCallback(request.url, attempt.state); }
      catch (error) { respond(400, "Authorization was not accepted. Return to the setup terminal."); if (error.safeCode === "authorization_declined") finish(error); return; }
      attempt.used = true;
      try {
        const credentials = await exchangeCode(client, attempt, code);
        code = null; attempt.verifier = "";
        saveCredentials(credentials);
        respond(200, "Authorization saved locally. Close this tab and return to setup. No website booking switch has been enabled.");
        finish();
      } catch (error) {
        code = null; attempt.verifier = "";
        respond(400, "Authorization could not be saved. Return to the setup terminal; no credentials are displayed here.");
        finish(safeError(error.safeCode || "setup_failed"));
      }
    });
    server.requestTimeout = 10000; server.headersTimeout = 10000;
    const timer = setTimeout(() => { server.closeAllConnections(); finish(safeError("authorization_timeout")); }, 10 * 60 * 1000);
    server.once("error", () => finish(safeError("local_callback_listener_failed")));
    server.listen(8765, "127.0.0.1", () => {
      process.stdout.write("Local callback ready. Open this Google authorization URL after confirming the host account and permissions:\n" + attempt.authorizationUrl + "\n");
    });
  });
  process.stdout.write("Credentials saved to ignored .local/google-credentials.json with restricted file permissions. No secret values were printed.\n");
}

if (require.main === module) run(process.argv[2]).catch(error => {
  // Never print arbitrary exception text/stack, callback or provider response.
  process.stderr.write(`Google setup failed: ${error.safeCode || "setup_failed"}.\n`);
  process.exitCode = 1;
});
module.exports = { REDIRECT_URI, SCOPES, parseClient, createAttempt, validateCallback, extractCredentials, exchangeCode };
