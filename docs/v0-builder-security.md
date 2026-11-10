# v0 Builder: authentication and access controls

The v0 integration is disabled until the server has all required settings. The browser never receives `V0_API_KEY`.

## Required server environment variables

Configure these in the Ask OCode.js Vercel project under **Settings → Environment Variables**. Use Preview first; do not add the key to a `VITE_*` or `NEXT_PUBLIC_*` variable.

| Variable | Purpose |
| --- | --- |
| `V0_API_KEY` | Server-only v0 Platform API key from https://v0.app/settings |
| `V0_ALLOWED_EMAILS` | Comma-separated allow-list of Firebase-authenticated email addresses |
| `FIREBASE_PROJECT_ID` | Firebase project ID; defaults to the project's checked-in public client config |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL for the shared Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

You may use `V0_ALLOWED_UIDS` instead of, or in addition to, `V0_ALLOWED_EMAILS`. Do not leave both allow-lists empty: the API deliberately returns 503 until an explicit allow-list is configured.

Production and Preview environments fail closed if Upstash Redis is not configured or unavailable. Local tests/development can use a process-local limiter; it is not a production substitute.

## Firebase Authentication setup

In Firebase Console → Authentication → Sign-in method, enable only the providers you intend to support:

- Google
- GitHub (configure the GitHub OAuth app credentials in Firebase)
- Email/Password

Add the Ask OCode.js Preview and production domains to Firebase Authentication → Settings → Authorized domains. The app uses Firebase popup authentication and email/password authentication. The backend verifies Firebase ID token signatures and the expected project issuer/audience against Google's published secure-token keys.

## Access policy

- Every v0 request must carry a valid Firebase ID token.
- The Firebase UID or verified email must match the explicit v0 allow-list. Email/password accounts must verify their email first; use the UID allow-list for provider accounts that do not expose a verified email.
- Every created v0 chat is private.
- A signed, expiring chat capability binds a chat ID to the Firebase UID that created it. Follow-up messages must present both the Firebase token and this capability.
- The v0 API key remains in server environment variables and is used only by the server SDK.
- Prompt size is capped at 12,000 characters.
- Shared Upstash fixed-window limits are 5 new chats/minute/user, 20 follow-up messages/minute/user, and separate per-IP limits.
- Redis errors fail closed. Provider errors are logged without returning secrets or raw upstream error details.
- v0 image generation, arbitrary MCP server selection, Vercel credential delegation, and GitHub credential delegation are not enabled by this integration.

## Preview-first rollout

1. Add the required variables to the Vercel **Preview** environment only.
2. Configure Firebase providers and authorized domains for the Preview hostname.
3. Sign in with an account present in `V0_ALLOWED_EMAILS`.
4. Test chat creation, follow-up ownership checks, 401/403 denials, and 429 rate limits.
5. Inspect Vercel Function logs for sanitized errors.
6. Only after explicit approval, copy the required variables to Production and deploy Production.

Do not commit real API keys, Redis tokens, Firebase service-account JSON, or user ID tokens.
