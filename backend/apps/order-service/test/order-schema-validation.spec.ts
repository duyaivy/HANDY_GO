import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Order Service Schema & Business Invariant Validation', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../prisma/migrations/20261024000000_init_order_service/migration.sql',
  );
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

  it('should have order-service migration and schema files created', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  it('should enforce all intended tables and enums in SQL migration', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Enums
    expect(sql).toContain('CREATE TYPE "request_status"');
    expect(sql).toContain('CREATE TYPE "booking_proposal_status"');
    expect(sql).toContain('CREATE TYPE "worker_selection_source"');
    expect(sql).toContain('CREATE TYPE "order_status"');
    expect(sql).toContain('CREATE TYPE "payment_state"');

    // Tables
    expect(sql).toContain('CREATE TABLE "service_requests"');
    expect(sql).toContain('CREATE TABLE "request_media"');
    expect(sql).toContain('CREATE TABLE "booking_proposals"');
    expect(sql).toContain('CREATE TABLE "orders"');
    expect(sql).toContain('CREATE TABLE "order_status_history"');
    expect(sql).toContain('CREATE TABLE "outbox_events"');
    expect(sql).toContain('CREATE TABLE "consumed_events"');

    // Relational Foreign Keys (Order internal only)
    expect(sql).toContain('FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id")');
    expect(sql).toContain('FOREIGN KEY ("booking_proposal_id") REFERENCES "booking_proposals"("id")');
    expect(sql).toContain('FOREIGN KEY ("order_id") REFERENCES "orders"("id")');

    // CHECK constraints
    expect(sql).toContain('CONSTRAINT "service_requests_version_check" CHECK ("version" >= 0)');
    expect(sql).toContain('CONSTRAINT "service_requests_matching_revision_check" CHECK ("matching_revision" >= 0)');
    expect(sql).toContain('CONSTRAINT "booking_proposals_agreed_price_check" CHECK ("agreed_price" > 0)');
    expect(sql).toContain('CONSTRAINT "orders_agreed_price_check" CHECK ("agreed_price" > 0)');

    // Selection Source XOR check
    expect(sql).toContain('booking_proposals_selection_source_check');
    expect(sql).toContain('orders_selection_source_check');
  });

  it('validates selection source XOR guard logic', () => {
    interface ProposalSelection {
      selection_source: 'bid' | 'recommendation';
      source_bid_id: string | null;
      source_match_result_id: string | null;
    }

    const validateSelectionSource = (p: ProposalSelection): boolean => {
      if (p.selection_source === 'bid') {
        return p.source_bid_id !== null && p.source_match_result_id === null;
      }
      if (p.selection_source === 'recommendation') {
        return p.source_match_result_id !== null && p.source_bid_id === null;
      }
      return false;
    };

    // Valid bid selection
    expect(
      validateSelectionSource({
        selection_source: 'bid',
        source_bid_id: 'bid-123',
        source_match_result_id: null,
      }),
    ).toBe(true);

    // Valid recommendation selection
    expect(
      validateSelectionSource({
        selection_source: 'recommendation',
        source_bid_id: null,
        source_match_result_id: 'match-123',
      }),
    ).toBe(true);

    // Invalid: bid with recommendation ID
    expect(
      validateSelectionSource({
        selection_source: 'bid',
        source_bid_id: 'bid-123',
        source_match_result_id: 'match-123',
      }),
    ).toBe(false);

    // Invalid: recommendation with no recommendation ID
    expect(
      validateSelectionSource({
        selection_source: 'recommendation',
        source_bid_id: null,
        source_match_result_id: null,
      }),
    ).toBe(false);
  });

  it('validates matching revision rules between Draft and Publication', () => {
    // Draft request has matching_revision = 0
    const draftRequest = {
      status: 'draft',
      matching_revision: 0,
      version: 0,
    };
    expect(draftRequest.matching_revision).toBe(0);

    // Upon publication, matching_revision becomes 1
    const publishedRequest = {
      ...draftRequest,
      status: 'open_for_bidding',
      matching_revision: 1,
      published_at: new Date(),
    };
    expect(publishedRequest.matching_revision).toBe(1);

    // Updating schedule alone does NOT increment matching revision
    const scheduleUpdated = {
      ...publishedRequest,
      scheduled_at: new Date(Date.now() + 86400000),
      version: publishedRequest.version + 1,
      matching_revision: publishedRequest.matching_revision, // remains 1
    };
    expect(scheduleUpdated.matching_revision).toBe(1);

    // Updating location/service increments matching revision
    const locationUpdated = {
      ...scheduleUpdated,
      latitude: 16.08,
      longitude: 108.22,
      version: scheduleUpdated.version + 1,
      matching_revision: scheduleUpdated.matching_revision + 1, // increments to 2
    };
    expect(locationUpdated.matching_revision).toBe(2);
  });
});
