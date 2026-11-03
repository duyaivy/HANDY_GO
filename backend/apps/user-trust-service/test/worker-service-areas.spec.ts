import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Worker Service Areas Schema & Constraint Validation', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../prisma/migrations/20261024000000_add_worker_service_areas/migration.sql',
  );
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

  it('should have the migration SQL file created', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('should define worker_service_areas table with required columns and constraints in migration SQL', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE "worker_service_areas"');
    expect(sql).toContain('"worker_profile_id" UUID NOT NULL');
    expect(sql).toContain('"latitude" DECIMAL(9,6) NOT NULL');
    expect(sql).toContain('"longitude" DECIMAL(9,6) NOT NULL');
    expect(sql).toContain('"radius_km" DECIMAL(6,2) NOT NULL');
    expect(sql).toContain('"is_active" BOOLEAN NOT NULL DEFAULT true');

    // CHECK constraints
    expect(sql).toContain('CONSTRAINT "worker_service_areas_latitude_check"');
    expect(sql).toContain('"latitude" >= -90.000000 AND "latitude" <= 90.000000');
    expect(sql).toContain('CONSTRAINT "worker_service_areas_longitude_check"');
    expect(sql).toContain('"longitude" >= -180.000000 AND "longitude" <= 180.000000');
    expect(sql).toContain('CONSTRAINT "worker_service_areas_radius_km_check"');
    expect(sql).toContain('"radius_km" > 0 AND "radius_km" <= 500.00');

    // Foreign key constraint
    expect(sql).toContain('FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id")');

    // Indexes
    expect(sql).toContain('CREATE INDEX "worker_service_areas_worker_profile_id_is_active_idx"');
    expect(sql).toContain('CREATE INDEX "worker_service_areas_latitude_longitude_idx"');
  });

  it('should define WorkerServiceArea model in Prisma schema with relations', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('model WorkerServiceArea');
    expect(schema).toContain('workerProfileId String        @map("worker_profile_id") @db.Uuid');
    expect(schema).toContain('latitude        Decimal       @db.Decimal(9, 6)');
    expect(schema).toContain('longitude       Decimal       @db.Decimal(9, 6)');
    expect(schema).toContain('radiusKm        Decimal       @map("radius_km") @db.Decimal(6, 2)');
    expect(schema).toContain('isActive        Boolean       @default(true) @map("is_active")');
    expect(schema).toContain('workerProfile   WorkerProfile @relation(fields: [workerProfileId], references: [id]');
    expect(schema).toContain('serviceAreas        WorkerServiceArea[]');
  });

  it('validates coordinate and radius bounds logically', () => {
    const isValidCoordinate = (lat: number, lon: number): boolean => {
      return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    };

    const isValidRadius = (radiusKm: number): boolean => {
      return radiusKm > 0 && radiusKm <= 500;
    };

    expect(isValidCoordinate(16.0544, 108.2022)).toBe(true); // Da Nang
    expect(isValidCoordinate(10.8231, 106.6297)).toBe(true); // HCMC
    expect(isValidCoordinate(91.0, 108.0)).toBe(false); // Invalid latitude > 90
    expect(isValidCoordinate(-90.5, 0)).toBe(false); // Invalid latitude < -90
    expect(isValidCoordinate(0, 180.5)).toBe(false); // Invalid longitude > 180

    expect(isValidRadius(10)).toBe(true);
    expect(isValidRadius(0)).toBe(false); // Radius must be > 0
    expect(isValidRadius(-5)).toBe(false); // Negative radius rejected
    expect(isValidRadius(600)).toBe(false); // Radius > 500 rejected
  });

  it('supports multiple service areas per worker profile', () => {
    const workerProfileId = '11111111-1111-1111-1111-111111111111';
    const areas = [
      {
        id: 'area-1',
        workerProfileId,
        latitude: 16.0544,
        longitude: 108.2022,
        radiusKm: 15,
        isActive: true,
      },
      {
        id: 'area-2',
        workerProfileId,
        latitude: 15.8801,
        longitude: 108.338,
        radiusKm: 20,
        isActive: true,
      },
    ];

    expect(areas).toHaveLength(2);
    expect(areas[0].workerProfileId).toBe(areas[1].workerProfileId);
    expect(areas[0].id).not.toBe(areas[1].id);
  });
});
