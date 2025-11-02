import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import crypto from 'node:crypto';
import {
  KickAuthClient,
  KickApiClient,
  KickApiError,
  createAuthorizationUrl,
  createPkcePair,
} from 'kapi-kit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  clientId: process.env.KICK_CLIENT_ID ?? 'YOUR_CLIENT_ID',
  clientSecret: process.env.KICK_CLIENT_SECRET ?? 'YOUR_CLIENT_SECRET',
  redirectUri: process.env.KICK_REDIRECT_URI ?? 'http://localhost:3000/oauth/callback',
  scopes: (process.env.KICK_SCOPES ?? 'chat:write').split(/\s+/).filter(Boolean),
  tokenStore: process.env.KICK_TOKEN_STORE ?? path.join(__dirname, 'rotation-tokens.json'),
  refreshGraceSeconds: Number(process.env.KICK_REFRESH_GRACE ?? 60),
};

if (!config.clientId || !config.clientSecret || config.clientId.startsWith('YOUR_')) {
  throw new Error('Set KICK_CLIENT_ID and KICK_CLIENT_SECRET before running this example.');
}

const authClient = new KickAuthClient({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

let tokens = null;

async function loadTokens() {
  try {
    const raw = await fs.readFile(config.tokenStore, 'utf8');
    tokens = JSON.parse(raw);
    console.log('Loaded tokens from disk.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to load tokens:', error);
    }
  }
}

async function saveTokens(payload) {
  tokens = payload;
  await fs.writeFile(config.tokenStore, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('Persisted tokens to', config.tokenStore);
}

function tokensAvailable() {
  return tokens && tokens.access_token && tokens.refresh_token;
}

async function interactiveAuthorization() {
  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();
  const url = createAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    state,
    codeChallenge: challenge,
  });

  console.log('\nNo tokens found. Complete the OAuth flow:');
  console.log(`  1. Open: ${url}`);
  console.log('  2. Authorize the app.');
  console.log('  3. Paste the ?code= value here.');

  process.stdout.write('\nAuthorization code: ');
  const code = await readLine();

  console.log('Exchanging authorization code for tokens...');
  const response = await authClient.exchangeCodeForToken({
    code,
    redirectUri: config.redirectUri,
    codeVerifier: verifier,
  });

  if (!response.access_token || !response.refresh_token) {
    throw new Error('Token exchange failed to return both access_token and refresh_token.');
  }

  await saveTokens({ ...response, obtained_at: new Date().toISOString() });
}

async function readLine() {
  return new Promise((resolve) => {
    const chunks = [];
    function onData(chunk) {
      const str = chunk.toString();
      if (str.includes('\n')) {
        process.stdin.off('data', onData);
        chunks.push(str.replace(/\r?\n/, ''));
        resolve(chunks.join(''));
      } else {
        chunks.push(str);
      }
    }
    process.stdin.on('data', onData);
  });
}

async function refreshLoop() {
  while (true) {
    try {
      await refreshTokens();
      await runSampleAction();
      const waitMs = Math.max((tokens.expires_in - config.refreshGraceSeconds) * 1000, 30_000);
      console.log(`Waiting ${(waitMs / 1000 / 60).toFixed(2)} minutes before next refresh.`);
      await sleep(waitMs);
    } catch (error) {
      console.error('Refresh loop failed:', error);
      await sleep(30_000);
    }
  }
}

async function refreshTokens() {
  console.log('Refreshing tokens...');
  const response = await authClient.refreshAccessToken({ refreshToken: tokens.refresh_token });
  if (!response.access_token) {
    throw new Error('refreshAccessToken did not return access_token.');
  }

  const updated = {
    access_token: response.access_token,
    refresh_token: response.refresh_token ?? tokens.refresh_token,
    expires_in: response.expires_in ?? tokens.expires_in,
    scope: response.scope ?? tokens.scope,
    obtained_at: new Date().toISOString(),
  };

  await saveTokens(updated);
}

async function runSampleAction() {
  try {
    const client = new KickApiClient({ accessToken: tokens.access_token });
    const channels = await client.getChannels({});
    console.log('Sample action succeeded. Channel data:', channels[0]?.slug ?? channels[0] ?? 'N/A');
  } catch (error) {
    if (error instanceof KickApiError) {
      console.error('Kick rejected the sample action:', error.status, error.body);
    } else {
      console.error('Sample action failed:', error);
    }
  }
}

async function main() {
  await loadTokens();
  if (!tokensAvailable()) {
    await interactiveAuthorization();
  }
  await refreshLoop();
}

main().catch((error) => {
  console.error('Fatal error in token rotation example:', error);
  process.exit(1);
});
