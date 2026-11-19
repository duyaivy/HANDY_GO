# Chat In-Session Bidding & Worker Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow workers to adjust quoted bid prices and customers to select that worker directly within their 1-on-1 chat session on the mobile app.

**Architecture:** Create a `ChatDealBar` sticky negotiation component situated immediately beneath the service header in `ChatScreen`. For workers, it reads active bid data via `useMyBidForRequest`, checks revision limits/cooldowns, and provides an `AdjustBidModal` invoking `useReviseBid` with version locking and auto-chat notification. For customers, it queries candidate bids via `useCandidates` and proposals via `OrdersApi.getProposalsForRequest`, allowing 1-tap confirmation invoking `OrdersApi.createProposal` with `selectionSource: 'bid'`, locking the selection and dispatching an auto-chat confirmation.

**Tech Stack:** React Native, Expo, TypeScript, TanStack Query, React Native Testing Library, Jest.

**Spec:** In-chat negotiation spec based on user requirements and backend contracts (HG48 Bidding Service + Order Service Booking Proposals).

## Global Constraints

- **Bid Revision limits:** Maximum 5 revisions per bid (`revisionsCount < 5`), minimum 2-minute cooldown between revisions, optimistic concurrency lock via `version`.
- **Customer Selection Source:** Must strictly adhere to `selectionSource: 'bid'`, with non-null `sourceBidId` and `agreedPrice > 0`. Never create orders directly; create booking proposals via `OrdersApi.createProposal`.
- **Order Finality:** If `conversation.orderId` is non-null, action buttons are disabled and a "Đã chốt đơn hàng" indicator is rendered.
- **Fail-Safe UI:** Must handle missing/loading bid data gracefully without breaking regular chat messaging.
- **Auto-Notification:** Upon adjusting price or selecting worker, send an automated text message into the chat so both parties have a timestamped audit trail in their message history.

## Review Focus

1. **Stale/Concurrent Bid Version:** Worker revising price after another update or concurrency mismatch; must handle 409 Conflict with a retry prompt.
2. **Zero/Negative or Invalid Bid Amount:** Worker entering 0, negative, or non-numeric amount; must validate min amount >= 1,000 VND before calling API.
3. **Already Proposed Worker:** Customer attempting to select a worker who already has a pending/accepted proposal; UI must show pending state ("Chờ thợ xác nhận") and disable redundant submissions.
4. **Order Already Converted:** Request already converted to an order; deal bar must show finalized status and prevent further bids/proposals.
5. **Role Segregation:** Ensure worker cannot see the "Chọn thợ" button and customer cannot see the "Điều chỉnh giá" button.

---

### Task 1: Create `AdjustBidModal` Component

**Files:**
- Create: `mobile/src/features/chat/components/adjust-bid-modal.tsx`
- Test: `mobile/src/features/chat/__tests__/adjust-bid-modal.test.tsx`

**Interfaces:**
- Consumes: `BidDetail` from `mobile/src/features/bidding/api/worker-bidding.api.ts`, `useReviseBid` from `mobile/src/features/bidding/hooks/use-worker-bidding.ts`.
- Produces:
  ```typescript
  export type AdjustBidModalProps = {
    visible: boolean;
    onClose: () => void;
    bid: BidDetail;
    requestId: string;
    onSuccess?: (newAmount: number, message?: string) => void;
  };
  export function AdjustBidModal(props: AdjustBidModalProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write the failing test for `AdjustBidModal`**
Create `mobile/src/features/chat/__tests__/adjust-bid-modal.test.tsx` testing rendering current price, inputting new price, validation errors (amount <= 0), cooldown notice, and successful revision mutation with optimistic concurrency version.

- [ ] **Step 2: Run test to verify it fails**
Run: `cd mobile && pnpm test src/features/chat/__tests__/adjust-bid-modal.test.tsx`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement `AdjustBidModal`**
Create `mobile/src/features/chat/components/adjust-bid-modal.tsx` with formatted amount input, optional message, revisions left calculation (`5 - bid.revisionsCount`), 2-minute cooldown timer, and `useReviseBid` mutation.

- [ ] **Step 4: Run test to verify it passes**
Run: `cd mobile && pnpm test src/features/chat/__tests__/adjust-bid-modal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add mobile/src/features/chat/components/adjust-bid-modal.tsx mobile/src/features/chat/__tests__/adjust-bid-modal.test.tsx
git commit -m "feat(chat): add AdjustBidModal component for worker bid revisions"
```

---

### Task 2: Create `ChatDealBar` Component

**Files:**
- Create: `mobile/src/features/chat/chat-deal-bar.tsx`
- Test: `mobile/src/features/chat/__tests__/chat-deal-bar.test.tsx`

**Interfaces:**
- Consumes: `ChatConversation` from `./types`, `useMyBidForRequest` from `@/features/bidding/hooks/use-worker-bidding`, `useCandidates` from `@/features/candidates/hooks/use-candidates`, `OrdersApi` from `@/features/orders/api/orders.api`.
- Produces:
  ```typescript
  export type ChatDealBarProps = {
    conversation: ChatConversation;
    userId: string;
    onSendMessage?: (content: string) => Promise<void>;
  };
  export function ChatDealBar(props: ChatDealBarProps): React.JSX.Element | null;
  ```

- [ ] **Step 1: Write failing unit tests for `ChatDealBar`**
Create `mobile/src/features/chat/__tests__/chat-deal-bar.test.tsx`:
- Test 1: Worker sees current bid amount and "Điều chỉnh giá" button.
- Test 2: Worker clicking "Điều chỉnh giá" opens modal, and on successful revise, calls `onSendMessage` with bid update text.
- Test 3: Customer sees worker's bid and "Chọn thợ này" button.
- Test 4: Customer clicking "Chọn thợ này" shows confirmation, calls `OrdersApi.createProposal`, displays success, and calls `onSendMessage`.
- Test 5: Customer sees "Đã gửi đề xuất - Chờ thợ xác nhận" when proposal already exists for this worker.
- Test 6: Shows "Đã chốt đơn hàng" badge when `conversation.orderId` is present.

- [ ] **Step 2: Run test to verify it fails**
Run: `cd mobile && pnpm test src/features/chat/__tests__/chat-deal-bar.test.tsx`
Expected: FAIL (file not found)

- [ ] **Step 3: Implement `ChatDealBar`**
Create `mobile/src/features/chat/chat-deal-bar.tsx` implementing all required role-specific views, queries, modals, confirmations, and callbacks.

- [ ] **Step 4: Run test to verify it passes**
Run: `cd mobile && pnpm test src/features/chat/__tests__/chat-deal-bar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add mobile/src/features/chat/chat-deal-bar.tsx mobile/src/features/chat/__tests__/chat-deal-bar.test.tsx
git commit -m "feat(chat): add ChatDealBar component for in-chat price adjustment and worker selection"
```

---

### Task 3: Integrate `ChatDealBar` into `ChatScreen` and Update Integration Tests

**Files:**
- Modify: `mobile/src/features/chat/chat-screen.tsx`
- Modify: `mobile/src/features/chat/__tests__/chat-screen.test.tsx`

**Interfaces:**
- Consumes: `ChatDealBar` from `./chat-deal-bar`.
- Modifies: `ParticipantChatScreen` layout in `mobile/src/features/chat/chat-screen.tsx` to mount `ChatDealBar` below the service banner.

- [ ] **Step 1: Add integration tests in `chat-screen.test.tsx`**
Update `mobile/src/features/chat/__tests__/chat-screen.test.tsx` to verify `ChatDealBar` mounts properly when conversation data is available.

- [ ] **Step 2: Run test to verify it fails**
Run: `cd mobile && pnpm test src/features/chat/__tests__/chat-screen.test.tsx`
Expected: FAIL

- [ ] **Step 3: Mount `ChatDealBar` in `ChatScreen`**
Integrate `<ChatDealBar conversation={conversation} userId={userId} onSendMessage={...} />` into `chat-screen.tsx` directly underneath the service title banner.

- [ ] **Step 4: Run test to verify all tests pass**
Run: `cd mobile && pnpm test src/features/chat/__tests__/chat-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full test suite for chat and bidding**
Run: `cd mobile && pnpm test src/features/chat/ src/features/bidding/`
Expected: All suites PASS

- [ ] **Step 6: Commit**
```bash
git add mobile/src/features/chat/chat-screen.tsx mobile/src/features/chat/__tests__/chat-screen.test.tsx
git commit -m "feat(chat): integrate in-chat bid adjustment and worker selection deal bar"
```
