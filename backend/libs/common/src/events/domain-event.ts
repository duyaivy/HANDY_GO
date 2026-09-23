export interface DomainEvent<T> {
  eventId: string;
  eventVersion: number;
  occurredAt: Date;
  producer: string;
  data: T;
}