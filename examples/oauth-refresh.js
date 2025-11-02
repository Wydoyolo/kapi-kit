import { KickAuthClient } from 'kapi-kit';

const auth = new KickAuthClient({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
});

const refreshed = await auth.refreshAccessToken({
  refreshToken: 'YOUR_REFRESH_TOKEN',
});

console.log('Refreshed tokens:', refreshed);
