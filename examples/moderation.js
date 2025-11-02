import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

await client.banUser({
  broadcasterUserId: 123456,
  userId: 333,
  duration: 10, // Minutes; omit to apply a permanent ban.
  reason: 'Please follow the rules.',
});

console.log('Ban or timeout applied.');

await client.unbanUser({
  broadcasterUserId: 123456,
  userId: 333,
});

console.log('User unbanned.');
