import { KickAuthClient, createPkcePair, createAuthorizationUrl } from 'kapi-kit';

const clientId = 'YOUR_CLIENT_ID';
const redirectUri = 'https://your-app.example.com/callback';
const scopes = ['chat:write', 'user:read'];

const { verifier, challenge } = createPkcePair();
const state = 'your-random-state';

const authorizationUrl = createAuthorizationUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  codeChallenge: challenge,
});

console.log('Open this URL in a browser to authorize:', authorizationUrl);
console.log('Store the following values for the token exchange step:');
console.log('PKCE verifier:', verifier);
console.log('state:', state);

const auth = new KickAuthClient({
  clientId,
  clientSecret: 'OPTIONAL_CLIENT_SECRET_FOR_CONFIDENTIAL_APPS',
});

// Exchange the authorization code after the user approves the app.
const tokens = await auth.exchangeCodeForToken({
  code: 'CODE_FROM_REDIRECT',
  redirectUri,
  codeVerifier: verifier,
});

console.log('Authorization code token response:', tokens);
