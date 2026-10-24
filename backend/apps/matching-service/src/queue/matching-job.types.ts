export interface MatchingJobPayload {
  jobId: string;
  serviceRequestId: string;
  serviceId: string;
  requestRevision: number;
  runNumber: number;
  customerUserId: string;
  description: string;
  latitude: number;
  longitude: number;
  attempt?: number;
  maxAttempts?: number;
  simulationOptions?: {
    simulateTimeoutMs?: number;
    simulateError?: boolean;
    simulateEmpty?: boolean;
  };
}
