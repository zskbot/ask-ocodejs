import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeV0RateLimit,
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
