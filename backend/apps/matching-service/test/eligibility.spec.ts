import { describe, expect, it } from 'vitest';
import { EligibilityService } from '../src/eligibility/eligibility.service.js';
import {
  calculateHaversineDistance,
  validateCoordinates,
} from '../src/eligibility/haversine.util.js';
import type {
  EligibilityRequestInput,
  WorkerCandidateEligibilityInput,
} from '../src/eligibility/eligibility.types.js';

describe('Geographical Haversine Utility', () => {
  it('should accurately calculate Haversine distance between known coordinates', () => {
    // Distance between Ben Thanh Market (10.7720, 106.6983) and Notre Dame Cathedral Saigon (10.7798, 106.6990)
    // Approximately 0.87 km
    const dist = calculateHaversineDistance(10.772, 106.6983, 10.7798, 106.699);
    expect(dist).toBeGreaterThan(0.8);
    expect(dist).toBeLessThan(1.0);
  });

  it('should return 0 km for identical coordinates', () => {
    const dist = calculateHaversineDistance(10.772, 106.6983, 10.772, 106.6983);
    expect(dist).toBe(0);
  });

  it('should validate boundary coordinates correctly', () => {
    expect(validateCoordinates(90, 180)).toBe(true);
    expect(validateCoordinates(-90, -180)).toBe(true);
    expect(validateCoordinates(0, 0)).toBe(true);
    expect(validateCoordinates(90.1, 0)).toBe(false);
    expect(validateCoordinates(-90.1, 0)).toBe(false);
    expect(validateCoordinates(0, 180.1)).toBe(false);
    expect(validateCoordinates(NaN, 100)).toBe(false);
  });

  it('should throw error when calculating distance with invalid coordinates', () => {
    expect(() =>
      calculateHaversineDistance(999, 106.0, 10.0, 106.0),
    ).toThrow(/Invalid geographic coordinates/);
  });
});

describe('EligibilityService Hard Filtering Rules', () => {
  const eligibilityService = new EligibilityService();

  const mockRequest: EligibilityRequestInput = {
    serviceRequestId: 'req-001',
    serviceId: 'srv-electrical-01',
    customerUserId: 'customer-user-123',
    latitude: 10.772,
    longitude: 106.6983,
  };

  const createValidCandidate = (
    workerUserId = 'worker-user-456',
  ): WorkerCandidateEligibilityInput => ({
    workerUserId,
    workerProfileId: `profile-${workerUserId}`,
    userStatus: 'active',
    workerProfileStatus: 'verified',
    hasApprovedKyc: true,
    hasActiveMatchingOffering: true,
    serviceAreas: [
      {
        latitude: 10.775,
        longitude: 106.7,
        radiusKm: 10.0,
        isActive: true,
      },
    ],
    isRestricted: false,
  });

  it('should mark a candidate eligible when all 7 mandatory rules pass', () => {
    const candidate = createValidCandidate();
    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);

    expect(result.isEligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.minimumDistanceKm).toBeDefined();
    expect(result.minimumDistanceKm).toBeLessThan(10.0);
  });

  it('Rule 1: should reject worker if user account is not active', () => {
    const candidate = createValidCandidate();
    candidate.userStatus = 'suspended';

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons).toContain(
      "User account status is 'suspended', required 'active'",
    );
  });

  it('Rule 2: should reject worker if profile is not verified', () => {
    const candidate = createValidCandidate();
    candidate.workerProfileStatus = 'pending_verification';

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('pending_verification'))).toBe(true);
  });

  it('Rule 3: should reject worker without approved KYC', () => {
    const candidate = createValidCandidate();
    candidate.hasApprovedKyc = false;

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('KYC'))).toBe(true);
  });

  it('Rule 4: should reject worker without matching active service offering', () => {
    const candidate = createValidCandidate();
    candidate.hasActiveMatchingOffering = false;

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('offering'))).toBe(true);
  });

  it('Rule 5: Anti-Self-Matching: should reject if worker is the customer', () => {
    const candidate = createValidCandidate(mockRequest.customerUserId);

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('Anti-self-matching'))).toBe(true);
  });

  it('Rule 6: should reject restricted worker', () => {
    const candidate = createValidCandidate();
    candidate.isRestricted = true;

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('restricted'))).toBe(true);
  });

  it('Rule 7: Geographic filtering: should reject if request location is outside radius', () => {
    const candidate = createValidCandidate();
    // Area in Hanoi (21.0285, 105.8542) with radius 15km, but request is in HCMC (10.7720, 106.6983)
    candidate.serviceAreas = [
      {
        latitude: 21.0285,
        longitude: 105.8542,
        radiusKm: 15.0,
        isActive: true,
      },
    ];

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('outside all active service areas'))).toBe(true);
  });

  it('Multiple Service Areas: should pick the minimum distance among active areas covering request', () => {
    const candidate = createValidCandidate();
    candidate.serviceAreas = [
      {
        // Farther area covering request: ~5km
        latitude: 10.81,
        longitude: 106.71,
        radiusKm: 15.0,
        isActive: true,
      },
      {
        // Closer area covering request: ~0.5km
        latitude: 10.775,
        longitude: 106.7,
        radiusKm: 5.0,
        isActive: true,
      },
      {
        // Inactive area
        latitude: 10.772,
        longitude: 106.6983,
        radiusKm: 2.0,
        isActive: false,
      },
    ];

    const result = eligibilityService.evaluateCandidate(candidate, mockRequest);
    expect(result.isEligible).toBe(true);
    expect(result.minimumDistanceKm).toBeLessThan(1.0);
    expect(result.matchedArea?.radiusKm).toBe(5.0);
  });

  it('filterEligibleCandidates: should filter array of candidates', () => {
    const valid1 = createValidCandidate('worker-1');
    const invalid = createValidCandidate('worker-2');
    invalid.userStatus = 'suspended';
    const valid2 = createValidCandidate('worker-3');

    const results = eligibilityService.filterEligibleCandidates(
      [valid1, invalid, valid2],
      mockRequest,
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.candidate.workerUserId)).toEqual([
      'worker-1',
      'worker-3',
    ]);
  });
});
