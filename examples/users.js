import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const users = await client.getUsers({ ids: [123, 456] });
console.log('Users:', users);
