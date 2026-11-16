-- CreateTable
CREATE TABLE IF NOT EXISTS "review_media" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "media_type" VARCHAR(30) NOT NULL,
    "media_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "review_media_review_id_idx" ON "review_media"("review_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "review_media" 
      ADD CONSTRAINT "review_media_review_id_fkey" 
      FOREIGN KEY ("review_id") REFERENCES "worker_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

