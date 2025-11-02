import { KickChatClient } from 'kapi-kit';

// Supply a chat:write token. Messages default to the authenticated channel when `type` is `bot`.
const chat = new KickChatClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const message = await chat.sendMessage({
  content: 'Hello from KickChatClient!',
  type: 'bot',
});

console.log(message);
