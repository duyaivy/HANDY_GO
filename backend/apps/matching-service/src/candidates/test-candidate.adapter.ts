import { Injectable } from '@nestjs/common';
import type { ICandidateProvider } from './candidate.provider.interface.js';
import type {
  WorkerCandidateDto,
  WorkerMatchProfileDto,
} from './candidate.dto.js';
import { calculateHaversineDistance } from '../eligibility/haversine.util.js';

@Injectable()
export class TestCandidateAdapter implements ICandidateProvider {
  private candidates: WorkerCandidateDto[] = [];
  private workerProfiles: Map<string, WorkerMatchProfileDto> = new Map();

  setTestCandidates(candidates: WorkerCandidateDto[]): void {
    this.candidates = [...candidates];
  }

  setWorkerProfile(workerUserId: string, profile: WorkerMatchProfileDto): void {
    this.workerProfiles.set(workerUserId, profile);
  }

  clear(): void {
    this.candidates = [];
    this.workerProfiles.clear();
  }

  async findCandidates(params: {
    serviceId: string;
    latitude: number;
    longitude: number;
    customerUserId?: string;
  }): Promise<WorkerCandidateDto[]> {
    const { serviceId, latitude, longitude, customerUserId } = params;

    return this.candidates
      .filter((c) => {
        if (customerUserId && c.workerUserId === customerUserId) {
          return false;
        }
        return true;
      })
      .map((c) => {
        // Re-compute distance if coordinates provided
        let distanceKm = c.distanceKm;
        if (c.centerLatitude && c.centerLongitude) {
          distanceKm = calculateHaversineDistance(
            latitude,
            longitude,
            c.centerLatitude,
            c.centerLongitude,
          );
        }
        return {
          ...c,
          distanceKm: Math.round(distanceKm * 100) / 100,
        };
      })
      .filter((c) => c.distanceKm <= c.radiusKm);
  }

  async getWorkerMatchProfile(
    workerUserId: string,
  ): Promise<WorkerMatchProfileDto | null> {
    return this.workerProfiles.get(workerUserId) || null;
  }
}
