import { EntitySchema } from '@mikro-orm/core';

export class InboxMessageOrmEntity {
  messageId!: string;
  consumerName!: string;
  payloadHash!: string;
  receivedAt!: Date;
  processedAt?: Date;
}

export const InboxMessageSchema = new EntitySchema<InboxMessageOrmEntity>({
  class: InboxMessageOrmEntity,
  tableName: 'inbox_messages',
  properties: {
    messageId: { fieldName: 'message_id', type: 'text', primary: true },
    consumerName: { fieldName: 'consumer_name', type: 'text', primary: true },
    payloadHash: { fieldName: 'payload_hash', type: 'char', length: 64 },
    receivedAt: { fieldName: 'received_at', type: 'timestamptz' },
    processedAt: { fieldName: 'processed_at', type: 'timestamptz', nullable: true },
  },
});