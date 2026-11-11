import { EntitySchema } from '@mikro-orm/core';

export class InboxMessageOrmEntity {
  messageId!: string;
  consumerName!: string;
  payloadHash!: string;
  receivedAt: Date = new Date();
  processedAt?: Date;
}

export const InboxMessageSchema = new EntitySchema<InboxMessageOrmEntity>({
  class: InboxMessageOrmEntity,
  tableName: 'inbox_messages',
  properties: {
    messageId: { fieldName: 'message_id', type: 'varchar', length: 255, primary: true },
    consumerName: { fieldName: 'consumer_name', type: 'varchar', length: 255, primary: true },
    payloadHash: { fieldName: 'payload_hash', type: 'varchar', length: 255 },
    receivedAt: { fieldName: 'received_at', type: 'timestamptz', defaultRaw: 'now()' },
    processedAt: { fieldName: 'processed_at', type: 'timestamptz', nullable: true },
  },
});