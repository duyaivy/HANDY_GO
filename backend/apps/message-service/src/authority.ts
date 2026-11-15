import {
  chatPermissions,
  validateMediaReferences,
} from '../../../libs/common/src/message-contracts/index.js';
import type {
  ChatBidAuthority,
  ChatRequestAuthority,
  VerifiedChatMedia,
  MessageSendInput,
  ChatAttachment,
} from '../../../libs/common/src/message-contracts/index.js';
import { ChatError } from './security.js';
export interface AuthorityOptions {
  secret: string;
  bidding: string;
  order: string;
  auth: string;
  media: string;
  userTrust?: string;
  catalog?: string;
}
export type MediaReceipt = VerifiedChatMedia &
  Pick<ChatAttachment, 'width' | 'height' | 'durationMs'> & {
    url: string;
    urlExpiresAt: string;
  };
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fresh = (value: unknown) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  Math.abs(Date.now() - Date.parse(value)) <= 5000;
const revision = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function assertBid(value: ChatBidAuthority) {
  if (
    ![value.bidId, value.requestId, value.workerId].every(
      (id) => typeof id === 'string' && uuid.test(id),
    ) ||
    !['active', 'withdrawn', 'expired', 'selected', 'rejected'].includes(
      value.status,
    ) ||
    !['pending', 'open', 'closed', 'no_bid', 'finalized', 'cancelled'].includes(
      value.roundStatus,
    ) ||
    typeof value.eligible !== 'boolean' ||
    !revision(value.version) ||
    !fresh(value.verifiedAt) ||
    !Number.isFinite(Date.parse(value.submittedAt)) ||
    (value.validUntil !== null &&
      !Number.isFinite(Date.parse(value.validUntil)))
  )
    throw new ChatError('ELIGIBILITY_UNAVAILABLE');
}
function assertRequest(value: ChatRequestAuthority) {
  if (
    ![value.requestId, value.customerId].every(
      (id) => typeof id === 'string' && uuid.test(id),
    ) ||
    typeof value.status !== 'string' ||
    !revision(value.version) ||
    !fresh(value.verifiedAt)
  )
    throw new ChatError('ELIGIBILITY_UNAVAILABLE');
  if (
    value.order !== null &&
    (!value.order ||
      ![value.order.orderId, value.order.workerId].every(
        (id) => typeof id === 'string' && uuid.test(id),
      ) ||
      typeof value.order.status !== 'string' ||
      !revision(value.order.version) ||
      (value.order.completedAt !== null &&
        !Number.isFinite(Date.parse(value.order.completedAt))))
  )
    throw new ChatError('ELIGIBILITY_UNAVAILABLE');
}
export interface UserDisplayProfile {
  fullName: string;
  avatarUrl: string | null;
}

export class AuthorityClient {
  private readonly profileCache = new Map<
    string,
    { profile: UserDisplayProfile; expiresAt: number }
  >();
  private readonly activeCache = new Map<
    string,
    { active: boolean; expiresAt: number }
  >();
  private readonly permissionCache = new Map<
    string,
    {
      proof: {
        permissions: ReturnType<typeof chatPermissions>;
        customerId: string;
        serviceId?: string;
        workerId: string;
        requestId: string;
        orderId: string | null;
        bid: ChatBidAuthority;
        timings?: {
          biddingAuthorizationMs: number;
          orderAuthorizationMs: number;
        };
      };
      expiresAt: number;
    }
  >();

  constructor(
    private readonly options: AuthorityOptions,
    private readonly request: typeof fetch = fetch,
  ) {}
  private async call<T>(
    base: string,
    path: string,
    body?: unknown,
    deadline = Date.now() + 2000,
  ): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    try {
      const response = await this.request(
        `${base.replace(/\/$/, '')}/api/v1${path}`,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            'x-internal-secret': this.options.secret,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(remaining),
        },
      );
      if (response.status === 404) throw new ChatError('CHAT_INELIGIBLE');
      if (!response.ok) throw new Error();
      const envelope = (await response.json()) as { data: T };
      if (!envelope.data) throw new Error();
      return envelope.data;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    }
  }
  async bid(bidId: string, deadline?: number) {
    const value = await this.call<ChatBidAuthority>(
      this.options.bidding,
      `/internal/bids/${encodeURIComponent(bidId)}/chat-eligibility`,
      undefined,
      deadline,
    );
    assertBid(value);
    if (value.bidId !== bidId) throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    return value;
  }
  async lookup(requestId: string, workerId: string, deadline?: number) {
    const value = await this.call<ChatBidAuthority>(
      this.options.bidding,
      `/internal/bids/chat-lookup?requestId=${encodeURIComponent(requestId)}&workerId=${encodeURIComponent(workerId)}`,
      undefined,
      deadline,
    );
    assertBid(value);
    return value;
  }
  clearPermissionCache(requestId?: string) {
    if (requestId) {
      for (const [k] of this.permissionCache) {
        if (k.startsWith(`${requestId}:`)) {
          this.permissionCache.delete(k);
        }
      }
    } else {
      this.permissionCache.clear();
    }
  }
  async active(accountId: string, userId: string, sid: string) {
    const startedAt = Date.now();
    const key = `${accountId}:${userId}:${sid}`;
    const cached = this.activeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.active;
    }
    try {
      const active =
        (
          await this.call<{ active: boolean }>(
            this.options.auth,
            '/internal/auth/chat-session',
            { accountId, userId, sid },
            Date.now() + 4000,
          )
        ).active === true;
      if (this.activeCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of this.activeCache) {
          if (v.expiresAt <= now) this.activeCache.delete(k);
        }
      }
      // Bound stale authorization from request start, not the end of a slow call.
      this.activeCache.set(key, { active, expiresAt: startedAt + 5_000 });
      return active;
    } catch (error) {
      this.activeCache.delete(key);
      if (error instanceof ChatError && error.code === 'CHAT_INELIGIBLE') {
        return false;
      }
      throw error;
    }
  }
  async permission(
    userId: string,
    pair: { requestId: string; workerId: string; customerId?: string },
    exists: boolean,
    bid?: ChatBidAuthority,
    deadline = Date.now() + 2000,
    generation?: number,
    useCache = true,
  ): Promise<{
    permissions: ReturnType<typeof chatPermissions>;
    customerId: string;
    serviceId?: string;
    workerId: string;
    requestId: string;
    orderId: string | null;
    bid: ChatBidAuthority;
    timings?: {
      biddingAuthorizationMs: number;
      orderAuthorizationMs: number;
    };
  }> {
    const cacheKey = `${pair.requestId}:${pair.workerId}:${pair.customerId ?? ''}:${userId}:${exists}:${generation ?? 0}`;
    if (!bid && useCache) {
      const cached = this.permissionCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.proof,
          timings: { biddingAuthorizationMs: 0, orderAuthorizationMs: 0 },
        };
      }
    }
    const tBid0 = performance.now();
    let biddingAuthorizationMs = 0;
    const bidPromise = bid
      ? Promise.resolve(bid)
      : this.lookup(pair.requestId, pair.workerId, deadline).then((res) => {
          biddingAuthorizationMs =
            Math.round((performance.now() - tBid0) * 100) / 100;
          return res;
        });

    const tOrder0 = performance.now();
    let orderAuthorizationMs = 0;
    const orderPromise = this.call<ChatRequestAuthority>(
      this.options.order,
      `/internal/service-requests/${encodeURIComponent(pair.requestId)}/chat-state`,
      undefined,
      deadline,
    ).then((res) => {
      orderAuthorizationMs =
        Math.round((performance.now() - tOrder0) * 100) / 100;
      return res;
    });

    const [b, r] = await Promise.all([bidPromise, orderPromise]);
    assertBid(b);
    assertRequest(r);
    if (
      b.requestId !== pair.requestId ||
      b.workerId !== pair.workerId ||
      r.requestId !== pair.requestId ||
      (pair.customerId !== undefined && r.customerId !== pair.customerId) ||
      Date.now() > deadline
    )
      throw new ChatError('ELIGIBILITY_UNAVAILABLE');
    const permissions = chatPermissions(
      {
        customerId: r.customerId,
        workerId: b.workerId,
        bidStatus: b.status,
        bidCurrentlyValid:
          b.eligible === true &&
          b.roundStatus !== 'cancelled' &&
          (b.validUntil === null || Date.parse(b.validUntil) > Date.now()),
        requestStatus: r.status,
        selectedWorkerId: r.order?.workerId ?? null,
        orderStatus: r.order?.status ?? null,
        verified: true,
        userActive: true,
        conversationExists: exists,
        completionWindowOpen: false,
      },
      userId,
    );
    const proof = {
      permissions,
      customerId: r.customerId,
      serviceId: r.serviceId,
      workerId: b.workerId,
      requestId: r.requestId,
      orderId: r.order?.workerId === b.workerId ? r.order.orderId : null,
      bid: b,
      timings: {
        biddingAuthorizationMs,
        orderAuthorizationMs,
      },
    };
    if (this.permissionCache.size > 200) {
      for (const [k, v] of this.permissionCache) {
        if (v.expiresAt <= Date.now()) this.permissionCache.delete(k);
      }
    }
    if (useCache)
      this.permissionCache.set(cacheKey, {
        proof,
        expiresAt: Math.min(
          Date.now() + 5_000,
          b.validUntil === null ? Infinity : Date.parse(b.validUntil),
        ),
      });
    return proof;
  }
  async displayProfiles(
    ids: string[],
  ): Promise<Record<string, UserDisplayProfile>> {
    if (!this.options.userTrust || ids.length === 0) return {};
    const unique = [...new Set(ids)];
    const profiles: Record<string, UserDisplayProfile> = {};
    const missing: string[] = [];
    const now = Date.now();
    for (const id of unique) {
      const cached = this.profileCache.get(id);
      if (cached && cached.expiresAt > now) {
        profiles[id] = cached.profile;
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) return profiles;
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      try {
        const rows = await this.call<
          { id: string; fullName: unknown; avatarUrl?: unknown }[]
        >(
          this.options.userTrust,
          `/internal/users/display-names?ids=${batch.map(encodeURIComponent).join(',')}`,
          undefined,
          Date.now() + 1000,
        );
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (
            row &&
            batch.includes(row.id) &&
            typeof row.fullName === 'string' &&
            row.fullName.trim()
          ) {
            const profile = {
              fullName: row.fullName.trim(),
              avatarUrl:
                typeof row.avatarUrl === 'string' && row.avatarUrl.trim()
                  ? row.avatarUrl.trim()
                  : null,
            };
            profiles[row.id] = profile;
            this.profileCache.set(row.id, {
              profile,
              expiresAt: Date.now() + 60_000,
            });
          }
        }
      } catch {
        /* Labels do not affect chat availability. */
      }
    }
    return profiles;
  }
  async displayNames(ids: string[]): Promise<Record<string, string>> {
    const profiles = await this.displayProfiles(ids);
    const names: Record<string, string> = {};
    for (const [id, profile] of Object.entries(profiles)) {
      names[id] = profile.fullName;
    }
    return names;
  }
  async serviceName(serviceId?: string): Promise<string | undefined> {
    if (!this.options.catalog || !serviceId) return undefined;
    try {
      const service = await this.call<{ id: string; name: unknown }>(
        this.options.catalog,
        `/services/${encodeURIComponent(serviceId)}`,
        undefined,
        Date.now() + 1000,
      );
      if (
        service.id === serviceId &&
        typeof service.name === 'string' &&
        service.name.trim()
      )
        return service.name.trim();
    } catch {
      /* Labels do not affect chat availability. */
    }
    return undefined;
  }
  async media(
    storageKey: string,
    ownerId: string,
    mediaType: 'IMAGE' | 'VIDEO',
  ): Promise<MediaReceipt> {
    try {
      const value = await this.call<MediaReceipt>(
        this.options.media,
        '/internal/media/chat/verify',
        { storageKey, ownerId, mediaType },
      );
      if (
        value.storageKey !== storageKey ||
        value.ownerId !== ownerId ||
        value.mediaType !== mediaType ||
        !value.url?.startsWith('https://') ||
        !Number.isFinite(Date.parse(value.urlExpiresAt)) ||
        Date.parse(value.urlExpiresAt) <= Date.now() ||
        Date.parse(value.urlExpiresAt) > Date.now() + 301000
      )
        throw new Error();
      return value;
    } catch {
      throw new ChatError('MEDIA_UNVERIFIED');
    }
  }
  async attachments(input: MessageSendInput, userId: string) {
    const assets = await Promise.all(
      (input.attachments ?? []).map((a) =>
        this.media(
          a.storageKey,
          userId,
          input.messageType as 'IMAGE' | 'VIDEO',
        ),
      ),
    );
    if (!validateMediaReferences(input, assets, userId))
      throw new ChatError('MEDIA_UNVERIFIED');
    return assets;
  }
}
