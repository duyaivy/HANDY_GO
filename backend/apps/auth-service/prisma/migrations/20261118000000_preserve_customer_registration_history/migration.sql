BEGIN;

-- Block role writes until backfill and capture are installed together.
LOCK TABLE "account_roles" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "customer_registrations" (
  "account_id" UUID PRIMARY KEY,
  "registered_at" TIMESTAMP(6) NOT NULL
);

CREATE INDEX "customer_registrations_registered_at_idx"
  ON "customer_registrations"("registered_at");

-- Auth retains registration outbox events. Recover the original registration
-- even when CUSTOMER was revoked or its current assigned_at was replaced.
-- Older event contracts used data.role; the current contract uses data.roles.
WITH registration_events AS (
  SELECT CASE WHEN jsonb_typeof("payload"->'data') = 'object'
    THEN "payload"->'data' ELSE "payload" END AS data
  FROM "outbox_events"
  WHERE "eventType" = 'user.registered'
), customer_events AS (
  SELECT data FROM registration_events e
  WHERE UPPER(e.data->>'role') = 'CUSTOMER'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(e.data->'roles') = 'array'
          THEN e.data->'roles' ELSE '[]'::jsonb END
      ) AS role_name(value)
      WHERE UPPER(role_name.value) = 'CUSTOMER'
    )
), evidence AS (
  SELECT a.id AS account_id, GREATEST(a.created_at, ar.assigned_at) AS registered_at
  FROM "accounts" a
  JOIN "account_roles" ar ON ar.account_id = a.id
  JOIN "roles" r ON r.id = ar.role_id
  WHERE r.code = 'CUSTOMER'
  UNION ALL
  SELECT a.id, a.created_at
  FROM "accounts" a
  JOIN customer_events e ON e.data->>'accountId' = a.id::text
  UNION ALL
  -- Keep legacy user-ID matching separate so both paths can use a hash join.
  SELECT a.id, a.created_at
  FROM "accounts" a
  JOIN customer_events e ON e.data->>'userId' = a.user_id::text
  WHERE e.data->>'accountId' IS NULL
)
INSERT INTO "customer_registrations" ("account_id", "registered_at")
SELECT account_id, MIN(registered_at) FROM evidence GROUP BY account_id;

-- Bind function lookups to this migration's Auth schema, including deployments
-- with a custom schema. A role assignment and its registration commit atomically.
CREATE FUNCTION "record_customer_registration"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "roles" WHERE id = NEW.role_id AND code = 'CUSTOMER') THEN
    INSERT INTO "customer_registrations" ("account_id", "registered_at")
    SELECT id, GREATEST(created_at, NEW.assigned_at) FROM "accounts"
    WHERE id = NEW.account_id
    ON CONFLICT ("account_id") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "account_roles_record_customer_registration"
AFTER INSERT OR UPDATE ON "account_roles"
FOR EACH ROW EXECUTE FUNCTION "record_customer_registration"();

-- Do not cascade from accounts: deleting an account must not erase the fact
-- that this customer registered. Role revocation/reassignment cannot edit it.
CREATE FUNCTION "protect_customer_registration"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Customer registration history is append-only';
END;
$$;

CREATE TRIGGER "customer_registrations_append_only"
BEFORE UPDATE OR DELETE ON "customer_registrations"
FOR EACH ROW EXECUTE FUNCTION "protect_customer_registration"();

COMMIT;
