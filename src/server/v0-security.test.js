import { beforeEach, describe, expect, it } from "vitest";
import {
  authorizeV0User,
  consumeV0RateLimit,
  enforceV0RateLimit,
  issueV0ChatToken,
  resetV0RateLimitsForTests,
  verifyV0ChatToken,
} from "./v0-security.js";

describe("v0 access security", () => {
  beforeEach(() => resetV0RateLimitsForTests());

  it("issues chat tokens bound to one Firebase user and one chat", () => {
    const token = issueV0ChatToken({
      uid: "firebase-user-1",
      chatId: "chat_123",
      secret: "test-secret-that-is-long-enough",
      now: 1_000_000,
    });
    expect(verifyV0ChatToken(token, {
      uid: "firebase-user-1",
      chatId: "chat_123",
      secret: "test-secret-that-is-long-enough",
      now: 1_001_000,
    })).toBe(true);
    expect(verifyV0ChatToken(token, {
      uid: "firebase-user-2",
      chatId: "chat_123",
      secret: "test-secret-that-is-long-enough",
      now: 1_001_000,
    })).toBe(false);
    expect(verifyV0ChatToken(token, {
      uid: "firebase-user-1",
      chatId: "chat_other",
      secret: "test-secret-that-is-long-enough",
      now: 1_001_000,
    })).toBe(false);
  });

  it("rejects expired, tampered, and malformed chat tokens", () => {
    const token = issueV0ChatToken({
      uid: "u1",
      chatId: "chat_1",
      secret: "test-secret-that-is-long-enough",
      now: 1_000,
      ttlMs: 1_000,
    });
    expect(verifyV0ChatToken(token, { uid: "u1", chatId: "chat_1", secret: "test-secret-that-is-long-enough", now: 3_000 })).toBe(false);
    expect(verifyV0ChatToken(`${token}x`, { uid: "u1", chatId: "chat_1", secret: "test-secret-that-is-long-enough" })).toBe(false);
    expect(verifyV0ChatToken("not-a-token", { uid: "u1", chatId: "chat_1", secret: "test-secret-that-is-long-enough" })).toBe(false);
  });

  it("enforces a fixed-window limit and resets after the window", () => {
    expect(consumeV0RateLimit("user-1", { max: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(consumeV0RateLimit("user-1", { max: 2, windowMs: 1000, now: 200 }).allowed).toBe(true);
    const blocked = consumeV0RateLimit("user-1", { max: 2, windowMs: 1000, now: 300 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(1);
    expect(consumeV0RateLimit("user-1", { max: 2, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });
});

describe("v0 authorization and production rate-limit requirements", () => {
  it("fails closed when no account allow-list is configured", () => {
    expect(() => authorizeV0User({ uid: "u1", email: "user@example.com" }, {}))
      .toThrow("V0_ALLOWED_EMAILS");
  });

  it("allows only explicitly listed Firebase emails or UIDs", () => {
    expect(() => authorizeV0User(
      { uid: "u1", email: "Owner@Example.com", emailVerified: true },
      { V0_ALLOWED_EMAILS: "owner@example.com" },
    )).not.toThrow();
    expect(() => authorizeV0User(
      { uid: "u2", email: "other@example.com", emailVerified: false },
      { V0_ALLOWED_UIDS: "u2" },
    )).not.toThrow();
    expect(() => authorizeV0User(
      { uid: "u3", email: "owner@example.com", emailVerified: false },
      { V0_ALLOWED_EMAILS: "owner@example.com" },
    )).toThrow("chưa được cấp quyền");
    expect(() => authorizeV0User(
      { uid: "u4", email: "other@example.com", emailVerified: true },
      { V0_ALLOWED_EMAILS: "owner@example.com" },
    )).toThrow("chưa được cấp quyền");
  });

  it("fails closed in production without shared Upstash rate limiting", async () => {
    await expect(enforceV0RateLimit("test-user", {
      max: 2,
      env: { NODE_ENV: "production" },
    })).rejects.toThrow("Upstash Redis");
  });

  it("uses a process-local limiter only outside production", async () => {
    resetV0RateLimitsForTests();
    await expect(enforceV0RateLimit("dev-user", {
      max: 1,
      env: { NODE_ENV: "test" },
    })).resolves.toMatchObject({ allowed: true });
    await expect(enforceV0RateLimit("dev-user", {
      max: 1,
      env: { NODE_ENV: "test" },
    })).rejects.toThrow("giới hạn");
  });
});
