-- Match the authenticated live-list keyset ordering without a sort over whole histories.
CREATE INDEX conversations_customer_activity_idx ON message.conversations (customer_id, (COALESCE(last_message_at, created_at)) DESC, id DESC);
CREATE INDEX conversations_worker_activity_idx ON message.conversations (worker_id, (COALESCE(last_message_at, created_at)) DESC, id DESC);
