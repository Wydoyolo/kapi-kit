/**
 * Represents an error response returned by the Kick API.
 */
export class KickApiError extends Error {
  /**
   * @param {string} message - Friendly error message.
   * @param {object} [options]
   * @param {number} [options.status]
   * @param {string} [options.statusText]
   * @param {any} [options.body]
   * @param {string | null} [options.requestId]
   */
  constructor(message, { status, statusText, body, requestId } = {}) {
    super(message);
    this.name = 'KickApiError';
    this.status = status ?? null;
    this.statusText = statusText ?? null;
    this.body = body;
    this.requestId = requestId ?? null;
  }
}

/**
 * Convert a Response object into either JSON or plain text.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function parseKickResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      // Failed JSON parsing should fall back to text.
    }
  }

  return response.text();
}
