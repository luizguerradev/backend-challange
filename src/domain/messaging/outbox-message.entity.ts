import { randomUUID } from 'node:crypto';
import type { IntegrationEvent } from './integration-event';

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
  createdAt: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    public readonly createdAt: Date,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue<T>(event: IntegrationEvent<T>): OutboxMessage {
    const now = new Date();
    return new OutboxMessage(
      randomUUID(),
      event.aggregateId,
      event.eventType,
      event.toJSON(),
      event.occurredAt,
      0,
      now,
      now, // pronto para envio imediato
      undefined,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.createdAt,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date = new Date()): boolean {
    if (!this.isPending()) return false;
    if (!this._nextAttemptAt) return true;
    return this._nextAttemptAt.getTime() <= now.getTime();
  }

  markPublished(at: Date = new Date()): void {
    if (this._publishedAt) {
      throw new Error(`OutboxMessage ${this.id} is already published at ${this._publishedAt.toISOString()}`);
    }
    this._publishedAt = at;
  }

  /**
   * Backoff exponencial: 2 ^ attempts * 1000ms com teto de 60 segundos
   */
  scheduleRetry(now: Date = new Date(), baseDelayMs: number = 1000, maxDelayMs: number = 60000): void {
    this._attempts += 1;
    const delay = Math.min(Math.pow(2, this._attempts) * baseDelayMs, maxDelayMs);
    this._nextAttemptAt = new Date(now.getTime() + delay);
  }
}