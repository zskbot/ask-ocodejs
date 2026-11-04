import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "ocodejs-auth-integration", version: "1.0.0" }, { capabilities: { tools: {} } });
const LINK_ENV = { app: "OCODEJS_APP_URL", docs: "OCODEJS_DOCS_URL", api: "OCODEJS_API_URL", mcp: "OCODEJS_MCP_URL", github: "OCODEJS_GITHUB_URL" };
const AUTH_ENV = {
  firebaseAdminProject: "FIREBASE_ADMIN_PROJECT_ID", firebaseAdminClientEmail: "FIREBASE_ADMIN_CLIENT_EMAIL", firebaseAdminPrivateKey: "FIREBASE_ADMIN_PRIVATE_KEY",
  githubClientId: "GITHUB_CLIENT_ID", githubClientSecret: "GITHUB_CLIENT_SECRET", githubCallbackUrl: "GITHUB_CALLBACK_URL",
  googleClientId: "GOOGLE_CLIENT_ID", googleClientSecret: "GOOGLE_CLIENT_SECRET", googleCallbackUrl: "GOOGLE_CALLBACK_URL",
};
const tools = [
  { name: "auth_configuration_status", description: "Inspect Firebase, GitHub OAuth, and Google OAuth configuration without returning secret values. Distinguishes source configuration from provider-console verification.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "project_integration_links", description: "List configured OCodeJS application, docs, API, MCP, and GitHub links. Never returns credentials.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "verify_project_links", description: "Check configured OCodeJS HTTPS service links. Only checks named OCODEJS_*_URL environment variables; redirects are revalidated and private/local destinations are blocked.", inputSchema: { type: "object", properties: { links: { type: "array", items: { type: "string", enum: Object.keys(LINK_ENV) }, description: "Optional link keys to check; defaults to all configured links." } }, additionalProperties: false } },
];
const configured = (name) => Boolean(process.env[name]?.trim());
async function firebaseConfig() {
  try {
    const file = new URL("../../firebase-applet-config.json", import.meta.url);
    const config = JSON.parse(await readFile(file, "utf8"));
    return { present: Boolean(config.projectId && config.authDomain && config.apiKey), projectId: config.projectId || null, authDomain: config.authDomain || null, apiKeyPresent: Boolean(config.apiKey) };
  } catch { return { present: false, projectId: null, authDomain: null, apiKeyPresent: false }; }
}
function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal" || host === "metadata.google") return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return null;
  return url;
}
function getLinks() { return Object.fromEntries(Object.entries(LINK_ENV).map(([key, env]) => [key, process.env[env]?.trim() || null])); }
async function inspectLink(key, value) {
  let current = safeUrl(value);
  if (!current) return { key, configured: true, reachable: false, error: "Only public HTTPS URLs are allowed; local/private destinations are blocked." };
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
    firebaseAdmin: { configured: checks.firebaseAdminProject && checks.firebaseAdminClientEmail && checks.firebaseAdminPrivateKey, checks: { projectId: checks.firebaseAdminProject, clientEmail: checks.firebaseAdminClientEmail, privateKey: checks.firebaseAdminPrivateKey } },
    githubOAuth: { configured: checks.githubClientId && checks.githubClientSecret && checks.githubCallbackUrl, checks: { clientId: checks.githubClientId, clientSecret: checks.githubClientSecret, callbackUrl: checks.githubCallbackUrl } },
    googleOAuth: { configured: checks.googleClientId && checks.googleClientSecret && checks.googleCallbackUrl, checks: { clientId: checks.googleClientId, clientSecret: checks.googleClientSecret, callbackUrl: checks.googleCallbackUrl }, firebaseGoogleProviderInClientCode: true },
    verificationLimit: "Checks configuration presence only. Does not authenticate users, validate secrets with providers, or prove OAuth is enabled in provider consoles.",
  };
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  let result;
  if (name === "auth_configuration_status") result = await authStatus();
  else if (name === "project_integration_links") result = Object.fromEntries(Object.entries(getLinks()).map(([key, url]) => [key, url ? { configured: true, url, validHttps: Boolean(safeUrl(url)) } : { configured: false, url: null }]));
  else if (name === "verify_project_links") {
    const links = getLinks();
    const requested = Array.isArray(args.links) && args.links.length ? args.links : Object.keys(LINK_ENV);
    result = await Promise.all(requested.map((key) => links[key] ? inspectLink(key, links[key]) : { key, configured: false, reachable: false, error: "Environment URL is not configured." }));
  } else return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
await server.connect(new StdioServerTransport());
