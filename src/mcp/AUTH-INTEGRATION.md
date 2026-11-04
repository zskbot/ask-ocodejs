# OCodeJS Auth & Integration MCP

Local stdio MCP server for inspecting authentication configuration and checking configured OCodeJS service links. It never returns secret values and does not sign users in.

## Start

```bash
npm install
npm run mcp:auth
```

The server loads local `.env` values through dotenv. Hosted MCP clients should use their secret manager.

## Tools

- `auth_configuration_status`: reports Firebase client/admin configuration presence, GitHub and Google OAuth variable presence, and callback URL HTTPS format. It does not expose secret values or claim provider-console enablement.
- `verify_provider_token`: verifies a Firebase ID token, GitHub access token, or Google access/ID token directly with the provider. It returns minimal identity metadata and never returns the supplied token.\n- `project_integration_links`: lists configured app, docs, API, MCP, and GitHub URLs. URL credentials, query strings, and fragments are stripped from displayed links.
- `verify_project_links`: checks configured public HTTPS service URLs. Local/private IP literals are blocked, redirects are revalidated, and requests time out after seven seconds.

The existing `npm run mcp` Git MCP remains unchanged.

## Environment

Set values in the MCP host secret manager, not in source control: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `OCODEJS_APP_URL`, `OCODEJS_DOCS_URL`, `OCODEJS_API_URL`, `OCODEJS_MCP_URL`, and `OCODEJS_GITHUB_URL`.

Firebase ID-token verification uses the public web API key in `firebase-applet-config.json`; it does not require a service-account key. GitHub and Google token checks call the respective provider verification endpoints. Never pass another user’s token or tokens from untrusted callers.\n\n## Security and verification boundaries

- Reports configuration presence and URL syntax only; never returns secret values.
- Firebase web config is read from the existing public client config. Admin credentials remain server-side.
- URL checks only inspect operator-configured environment URLs. Do not expose this tool to untrusted callers without caller authentication, rate limiting, DNS/IP pinning, and an explicit host allowlist.
- URL validation rejects non-HTTPS schemes, URL credentials, local hostnames, and non-public IP literals. Redirect targets are revalidated.
- Callback URL presence/format does not prove provider registration or successful sign-in. Provider enablement must still be checked in Firebase, GitHub, and Google consoles.
- This is a local STDIO MCP server, not a remotely hosted HTTPS MCP endpoint.
