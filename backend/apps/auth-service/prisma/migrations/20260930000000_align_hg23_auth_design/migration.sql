-- HG-23 Auth design. This migration is intentionally for a new, empty database.
-- Keep the previous migration in history so fresh installations migrate normally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts")
     OR EXISTS (SELECT 1 FROM "roles")
     OR EXISTS (SELECT 1 FROM "permissions")
     OR EXISTS (SELECT 1 FROM "account_roles")
     OR EXISTS (SELECT 1 FROM "role_permissions")
     OR EXISTS (SELECT 1 FROM "refresh_sessions")
     OR EXISTS (SELECT 1 FROM "otp_challenges")
     OR EXISTS (SELECT 1 FROM "outbox_events") THEN
    RAISE EXCEPTION 'HG-23 schema alignment requires an empty Auth database; preserve and migrate existing data separately';
  END IF;
END $$;

DROP TABLE "otp_challenges";
DROP TABLE "refresh_sessions";
DROP TABLE "account_roles";
DROP TABLE "role_permissions";
DROP TABLE "permissions";
DROP TABLE "roles";
DROP TABLE "accounts";

CREATE TYPE "account_status" AS ENUM (
  'pending', 'active', 'suspended', 'locked', 'deleted'
);

CREATE TYPE "otp_purpose" AS ENUM (
  'register', 'verify_email', 'reset_password'
);

CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid UNIQUE NOT NULL,
  "email" varchar(255) UNIQUE,
  "phone" varchar(30) UNIQUE,
  "password_hash" varchar(255) NOT NULL,
  "status" account_status NOT NULL DEFAULT 'pending',
  "email_verified_at" timestamp,
  "password_changed_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY,
  "code" varchar(50) UNIQUE NOT NULL,
  "name" varchar(100) NOT NULL,
  "created_at" timestamp NOT NULL
);

CREATE TABLE "permissions" (
  "id" uuid PRIMARY KEY,
  "code" varchar(100) UNIQUE NOT NULL,
  "name" varchar(150) NOT NULL,
  "resource" varchar(50) NOT NULL,
  "action" varchar(30) NOT NULL,
  "created_at" timestamp NOT NULL
);

CREATE TABLE "account_roles" (
  "account_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "assigned_at" timestamp NOT NULL,
  PRIMARY KEY ("account_id", "role_id")
);

CREATE TABLE "permission_roles" (
  "permission_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "assigned_at" timestamp NOT NULL,
  PRIMARY KEY ("permission_id", "role_id")
);

CREATE TABLE "refresh_sessions" (
  "id" uuid PRIMARY KEY,
  "account_id" uuid NOT NULL,
  "refresh_token_hash" varchar(255) UNIQUE NOT NULL,
  "device_id" varchar(255),
  "device_name" varchar(255),
  "user_agent" text,
  "ip_address" varchar(64),
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL
);

COMMENT ON COLUMN "accounts"."user_id" IS 'Logical reference -> User & Trust Service.users.id';

ALTER TABLE "account_roles" ADD FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "account_roles" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "permission_roles" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "permission_roles" ADD FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "refresh_sessions" ADD FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

-- Operational OTP table; the group's Auth SQL defines otp_purpose but no OTP table.
CREATE TABLE "otp_challenges" (
  "id" uuid PRIMARY KEY,
  "accountId" uuid NOT NULL,
  "type" otp_purpose NOT NULL DEFAULT 'verify_email',
  "otpHash" text NOT NULL,
  "expiresAt" timestamp(3) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "resendAvailableAt" timestamp(3) NOT NULL,
  "isUsed" boolean NOT NULL DEFAULT false,
  "deliveryStatus" text NOT NULL DEFAULT 'pending',
  "deliveryError" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);

CREATE INDEX "otp_challenges_accountId_isUsed_idx" ON "otp_challenges" ("accountId", "isUsed");
ALTER TABLE "otp_challenges" ADD FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
