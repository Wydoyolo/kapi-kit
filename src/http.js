import { KickApiError, parseKickResponse } from './errors.js';

const SDK_VERSION = '0.1.0';
export const DEFAULT_API_BASE_URL = 'https://api.kick.com/public/v1';

/**
 * Minimal HTTP client used by the higher level API wrappers.
 */
export class KickHttpClient {
  /**
   * @param {object} [options]
   * @param {string} [options.accessToken] - OAuth token used for Authorization header.
   * @param {string} [options.baseUrl] - Override the API base URL (defaults to Kick Public API).
   * @param {(input: RequestInfo, init?: RequestInit) => Promise<Response>} [options.fetchImpl] - Custom fetch implementation.
   * @param {string} [options.userAgent] - Custom User-Agent header value.
   */
  constructor({
    accessToken,
    baseUrl = DEFAULT_API_BASE_URL,
    fetchImpl = globalThis.fetch,
    userAgent = `kapi-kit-sdk/${SDK_VERSION} (+https://docs.kick.com/)`,
  } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('The provided fetch implementation must be a function');
    }

    this.accessToken = accessToken ?? null;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
    this.userAgent = userAgent;
  }

  /**
   * Update the bearer token used for API requests.
   * @param {string | null | undefined} token
   */
  setAccessToken(token) {
    this.accessToken = token ?? null;
  }

  /**
   * Execute an API request with automatic JSON parsing and error handling.
   * @param {object} options
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} options.method
   * @param {string} options.path
   * @param {Record<string, unknown> | undefined} [options.query]
   * @param {any} [options.body]
   * @param {AbortSignal} [options.signal]
   * @param {Record<string, string>} [options.headers]
   * @returns {Promise<any>}
   */
  async request({
    method,
    path,
    query,
    body,
    signal,
    headers = {},
  }) {
    if (!method) {
      throw new Error('HTTP method is required');
    }

    const targetPath = path.startsWith('/') ? path : `/${path}`;
    const queryString = this.#buildQueryString(query);
    const url = `${this.baseUrl}${targetPath}${queryString ? `?${queryString}` : ''}`;

    const requestHeaders = {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
      ...headers,
    };

    const init = { method, headers: requestHeaders, signal };

    if (body !== undefined && body !== null) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    if (this.accessToken) {
      requestHeaders.Authorization = requestHeaders.Authorization ?? `Bearer ${this.accessToken}`;
    }

    const response = await this.fetchImpl(url, init);

    if (response.status === 204) {
      return null;
    }

    const parsed = await parseKickResponse(response);

    if (!response.ok) {
      throw new KickApiError('Kick API request failed', {
        status: response.status,
        statusText: response.statusText,
        body: parsed,
        requestId: response.headers.get('kick-request-id') ?? response.headers.get('x-request-id'),
      });
    }

    return parsed;
  }

  #buildQueryString(query) {
    if (!query) return '';

    const params = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined || item === null) continue;
          params.push([key, String(item)]);
        }
        continue;
      }

      params.push([key, String(value)]);
    }

    return new URLSearchParams(params).toString();
  }
}
