import { describe, expect, it } from "vitest";
import { isValidCallbackUrl, safeUrl, sanitizeUrl } from "./auth-links-core.js";

describe("OCodeJS Auth MCP URL validation", () => {
  it("accepts public HTTPS URLs", () => {
    expect(safeUrl("https://auth.example.com/callback")?.hostname).toBe("auth.example.com");
  });

  it("rejects non-HTTPS schemes and credential-bearing URLs", () => {
    expect(safeUrl("http://auth.example.com")).toBeNull();
    expect(safeUrl("https://user:pass@example.com")).toBeNull();
  });

  it("rejects localhost, private IPv4 and link-local IPv4", () => {
    for (const url of [
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.2",
      "https://172.16.0.1",
      "https://192.168.1.2",
      "https://169.254.169.254",
      "https://100.64.0.1",
    ]) expect(safeUrl(url), url).toBeNull();
  });

  it("rejects loopback, unique-local and link-local IPv6", () => {
    for (const url of ["https://[::1]", "https://[fc00::1]", "https://[fe80::1]"]) {
      expect(safeUrl(url), url).toBeNull();
    }
  });

  it("validates callback URL format without exposing query secrets", () => {
    expect(isValidCallbackUrl("https://app.example.com/oauth/callback")).toBe(true);
    expect(isValidCallbackUrl("javascript:alert(1)")).toBe(false);
    expect(sanitizeUrl("https://app.example.com/callback?code=secret#token")).toBe("https://app.example.com/callback");
  });
});
