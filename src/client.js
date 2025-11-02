import { KickHttpClient, DEFAULT_API_BASE_URL } from './http.js';

/**
 * High-level wrapper that exposes every endpoint in the Kick Public API.
 */
export class KickApiClient {
  /**
   * @param {object} [options]
   * @param {string} [options.accessToken]
   * @param {string} [options.baseUrl]
   * @param {(input: RequestInfo, init?: RequestInit) => Promise<Response>} [options.fetchImpl]
   * @param {string} [options.userAgent]
   */
  constructor(options = {}) {
    this.http = new KickHttpClient(options);
  }

  /**
   * Update the bearer token at runtime.
   * @param {string | null | undefined} token
   */
  setAccessToken(token) {
    this.http.setAccessToken(token);
  }

  /**
   * Base URL accessor mainly for tests or custom deployments.
   */
  get baseUrl() {
    return this.http.baseUrl ?? DEFAULT_API_BASE_URL;
  }

  // --- Chat ---
  async sendChatMessage(params) {
    const {
      content,
      type = 'bot',
      broadcasterUserId,
      replyToMessageId,
      signal,
    } = params ?? {};

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

    return this.#request('POST', '/chat', { body, signal }, { unwrapData: true });
  }

  // --- Categories ---
  async searchCategories({ query, page, signal } = {}) {
    if (typeof query !== 'string' || query.trim() === '') {
      throw new Error('query must be a non-empty string');
    }

    return this.#request(
      'GET',
      '/categories',
      { query: { q: query, page }, signal },
      { unwrapData: true },
    );
  }

  async getCategoryById(categoryId, { signal } = {}) {
    if (categoryId === undefined || categoryId === null) {
      throw new Error('categoryId is required');
    }

    return this.#request(
      'GET',
      `/categories/${categoryId}`,
      { signal },
      { unwrapData: true },
    );
  }

  // --- Channels ---
  async getChannels({ broadcasterUserIds, slugs, signal } = {}) {
    const hasBroadcasters = Array.isArray(broadcasterUserIds) && broadcasterUserIds.length > 0;
    const hasSlugs = Array.isArray(slugs) && slugs.length > 0;

    if (hasBroadcasters && hasSlugs) {
      throw new Error('broadcasterUserIds and slugs cannot be provided together');
    }

    const query = {};
    if (hasBroadcasters) {
      query.broadcaster_user_id = broadcasterUserIds;
    }
    if (hasSlugs) {
      query.slug = slugs;
    }

    return this.#request('GET', '/channels', { query, signal }, { unwrapData: true });
  }

  async updateChannelMetadata({
    categoryId,
    streamTitle,
    customTags,
    signal,
  } = {}) {
    const body = {};
    if (categoryId !== undefined) body.category_id = categoryId;
    if (streamTitle !== undefined) body.stream_title = streamTitle;
    if (Array.isArray(customTags)) body.custom_tags = customTags;

    if (Object.keys(body).length === 0) {
      throw new Error('At least one of categoryId, streamTitle, or customTags must be provided');
    }

    await this.#request('PATCH', '/channels', { body, signal }, { unwrapData: false });
  }

  // --- Events ---
  async listEventSubscriptions({ broadcasterUserId, signal } = {}) {
    const query = {};
    if (broadcasterUserId !== undefined) {
      query.broadcaster_user_id = broadcasterUserId;
    }

    return this.#request(
      'GET',
      '/events/subscriptions',
      { query, signal },
      { unwrapData: true },
    );
  }

  async createEventSubscriptions({
    broadcasterUserId,
    method = 'webhook',
    events,
    signal,
  } = {}) {
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('events must be a non-empty array');
    }

    const body = {
      method,
      events: events.map((event) => {
        if (!event || typeof event !== 'object') {
          throw new Error('Each event must be an object with name and version');
        }

        const { name, version } = event;
        if (typeof name !== 'string' || name.trim() === '') {
          throw new Error('Event name must be a non-empty string');
        }
        if (typeof version !== 'number') {
          throw new Error('Event version must be a number');
        }
        return { name, version };
      }),
    };

    if (broadcasterUserId !== undefined) {
      body.broadcaster_user_id = broadcasterUserId;
    }

    return this.#request(
      'POST',
      '/events/subscriptions',
      { body, signal },
      { unwrapData: true },
    );
  }

  async deleteEventSubscriptions({ ids, signal } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array of subscription ids');
    }

    await this.#request(
      'DELETE',
      '/events/subscriptions',
      { query: { id: ids }, signal },
      { unwrapData: false },
    );
  }

  // --- Livestreams ---
  async getLivestreams({
    broadcasterUserIds,
    categoryId,
    language,
    limit,
    sort,
    signal,
  } = {}) {
    const query = {};
    if (Array.isArray(broadcasterUserIds) && broadcasterUserIds.length > 0) {
      query.broadcaster_user_id = broadcasterUserIds;
    }
    if (categoryId !== undefined) query.category_id = categoryId;
    if (language !== undefined) query.language = language;
    if (limit !== undefined) query.limit = limit;
    if (sort !== undefined) query.sort = sort;

    return this.#request('GET', '/livestreams', { query, signal }, { unwrapData: true });
  }

  async getLivestreamStats({ signal } = {}) {
    return this.#request('GET', '/livestreams/stats', { signal }, { unwrapData: true });
  }

  // --- Moderation ---
  async banUser({
    broadcasterUserId,
    userId,
    duration,
    reason,
    signal,
  } = {}) {
    if (typeof broadcasterUserId !== 'number') {
      throw new Error('broadcasterUserId is required and must be a number');
    }
    if (typeof userId !== 'number') {
      throw new Error('userId is required and must be a number');
    }

    const body = {
      broadcaster_user_id: broadcasterUserId,
      user_id: userId,
    };

    if (duration !== undefined) body.duration = duration;
    if (reason !== undefined) body.reason = reason;

    return this.#request(
      'POST',
      '/moderation/bans',
      { body, signal },
      { unwrapData: true },
    );
  }

  async unbanUser({
    broadcasterUserId,
    userId,
    signal,
  } = {}) {
    if (typeof broadcasterUserId !== 'number') {
      throw new Error('broadcasterUserId is required and must be a number');
    }
    if (typeof userId !== 'number') {
      throw new Error('userId is required and must be a number');
    }

    const body = {
      broadcaster_user_id: broadcasterUserId,
      user_id: userId,
    };

    return this.#request(
      'DELETE',
      '/moderation/bans',
      { body, signal },
      { unwrapData: true },
    );
  }

  // --- Kicks ---
  async getKicksLeaderboard({ top, signal } = {}) {
    const query = {};
    if (top !== undefined) {
      query.top = top;
    }

    return this.#request(
      'GET',
      '/kicks/leaderboard',
      { query, signal },
      { unwrapData: true },
    );
  }

  // --- Public Key ---
  async getPublicKey({ signal } = {}) {
    return this.#request('GET', '/public-key', { signal }, { unwrapData: true });
  }

  // --- Users ---
  async getUsers({ ids, signal } = {}) {
    const query = {};
    if (Array.isArray(ids) && ids.length > 0) {
      query.id = ids;
    }

    return this.#request('GET', '/users', { query, signal }, { unwrapData: true });
  }

  async introspectToken({ signal } = {}) {
    return this.#request(
      'POST',
      '/token/introspect',
      { signal },
      { unwrapData: true },
    );
  }

  async #request(method, path, { query, body, signal } = {}, { unwrapData }) {
    const response = await this.http.request({
      method,
      path,
      query,
      body,
      signal,
    });

    if (!unwrapData) {
      return response;
    }

    if (response && typeof response === 'object' && 'data' in response) {
      return response.data;
    }

    return response ?? null;
  }
}
