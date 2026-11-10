import { createHmac, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);
const DEFAULT_FIREBASE_PROJECT_ID = "gen-lang-client-0137515073";
const buckets = new Map();

export class V0HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function authenticateFirebaseRequest(req, env = process.env) {
  const authorization = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(authorization));
  if (!match) throw new V0HttpError(401, "AUTH_REQUIRED", "Đăng nhập để sử dụng v0 Builder.");

  const projectId = String(env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim();
  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128) {
      throw new Error("Invalid Firebase subject");
    }
    if (payload.firebase?.sign_in_provider === "anonymous") {
      throw new V0HttpError(403, "AUTH_PROVIDER_NOT_ALLOWED", "Tài khoản ẩn danh không được phép dùng v0 Builder.");
    }
    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch (error) {
    if (error instanceof V0HttpError) throw error;
    if (error?.code === "ERR_JWKS_TIMEOUT" || error?.code === "ERR_JWKS_FETCH") {
      throw new V0HttpError(503, "AUTH_VERIFICATION_UNAVAILABLE", "Không thể xác minh phiên đăng nhập lúc này.");
    }
    throw new V0HttpError(401, "INVALID_SESSION", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.");
  }
}

export function authorizeV0User(user, env = process.env) {
  const allowedEmails = String(env.V0_ALLOWED_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowedUids = String(env.V0_ALLOWED_UIDS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!allowedEmails.length && !allowedUids.length) {
    throw new V0HttpError(503, "V0_ACCESS_NOT_CONFIGURED", "v0 Builder đang khóa. Chủ dự án cần cấu hình V0_ALLOWED_EMAILS hoặc V0_ALLOWED_UIDS.");
  }
  const emailAllowed = user.email && allowedEmails.includes(user.email.toLowerCase());
  const uidAllowed = allowedUids.includes(user.uid);
  if (!emailAllowed && !uidAllowed) {
    throw new V0HttpError(403, "V0_ACCESS_DENIED", "Tài khoản này chưa được cấp quyền sử dụng v0 Builder.");
  }
}

function tokenSignature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueV0ChatToken({ uid, chatId, secret, now = Date.now(), ttlMs = 30 * 24 * 60 * 60 * 1000 }) {
  if (!secret || secret.length < 20) throw new V0HttpError(503, "V0_NOT_CONFIGURED", "v0 Builder chưa được cấu hình an toàn.");
  const payload = Buffer.from(JSON.stringify({ uid, chatId, exp: Math.floor((now + ttlMs) / 1000) })).toString("base64url");
  return `${payload}.${tokenSignature(payload, secret)}`;
}

export function verifyV0ChatToken(token, { uid, chatId, secret, now = Date.now() }) {
  if (!secret || typeof token !== "string" || token.length > 2048) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expected = tokenSignature(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.uid === uid && data.chatId === chatId && Number.isInteger(data.exp) && data.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function consumeV0RateLimit(key, { max, windowMs = 60_000, now = Date.now(), maxKeys = 5000 } = {}) {
  if (!key || !Number.isInteger(max) || max < 1) return { allowed: false, remaining: 0, retryAfter: 60 };
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (buckets.size > maxKeys) {
    for (const [candidate, value] of buckets) {
      if (now - value.startedAt >= windowMs) buckets.delete(candidate);
    }
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
  }
  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000)),
  };
}

export async function enforceV0RateLimit(key, { max, windowSeconds = 60, env = process.env } = {}) {
  const redisUrl = String(env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
  const redisToken = String(env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!redisUrl || !redisToken) {
    if (env.NODE_ENV === "production") {
      throw new V0HttpError(503, "RATE_LIMIT_NOT_CONFIGURED", "v0 Builder đang khóa cho đến khi cấu hình Upstash Redis rate limiting.");
    }
    const local = consumeV0RateLimit(key, { max, windowMs: windowSeconds * 1000 });
    if (!local.allowed) throw new V0HttpError(429, "RATE_LIMITED", "Đã đạt giới hạn yêu cầu v0. Hãy thử lại sau.");
    return local;
  }

  let endpoint;
  try {
    endpoint = new URL(redisUrl);
    if (endpoint.protocol !== "https:") throw new Error("Redis REST must use HTTPS");
  } catch {
    throw new V0HttpError(503, "RATE_LIMIT_UNAVAILABLE", "Cấu hình Redis rate limiting không hợp lệ.");
  }

  try {
    const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";
    const response = await fetch(`${endpoint.origin}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify([["EVAL", script, "1", key, String(windowSeconds)]]),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error("Redis rate-limit request failed");
    const result = await response.json();
    const count = Number(result?.[0]?.result);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid Redis rate-limit response");
    if (count > max) throw new V0HttpError(429, "RATE_LIMITED", "Đã đạt giới hạn yêu cầu v0. Hãy thử lại sau.");
    return { allowed: true, remaining: Math.max(0, max - count), retryAfter: 0 };
  } catch (error) {
    if (error instanceof V0HttpError) throw error;
    throw new V0HttpError(503, "RATE_LIMIT_UNAVAILABLE", "Không thể kiểm tra giới hạn sử dụng v0. Hãy thử lại sau.");
  }
}

export function resetV0RateLimitsForTests() {
  buckets.clear();
}
