import { EntitySchema } from '@mikro-orm/core';

export class OutboxMessageOrmEntity {
  id!: string;
  aggregateId!: string;
  eventType!: string;
  payload!: Record<string, unknown>;
  occurredAt!: Date;
  attempts: number = 0;
  nextAttemptAt?: Date;
  publishedAt?: Date;
  createdAt: Date = new Date();
}

export const OutboxMessageSchema = new EntitySchema<OutboxMessageOrmEntity>({
  class: OutboxMessageOrmEntity,
  tableName: 'outbox_messages',
  properties: {
    id: { type: 'uuid', primary: true },
    aggregateId: { fieldName: 'aggregate_id', type: 'text' },
    eventType: { fieldName: 'event_type', type: 'varchar', length: 100 },
    payload: { type: 'jsonb' },
    occurredAt: { fieldName: 'occurred_at', type: 'timestamptz' },
    attempts: { type: 'integer', default: 0 },
    nextAttemptAt: { fieldName: 'next_attempt_at', type: 'timestamptz', nullable: true },
    publishedAt: { fieldName: 'published_at', type: 'timestamptz', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'timestamptz', defaultRaw: 'now()' },
  },
});