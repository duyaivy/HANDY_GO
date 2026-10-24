-- CreateTable: worker_service_areas
CREATE TABLE "worker_service_areas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "worker_profile_id" UUID NOT NULL,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "radius_km" DECIMAL(6,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "worker_service_areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "worker_service_areas_latitude_check" CHECK ("latitude" >= -90.000000 AND "latitude" <= 90.000000),
  CONSTRAINT "worker_service_areas_longitude_check" CHECK ("longitude" >= -180.000000 AND "longitude" <= 180.000000),
  CONSTRAINT "worker_service_areas_radius_km_check" CHECK ("radius_km" > 0 AND "radius_km" <= 500.00)
);

-- CreateIndexes
CREATE INDEX "worker_service_areas_worker_profile_id_is_active_idx" ON "worker_service_areas"("worker_profile_id", "is_active");
CREATE INDEX "worker_service_areas_latitude_longitude_idx" ON "worker_service_areas"("latitude", "longitude");

-- AddForeignKey
ALTER TABLE "worker_service_areas" 
  ADD CONSTRAINT "worker_service_areas_worker_profile_id_fkey" 
  FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comments
COMMENT ON TABLE "worker_service_areas" IS 'Geographical service area centers and operational radius registered by Workers';
COMMENT ON COLUMN "worker_service_areas"."worker_profile_id" IS 'Internal reference to worker_profiles.id';
COMMENT ON COLUMN "worker_service_areas"."latitude" IS 'Service area center latitude (-90 to 90)';
COMMENT ON COLUMN "worker_service_areas"."longitude" IS 'Service area center longitude (-180 to 180)';
COMMENT ON COLUMN "worker_service_areas"."radius_km" IS 'Maximum service radius in kilometers (must be > 0 and <= 500)';
COMMENT ON COLUMN "worker_service_areas"."is_active" IS 'Whether worker currently accepts jobs within this zone';
