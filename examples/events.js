import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const subscriptions = await client.listEventSubscriptions({ broadcasterUserId: 123456 });
console.log('Existing subscriptions:', subscriptions);

const created = await client.createEventSubscriptions({
  broadcasterUserId: 123456,
  events: [
    { name: 'chat.message.sent', version: 1 },
  ],
});
console.log('Created subscriptions:', created);

const subscriptionIds = Array.isArray(created)
  ? created.map((record) => record?.subscription_id).filter(Boolean)
  : [];

if (subscriptionIds.length > 0) {
  await client.deleteEventSubscriptions({ ids: subscriptionIds });
  console.log('Deleted subscriptions:', subscriptionIds);
}
