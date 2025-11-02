import { KickAuthClient } from 'kapi-kit';

const auth = new KickAuthClient({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
});

const token = await auth.getAppAccessToken({ scopes: ['chat:write'] });
console.log('App access token response:', token);
