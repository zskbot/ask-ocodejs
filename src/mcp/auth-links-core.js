import { isIP } from "node:net";

export const LINK_ENV = Object.freeze({
  app: "OCODEJS_APP_URL",
  docs: "OCODEJS_DOCS_URL",
  api: "OCODEJS_API_URL",
  mcp: "OCODEJS_MCP_URL",
  github: "OCODEJS_GITHUB_URL",
});

export const AUTH_ENV = Object.freeze({
  firebaseAdminProject: "FIREBASE_ADMIN_PROJECT_ID",
  firebaseAdminClientEmail: "FIREBASE_ADMIN_CLIENT_EMAIL",
  firebaseAdminPrivateKey: "FIREBASE_ADMIN_PRIVATE_KEY",
  githubClientId: "GITHUB_CLIENT_ID",
  githubClientSecret: "GITHUB_CLIENT_SECRET",
  githubCallbackUrl: "GITHUB_CALLBACK_URL",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  googleCallbackUrl: "GOOGLE_CALLBACK_URL",
});

function isPublicIp(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const version = isIP(host);
  if (version === 0) return true;
  if (version === 4) {
    const octets = host.split(".").map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && octets[2] === 100))) return false;
    if (a === 203 && b === 0 && octets[2] === 113) return false;
    return true;
  }
  // Only global-unicast IPv6 (2000::/3) is accepted. This rejects loopback,
  // link-local, unique-local, IPv4-mapped and unspecified addresses.
  const firstHextet = Number.parseInt(host.split(":")[0] || "0", 16);
  return firstHextet >= 0x2000 && firstHextet <= 0x3fff;
}

export function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.google" ||
    !isPublicIp(host)
  ) return null;
  return url;
}

export function sanitizeUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isValidCallbackUrl(value) {
  return Boolean(safeUrl(value));
}
