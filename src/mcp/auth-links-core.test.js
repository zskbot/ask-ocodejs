import test from "node:test";
import assert from "node:assert/strict";
import { isValidCallbackUrl, safeUrl, sanitizeUrl } from "./auth-links-core.js";

test("accepts public HTTPS URLs", () => {
  assert.equal(safeUrl("https://auth.example.com/callback")?.hostname, "auth.example.com");
});

test("rejects non-HTTPS schemes and credential-bearing URLs", () => {
  assert.equal(safeUrl("http://auth.example.com"), null);
  assert.equal(safeUrl("https://user:pass@example.com"), null);
});

test("rejects localhost, private, link-local, and reserved IPv4 addresses", () => {
  for (const url of [
    "https://localhost", "https://127.0.0.1", "https://10.0.0.2",
    "https://172.16.0.1", "https://192.168.1.2", "https://169.254.169.254",
    "https://100.64.0.1", "https://198.51.100.5", "https://203.0.113.5",
  ]) assert.equal(safeUrl(url), null, url);
});

test("rejects loopback, unique-local, and link-local IPv6 addresses", () => {
  for (const url of ["https://[::1]", "https://[fc00::1]", "https://[fe80::1]"]) {
    assert.equal(safeUrl(url), null, url);
  }
});

test("validates callback URL format and strips query secrets from displayed links", () => {
  assert.equal(isValidCallbackUrl("https://app.example.com/oauth/callback"), true);
  assert.equal(isValidCallbackUrl("javascript:alert(1)"), false);
  assert.equal(sanitizeUrl("https://app.example.com/callback?code=secret#token"), "https://app.example.com/callback");
});
