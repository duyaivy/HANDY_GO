# Business rules and lifecycle

The executable policy specification is `backend/libs/common/src/message-contracts/policy.ts`; tests exercise committed/uncommitted bids, unrelated users, nonselected workers, cancellation/completion and read progression. Phase 2 handlers must obtain authoritative data and call the policy; this is not evidence of a running service.

Only a customer and one worker share a conversation tied to one service request. No group chat, discovery, arbitrary direct messages, worker transfer or mobile-selected participant IDs. Multiple workers with valid persisted bids get separate private conversations with the request owner. Unique identity is `(requestId,customerId,workerId)`. Customer ID is deliberately retained for authorization/listing without reading another service's tables. Participant identities and request ID are immutable; order ID may be attached later to the selected conversation.

## Permission matrix

| Authoritative business state                                                        | CREATE                          | READ existing                          | SEND / typing                  |
| ----------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------- | ------------------------------ |
| no persisted valid bid / unconfirmed projection                                     | deny                            | participant history only, if any       | deny                           |
| active, unexpired bid + noncanceled round + open_for_bidding/bidding_closed request | allow both participants         | allow participants                     | allow                          |
| revised active bid                                                                  | same conversation               | allow                                  | allow if request permits       |
| withdrawn/expired/rejected bid                                                      | deny                            | allow                                  | deny                           |
| request canceled/expired                                                            | deny                            | allow                                  | deny                           |
| tentative proposal created                                                          | prior active-bid rule only      | allow                                  | no special selection privilege |
| order created from bid; selected worker                                             | allow/retrieve pair after proof | allow                                  | allow selected pair            |
| selected a different worker                                                         | deny losing pair                | allow losing participants' own history | deny losing pair               |
| order confirmed/in_progress/awaiting_customer_confirmation                          | selected pair only              | allow                                  | selected pair only             |
| completed order                                                                     | only during configured window   | allow                                  | window only                    |
| canceled/disputed order                                                             | deny                            | allow                                  | deny                           |
| suspended/revoked actor or unrelated user                                           | deny                            | deny                                   | deny                           |

Default post-completion messaging window is **0 hours** (immediate READ_ONLY). A future `MESSAGE_POST_COMPLETION_HOURS` configuration may explicitly enable a bounded positive period; evaluate using authoritative completedAt and server time, never a client flag. Changing default is a product decision for Phase 2. Disputed orders are READ_ONLY pending explicit support policy. Existing historical access is not destructive retention or public access; only original active participants can read. Unknown states fail closed for writes. Request `draft`, unsupported lifecycle state, inconsistent snapshots and missing upstream authority never grant creation/sending.

`OPEN` and `READ_ONLY` are local materialized presentation states, derived from the lifecycle rather than independent business authority. The policy remains correct while events lag because every CREATE/SEND/typing admission fetches current authority. Closing event updates help revoke room typing immediately; they do not destroy messages. On conversion retain conversation ID, all messages/read states and set matching orderId. Never move one worker's history into another worker's conversation. Bidding bid/revision history remains owned by Bidding.

Create and send are separate permissions: an ineligible old conversation still supports READ and read-cursor advancement. `conversation.join` checks READ; `message.send` and `typing.start` check SEND. Room membership is never sufficient for either. An account may have several devices, but each message sender is the authenticated marketplace user, and each read state is one row per participant/conversation. Apply cursor advancement by max(current,incoming); reject nonexistent or above-high-water target. Store no per-message receipt rows.

## Idempotency and content rules

Generate UUID clientMessageId once per logical message. Unique sender/clientMessageId is global to that user; exact validated retries return the existing message, changed retries are conflict. Persist before success ACK. Stable ordering is server bigint per conversation. No client timestamps define order. Replies must reference an existing message in the same conversation; text preview is returned inline. No reactions, edits, message deletes, binary socket upload or ephemeral typing persistence in MVP.

TEXT needs nonblank content up to 4000 UTF-16 code units. IMAGE requires 1–4 IMAGE assets, VIDEO exactly one VIDEO; both may include same-limited optional caption. Client sends only ordered storage keys; independent server verification establishes ownership/private ready state, MIME, file size and type. SQL constraints enforce local structural integrity but cannot prove ownership in another system.

## Anti-circumvention and abuse

Deterministic v1 text validation examines NFKC-normalized text/captions without storing a normalized copy. Reject email-address patterns, digit runs of 9–15 digits allowing common phone separators, all `http(s)://`/`www.` links, `@handle` patterns with at least 3 handle characters, named external-contact services (Zalo, Telegram, WhatsApp, Facebook, Instagram, TikTok, WeChat, Viber, Signal, m.me/t.me), and English “pay/payment/transact [me] outside/off-platform” phrases. This intentionally conservative baseline may reject measurements/order numbers, legitimate links, service discussion or names. Return a generic CONTACT_INFORMATION_BLOCKED and let users rephrase without exposing filter internals. Shared boolean payload validator also returns false for these; Phase 2 error mapping may distinguish this reason without echoing content.

Rate limits are specified in SOCKET-IO-CONTRACTS and SECURITY-DESIGN. Repeated rejected messages and rate-limit violations should trigger bounded temporary send cooldown and support review (proposed initial 5 violations/10 minutes → 10 minute cooldown; store counts/IDs, not rejected drafts). Support review must have explicit permissions and auditable access. Do not automatically impose permanent account sanctions from this filter alone.

Text filters cannot reliably stop obfuscated numbers, Vietnamese slang, social contact intent or information embedded in images/video/audio. No current OCR/video moderation capability is integrated for chat. Disable media until ownership/privacy requirements are met; thereafter require reporting/blocking/support workflow before broad release. Do not describe attachments as screened. No complex AI moderation, unnecessary personal-data extraction or media scanning system is built in Phase 1. Human review/retention policy and multilingual filter calibration remain Phase 2 product/security dependencies.
