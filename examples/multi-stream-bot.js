import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  KickApiClient,
  KickAuthClient,
  KickApiError,
} from 'kapi-kit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  clientId: process.env.KICK_CLIENT_ID ?? 'YOUR_CLIENT_ID',
  clientSecret: process.env.KICK_CLIENT_SECRET ?? 'YOUR_CLIENT_SECRET',
  redirectUri: process.env.KICK_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback',
  scopes: (process.env.KICK_SCOPES ?? 'chat:write channel:write events:subscribe')
    .split(/\s+/)
    .filter(Boolean),
  webhookPath: process.env.KICK_WEBHOOK_PATH ?? '/kick/webhook',
  listenPort: Number(process.env.KICK_PORT ?? 3000),
  storePath: process.env.KICK_STORE_PATH ?? path.join(__dirname, 'multi-streamers.json'),
  eventSecret: process.env.KICK_APP_SECRET ?? 'set-a-secret-to-secure-event-intake',
  addStreamerEndpoint: process.env.KICK_ADD_ENDPOINT ?? '/kick/streamers/add',
  keepAliveIntervalMs: Number(process.env.KICK_KEEPALIVE_MS ?? 5 * 60 * 1000),
  keepAliveUserMessage:
    process.env.KICK_KEEPALIVE_USER ?? 'Remember to stretch and grab some water! 💧',
  keepAliveBotMessage:
    process.env.KICK_KEEPALIVE_BOT ?? 'Your friendly bot is online across all channels 🤖',
};

if (!config.clientId || !config.clientSecret || config.clientId.startsWith('YOUR_')) {
  throw new Error('Set KICK_CLIENT_ID and KICK_CLIENT_SECRET before running this example.');
}

const authClient = new KickAuthClient({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

let kickPublicKeyPem = null;

const state = {
  streamers: new Map(), // broadcasterUserId -> streamer object
  subscriptions: new Map(), // subscriptionId -> streamer object
};

async function loadStore() {
  try {
    const raw = await fs.readFile(config.storePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.streamers)) {
      return { streamers: [] };
    }
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to read store file:', error);
    }
    return { streamers: [] };
  }
}

async function saveStore(store) {
  await fs.mkdir(path.dirname(config.storePath), { recursive: true });
  await fs.writeFile(config.storePath, JSON.stringify(store, null, 2), 'utf8');
  console.log(`Updated streamer store at ${config.storePath}`);
}

async function persistState() {
  const payload = {
    streamers: Array.from(state.streamers.values()).map((streamer) => ({
      broadcasterUserId: streamer.broadcasterUserId,
      slug: streamer.slug,
      refreshToken: streamer.refreshToken,
      subscriptionId: streamer.subscriptionId,
    })),
  };
  await saveStore(payload);
}

async function upsertStreamer(streamer) {
  state.streamers.set(streamer.broadcasterUserId, streamer);
  await persistState();
}

async function refreshStreamerTokens(streamer) {
  const response = await authClient.refreshAccessToken({ refreshToken: streamer.refreshToken });
  streamer.accessToken = response.access_token;
  streamer.refreshToken = response.refresh_token ?? streamer.refreshToken;
  streamer.expiresIn = response.expires_in ?? 3600;
  streamer.updatedAt = new Date().toISOString();
}

async function ensureSubscription(streamer) {
  const client = streamer.client;
  const existing = await client.listEventSubscriptions({ broadcasterUserId: streamer.broadcasterUserId });

  const match = Array.isArray(existing)
    ? existing.find((entry) => entry?.event === 'chat.message.sent' && entry?.version === 1)
    : null;

  if (match) {
    streamer.subscriptionId = match.id;
    state.subscriptions.set(match.id, streamer);
    return;
  }

  const created = await client.createEventSubscriptions({
    method: 'webhook',
    broadcasterUserId: streamer.broadcasterUserId,
    events: [{ name: 'chat.message.sent', version: 1 }],
  });

  const subscription = Array.isArray(created) ? created[0] : null;
  if (!subscription?.subscription_id) {
    throw new Error(
      `Failed to create chat.message.sent subscription for broadcaster ${streamer.broadcasterUserId}.`,
    );
  }

  streamer.subscriptionId = subscription.subscription_id;
  state.subscriptions.set(streamer.subscriptionId, streamer);
}

async function loadKickPublicKey() {
  if (kickPublicKeyPem) return;
  const client = new KickApiClient();
  const response = await client.getPublicKey({});
  if (!response?.public_key) {
    throw new Error('Unable to fetch Kick public key for webhook verification.');
  }
  kickPublicKeyPem = response.public_key;
  console.log('Loaded Kick public key.');
}

function verifyWebhook(headers, rawBody) {
  if (!kickPublicKeyPem) return false;

  const messageId = headers['kick-event-message-id'];
  const timestamp = headers['kick-event-message-timestamp'];
  const signature = headers['kick-event-signature'];
  const providedSecret = headers['kick-app-secret'];

  if (!messageId || !timestamp || !signature) {
    return false;
  }

  if (typeof config.eventSecret === 'string' && config.eventSecret) {
    if (!providedSecret || providedSecret !== config.eventSecret) {
      console.warn('Webhook secret mismatch.');
      return false;
    }
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${messageId}.${timestamp}.${rawBody}`);
  verifier.end();

  try {
    return verifier.verify(kickPublicKeyPem, Buffer.from(signature, 'base64'));
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

async function initStreamers() {
  const store = await loadStore();
  if (store.streamers.length === 0) {
    console.log('No streamers registered yet. Awaiting incoming add requests at', config.addStreamerEndpoint);
    return;
  }

  for (const entry of store.streamers) {
    if (!entry.refreshToken) {
      console.warn(`Streamer ${entry.broadcasterUserId} missing refresh token. Skipping.`);
      continue;
    }

    try {
      await refreshStreamerTokens(entry);
      entry.client = new KickApiClient({ accessToken: entry.accessToken });
      entry.refreshTimer = scheduleStreamerRefresh(entry);
      await ensureSubscription(entry);
      state.streamers.set(entry.broadcasterUserId, entry);
      if (entry.subscriptionId) {
        state.subscriptions.set(entry.subscriptionId, entry);
      }

      scheduleKeepAlive(entry);
      console.log(
        `Streamer ready: ${entry.slug ?? entry.broadcasterUserId} (subscription ${entry.subscriptionId}).`,
      );
    } catch (error) {
      console.error(`Failed to initialize streamer ${entry.broadcasterUserId}:`, error);
    }
  }

  await persistState();
}

function scheduleStreamerRefresh(streamer) {
  const refreshInMs = Math.max((streamer.expiresIn - 120) * 1000, 30_000);
  return setTimeout(async () => {
    try {
      await refreshStreamerTokens(streamer);
      streamer.client = new KickApiClient({ accessToken: streamer.accessToken });
      streamer.refreshTimer = scheduleStreamerRefresh(streamer);
      await persistState();
      console.log(`Refreshed token for broadcaster ${streamer.broadcasterUserId}.`);
    } catch (error) {
      console.error('Automatic refresh failed for streamer', streamer.broadcasterUserId, error);
    }
  }, refreshInMs);
}

function scheduleKeepAlive(streamer) {
  streamer.keepAliveTimer = setInterval(async () => {
    try {
      await streamer.client.sendChatMessage({
        type: 'user',
        content: config.keepAliveUserMessage,
        broadcasterUserId: streamer.broadcasterUserId,
      });

      await streamer.client.sendChatMessage({
        type: 'bot',
        content: config.keepAliveBotMessage,
      });

      console.log(`Keep-alive messages posted for broadcaster ${streamer.broadcasterUserId}.`);
    } catch (error) {
      reportError(`keep-alive for ${streamer.broadcasterUserId}`, error);
    }
  }, config.keepAliveIntervalMs);
}

async function handleChatMessage(streamer, payload) {
  const content = payload?.content?.trim();
  if (!content) return;

  const lower = content.toLowerCase();
  const messageId = payload?.message_id;

  if (lower === '!ping') {
    await sendReply(streamer, '!pong', messageId);
    return;
  }

  if (lower.startsWith('!title ')) {
    const newTitle = content.slice('!title '.length).trim();
    if (!newTitle) return;
    try {
      await streamer.client.updateChannelMetadata({ streamTitle: newTitle });
      await sendReply(streamer, `Updated title to: ${newTitle}`, messageId);
      console.log(`Updated title for broadcaster ${streamer.broadcasterUserId}.`);
    } catch (error) {
      reportError(`updating title for ${streamer.broadcasterUserId}`, error);
      await sendReply(streamer, 'Failed to update title. Check logs.', messageId);
    }
  }
}

async function sendReply(streamer, message, replyToMessageId) {
  try {
    await streamer.client.sendChatMessage({
      type: 'bot',
      content: message,
      replyToMessageId,
    });
  } catch (error) {
    reportError(`sending reply for ${streamer.broadcasterUserId}`, error);
  }
}

function reportError(context, error) {
  if (error instanceof KickApiError) {
    console.error(`Kick API error while ${context}:`, {
      status: error.status,
      body: error.body,
      requestId: error.requestId,
    });
  } else {
    console.error(`Unexpected error while ${context}:`, error);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function startWebhookServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === config.addStreamerEndpoint) {
      await handleAddStreamer(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === config.webhookPath) {
      await handleEventWebhook(req, res);
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(config.listenPort, () => {
    console.log(`Webhook server listening on http://localhost:${config.listenPort}${config.webhookPath}`);
    console.log('Expose this endpoint via a public URL (e.g., Ngrok, Cloudflare Tunnel) and update each streamer\'s webhook URL in the Kick developer portal.');
  });
}

async function handleAddStreamer(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody.toString('utf8'));

    const secret = req.headers['kick-app-secret'];
    if (config.eventSecret && secret !== config.eventSecret) {
      res.writeHead(401).end('invalid secret');
      return;
    }

    const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = body ?? {};
    if (!code || !codeVerifier) {
      res.writeHead(400).end('code and code_verifier required');
      return;
    }

    const tokenResponse = await authClient.exchangeCodeForToken({
      code,
      redirectUri: redirectUri ?? config.redirectUri,
      codeVerifier,
    });

    const accessToken = tokenResponse.access_token;
    const refreshToken = tokenResponse.refresh_token;
    if (!accessToken || !refreshToken) {
      res.writeHead(500).end('token exchange failed');
      return;
    }

    const tempClient = new KickApiClient({ accessToken });
    const channels = await tempClient.getChannels({});
    const channel = Array.isArray(channels) && channels[0] ? channels[0] : null;
    if (!channel?.broadcaster_user_id) {
      res.writeHead(500).end('unable to determine broadcaster');
      return;
    }

    const streamer = {
      broadcasterUserId: channel.broadcaster_user_id,
      slug: channel.slug,
      refreshToken,
      subscriptionId: null,
    };

    await upsertStreamer(streamer);
    await initializeStreamer(streamer);

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ ok: true, broadcasterUserId: streamer.broadcasterUserId, slug: streamer.slug }),
    );
  } catch (error) {
    console.error('Failed to add streamer:', error);
    res.writeHead(500).end('error');
  }
}

async function handleEventWebhook(req, res) {
  try {
    const rawBody = await readBody(req);
    if (!verifyWebhook(req.headers, rawBody)) {
      res.writeHead(401).end('invalid signature');
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const eventType = req.headers['kick-event-type'];
    const subscriptionId = req.headers['kick-event-subscription-id'];

    if (eventType === 'chat.message.sent') {
      const streamer = state.subscriptions.get(subscriptionId);
      if (!streamer) {
        console.warn(`No streamer mapped for subscription ${subscriptionId}`);
      } else {
        await handleChatMessage(streamer, payload);
      }
    }

    res.writeHead(200).end('ok');
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.writeHead(500).end('error');
  }
}

async function main() {
  await loadKickPublicKey();
  await initStreamers();
  startWebhookServer();
}

main().catch((error) => {
  console.error('Fatal error in multi-stream bot example:', error);
  process.exit(1);
});
