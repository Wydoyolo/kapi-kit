import crypto from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { KickApiError, parseKickResponse } from './errors.js';

export const DEFAULT_OAUTH_BASE_URL = 'https://id.kick.com';
const DEFAULT_SCOPE = 'chat:write';

/**
 * Generates a random PKCE verifier string.
 * @param {number} [length]
 * @returns {string}
 */
function generatePkceVerifier(length = 64) {
  const bytes = crypto.randomBytes(length);
  return base64UrlEncode(bytes);
}

/**
 * Returns a SHA256 based PKCE challenge for the provided verifier.
 * @param {string} verifier
 * @returns {string}
 */
function generatePkceChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Encode a buffer to a URL safe base64 string (RFC 7636).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create an authorization URL that can be used to start the user consent flow.
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.redirectUri
 * @param {string[]} options.scopes
 * @param {string} options.state
 * @param {string} options.codeChallenge
 * @param {string} [options.baseUrl]
 */
export function createAuthorizationUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  codeChallenge,
  baseUrl = DEFAULT_OAUTH_BASE_URL,
}) {
  if (!clientId) throw new Error('clientId is required to create authorization URL');
  if (!redirectUri) throw new Error('redirectUri is required to create authorization URL');
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('At least one scope is required to create authorization URL');
  }
  if (!state) throw new Error('state is required to create authorization URL');
  if (!codeChallenge) throw new Error('codeChallenge is required to create authorization URL');

  const url = new URL('/oauth/authorize', baseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

/**
 * Generate a PKCE verifier and challenge pair.
 * @returns {{ verifier: string, challenge: string }}
 */
export function createPkcePair() {
  const verifier = generatePkceVerifier();
  const challenge = generatePkceChallenge(verifier);
  return { verifier, challenge };
}

/**
 * Client that encapsulates OAuth flows for Kick apps.
 */
export class KickAuthClient {
  /**
   * @param {object} options
   * @param {string} options.clientId
   * @param {string} [options.clientSecret]
   * @param {string} [options.baseUrl]
   * @param {(input: RequestInfo, init?: RequestInit) => Promise<Response>} [options.fetchImpl]
   */
  constructor({
    clientId,
    clientSecret,
    baseUrl = DEFAULT_OAUTH_BASE_URL,
    fetchImpl = globalThis.fetch,
  }) {
    if (!clientId) throw new Error('clientId is required for KickAuthClient');
    if (typeof fetchImpl !== 'function') {
      throw new Error('The provided fetch implementation must be a function');
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  /**
   * Request an app access token via the OAuth client credentials flow.
   * @param {object} [options]
   * @param {string[]} [options.scopes]
   * @returns {Promise<object>}
   */
  async getAppAccessToken({ scopes = [DEFAULT_SCOPE] } = {}) {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
    });

    if (this.clientSecret) {
      params.set('client_secret', this.clientSecret);
    }

    if (scopes && scopes.length > 0) {
      params.set('scope', scopes.join(' '));
    }

    return this.#postForm('/oauth/token', params);
  }

  /**
   * Exchange an authorization code for an access token using the authorization code flow.
   * @param {object} options
   * @param {string} options.code
   * @param {string} options.redirectUri
   * @param {string} options.codeVerifier
   * @returns {Promise<object>}
   */
  async exchangeCodeForToken({ code, redirectUri, codeVerifier }) {
    if (!code) throw new Error('code is required to exchange for token');
    if (!redirectUri) throw new Error('redirectUri is required to exchange for token');
    if (!codeVerifier) throw new Error('codeVerifier is required to exchange for token');

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });

    if (this.clientSecret) {
      params.set('client_secret', this.clientSecret);
    }

    return this.#postForm('/oauth/token', params);
  }

  /**
   * Refresh an access token using its refresh token.
   * @param {object} options
   * @param {string} options.refreshToken
   * @returns {Promise<object>}
   */
  async refreshAccessToken({ refreshToken }) {
    if (!refreshToken) throw new Error('refreshToken is required to refresh access token');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });

    if (this.clientSecret) {
      params.set('client_secret', this.clientSecret);
    }

    return this.#postForm('/oauth/token', params);
  }

  /**
   * Revoke an access or refresh token.
   * @param {object} options
   * @param {string} options.token
   * @param {'access_token' | 'refresh_token'} [options.tokenTypeHint]
   * @returns {Promise<void>}
   */
  async revokeToken({ token, tokenTypeHint }) {
    if (!token) throw new Error('token is required to revoke');

    const params = new URLSearchParams({
      token,
    });

    if (tokenTypeHint) {
      params.set('token_hint_type', tokenTypeHint);
    }

    const response = await this.fetchImpl(`${this.baseUrl}/oauth/revoke?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      const body = await parseKickResponse(response);
      throw new KickApiError('Failed to revoke token', {
        status: response.status,
        statusText: response.statusText,
        body,
        requestId: response.headers.get('kick-request-id') ?? response.headers.get('x-request-id'),
      });
    }
  }

  async #postForm(path, params) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const body = await parseKickResponse(response);

    if (!response.ok) {
      throw new KickApiError('Kick OAuth request failed', {
        status: response.status,
        statusText: response.statusText,
        body,
        requestId: response.headers.get('kick-request-id') ?? response.headers.get('x-request-id'),
      });
    }

    return body;
  }
}
