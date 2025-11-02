import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const livestreams = await client.getLivestreams({
  categoryId: 123, // Optional category filter.
  language: 'en',
  limit: 5,
  sort: 'viewer_count',
});

console.log('Livestreams:', livestreams);
