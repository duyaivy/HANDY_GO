-- HG-23 User & Trust design. This migration is intentionally for a new, empty database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users")
     OR EXISTS (SELECT 1 FROM "customer_profiles")
     OR EXISTS (SELECT 1 FROM "event_inbox") THEN
    RAISE EXCEPTION 'HG-23 schema alignment requires an empty User & Trust database; preserve and migrate existing data separately';
  END IF;
END $$;

DROP TABLE "customer_profiles";
DROP TABLE "users";

CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE "worker_status" AS ENUM ('draft', 'pending_kyc', 'under_review', 'verified', 'rejected', 'suspended');
CREATE TYPE "kyc_status" AS ENUM ('draft', 'submitted', 'reviewing', 'approved', 'rejected');
CREATE TYPE "review_status" AS ENUM ('published', 'hidden', 'flagged', 'removed');
CREATE TYPE "complaint_status" AS ENUM ('submitted', 'reviewing', 'awaiting_information', 'resolved', 'rejected', 'closed');
CREATE TYPE "complaint_category" AS ENUM ('service_quality', 'worker_behavior', 'customer_behavior', 'payment', 'fraud', 'safety', 'other');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "full_name" varchar(150) NOT NULL,
  "avatar_url" text,
  "status" user_status NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "customer_profiles" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid UNIQUE NOT NULL,
  "bio" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "worker_profiles" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid UNIQUE NOT NULL,
  "status" worker_status NOT NULL DEFAULT 'draft',
  "average_rating" decimal(3,2) NOT NULL DEFAULT 0,
  "rating_count" int NOT NULL DEFAULT 0,
  "completed_order_count" int NOT NULL DEFAULT 0,
  "order_count_total" int NOT NULL DEFAULT 0,
  "verified_at" timestamp,
  "approved_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "user_bank_accounts" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "bank_code" varchar(20) NOT NULL,
  "bank_name" varchar(100) NOT NULL,
  "account_number" varchar(50) NOT NULL,
  "account_holder_name" varchar(150) NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "worker_service_offerings" (
  "id" uuid PRIMARY KEY,
  "worker_profile_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "title" varchar(200),
  "description" text,
  "experience_years" int DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "kyc_cases" (
  "id" uuid PRIMARY KEY,
  "worker_profile_id" uuid NOT NULL,
  "id_document_type" varchar(50) NOT NULL,
  "id_number_masked" varchar(100),
  "document_front_ref" text NOT NULL,
  "document_back_ref" text,
  "selfie_ref" text NOT NULL,
  "status" kyc_status NOT NULL DEFAULT 'draft',
  "ai_similarity_score" decimal(5,4),
  "reviewed_by_user_id" uuid,
  "review_note" text,
  "submitted_at" timestamp,
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "worker_reviews" (
  "id" uuid PRIMARY KEY,
  "order_id" uuid NOT NULL,
  "customer_user_id" uuid NOT NULL,
  "worker_user_id" uuid NOT NULL,
  "rating" int NOT NULL,
  "attitude_rating" text NOT NULL,
  "quality_rating" text NOT NULL,
  "speed_rating" text NOT NULL,
  "comment" text,
  "status" review_status NOT NULL DEFAULT 'published',
  "moderated_by_user_id" uuid,
  "moderation_note" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "complaints" (
  "id" uuid PRIMARY KEY,
  "order_id" uuid NOT NULL,
  "complainant_user_id" uuid NOT NULL,
  "reported_user_id" uuid,
  "category" complaint_category NOT NULL,
  "subject" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "status" complaint_status NOT NULL DEFAULT 'submitted',
  "assigned_admin_user_id" uuid,
  "resolution" text,
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "complaint_evidence" (
  "id" uuid PRIMARY KEY,
  "complaint_id" uuid NOT NULL,
  "uploaded_by_user_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "note" text,
  "created_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX ON "worker_service_offerings" ("worker_profile_id", "service_id");
CREATE UNIQUE INDEX ON "worker_reviews" ("order_id");
CREATE INDEX ON "worker_reviews" ("worker_user_id");
CREATE INDEX ON "worker_reviews" ("customer_user_id");

COMMENT ON COLUMN "worker_service_offerings"."service_id" IS 'Logical reference -> Catalog Service.services.id';
COMMENT ON COLUMN "worker_reviews"."order_id" IS 'Logical reference -> Order Service.orders.id';
COMMENT ON COLUMN "complaints"."order_id" IS 'Logical reference -> Order Service.orders.id';

ALTER TABLE "customer_profiles" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "worker_profiles" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "user_bank_accounts" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "worker_service_offerings" ADD FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "kyc_cases" ADD FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "kyc_cases" ADD FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "worker_reviews" ADD FOREIGN KEY ("customer_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "worker_reviews" ADD FOREIGN KEY ("worker_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "worker_reviews" ADD FOREIGN KEY ("moderated_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "complaints" ADD FOREIGN KEY ("complainant_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "complaints" ADD FOREIGN KEY ("reported_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "complaints" ADD FOREIGN KEY ("assigned_admin_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "complaint_evidence" ADD FOREIGN KEY ("complaint_id") REFERENCES "complaints" ("id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "complaint_evidence" ADD FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
