import { KickHttpClient } from './http.js';

/**
 * Focused helper around the `/chat` endpoint.
 */
export class KickChatClient {
  /**
   * @param {object} options
   * @param {string} options.accessToken
   * @param {string} [options.baseUrl]
   * @param {(input: RequestInfo, init?: RequestInit) => Promise<Response>} [options.fetchImpl]
   * @param {string} [options.userAgent]
   */
  constructor(options = {}) {
    const { accessToken } = options;
    if (!accessToken) {
      throw new Error('accessToken is required for KickChatClient');
    }

    this.http = new KickHttpClient(options);
  }

  get baseUrl() {
    return this.http.baseUrl;
  }

  /**
   * Swap the bearer token used for chat requests.
   * @param {string | null | undefined} token
   */
  setAccessToken(token) {
    this.http.setAccessToken(token);
  }

  /**
   * Sends a chat message to Kick.
   * @param {object} options
   * @param {string} options.content
   * @param {'bot' | 'user'} [options.type]
   * @param {number} [options.broadcasterUserId]
   * @param {string} [options.replyToMessageId]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<object | null>}
   */
  async sendMessage({
    content,
    type = 'bot',
    broadcasterUserId,
    replyToMessageId,
    signal,
  }) {
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('content must be a non-empty string');
    }
    if (!['bot', 'user'].includes(type)) {
      throw new Error('type must be either "bot" or "user"');
    }
    if (type === 'user' && typeof broadcasterUserId !== 'number') {
      throw new Error('broadcasterUserId is required when sending as a user');
    }

    const body = {
      content,
      type,
    };

    if (typeof broadcasterUserId === 'number') {
      body.broadcaster_user_id = broadcasterUserId;
    }

    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
    }

    const response = await this.http.request({
      method: 'POST',
      path: '/chat',
      body,
      signal,
    });

    return response?.data ?? response ?? null;
  }

  /**
   * Forwards a raw payload directly to the chat endpoint.
   * @param {object} body
   * @param {AbortSignal} [signal]
   * @returns {Promise<any>}
   */
  async sendRawMessage(body, signal) {
    if (!body || typeof body !== 'object') {
      throw new Error('body must be an object when sending a raw message');
    }

    const response = await this.http.request({
      method: 'POST',
      path: '/chat',
      body,
      signal,
    });

    return response?.data ?? response ?? null;
  }
}
