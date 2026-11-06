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
}
export type MediaReceipt = VerifiedChatMedia &
  Pick<
    ChatAttachment,
    'width' | 'height' | 'durationMs' | 'url' | 'urlExpiresAt'
  >;
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
export class AuthorityClient {
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
  async active(accountId: string, userId: string, sid: string) {
    try {
      return (
        (
          await this.call<{ active: boolean }>(
            this.options.auth,
            '/internal/auth/chat-session',
            { accountId, userId, sid },
          )
        ).active === true
      );
    } catch {
      throw new ChatError('UNAUTHORIZED');
    }
  }
  async permission(
    userId: string,
    pair: { requestId: string; workerId: string; customerId?: string },
    exists: boolean,
    bid?: ChatBidAuthority,
    deadline = Date.now() + 2000,
  ) {
    const [b, r] = await Promise.all([
      bid
        ? Promise.resolve(bid)
        : this.lookup(pair.requestId, pair.workerId, deadline),
      this.call<ChatRequestAuthority>(
        this.options.order,
        `/internal/service-requests/${encodeURIComponent(pair.requestId)}/chat-state`,
        undefined,
        deadline,
      ),
    ]);
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
    return {
      permissions,
      customerId: r.customerId,
      workerId: b.workerId,
      requestId: r.requestId,
      orderId: r.order?.workerId === b.workerId ? r.order.orderId : null,
      bid: b,
    };
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
