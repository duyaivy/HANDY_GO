import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { RequestStatus, OrderStatus, BookingProposalStatus } from '@prisma/order-client';
import {
  IsCommaSeparatedEnumConstraint,
} from './is-comma-separated-enum.validator.js';
import { QueryServiceRequestDto } from '../../service-requests/dto/query-service-request.dto.js';
import { QueryOrderDto } from '../../orders/dto/query-order.dto.js';
import { QueryBookingProposalDto } from '../../booking-proposals/dto/query-booking-proposal.dto.js';

describe('IsCommaSeparatedEnumConstraint (Unit Tests)', () => {
  const constraint = new IsCommaSeparatedEnumConstraint();
  const mockArgs = (enumObj: any) => ({ constraints: [enumObj], property: 'status' }) as any;

  it('accepts single valid enum token', () => {
    expect(constraint.validate('draft', mockArgs(RequestStatus))).toBe(true);
    expect(constraint.validate('created', mockArgs(OrderStatus))).toBe(true);
    expect(constraint.validate('proposed', mockArgs(BookingProposalStatus))).toBe(true);
  });

  it('accepts multiple valid enum tokens separated by comma', () => {
    expect(
      constraint.validate('draft,open_for_bidding,bidding_closed', mockArgs(RequestStatus)),
    ).toBe(true);
    expect(
      constraint.validate('created, confirmed , in_progress', mockArgs(OrderStatus)),
    ).toBe(true);
  });

  it('rejects non-string values (arrays, objects, numbers, booleans)', () => {
    expect(constraint.validate(['draft', 'open_for_bidding'] as any, mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate({ status: 'draft' } as any, mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(123 as any, mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(true as any, mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(null as any, mockArgs(RequestStatus))).toBe(false);
  });

  it('rejects empty string, whitespace only, or commas only', () => {
    expect(constraint.validate('', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate('   ', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(',', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(' , , ', mockArgs(RequestStatus))).toBe(false);
  });

  it('rejects string with empty tokens (e.g. trailing comma or double comma)', () => {
    expect(constraint.validate('draft,', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate(',draft', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate('draft,,open_for_bidding', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate('draft, ,open_for_bidding', mockArgs(RequestStatus))).toBe(false);
  });

  it('rejects unknown or invalid enum tokens', () => {
    expect(constraint.validate('draft,INVALID_STATUS', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate('unknown', mockArgs(RequestStatus))).toBe(false);
    expect(constraint.validate('not_an_order_status', mockArgs(OrderStatus))).toBe(false);
    expect(constraint.validate('proposed,unknown_proposal', mockArgs(BookingProposalStatus))).toBe(false);
  });

  it('provides descriptive default message with allowed enum values', () => {
    const msg = constraint.defaultMessage(mockArgs(RequestStatus));
    expect(msg).toContain('status must be a valid comma-separated list of enum values');
    expect(msg).toContain('open_for_bidding');
    expect(msg).toContain('draft');
  });
});

describe('DTO Validation with class-validator (Unit Tests)', () => {
  it('validates QueryServiceRequestDto status field', async () => {
    const dtoValid = new QueryServiceRequestDto();
    dtoValid.status = 'open_for_bidding,draft';
    const errorsValid = await validate(dtoValid);
    expect(errorsValid).toHaveLength(0);

    const dtoArray = new QueryServiceRequestDto();
    (dtoArray as any).status = ['draft', 'open_for_bidding'];
    const errorsArray = await validate(dtoArray);
    expect(errorsArray.length).toBeGreaterThan(0);
    expect(errorsArray.some(e => e.property === 'status')).toBe(true);

    const dtoInvalidToken = new QueryServiceRequestDto();
    dtoInvalidToken.status = 'draft,invalid_status';
    const errorsInvalidToken = await validate(dtoInvalidToken);
    expect(errorsInvalidToken.length).toBeGreaterThan(0);
    expect(errorsInvalidToken.some(e => e.property === 'status')).toBe(true);

    const dtoOnlyCommas = new QueryServiceRequestDto();
    dtoOnlyCommas.status = ' , , ';
    const errorsOnlyCommas = await validate(dtoOnlyCommas);
    expect(errorsOnlyCommas.length).toBeGreaterThan(0);
    expect(errorsOnlyCommas.some(e => e.property === 'status')).toBe(true);
  });

  it('validates QueryOrderDto status field', async () => {
    const dtoValid = new QueryOrderDto();
    dtoValid.status = 'created,confirmed,in_progress';
    const errorsValid = await validate(dtoValid);
    expect(errorsValid).toHaveLength(0);

    const dtoInvalid = new QueryOrderDto();
    dtoInvalid.status = 'created,invalid_enum';
    const errorsInvalid = await validate(dtoInvalid);
    expect(errorsInvalid.length).toBeGreaterThan(0);
    expect(errorsInvalid.some(e => e.property === 'status')).toBe(true);

    const dtoArray = new QueryOrderDto();
    (dtoArray as any).status = ['created', 'confirmed'];
    const errorsArray = await validate(dtoArray);
    expect(errorsArray.length).toBeGreaterThan(0);
    expect(errorsArray.some(e => e.property === 'status')).toBe(true);
  });

  it('validates QueryBookingProposalDto status field', async () => {
    const dtoValid = new QueryBookingProposalDto();
    dtoValid.status = 'proposed,changes_requested';
    const errorsValid = await validate(dtoValid);
    expect(errorsValid).toHaveLength(0);

    const dtoInvalid = new QueryBookingProposalDto();
    dtoInvalid.status = 'proposed,wrong_token';
    const errorsInvalid = await validate(dtoInvalid);
    expect(errorsInvalid.length).toBeGreaterThan(0);
    expect(errorsInvalid.some(e => e.property === 'status')).toBe(true);

    const dtoCommas = new QueryBookingProposalDto();
    dtoCommas.status = ',';
    const errorsCommas = await validate(dtoCommas);
    expect(errorsCommas.length).toBeGreaterThan(0);
    expect(errorsCommas.some(e => e.property === 'status')).toBe(true);
  });
});
