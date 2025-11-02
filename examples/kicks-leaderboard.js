import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const leaderboard = await client.getKicksLeaderboard({ top: 10 });
console.log('KICKs leaderboard:', leaderboard);
