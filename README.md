# kapi-kit &middot; Kick Public API toolkit for Node.js 22&nbsp;🚀

[![npm version](https://img.shields.io/npm/v/kapi-kit.svg?label=npm)](https://www.npmjs.com/package/kapi-kit)
[![node](https://img.shields.io/badge/node-%E2%89%A5%2022.0-6cc24a)](#requirements)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![coverage](https://img.shields.io/badge/endpoints-100%25-brightgreen.svg)](docs/coverage.md)

`kapi-kit` is a batteries-included SDK for the [Kick Public API](https://github.com/KickEngineering/KickDevDocs). It is designed for modern Node.js runtimes (22+) and ships with everything you need to build bots, dashboards, or broadcaster tooling:

- 🔐 **OAuth 2.1 helpers** with PKCE utilities, refresh rotation, and token revocation
- 💬 **Chat client** ready for bot *and* broadcaster messages, including replies
- 📺 **Livestream, channel, moderation, kicks, and users** endpoints behind a unified client
- 🪝 **Webhook receivers** complete with signature verification and shared-secret support
- 🧪 **Drop-in examples** for every endpoint, from quick scripts to production-ready bots
- 🧰 **Multi-tenant bot framework** so multiple streamers can adopt your bot with a single deployment

> **Status** – The codebase mirrors Kick’s public documentation as of 2025-10-27. Keep an eye on the [Kick Engineering announcements](https://github.com/KickEngineering/KickDevDocs) for new endpoints; extending `kapi-kit` is intentionally straightforward.

---

## Table of contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Authentication flows](#authentication-flows)
5. [API tour](#api-tour)
6. [Example gallery](#example-gallery)
7. [Multi-stream bot architecture](#multi-stream-bot-architecture)
8. [Endpoint coverage](#endpoint-coverage)
9. [Roadmap](#roadmap)
10. [Contributing](#contributing)
11. [License](#license)

---

## Requirements

- **Node.js 22.0.0 or newer** (built-in `fetch` is used throughout)
- **npm** or any compatible package manager
- A registered [Kick developer application](https://kick.com/apps) with the scopes you plan to use

Check your environment quickly:

```bash
npm run lint
```

The command verifies Node.js version and `fetch` availability.

---

## Installation

```bash
npm install kapi-kit
```

or with pnpm:

```bash
pnpm add kapi-kit
```

`kapi-kit` ships as native ESM – just use standard `import` syntax.

---

## Quick start

```js
import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({
  accessToken: process.env.KICK_ACCESS_TOKEN, // must include chat:write to send messages
});

await client.sendChatMessage({
  type: 'bot',
  content: 'Hello Kick! 👋',
});
```

> Need scopes? Head to **Kick Dev Portal → Your App → Scopes** and grant `chat:write`.

---

## Authentication flows

| Scenario | Helper | Notes |
| --- | --- | --- |
| App-to-app calls (Client Credentials) | `KickAuthClient#getAppAccessToken` | Use when no broadcaster auth is required. |
| Interactive login (Authorization Code + PKCE) | `createPkcePair`, `createAuthorizationUrl`, `KickAuthClient#exchangeCodeForToken` | Guides end-users through the consent screen. |
| Refreshing access tokens | `KickAuthClient#refreshAccessToken` | Returns a *new* access and refresh token. Persist it! |
| Revoking tokens | `KickAuthClient#revokeToken` | Works with either access or refresh tokens. |
| Token introspection | `KickApiClient#introspectToken` | Confirms validity, scope, and expiry. |

🚦 **First time implementing OAuth?** Run `node examples/token-rotation.js`. It walks through the PKCE flow, stores the refresh token, and keeps rotating it so it never expires.

---

## API tour

`kapi-kit` exposes a single high-level client plus targeted helpers:

```js
import {
  KickApiClient,
  KickChatClient,
  KickAuthClient,
  createAuthorizationUrl,
  createPkcePair,
  KickApiError,
} from 'kapi-kit';
```

| Area | Methods | Example |
| --- | --- | --- |
| **Chat** | `client.sendChatMessage`, `chat.sendMessage` | `examples/chat-send.js` |
| **Channels** | `client.getChannels`, `client.updateChannelMetadata` | `examples/channels-get.js`, `examples/channels-update.js` |
| **Livestreams** | `client.getLivestreams`, `client.getLivestreamStats` | `examples/livestreams-list.js` |
| **Events** | `client.list/create/deleteEventSubscriptions` | `examples/events.js` |
| **Moderation** | `client.banUser`, `client.unbanUser` | `examples/moderation.js` |
| **Kicks** | `client.getKicksLeaderboard` | `examples/kicks-leaderboard.js` |
| **Users** | `client.getUsers` | `examples/users.js` |
| **Public key** | `client.getPublicKey` | `examples/public-key.js` |

Every method accepts an optional `AbortSignal` and raises a `KickApiError` with `status`, `statusText`, `body`, and `requestId` fields on failure.

---

## Example gallery

| Script | What it teaches | Typical use case |
| --- | --- | --- |
| `chat-send.js` | Send bot/broadcaster messages, replies, emotes | Simple bot posting updates |
| `token-rotation.js` | Persistent refresh rotation + sample call | Long-running services |
| `full-bot.js` | Single-channel bot with webhooks, `!ping`, `!title`, keep-alives | Bots for a single broadcaster |
| `multi-stream-bot.js` | Multi-tenant bot with onboarding endpoint & webhook verification | SaaS bot adopted by many streamers |
| `events.js` | Subscribe/unsubscribe/list webhook events | Dashboards & analytics |
| `oauth-*` scripts | Client credentials, PKCE, refresh, revoke | Bootstrapping authentication flows |

All scripts can be launched directly:

```bash
node examples/full-bot.js
```

Each script documents the environment variables it reads—search for `process.env` inside the file for a cheat-sheet.

---

## Multi-stream bot architecture

`examples/multi-stream-bot.js` contains everything you need to run a “click to add bot” experience:

1. **User clicks “Add Bot”** on your website → Kick redirects back with `code` + `code_verifier`.
2. Your frontend POSTs `{ code, code_verifier }` (and the optional `redirect_uri`) to `POST /kick/streamers/add`, sending `Kick-App-Secret` in the header.
3. The server exchanges the code for tokens, stores the refresh token in `multi-streamers.json`, subscribes to `chat.message.sent`, and schedules token refreshes + keep-alive messages for that broadcaster.
4. Kick delivers chat events to `POST /kick/webhook`. The bot validates the signature *and* shared secret, then responds to commands:
   - `!ping` → `!pong`
   - `!title The New Title` updates the stream title
   - Keep-alive messages post every 5 minutes as both bot and broadcaster.

Token refreshes are automatically persisted. If a broadcaster revokes access, refresh attempts will start failing—handle that by removing them from the store or prompting them to re-authorize.

---

## Endpoint coverage

See [docs/coverage.md](docs/coverage.md) for the full matrix mapping each Kick endpoint to SDK methods and runnable examples. It mirrors the official [Kick Dev Docs](https://github.com/KickEngineering/KickDevDocs).

---

## Roadmap

- [ ] Streaming consumer for real-time chat without webhooks
- [ ] Lightweight HTTP client plug-in (Axios/undici swap)
- [ ] TypeScript type declarations (today we rely on JSDoc)
- [ ] Optional Redis-backed token stores for multi-stream bots

Got ideas or find a gap in Kick’s evolving API? Open an issue or PR—feedback is welcome!

---

## Contributing

1. Fork the repository.
2. Install dependencies and run the lint check:
   ```bash
   npm install
   npm run lint
   ```
3. Add tests or examples if your change affects behaviour.
4. Open a pull request against `main` describing the change and relevant Kick docs.

---

## License

MIT © [Wydoyolo](https://github.com/Wydoyolo)

Kick API documentation is owned by Kick. See the official docs for the latest platform terms.
