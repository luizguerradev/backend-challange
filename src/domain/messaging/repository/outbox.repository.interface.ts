import type { OutboxMessage } from '../outbox-message.entity.js';

export const OUTBOX_REPOSITORY_TOKEN = Symbol('OUTBOX_REPOSITORY_TOKEN');

export interface OutboxRepositoryInterface {
  save(message: OutboxMessage): Promise<void>;
  saveBatch(messages: OutboxMessage[]): Promise<void>;
  fetchPendingDueForUpdate(limit: number, now?: Date): Promise<OutboxMessage[]>;
  findById(id: string): Promise<OutboxMessage | null>;
}