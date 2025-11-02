import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import process from 'node:process';
import { stdin as input, stdout as output } from 'node:process';
import {
  KickApiClient,
  KickAuthClient,
  KickApiError,
  createAuthorizationUrl,
  createPkcePair,
} from 'kapi-kit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration (replace every placeholder before running) ---
// Generate the refresh token via the OAuth authorization code flow (see examples/oauth-authorization-code.js).
// Persist the returned refresh_token securely and supply it here or via the matching environment variable.
const config = {
  clientId: process.env.KICK_CLIENT_ID ?? 'YOUR_CLIENT_ID',
  clientSecret: process.env.KICK_CLIENT_SECRET ?? 'YOUR_CLIENT_SECRET',
  refreshToken: process.env.KICK_REFRESH_TOKEN ?? 'YOUR_REFRESH_TOKEN',
  authCode: process.env.KICK_AUTH_CODE ?? '',
  codeVerifier: process.env.KICK_CODE_VERIFIER ?? '',
  redirectUri: process.env.KICK_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback',
  tokenStorePath: process.env.KICK_TOKEN_STORE ?? path.join(__dirname, 'kick-tokens.json'),
  scopes: (process.env.KICK_SCOPES ?? 'chat:write channel:write events:subscribe')
    .split(/\s+/)
    .filter(Boolean),
  broadcasterUserId: 123456, // numeric broadcaster user id
  keepAliveMessageUser: 'Remember to hydrate and follow the channel! 💧',
  keepAliveMessageBot: 'This is your friendly bot checking in. 🤖',
  keepAliveIntervalMs: 5 * 60 * 1000, // five minutes
  webhookPath: '/kick/webhook',
  listenPort: 3000,
};

if (!config.clientId || !config.clientSecret) {
  throw new Error('Set KICK_CLIENT_ID and KICK_CLIENT_SECRET (or replace placeholders).');
}

const authClient = new KickAuthClient({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

const apiClient = new KickApiClient();

let accessToken = null;
let currentRefreshToken = null;
let refreshTimer = null;
let kickPublicKeyPem = null;

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('YOUR_');
}

async function loadTokensFromDisk() {
  try {
    const raw = await fs.readFile(config.tokenStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to read token store:', error);
    }
    return null;
  }
}

async function saveTokens(tokens) {
  try {
    await fs.writeFile(
      config.tokenStorePath,
      JSON.stringify(tokens, null, 2),
      'utf8',
    );
    console.log(`Updated token store at ${config.tokenStorePath}`);
  } catch (error) {
    console.warn('Failed to persist tokens:', error);
  }
}

async function ensureRefreshToken() {
  if (!currentRefreshToken && isConfigured(config.refreshToken)) {
    currentRefreshToken = config.refreshToken;
    console.log('Using refresh token provided via configuration.');
    return;
  }

  if (!currentRefreshToken) {
    const stored = await loadTokensFromDisk();
    if (stored?.refresh_token && isConfigured(stored.refresh_token)) {
      currentRefreshToken = stored.refresh_token;
      console.log('Loaded refresh token from disk.');
      return;
    }
  }

  if (!currentRefreshToken) {
    if (isConfigured(config.authCode) && isConfigured(config.codeVerifier)) {
      console.log('Exchanging authorization code for tokens...');
      const response = await authClient.exchangeCodeForToken({
        code: config.authCode,
        redirectUri: config.redirectUri,
        codeVerifier: config.codeVerifier,
      });
      currentRefreshToken = response.refresh_token;
      if (!currentRefreshToken) {
        throw new Error('Authorization code exchange did not return refresh_token.');
      }
      await saveTokens({
        ...response,
        obtained_at: new Date().toISOString(),
      });
      console.log('Authorization code exchange complete. PKCE verifier is now single-use.');
      return;
    }
  }

  if (!currentRefreshToken && process.stdin.isTTY) {
    await runInteractiveAuthorizationFlow();
    return;
  }

  if (!currentRefreshToken) {
    throw new Error(
      'Refresh token is missing. Provide KICK_REFRESH_TOKEN, populate kick-tokens.json, run interactively in a TTY, or supply KICK_AUTH_CODE / KICK_CODE_VERIFIER.',
    );
  }
}

async function runInteractiveAuthorizationFlow() {
  if (!process.stdin.isTTY) {
    console.error('Interactive authorization not available (stdin is not a TTY).');
    return;
  }

  const scopes = config.scopes.length ? config.scopes : ['chat:write', 'channel:write', 'events:subscribe'];
  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();
  const authorizationUrl = createAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes,
    state,
    codeChallenge: challenge,
  });

  console.log('\nNo refresh token detected. Starting interactive OAuth flow.');
  console.log('1. Open this URL in a browser and authorize the application:');
  console.log(`   ${authorizationUrl}`);
  console.log('2. After authorizing, copy the value of the ?code= parameter from the redirect URL.');
  console.log(`   (Redirect URI configured: ${config.redirectUri})`);

  const rl = readline.createInterface({ input, output });
  const codeInput = (await rl.question('\nPaste the authorization code here: ')).trim();
  rl.close();

  if (!codeInput) {
    throw new Error('No authorization code provided.');
  }

  console.log('Exchanging authorization code for tokens...');
  const response = await authClient.exchangeCodeForToken({
    code: codeInput,
    redirectUri: config.redirectUri,
    codeVerifier: verifier,
  });

  currentRefreshToken = response.refresh_token;
  accessToken = response.access_token;

  if (!currentRefreshToken || !accessToken) {
    throw new Error('Authorization code exchange did not return both access_token and refresh_token.');
  }

  apiClient.setAccessToken(accessToken);
  await saveTokens({
    ...response,
    obtained_at: new Date().toISOString(),
  });
  console.log('Tokens stored locally. For future runs, set KICK_REFRESH_TOKEN to reuse the refresh token:');
  console.log(`KICK_REFRESH_TOKEN=${currentRefreshToken}\n`);

  const expiresInSeconds = typeof response.expires_in === 'number' ? response.expires_in : 3600;
  scheduleRefresh(expiresInSeconds);
}

async function refreshTokens(reason = 'initial') {
  console.log(`Refreshing OAuth tokens (${reason})...`);
  const response = await authClient.refreshAccessToken({ refreshToken: currentRefreshToken });
  accessToken = response.access_token;
  if (!accessToken) throw new Error('Kick did not return access_token during refresh.');
  apiClient.setAccessToken(accessToken);

  if (response.refresh_token) {
    currentRefreshToken = response.refresh_token;
    console.log('Received new refresh token. Persist this value for future restarts.');
  }

  await saveTokens({
    access_token: response.access_token,
    refresh_token: currentRefreshToken,
    expires_in: response.expires_in,
    scope: response.scope,
    obtained_at: new Date().toISOString(),
  });

  const expiresInSeconds = typeof response.expires_in === 'number' ? response.expires_in : 3600;
  scheduleRefresh(expiresInSeconds);
}

function scheduleRefresh(expiresInSeconds) {
  const refreshInMs = Math.max((expiresInSeconds - 120) * 1000, 30_000);
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTokens('scheduled').catch((error) => {
      console.error('Failed to refresh token:', error);
    });
  }, refreshInMs);
  console.log(`Next token refresh scheduled in ${(refreshInMs / 1000 / 60).toFixed(2)} minutes.`);
}

async function ensureChatSubscription() {
  console.log('Ensuring chat.message.sent subscription exists...');
  const existing = await apiClient.listEventSubscriptions({ broadcasterUserId: config.broadcasterUserId });
  const alreadySubscribed = Array.isArray(existing)
    ? existing.some((sub) => sub?.event === 'chat.message.sent' && sub?.version === 1)
    : false;

  if (alreadySubscribed) {
    console.log('chat.message.sent subscription already present.');
    return;
  }

  const created = await apiClient.createEventSubscriptions({
    method: 'webhook',
    broadcasterUserId: config.broadcasterUserId,
    events: [{ name: 'chat.message.sent', version: 1 }],
  });
  console.log('Created event subscription:', created);
}

async function loadKickPublicKey() {
  if (kickPublicKeyPem) return;
  const publicKeyResponse = await apiClient.getPublicKey({});
  const publicKey = publicKeyResponse?.public_key;
  if (!publicKey) {
    throw new Error('Failed to load Kick public key for webhook verification.');
  }
  kickPublicKeyPem = publicKey;
  console.log('Loaded Kick public key for webhook verification.');
}

function startKeepAliveMessages() {
  console.log(`Scheduling keep-alive messages every ${config.keepAliveIntervalMs / 60000} minutes.`);
  setInterval(async () => {
    try {
      // Send a user-type message (requires broadcasterUserId).
      await apiClient.sendChatMessage({
        type: 'user',
        content: config.keepAliveMessageUser,
        broadcasterUserId: config.broadcasterUserId,
      });

      // Send a bot-type message (automatically routed to the authenticated channel).
      await apiClient.sendChatMessage({
        type: 'bot',
        content: config.keepAliveMessageBot,
      });

      console.log('Keep-alive messages posted (user + bot).');
    } catch (error) {
      reportError('keep-alive message failed', error);
    }
  }, config.keepAliveIntervalMs);
}

function startWebhookServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== config.webhookPath) {
      res.writeHead(404).end();
      return;
    }

    try {
      const rawBody = await readBody(req);
      if (!verifyWebhook(req.headers, rawBody)) {
        res.writeHead(401).end('invalid signature');
        return;
      }

      const payload = JSON.parse(rawBody.toString('utf8'));
      const eventType = req.headers['kick-event-type'];

      if (eventType === 'chat.message.sent') {
        await handleChatMessage(payload);
      }

      res.writeHead(200).end('ok');
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.writeHead(500).end('error');
    }
  });

  server.listen(config.listenPort, () => {
    console.log(`Webhook server listening on http://localhost:${config.listenPort}${config.webhookPath}`);
    console.log('Expose this endpoint via a public URL (e.g., Cloudflare Tunnel, Ngrok) and set it in the Kick developer portal.');
  });
}

async function handleChatMessage(payload) {
  const content = payload?.content?.trim();
  if (!content) return;

  const lower = content.toLowerCase();
  const messageId = payload?.message_id;

  if (lower === '!ping') {
    await sendReply('!pong', messageId);
    return;
  }

  if (lower.startsWith('!title ')) {
    const newTitle = content.slice('!title '.length).trim();
    if (!newTitle) return;

    try {
      await apiClient.updateChannelMetadata({ streamTitle: newTitle });
      await sendReply(`Updated title to: ${newTitle}`, messageId);
      console.log(`Stream title updated via chat command: ${newTitle}`);
    } catch (error) {
      reportError('updating stream title', error);
      await sendReply('Failed to update title. Check logs.', messageId);
    }
  }
}

async function sendReply(message, replyToMessageId) {
  try {
    await apiClient.sendChatMessage({
      type: 'bot',
      content: message,
      replyToMessageId,
    });
  } catch (error) {
    reportError('sending chat reply', error);
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

function verifyWebhook(headers, rawBody) {
  if (!kickPublicKeyPem) {
    console.warn('Kick public key not loaded; skipping verification.');
    return true;
  }

  const messageId = headers['kick-event-message-id'];
  const timestamp = headers['kick-event-message-timestamp'];
  const signature = headers['kick-event-signature'];
  if (!messageId || !timestamp || !signature) {
    console.warn('Missing webhook signature headers.');
    return false;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${messageId}.${timestamp}.${rawBody}`);
  verifier.end();

  try {
    return verifier.verify(kickPublicKeyPem, Buffer.from(signature, 'base64'));
  } catch (error) {
    console.error('Failed to verify Kick webhook signature:', error);
    return false;
  }
}

async function main() {
  await ensureRefreshToken();
  if (!accessToken) {
    await refreshTokens('initial');
  }
  await loadKickPublicKey();
  await ensureChatSubscription();
  startKeepAliveMessages();
  startWebhookServer();
}

main().catch((error) => {
  console.error('Fatal error starting bot example:', error);
  process.exit(1);
});
