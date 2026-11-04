# OCodeJS Auth & Integration MCP

A local stdio MCP server for inspecting authentication configuration and checking configured OCodeJS service links. It never returns secret values and does not perform sign-in on behalf of users.

## Start

```bash
npm install
npm run mcp:auth
```

## MCP tools

- `auth_configuration_status` — reports presence of Firebase client/admin, GitHub OAuth, and Google OAuth configuration. It does not expose values or claim provider-console enablement.
- `project_integration_links` — lists configured app, docs, API, MCP, and GitHub URLs.
- `verify_project_links` — checks configured public HTTPS service URLs. Local/private targets are blocked and redirects are revalidated.

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

## Verification boundaries

- Reports configuration presence only; never returns secret values.
- Firebase web config is read from the existing public client config. Admin credentials remain server-side.
- URL checks are limited to configured environment URLs, HTTPS only, and public destinations. Redirects are revalidated.
- OAuth callback URLs are checked for presence only; no OAuth flow is triggered.
- Provider enablement and callback registration must still be verified in Firebase, GitHub, and Google consoles.
