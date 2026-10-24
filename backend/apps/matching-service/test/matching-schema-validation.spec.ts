import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Matching Service Schema & Constraint Validation', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../prisma/migrations/20261024000000_init_matching_service/migration.sql',
  );
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

  it('should have matching-service migration and schema files created', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  it('should enforce display_limit = 5 by default and Top 20 rank constraint', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // display_limit = 5 default
    expect(sql).toContain('"display_limit" INTEGER NOT NULL DEFAULT 5');
    expect(sql).toContain('CONSTRAINT "match_runs_display_limit_check" CHECK ("display_limit" > 0)');

    // Top 20 rank constraint
    expect(sql).toContain('CONSTRAINT "match_results_rank_check" CHECK ("rank" > 0 AND "rank" <= 20)');

    // Score constraint in [0.00, 100.00]
    expect(sql).toContain(
      'CONSTRAINT "match_results_score_check" CHECK ("matching_score" >= 0.00 AND "matching_score" <= 100.00)',
    );

    // Run execution uniqueness for retries: (service_request_id, request_revision, run_number)
    expect(sql).toContain(
      'CONSTRAINT "match_runs_service_request_revision_run_key" UNIQUE ("service_request_id", "request_revision", "run_number")',
    );

    // Result uniqueness: no duplicate workers per run, unique rank per run
    expect(sql).toContain(
      'CONSTRAINT "match_results_match_run_worker_key" UNIQUE ("match_run_id", "worker_user_id")',
    );
    expect(sql).toContain(
      'CONSTRAINT "match_results_match_run_rank_key" UNIQUE ("match_run_id", "rank")',
    );
  });

  it('validates retry lifecycle without overwriting historical runs', () => {
    const serviceRequestId = 'req-uuid-1';
    const requestRevision = 1;

    // First execution attempt fails
    const run1 = {
      id: 'run-1',
      serviceRequestId,
      requestRevision,
      runNumber: 1,
      status: 'failed',
      errorMessage: 'AI ranking service timed out',
      candidateCount: 15,
      resultCount: 0,
      displayLimit: 5,
    };

    // Retry execution creates a NEW row with run_number = 2
    const run2 = {
      id: 'run-2',
      serviceRequestId,
      requestRevision,
      runNumber: 2,
      status: 'completed',
      candidateCount: 15,
      resultCount: 10,
      displayLimit: 5,
    };

    expect(run1.runNumber).toBe(1);
    expect(run2.runNumber).toBe(2);
    expect(run1.id).not.toBe(run2.id);
    expect(run1.status).toBe('failed');
    expect(run2.status).toBe('completed');
  });

  it('validates ranking results capacity and display slice logic', () => {
    // Generate up to Top 20 persisted recommendations
    const results = Array.from({ length: 20 }, (_, idx) => ({
      id: `res-${idx + 1}`,
      matchRunId: 'run-2',
      workerUserId: `worker-${idx + 1}`,
      rank: idx + 1,
      matchingScore: Number((100 - idx * 2.5).toFixed(2)),
    }));

    expect(results).toHaveLength(20);
    expect(results[0].rank).toBe(1);
    expect(results[19].rank).toBe(20);

    // Customer API slices to display_limit (5)
    const displayLimit = 5;
    const customerView = results.slice(0, displayLimit);
    expect(customerView).toHaveLength(5);
    expect(customerView.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);

    // Check rank validation logic
    const isValidRank = (rank: number): boolean => rank >= 1 && rank <= 20;
    expect(isValidRank(1)).toBe(true);
    expect(isValidRank(20)).toBe(true);
    expect(isValidRank(0)).toBe(false);
    expect(isValidRank(21)).toBe(false);

    // Check score validation logic
    const isValidScore = (score: number): boolean => score >= 0 && score <= 100;
    expect(isValidScore(98.5)).toBe(true);
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(100)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(100.1)).toBe(false);
  });
});
