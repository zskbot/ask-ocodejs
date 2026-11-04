import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AUTH_ENV, LINK_ENV, isValidCallbackUrl, safeUrl, sanitizeUrl } from "./auth-links-core.js";
import { verifyProviderToken } from "./auth-token-verifier.js";

const server = new Server({ name: "ocodejs-auth-integration", version: "1.0.1" }, { capabilities: { tools: {} } });
const tools = [
  { name: "auth_configuration_status", description: "Inspect Firebase, GitHub OAuth, and Google OAuth configuration without returning secret values. Reports callback URL format separately from provider-console verification.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "verify_provider_token", description: "Verify a Firebase ID token, GitHub access token, or Google access/ID token directly with its provider. Never logs or returns the supplied token; returns minimal identity and validity metadata.", inputSchema: { type: "object", properties: { provider: { type: "string", enum: ["firebase", "github", "google"] }, token: { type: "string", minLength: 1, maxLength: 16384 }, tokenType: { type: "string", enum: ["id_token", "access_token"] } }, required: ["provider", "token"], additionalProperties: false } },
  { name: "project_integration_links", description: "List configured OCodeJS application, docs, API, MCP, and GitHub links. Sensitive query strings and URL credentials are never returned.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "verify_project_links", description: "Check configured OCodeJS HTTPS service links. Only checks named OCODEJS_*_URL environment variables; redirects are revalidated and private IP literals are blocked.", inputSchema: { type: "object", properties: { links: { type: "array", items: { type: "string", enum: Object.keys(LINK_ENV) }, description: "Optional link keys to check; defaults to all configured links." } }, additionalProperties: false } },
];
const configured = (name) => Boolean(process.env[name]?.trim());
async function firebaseConfig() {
  try {
    const file = new URL("../../firebase-applet-config.json", import.meta.url);
    const config = JSON.parse(await readFile(file, "utf8"));
    return { present: Boolean(config.projectId && config.authDomain && config.apiKey), projectId: config.projectId || null, authDomain: config.authDomain || null, apiKeyPresent: Boolean(config.apiKey), apiKey: config.apiKey || null };
  } catch { return { present: false, projectId: null, authDomain: null, apiKeyPresent: false, apiKey: null }; }
}
function getLinks() {
  return Object.fromEntries(Object.entries(LINK_ENV).map(([key, env]) => [key, process.env[env]?.trim() || null]));
}
async function inspectLink(key, value) {
  let current = safeUrl(value);
  if (!current) return { key, configured: true, reachable: false, error: "Only public HTTPS URLs are allowed; local/private IP destinations are blocked." };
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      let response = await fetch(current, { method: "HEAD", redirect: "manual", signal: controller.signal, headers: { "user-agent": "OCodeJS-Integration-MCP/1.0" } });
      if (response.status === 405 || response.status === 501) response = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "user-agent": "OCodeJS-Integration-MCP/1.0", range: "bytes=0-0" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) return { key, configured: true, reachable: false, status: response.status, error: "Redirect limit reached or Location header missing." };
        current = safeUrl(new URL(location, current).toString());
        if (!current) return { key, configured: true, reachable: false, status: response.status, error: "Redirect target is not an allowed public HTTPS URL." };
        continue;
      }
      return { key, configured: true, reachable: response.status >= 200 && response.status < 500, status: response.status, finalHost: current.host };
    } catch (error) {
      return { key, configured: true, reachable: false, error: error?.name === "AbortError" ? "Request timed out after 7 seconds." : "Network request failed." };
    } finally { clearTimeout(timer); }
  }
  return { key, configured: true, reachable: false, error: "Redirect limit reached." };
}
async function authStatus() {
  const firebase = await firebaseConfig();
  const checks = Object.fromEntries(Object.entries(AUTH_ENV).map(([key, env]) => [key, configured(env)]));
  return {
    firebaseClient: { configuredInSource: firebase.present, projectId: firebase.projectId, authDomain: firebase.authDomain, publicApiKeyPresent: firebase.apiKeyPresent, note: "Firebase web API keys are public client identifiers. Provider enablement must be verified in Firebase Console." },
    firebaseAdmin: { configured: Boolean(checks.firebaseAdminProject && checks.firebaseAdminClientEmail && checks.firebaseAdminPrivateKey), checks: { projectId: checks.firebaseAdminProject, clientEmail: checks.firebaseAdminClientEmail, privateKey: checks.firebaseAdminPrivateKey } },
    githubOAuth: { configured: Boolean(checks.githubClientId && checks.githubClientSecret && checks.githubCallbackUrl), checks: { clientId: checks.githubClientId, clientSecret: checks.githubClientSecret, callbackUrlConfigured: checks.githubCallbackUrl, callbackUrlValidHttps: checks.githubCallbackUrl ? isValidCallbackUrl(process.env.GITHUB_CALLBACK_URL) : false } },
    googleOAuth: { configured: Boolean(checks.googleClientId && checks.googleClientSecret && checks.googleCallbackUrl), checks: { clientId: checks.googleClientId, clientSecret: checks.googleClientSecret, callbackUrlConfigured: checks.googleCallbackUrl, callbackUrlValidHttps: checks.googleCallbackUrl ? isValidCallbackUrl(process.env.GOOGLE_CALLBACK_URL) : false }, firebaseGoogleProviderInClientCode: true },
    verificationLimit: "Checks local configuration presence and callback URL format only. Does not authenticate users, validate secrets with providers, or prove OAuth is enabled in provider consoles.",
  };
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  let result;
  if (name === "auth_configuration_status") result = await authStatus();
  else if (name === "verify_provider_token") {
    const firebase = args.provider === "firebase" ? await firebaseConfig() : null;
    try {
      result = await verifyProviderToken({ provider: args.provider, token: args.token, tokenType: args.tokenType, firebaseApiKey: firebase?.apiKey, googleClientId: process.env.GOOGLE_CLIENT_ID });
    } catch {
      result = { valid: false, provider: args.provider, reason: "verification_service_unavailable" };
    }
  }
  else if (name === "project_integration_links") {
    result = Object.fromEntries(Object.entries(getLinks()).map(([key, url]) => [key, url ? { configured: true, url: sanitizeUrl(url), validHttps: Boolean(safeUrl(url)) } : { configured: false, url: null }]));
  } else if (name === "verify_project_links") {
    const links = getLinks();
    const requested = Array.isArray(args.links) && args.links.length ? args.links : Object.keys(LINK_ENV);
    result = await Promise.all(requested.map((key) => links[key] ? inspectLink(key, links[key]) : { key, configured: false, reachable: false, error: "Environment URL is not configured." }));
  } else return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
await server.connect(new StdioServerTransport());
