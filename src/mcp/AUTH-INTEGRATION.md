# OCodeJS Auth & Integration MCP

A local stdio MCP server for inspecting authentication configuration and checking configured OCodeJS service links. It never returns secret values and does not perform sign-in on behalf of users.

## Start

```bash
npm install
npm run mcp:auth
```

The server loads local `.env` values through dotenv. In hosted MCP clients, configure variables through the host's secret manager instead.

## MCP tools

- `auth_configuration_status` — reports Firebase client/admin configuration presence, GitHub and Google OAuth variable presence, and whether callback URLs use valid public HTTPS URLs. It does not expose secret values or claim provider-console enablement.
- `project_integration_links` — lists configured app, docs, API, MCP, and GitHub URLs. Query strings and URL credentials are stripped from displayed links.
- `verify_project_links` — checks configured public HTTPS service URLs. Local/private IP literals are blocked, redirects are revalidated, and requests time out after seven seconds.

The existing `npm run mcp` Git MCP remains unchanged.

## Environment

Set values in the MCP host's secret/environment manager, not in source control:

| Variable | Purpose |
| --- | --- |
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase Admin project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Admin service-account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase Admin private key |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth credentials |
| `GITHUB_CALLBACK_URL` | GitHub OAuth callback URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL |
| `OCODEJS_APP_URL` | Application URL |
| `OCODEJS_DOCS_URL` | Documentation URL |
| `OCODEJS_API_URL` | API base URL |
| `OCODEJS_MCP_URL` | MCP endpoint URL |
| `OCODEJS_GITHUB_URL` | GitHub project URL |

## Verification boundaries and security

- Reports configuration presence and URL syntax only; never returns secret values.
- Firebase web config is read from the existing public client config. Firebase Admin credentials remain server-side.
- URL checks only inspect operator-configured environment URLs. Do not expose this tool to untrusted callers without adding caller authentication, rate limiting, DNS/IP pinning, and an explicit host allowlist.
- URL validation rejects non-HTTPS schemes, URL credentials, local hostnames, and non-public IP literals. Redirect targets are revalidated.
- OAuth callback URL presence/format does not prove provider registration or successful sign-in. Firebase, GitHub, and Google provider enablement must still be checked in their consoles.
- This package is a local STDIO MCP server, not a remotely hosted HTTPS MCP endpoint.
