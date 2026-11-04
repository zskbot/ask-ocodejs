const invalid = (provider, reason) => ({ valid: false, provider, reason });

export async function verifyProviderToken({ provider, token, tokenType, firebaseApiKey, googleClientId, fetchImpl = fetch }) {
  if (typeof token !== "string" || !token.trim()) return invalid(provider, "token_required");
  if (token.length > 16384) return invalid(provider, "token_too_large");

  if (provider === "firebase") {
    if (tokenType && tokenType !== "id_token") return invalid(provider, "firebase_requires_id_token");
    if (!firebaseApiKey) return invalid(provider, "firebase_client_config_missing");
    const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token }),
    });
    if (!response.ok) return invalid(provider, response.status === 400 ? "invalid_or_expired_token" : "verification_service_unavailable");
    const user = (await response.json()).users?.[0];
    if (!user?.localId) return invalid(provider, "invalid_or_expired_token");
    return { valid: true, provider, subject: user.localId, emailVerified: Boolean(user.emailVerified), providers: (user.providerUserInfo || []).map((item) => item.providerId).filter(Boolean) };
  }

  if (provider === "github") {
    if (tokenType && tokenType !== "access_token") return invalid(provider, "github_requires_access_token");
    const response = await fetchImpl("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "OCodeJS-Auth-Integration-MCP/1.0" },
    });
    if (!response.ok) return invalid(provider, response.status === 401 ? "invalid_or_expired_token" : "verification_service_unavailable");
    const user = await response.json();
    return { valid: true, provider, subject: String(user.id), username: user.login || null, scopes: (response.headers.get("x-oauth-scopes") || "").split(",").map((scope) => scope.trim()).filter(Boolean) };
  }

  if (provider === "google") {
    const kind = tokenType || "access_token";
    if (kind !== "access_token" && kind !== "id_token") return invalid(provider, "unsupported_google_token_type");
    const response = await fetchImpl("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ [kind]: token }),
    });
    if (!response.ok) return invalid(provider, response.status === 400 ? "invalid_or_expired_token" : "verification_service_unavailable");
    const info = await response.json();
    if (googleClientId && info.aud && info.aud !== googleClientId) return invalid(provider, "token_audience_mismatch");
    return { valid: true, provider, tokenType: kind, subject: info.sub || null, audienceMatches: !googleClientId || !info.aud || info.aud === googleClientId, emailVerified: info.email_verified === true || info.email_verified === "true", scopes: (info.scope || "").split(" ").filter(Boolean), expiresIn: Number.isFinite(Number(info.expires_in)) ? Number(info.expires_in) : null };
  }

  return invalid(provider, "unsupported_provider");
}
