export interface ServiceRequestPublishedEventData {
  serviceRequestId?: string;
  requestId?: string;
  id?: string;
  requestCode: string;
  customerUserId: string;
  serviceId: string;
  description: string;
  scheduledAt?: string;
  addressText?: string;
  latitude: number;
  longitude: number;
  matchingRevision?: number;
}

export interface ServiceRequestInputsChangedEventData {
  serviceRequestId?: string;
  requestId?: string;
  id?: string;
  customerUserId: string;
  matchingRevision: number;
  serviceId: string;
  description?: string;
  scheduledAt?: string;
  latitude: number;
  longitude: number;
}

export interface ServiceRequestCancelledEventData {
  serviceRequestId?: string;
  requestId?: string;
  id?: string;
  reason?: string;
  cancelledAt: string;
}

export interface ServiceRequestConvertedToOrderEventData {
  serviceRequestId?: string;
  requestId?: string;
  id?: string;
  orderId: string;
  convertedAt: string;
}
