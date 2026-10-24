export interface ServiceRequestPublishedEventData {
  serviceRequestId: string;
  requestCode: string;
  customerUserId: string;
  serviceId: string;
  description: string;
  scheduledAt?: string;
  addressText?: string;
  latitude: number;
  longitude: number;
  matchingRevision: number;
}

export interface ServiceRequestInputsChangedEventData {
  serviceRequestId: string;
  customerUserId: string;
  matchingRevision: number;
  serviceId: string;
  description?: string;
  scheduledAt?: string;
  latitude: number;
  longitude: number;
}

export interface ServiceRequestCancelledEventData {
  serviceRequestId: string;
  reason?: string;
  cancelledAt: string;
}

export interface ServiceRequestConvertedToOrderEventData {
  serviceRequestId: string;
  orderId: string;
  convertedAt: string;
}
