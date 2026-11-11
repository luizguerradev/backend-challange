export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');

export interface PublishMessageInput {
  messageId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface EventPublisherPort {
  publish(input: PublishMessageInput): Promise<void>;
  publishBatch(inputs: PublishMessageInput[]): Promise<void>;
}