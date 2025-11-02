import { KickAuthClient } from 'kapi-kit';

const auth = new KickAuthClient({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
});

await auth.revokeToken({
  token: 'ACCESS_OR_REFRESH_TOKEN_TO_REVOKE',
  tokenTypeHint: 'access_token',
});

console.log('Token revoked.');
