# Kick Public API Coverage

The SDK implements every endpoint listed in the [Kick Dev Docs](https://github.com/KickEngineering/KickDevDocs) public documentation. Use the table below to trace an endpoint in the official docs to the matching helper and runnable example in `kapi-kit`.

| Kick Endpoint | SDK Method | Notes | Example Script |
| --- | --- | --- | --- |
| `POST /oauth/token` | `KickAuthClient#getAppAccessToken`, `#exchangeCodeForToken`, `#refreshAccessToken` | Client credentials, authorization code, and refresh flows | `examples/oauth-client-credentials.js`, `examples/oauth-authorization-code.js`, `examples/oauth-refresh.js` |
| `POST /oauth/revoke` | `KickAuthClient#revokeToken` | Uses query-string token hint as documented | `examples/oauth-revoke.js` |
| `POST /oauth/authorize` | `createAuthorizationUrl`, `createPkcePair` | Helper utilities for initiating PKCE authorization flows | `examples/token-rotation.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `POST /chat` | `KickApiClient#sendChatMessage`, `KickChatClient#sendMessage` | Supports bot & user message types, optional replies | `examples/chat-send.js`, `examples/chat-client.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `GET /categories` | `KickApiClient#searchCategories` | Handles pagination (`page`) | `examples/categories.js` |
| `GET /categories/:category_id` | `KickApiClient#getCategoryById` | Returns full category payload | `examples/categories.js` |
| `GET /channels` | `KickApiClient#getChannels` | Supports filtering by broadcaster IDs or slugs (mutually exclusive) | `examples/channels-get.js` |
| `PATCH /channels` | `KickApiClient#updateChannelMetadata` | Updates category, title, and custom tags | `examples/channels-update.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `GET /events/subscriptions` | `KickApiClient#listEventSubscriptions` | Optional broadcaster filtering | `examples/events.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `POST /events/subscriptions` | `KickApiClient#createEventSubscriptions` | Accepts webhook subscriptions with event list validation | `examples/events.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `DELETE /events/subscriptions` | `KickApiClient#deleteEventSubscriptions` | Accepts multiple subscription IDs | `examples/events.js`, `examples/full-bot.js`, `examples/multi-stream-bot.js` |
| `GET /livestreams` | `KickApiClient#getLivestreams` | Supports language, category, sort, limit, broadcaster filters | `examples/livestreams-list.js` |
| `GET /livestreams/stats` | `KickApiClient#getLivestreamStats` | Returns livestream count | `examples/livestreams-stats.js` |
| `GET /kicks/leaderboard` | `KickApiClient#getKicksLeaderboard` | Optional `top` parameter | `examples/kicks-leaderboard.js` |
| `POST /moderation/bans` | `KickApiClient#banUser` | Supports optional timeout duration & reason | `examples/moderation.js` |
| `DELETE /moderation/bans` | `KickApiClient#unbanUser` | Reverses bans/timeouts | `examples/moderation.js` |
| `GET /public-key` | `KickApiClient#getPublicKey` | Exposes verification public key | `examples/public-key.js` |
| `POST /token/introspect` | `KickApiClient#introspectToken` | Mirrors RFC 7662 output | `examples/token-introspect.js` |
| `GET /users` | `KickApiClient#getUsers` | Fetches authorised user or list of IDs | `examples/users.js` |

Every example is self-contained and can be executed directly after replacing placeholder credentials.
