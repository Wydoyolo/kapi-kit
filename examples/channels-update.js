import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

await client.updateChannelMetadata({
  streamTitle: 'A better title for my stream',
  categoryId: 123, // Replace with a category id from /categories.
  customTags: ['speedrun', 'giveaway'],
});

console.log('Channel metadata update accepted.');
