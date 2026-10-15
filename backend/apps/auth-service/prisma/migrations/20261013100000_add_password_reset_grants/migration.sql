-- CreateTable: password_reset_grants
CREATE TABLE "password_reset_grants" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "account_id" uuid NOT NULL,
    "token_hash" varchar(255) NOT NULL,
    "expires_at" timestamp(6) NOT NULL,
    "is_used" boolean NOT NULL DEFAULT false,
    "created_at" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" timestamp(6),

    CONSTRAINT "password_reset_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_grants_token_hash_key" ON "password_reset_grants"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_grants_account_id_is_used_idx" ON "password_reset_grants"("account_id", "is_used");

-- CreateIndex
CREATE INDEX "password_reset_grants_expires_at_idx" ON "password_reset_grants"("expires_at");

-- AddForeignKey
ALTER TABLE "password_reset_grants" ADD CONSTRAINT "password_reset_grants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
