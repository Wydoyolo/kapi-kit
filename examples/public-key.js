import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient();

const publicKey = await client.getPublicKey();
console.log('Kick webhook public key:', publicKey);
