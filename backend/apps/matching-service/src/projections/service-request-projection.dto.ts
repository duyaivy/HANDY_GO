export interface ServiceRequestProjectionDto {
  id: string;
  requestCode: string;
  customerUserId: string;
  serviceId: string;
  description?: string | null;
  scheduledAt?: Date | null;
  addressText?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  matchingRevision: number;
  createdAt: Date;
  updatedAt: Date;
}
