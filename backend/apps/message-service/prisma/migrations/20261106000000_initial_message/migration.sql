-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "message";
SET search_path = message;

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('OPEN', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "attachment_type" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "order_id" UUID,
    "customer_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "status" "conversation_status" NOT NULL DEFAULT 'OPEN',
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "client_message_id" UUID NOT NULL,
    "message_type" "message_type" NOT NULL,
    "content" TEXT,
    "reply_to_id" UUID,
    "sequence" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "media_type" "attachment_type" NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_read_states" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_sequence" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_read_states_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL DEFAULT 'message',
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumed_events" (
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "conversations_customer_id_last_message_at_id_idx" ON "conversations"("customer_id", "last_message_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "conversations_worker_id_last_message_at_id_idx" ON "conversations"("worker_id", "last_message_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "conversations_order_id_idx" ON "conversations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_request_id_customer_id_worker_id_key" ON "conversations"("request_id", "customer_id", "worker_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_reply_to_id_idx" ON "messages"("conversation_id", "reply_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_id_client_message_id_key" ON "messages"("sender_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sequence_key" ON "messages"("conversation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_id_key" ON "messages"("conversation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_message_id_position_key" ON "message_attachments"("message_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_message_id_storage_key_key" ON "message_attachments"("message_id", "storage_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_reply_to_id_fkey" FOREIGN KEY ("conversation_id", "reply_to_id") REFERENCES "messages"("conversation_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prisma cannot describe these domain CHECK constraints or triggers. Preserve them in migrations.
ALTER TABLE message.conversations ADD CONSTRAINT conversation_distinct_participants CHECK (customer_id <> worker_id), ADD CONSTRAINT conversation_nonnegative_sequence CHECK (last_sequence >= 0);
ALTER TABLE message.messages ADD CONSTRAINT message_positive_sequence CHECK (sequence > 0), ADD CONSTRAINT message_content_shape CHECK (
  (message_type = 'TEXT' AND content IS NOT NULL AND length(btrim(content)) BETWEEN 1 AND 4000)
  OR (message_type IN ('IMAGE','VIDEO') AND (content IS NULL OR length(content) <= 4000))
), ADD CONSTRAINT message_no_self_reply CHECK (reply_to_id IS DISTINCT FROM id);
ALTER TABLE message.message_attachments ADD CONSTRAINT attachment_metadata CHECK (
  length(btrim(storage_key)) > 0 AND storage_key !~ '^https?://' AND position BETWEEN 0 AND 3
  AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0) AND (duration_ms IS NULL OR duration_ms > 0)
  AND ((media_type = 'IMAGE' AND mime_type IN ('image/jpeg','image/png','image/webp') AND size_bytes BETWEEN 1 AND 10485760 AND duration_ms IS NULL)
    OR (media_type = 'VIDEO' AND mime_type IN ('video/mp4','video/quicktime','video/webm') AND size_bytes BETWEEN 1 AND 104857600 AND position = 0))
);
ALTER TABLE message.conversation_read_states ADD CONSTRAINT read_nonnegative_sequence CHECK (last_read_sequence >= 0);

CREATE FUNCTION message.guard_conversation_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, message AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_sequence <> 0 OR NEW.last_message_at IS NOT NULL THEN
      RAISE EXCEPTION 'Initial conversation cursor must be empty' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id,NEW.request_id,NEW.customer_id,NEW.worker_id) IS DISTINCT FROM (OLD.id,OLD.request_id,OLD.customer_id,OLD.worker_id) THEN
    RAISE EXCEPTION 'Conversation identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF pg_trigger_depth() < 2 AND (NEW.last_sequence,NEW.last_message_at) IS DISTINCT FROM (OLD.last_sequence,OLD.last_message_at) THEN
    RAISE EXCEPTION 'Message cursor is server allocated' USING ERRCODE = '23514';
  END IF;
  IF OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'Conversation order cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversation_identity BEFORE INSERT OR UPDATE ON message.conversations FOR EACH ROW EXECUTE FUNCTION message.guard_conversation_identity();

CREATE FUNCTION message.allocate_message_sequence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, message AS $$
DECLARE c message.conversations;
BEGIN
  SELECT * INTO c FROM message.conversations WHERE id = NEW.conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '23503'; END IF;
  IF NEW.sender_id NOT IN (c.customer_id,c.worker_id) THEN RAISE EXCEPTION 'Sender is not a participant' USING ERRCODE = '23514'; END IF;
  IF c.status <> 'OPEN' THEN RAISE EXCEPTION 'Conversation is read only' USING ERRCODE = '23514'; END IF;
  NEW.sequence := c.last_sequence + 1;
  NEW.created_at := clock_timestamp();
  UPDATE message.conversations SET last_sequence = NEW.sequence,last_message_at = NEW.created_at,updated_at = NEW.created_at WHERE id = c.id;
  RETURN NEW;
END $$;
CREATE TRIGGER message_sequence BEFORE INSERT ON message.messages FOR EACH ROW EXECUTE FUNCTION message.allocate_message_sequence();

CREATE FUNCTION message.immutable_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, message AS $$
BEGIN
  RAISE EXCEPTION 'Message history is immutable; retention requires a separate reviewed migration' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER message_immutable BEFORE UPDATE OR DELETE ON message.messages FOR EACH ROW EXECUTE FUNCTION message.immutable_history();
CREATE TRIGGER attachment_immutable BEFORE UPDATE OR DELETE ON message.message_attachments FOR EACH ROW EXECUTE FUNCTION message.immutable_history();

CREATE FUNCTION message.validate_message_attachments() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, message AS $$
DECLARE target uuid; kind message.message_type; n integer; invalid integer;
BEGIN
  IF TG_TABLE_NAME = 'messages' THEN target := NEW.id; ELSE target := NEW.message_id; END IF;
  SELECT message_type INTO kind FROM message.messages WHERE id = target;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT count(*),count(*) FILTER (WHERE media_type::text <> kind::text) INTO n,invalid FROM message.message_attachments WHERE message_id = target;
  IF invalid > 0 OR (kind = 'TEXT' AND n <> 0) OR (kind = 'IMAGE' AND n NOT BETWEEN 1 AND 4) OR (kind = 'VIDEO' AND n <> 1) THEN
    RAISE EXCEPTION 'Attachment count/type does not match message' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER message_attachment_shape AFTER INSERT ON message.messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION message.validate_message_attachments();
CREATE CONSTRAINT TRIGGER attachment_message_shape AFTER INSERT ON message.message_attachments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION message.validate_message_attachments();

CREATE FUNCTION message.guard_read_state() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, message AS $$
DECLARE c message.conversations;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.conversation_id,NEW.user_id) IS DISTINCT FROM (OLD.conversation_id,OLD.user_id) THEN
    RAISE EXCEPTION 'Read state identity is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO c FROM message.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '23503'; END IF;
  IF NEW.user_id NOT IN (c.customer_id,c.worker_id) OR NEW.last_read_sequence > c.last_sequence OR NEW.last_read_sequence < 0 THEN
    RAISE EXCEPTION 'Invalid participant or read cursor' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.last_read_sequence := greatest(OLD.last_read_sequence,NEW.last_read_sequence); END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER read_state_guard BEFORE INSERT OR UPDATE ON message.conversation_read_states FOR EACH ROW EXECUTE FUNCTION message.guard_read_state();
