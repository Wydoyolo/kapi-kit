import { KickApiClient } from 'kapi-kit';

// Replace with an access token that includes the `chat:write` scope.
const client = new KickApiClient({
  accessToken: 'YOUR_ACCESS_TOKEN',
});

// Send as the authenticated bot. Kick routes bot messages to the broadcaster
// associated with the token.
const botMessage = await client.sendChatMessage({
  type: 'bot',
  content: 'Message will be sent to the authenticated channel.',
});

console.log('Bot message:', botMessage);

// Send as a broadcaster user by providing the broadcaster user id.
const userMessage = await client.sendChatMessage({
  type: 'user',
  content: 'Message will be sent to the specified broadcaster channel.',
  broadcasterUserId: 123456, // Replace with a real broadcaster user id.
});

console.log('User message:', userMessage);
