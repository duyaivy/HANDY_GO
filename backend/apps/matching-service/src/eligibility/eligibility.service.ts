import { Injectable, Logger } from '@nestjs/common';
import {
  calculateHaversineDistance,
  validateCoordinates,
} from './haversine.util.js';
import type {
  EligibilityRequestInput,
  WorkerCandidateEligibilityInput,
  WorkerEligibilityResult,
} from './eligibility.types.js';

@Injectable()
export class EligibilityService {
  private readonly logger = new Logger(EligibilityService.name);

  /**
   * Evaluates mandatory hard eligibility rules for a single worker candidate.
   * Hard eligibility is binary: AI scores CANNOT override eligibility failures.
   */
  evaluateCandidate(
    candidate: WorkerCandidateEligibilityInput,
    request: EligibilityRequestInput,
  ): WorkerEligibilityResult {
    const reasons: string[] = [];

    // Rule 1: Active User Account
    if (candidate.userStatus !== 'active') {
      reasons.push(`User account status is '${candidate.userStatus}', required 'active'`);
    }

    // Rule 2: Verified Worker Profile
    if (candidate.workerProfileStatus !== 'verified') {
      reasons.push(
        `Worker profile status is '${candidate.workerProfileStatus}', required 'verified'`,
      );
    }

    // Rule 3: Approved KYC
    if (!candidate.hasApprovedKyc) {
      reasons.push('Worker does not have an approved KYC verification case');
    }

    // Rule 4: Active Service Offering matching Request
    if (!candidate.hasActiveMatchingOffering) {
      reasons.push('Worker has no active service offering for the requested service ID');
    }

    // Rule 5: Anti-Self-Matching (Worker cannot be the Customer)
    if (candidate.workerUserId === request.customerUserId) {
      reasons.push('Anti-self-matching: worker is the customer of this request');
    }

    // Rule 6: Business restrictions (e.g. account blocks, sanctions)
    if (candidate.isRestricted) {
      reasons.push('Worker is restricted by administrative or safety policy');
    }

    // Rule 7: Geographic Service-Area Eligibility
    if (!validateCoordinates(request.latitude, request.longitude)) {
      reasons.push(
        `Request location coordinates (${request.latitude}, ${request.longitude}) are invalid`,
      );
    }

    const activeAreas = (candidate.serviceAreas || []).filter((a) => a.isActive);
    if (activeAreas.length === 0) {
      reasons.push('Worker has no active registered service areas');
    }

    let minDistance = Infinity;
    let bestMatchedArea: (typeof candidate.serviceAreas)[0] | undefined;

    for (const area of activeAreas) {
      if (!validateCoordinates(area.latitude, area.longitude) || area.radiusKm <= 0) {
        continue;
      }

      try {
        const distance = calculateHaversineDistance(
          request.latitude,
          request.longitude,
          area.latitude,
          area.longitude,
        );

        if (distance <= area.radiusKm && distance < minDistance) {
          minDistance = distance;
          bestMatchedArea = area;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to calculate distance for worker ${candidate.workerUserId}: ${(err as Error).message}`,
        );
      }
    }

    if (!bestMatchedArea || minDistance === Infinity) {
      reasons.push(
        `Request location is outside all active service areas of worker (min evaluated distance was ${minDistance === Infinity ? 'N/A' : minDistance.toFixed(2) + ' km'})`,
      );
    }

    const isEligible = reasons.length === 0;

    return {
      workerUserId: candidate.workerUserId,
      isEligible,
      reasons,
      minimumDistanceKm: isEligible ? Math.round(minDistance * 100) / 100 : undefined,
      matchedArea: bestMatchedArea,
    };
  }

  /**
   * Filters an array of candidates, returning only those that pass all hard eligibility rules.
   */
  filterEligibleCandidates(
    candidates: WorkerCandidateEligibilityInput[],
    request: EligibilityRequestInput,
  ): Array<{ candidate: WorkerCandidateEligibilityInput; result: WorkerEligibilityResult }> {
    const eligible: Array<{
      candidate: WorkerCandidateEligibilityInput;
      result: WorkerEligibilityResult;
    }> = [];

    for (const candidate of candidates) {
      const result = this.evaluateCandidate(candidate, request);
      if (result.isEligible) {
        eligible.push({ candidate, result });
      }
    }

    return eligible;
  }
}
