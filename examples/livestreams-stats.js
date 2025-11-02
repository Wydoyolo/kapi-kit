import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const stats = await client.getLivestreamStats();
console.log('Livestream stats:', stats);
