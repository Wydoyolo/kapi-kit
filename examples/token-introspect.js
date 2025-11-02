import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const tokenInfo = await client.introspectToken();
console.log('Token introspection:', tokenInfo);
