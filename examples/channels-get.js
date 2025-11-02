import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const byBroadcasterId = await client.getChannels({ broadcasterUserIds: [123456] });
console.log('Channels by broadcaster id:', byBroadcasterId);

const bySlug = await client.getChannels({ slugs: ['example-channel'] });
console.log('Channels by slug:', bySlug);
